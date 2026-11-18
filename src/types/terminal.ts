export type ConnectionMode = 'serial' | 'ssh';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type SerialParity = 'none' | 'even' | 'odd';
export type SerialFlowControl = 'none' | 'hardware';

export interface SerialSettings {
  baudRate: number;
  dataBits: 7 | 8;
  stopBits: 1 | 2;
  parity: SerialParity;
  flowControl: SerialFlowControl;
}

export interface SerialConnectionConfig extends SerialSettings {
  usbVendorId?: number;
  usbProductId?: number;
  portName?: string;
}

export interface SshSettings {
  port: number;
  relayUrl: string;
  keepaliveInterval: number;
  termType: string;
}

export interface SshConnectionConfig extends SshSettings {
  host: string;
  username: string;
}

export interface SshCredentials {
  password?: string;
  privateKey?: string;
}

export interface RecentConnection {
  id: string;
  mode: ConnectionMode;
  label: string;
  pinned: boolean;
  lastUsedAt: number;
  serialConfig?: SerialConnectionConfig;
  sshConfig?: SshConnectionConfig;
}

export interface UserPreferences {
  serialDefaults: SerialSettings;
  sshDefaults: SshSettings;
  updatedAt?: number;
}

export const DEFAULT_SERIAL_SETTINGS: SerialSettings = {
  baudRate: 115200,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
  flowControl: 'none',
};

export const DEFAULT_SSH_SETTINGS: SshSettings = {
  port: 22,
  relayUrl: 'ws://localhost:8022',
  keepaliveInterval: 30,
  termType: 'xterm-256color',
};

export interface TerminalTransport {
  write: (data: string | Uint8Array) => Promise<void> | void;
  resize?: (cols: number, rows: number) => void;
  disconnect: () => Promise<void> | void;
}
