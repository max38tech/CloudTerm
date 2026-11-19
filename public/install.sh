#!/usr/bin/env bash
set -euo pipefail

REPO="max38tech/CloudTerm"
INSTALL_DIR="${CLOUDTERM_INSTALL_DIR:-$HOME/.local/bin}"
BIN_PATH="$INSTALL_DIR/cloudterm-relay"
ADDR="${CLOUDTERM_RELAY_ADDR:-127.0.0.1:8022}"
HEALTH_URL="http://${ADDR}/health"

echo "==> CloudTerm SSH Relay Installer"

# Check if already running
if curl -fsS --max-time 1 "$HEALTH_URL" >/dev/null 2>&1; then
  echo "✓ cloudterm-relay is already running at $ADDR"
  exit 0
fi

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
case "$OS" in
  linux) OS="linux" ;;
  darwin) OS="darwin" ;;
  *)
    echo "Error: Unsupported OS '$OS'. Use install.ps1 on Windows." >&2
    exit 1
    ;;
esac

ARCH_RAW="$(uname -m)"
case "$ARCH_RAW" in
  x86_64|amd64) ARCH="amd64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *)
    echo "Error: Unsupported architecture '$ARCH_RAW'." >&2
    exit 1
    ;;
esac

mkdir -p "$INSTALL_DIR"

if [ ! -x "$BIN_PATH" ]; then
  RELEASE_URL="https://github.com/${REPO}/releases/latest/download/cloudterm-relay-${OS}-${ARCH}"
  TMP_BIN="$(mktemp)"
  trap 'rm -f "$TMP_BIN"' EXIT

  echo "==> Downloading cloudterm-relay (${OS}/${ARCH})..."
  if curl -fsSL "$RELEASE_URL" -o "$TMP_BIN" 2>/dev/null; then
    chmod +x "$TMP_BIN"
    mv "$TMP_BIN" "$BIN_PATH"
    echo "✓ Installed prebuilt binary to $BIN_PATH"
  elif command -v go >/dev/null 2>&1; then
    echo "==> No prebuilt release found; building from GitHub source with Go..."
    TMP_SRC="$(mktemp -d)"
    trap 'rm -rf "$TMP_BIN" "$TMP_SRC"' EXIT
    RAW_BASE="https://raw.githubusercontent.com/${REPO}/main/relay"
    curl -fsSL "$RAW_BASE/go.mod" -o "$TMP_SRC/go.mod"
    curl -fsSL "$RAW_BASE/go.sum" -o "$TMP_SRC/go.sum"
    curl -fsSL "$RAW_BASE/main.go" -o "$TMP_SRC/main.go"
    (cd "$TMP_SRC" && go build -trimpath -ldflags="-s -w" -o "$BIN_PATH" .)
    chmod +x "$BIN_PATH"
    echo "✓ Built and installed to $BIN_PATH"
  else
    echo "Error: Could not download prebuilt binary from:" >&2
    echo "  $RELEASE_URL" >&2
    echo "And Go is not installed to build from source." >&2
    echo "Please install Go (https://go.dev/dl/) or publish a GitHub Release, then re-run." >&2
    exit 1
  fi
else
  echo "✓ Found existing binary at $BIN_PATH"
fi

# Start as a user service when possible, otherwise detach in background
start_detached() {
  LOG_FILE="${XDG_STATE_HOME:-$HOME/.local/state}/cloudterm-relay.log"
  mkdir -p "$(dirname "$LOG_FILE")"
  nohup "$BIN_PATH" -addr "$ADDR" >"$LOG_FILE" 2>&1 </dev/null &
  disown || true
}

if [ "$OS" = "linux" ] && command -v systemctl >/dev/null 2>&1 && systemctl --user status >/dev/null 2>&1; then
  SERVICE_DIR="$HOME/.config/systemd/user"
  mkdir -p "$SERVICE_DIR"
  cat >"$SERVICE_DIR/cloudterm-relay.service" <<EOF
[Unit]
Description=CloudTerm Local SSH Relay
After=network.target

[Service]
ExecStart=$BIN_PATH -addr $ADDR
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
EOF
  systemctl --user daemon-reload
  systemctl --user enable --now cloudterm-relay.service
  echo "✓ Enabled and started systemd user service (cloudterm-relay.service)"
elif [ "$OS" = "darwin" ]; then
  PLIST_DIR="$HOME/Library/LaunchAgents"
  PLIST_PATH="$PLIST_DIR/dev.cloudterm.relay.plist"
  mkdir -p "$PLIST_DIR"
  cat >"$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>dev.cloudterm.relay</string>
  <key>ProgramArguments</key>
  <array>
    <string>$BIN_PATH</string>
    <string>-addr</string>
    <string>$ADDR</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
</dict>
</plist>
EOF
  launchctl unload "$PLIST_PATH" >/dev/null 2>&1 || true
  launchctl load -w "$PLIST_PATH"
  echo "✓ Installed and started LaunchAgent ($PLIST_PATH)"
else
  start_detached
  echo "✓ Started cloudterm-relay in background"
fi

# Verify health endpoint
for _ in 1 2 3 4 5; do
  if curl -fsS --max-time 1 "$HEALTH_URL" >/dev/null 2>&1; then
    echo "✓ CloudTerm SSH Relay is online at ws://$ADDR"
    exit 0
  fi
  sleep 0.5
done

echo "Warning: Relay started, but $HEALTH_URL did not respond yet." >&2
