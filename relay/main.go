package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"golang.org/x/crypto/ssh"
)

type ControlMessage struct {
	Type              string `json:"type"`
	Host              string `json:"host,omitempty"`
	Port              int    `json:"port,omitempty"`
	Username          string `json:"username,omitempty"`
	Password          string `json:"password,omitempty"`
	PrivateKey        string `json:"privateKey,omitempty"`
	TermType          string `json:"termType,omitempty"`
	Cols              int    `json:"cols,omitempty"`
	Rows              int    `json:"rows,omitempty"`
	KeepaliveInterval int    `json:"keepaliveInterval,omitempty"`
	Data              string `json:"data,omitempty"`
}

type ServerMessage struct {
	Type    string `json:"type"`
	Message string `json:"message,omitempty"`
}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type wsWriter struct {
	conn *websocket.Conn
	mu   sync.Mutex
}

func (w *wsWriter) WriteBinary(data []byte) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.conn.WriteMessage(websocket.BinaryMessage, data)
}

func (w *wsWriter) WriteJSON(v any) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.conn.WriteJSON(v)
}

func sendError(w *wsWriter, msg string) {
	_ = w.WriteJSON(ServerMessage{Type: "error", Message: msg})
}

func handleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("websocket upgrade failed: %v", err)
		return
	}
	defer conn.Close()

	writer := &wsWriter{conn: conn}

	// First message must be a JSON "connect" payload.
	_, raw, err := conn.ReadMessage()
	if err != nil {
		return
	}

	var initMsg ControlMessage
	if err := json.Unmarshal(raw, &initMsg); err != nil || initMsg.Type != "connect" {
		sendError(writer, "Expected initial connect message")
		return
	}

	if initMsg.Host == "" || initMsg.Username == "" {
		sendError(writer, "Host and username are required")
		return
	}

	port := initMsg.Port
	if port <= 0 || port > 65535 {
		port = 22
	}
	cols := initMsg.Cols
	if cols <= 0 {
		cols = 80
	}
	rows := initMsg.Rows
	if rows <= 0 {
		rows = 24
	}
	termType := initMsg.TermType
	if termType == "" {
		termType = "xterm-256color"
	}

	var authMethods []ssh.AuthMethod
	if initMsg.PrivateKey != "" {
		signer, err := ssh.ParsePrivateKey([]byte(initMsg.PrivateKey))
		if err != nil {
			sendError(writer, fmt.Sprintf("Invalid private key: %v", err))
			return
		}
		authMethods = append(authMethods, ssh.PublicKeys(signer))
	}
	if initMsg.Password != "" {
		authMethods = append(authMethods, ssh.Password(initMsg.Password))
		authMethods = append(authMethods, ssh.KeyboardInteractive(
			func(user, instruction string, questions []string, echos []bool) ([]string, error) {
				answers := make([]string, len(questions))
				for i := range questions {
					answers[i] = initMsg.Password
				}
				return answers, nil
			},
		))
	}

	if len(authMethods) == 0 {
		sendError(writer, "Password or private key is required")
		return
	}

	sshConfig := &ssh.ClientConfig{
		User:            initMsg.Username,
		Auth:            authMethods,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         15 * time.Second,
	}

	target := net.JoinHostPort(initMsg.Host, strconv.Itoa(port))
	client, err := ssh.Dial("tcp", target, sshConfig)
	if err != nil {
		sendError(writer, fmt.Sprintf("SSH connection failed: %v", err))
		return
	}
	defer client.Close()

	session, err := client.NewSession()
	if err != nil {
		sendError(writer, fmt.Sprintf("Failed to create SSH session: %v", err))
		return
	}
	defer session.Close()

	stdin, err := session.StdinPipe()
	if err != nil {
		sendError(writer, fmt.Sprintf("Failed to open stdin pipe: %v", err))
		return
	}
	stdout, err := session.StdoutPipe()
	if err != nil {
		sendError(writer, fmt.Sprintf("Failed to open stdout pipe: %v", err))
		return
	}
	stderr, err := session.StderrPipe()
	if err != nil {
		sendError(writer, fmt.Sprintf("Failed to open stderr pipe: %v", err))
		return
	}

	modes := ssh.TerminalModes{
		ssh.ECHO:          1,
		ssh.TTY_OP_ISPEED: 14400,
		ssh.TTY_OP_OSPEED: 14400,
	}
	if err := session.RequestPty(termType, rows, cols, modes); err != nil {
		sendError(writer, fmt.Sprintf("Failed to request PTY: %v", err))
		return
	}

	if err := session.Shell(); err != nil {
		sendError(writer, fmt.Sprintf("Failed to start shell: %v", err))
		return
	}

	if err := writer.WriteJSON(ServerMessage{Type: "connected"}); err != nil {
		return
	}

	done := make(chan struct{})
	var closeOnce sync.Once
	closeDone := func() {
		closeOnce.Do(func() {
			close(done)
			_ = session.Close()
			_ = conn.Close()
		})
	}

	// Keepalive ticker
	if initMsg.KeepaliveInterval > 0 {
		go func() {
			ticker := time.NewTicker(time.Duration(initMsg.KeepaliveInterval) * time.Second)
			defer ticker.Stop()
			for {
				select {
				case <-done:
					return
				case <-ticker.C:
					_, _, err := client.SendRequest("keepalive@openssh.com", true, nil)
					if err != nil {
						closeDone()
						return
					}
				}
			}
		}()
	}

	pipeOutput := func(r io.Reader) {
		buf := make([]byte, 8192)
		for {
			n, err := r.Read(buf)
			if n > 0 {
				if writeErr := writer.WriteBinary(buf[:n]); writeErr != nil {
					closeDone()
					return
				}
			}
			if err != nil {
				return
			}
		}
	}

	go pipeOutput(stdout)
	go pipeOutput(stderr)

	// Wait for SSH session completion
	go func() {
		_ = session.Wait()
		closeDone()
	}()

	// Read WebSocket frames from browser
	for {
		msgType, payload, err := conn.ReadMessage()
		if err != nil {
			closeDone()
			return
		}

		if msgType == websocket.BinaryMessage {
			if _, err := stdin.Write(payload); err != nil {
				closeDone()
				return
			}
			continue
		}

		if msgType == websocket.TextMessage {
			var ctrl ControlMessage
			if err := json.Unmarshal(payload, &ctrl); err == nil && ctrl.Type != "" {
				switch ctrl.Type {
				case "resize":
					if ctrl.Cols > 0 && ctrl.Rows > 0 {
						_ = session.WindowChange(ctrl.Rows, ctrl.Cols)
					}
				case "data":
					if ctrl.Data != "" {
						if _, err := stdin.Write([]byte(ctrl.Data)); err != nil {
							closeDone()
							return
						}
					}
				case "ping":
					// no-op
				}
			} else {
				if _, err := stdin.Write(payload); err != nil {
					closeDone()
					return
				}
			}
		}
	}
}

func main() {
	addr := flag.String("addr", "127.0.0.1:8022", "WebSocket listen address")
	flag.Parse()

	mux := http.NewServeMux()
	mux.HandleFunc("/", handleWS)
	mux.HandleFunc("/ws", handleWS)
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	log.Printf("CloudTerm SSH relay listening on ws://%s", *addr)
	if err := http.ListenAndServe(*addr, mux); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
