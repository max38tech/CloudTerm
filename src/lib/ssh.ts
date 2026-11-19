import type {
  SshConnectionConfig,
  SshCredentials,
  TerminalTransport,
} from '../types/terminal';

interface RelayServerMessage {
  type: 'connected' | 'error';
  message?: string;
}

export function getRelayHealthUrl(relayUrl: string): string | null {
  try {
    const url = new URL(relayUrl);
    if (url.protocol === 'ws:') {
      url.protocol = 'http:';
    } else if (url.protocol === 'wss:') {
      url.protocol = 'https:';
    } else if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    url.pathname = '/health';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

export async function checkSshRelayHealth(
  relayUrl: string,
  timeoutMs = 1500
): Promise<boolean> {
  const healthUrl = getRelayHealthUrl(relayUrl);
  if (!healthUrl) return false;

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(healthUrl, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

export function connectSshRelay(
  config: SshConnectionConfig,
  credentials: SshCredentials,
  dimensions: { cols: number; rows: number },
  callbacks: {
    onConnected: () => void;
    onData: (data: Uint8Array) => void;
    onClose: (error?: Error) => void;
  },
  signal?: AbortSignal
): Promise<TerminalTransport> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let closed = false;
    const textEncoder = new TextEncoder();

    if (signal?.aborted) {
      reject(new Error('Connection cancelled'));
      return;
    }

    let ws: WebSocket;
    try {
      ws = new WebSocket(config.relayUrl);
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    const onAbort = () => {
      if (!settled) {
        settled = true;
        closed = true;
        ws.close();
        reject(new Error('Connection cancelled'));
      }
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    ws.binaryType = 'arraybuffer';

    const transport: TerminalTransport = {
      write: (data: string | Uint8Array) => {
        if (closed || ws.readyState !== WebSocket.OPEN) return;
        const bytes = typeof data === 'string' ? textEncoder.encode(data) : data;
        ws.send(bytes);
      },
      resize: (cols: number, rows: number) => {
        if (closed || ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({ type: 'resize', cols, rows }));
      },
      disconnect: () => {
        if (closed) return;
        closed = true;
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
        callbacks.onClose();
      },
    };

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: 'connect',
          host: config.host,
          port: config.port,
          username: config.username,
          password: credentials.password || undefined,
          privateKey: credentials.privateKey || undefined,
          termType: config.termType,
          cols: dimensions.cols,
          rows: dimensions.rows,
          keepaliveInterval: config.keepaliveInterval,
        })
      );
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        callbacks.onData(new Uint8Array(event.data));
        return;
      }

      if (typeof event.data === 'string') {
        try {
          const msg = JSON.parse(event.data) as RelayServerMessage;
          if (msg.type === 'connected') {
            if (!settled) {
              settled = true;
              callbacks.onConnected();
              resolve(transport);
            }
            return;
          }
          if (msg.type === 'error') {
            const err = new Error(msg.message || 'SSH relay error');
            if (!settled) {
              settled = true;
              closed = true;
              ws.close();
              reject(err);
            } else {
              closed = true;
              ws.close();
              callbacks.onClose(err);
            }
            return;
          }
        } catch {
          callbacks.onData(textEncoder.encode(event.data));
        }
      }
    };

    ws.onerror = () => {
      const err = new Error(
        `Unable to reach local SSH relay at ${config.relayUrl}. Ensure cloudterm-relay is running.`
      );
      if (!settled) {
        settled = true;
        closed = true;
        reject(err);
      } else if (!closed) {
        closed = true;
        callbacks.onClose(err);
      }
    };

    ws.onclose = () => {
      if (!settled) {
        settled = true;
        closed = true;
        reject(new Error('SSH relay connection closed before session started'));
      } else if (!closed) {
        closed = true;
        callbacks.onClose();
      }
    };
  });
}
