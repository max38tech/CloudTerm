import { useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  KeyRound,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Server,
  Upload,
  Usb,
  X,
} from 'lucide-react';
import type {
  ConnectionMode,
  ConnectionStatus,
  RecentConnection,
  SerialFlowControl,
  SerialParity,
  SerialSettings,
  SshCredentials,
  SshSettings,
} from '../types/terminal';
import {
  formatSerialPortLabel,
  isWebSerialSupported,
  type WebSerialPort,
} from '../lib/serial';

interface SidebarProps {
  open: boolean;
  onCloseMobile: () => void;
  mode: ConnectionMode;
  onModeChange: (mode: ConnectionMode) => void;
  status: ConnectionStatus;

  // Serial
  serialPorts: WebSerialPort[];
  selectedPortIndex: number;
  onSelectPortIndex: (index: number) => void;
  onRequestSerialPort: () => void;
  onRefreshSerialPorts: () => void;
  serialSettings: SerialSettings;
  onUpdateSerialSettings: (next: SerialSettings) => void;
  onConnectSerial: () => void;

  // SSH
  sshHost: string;
  onSshHostChange: (host: string) => void;
  sshUsername: string;
  onSshUsernameChange: (username: string) => void;
  sshCredentials: SshCredentials;
  onSshCredentialsChange: (creds: SshCredentials) => void;
  sshSettings: SshSettings;
  onUpdateSshSettings: (next: SshSettings) => void;
  onConnectSsh: () => void;

  // Recent Connections
  recentConnections: RecentConnection[];
  onSelectRecent: (conn: RecentConnection) => void;
  onTogglePin: (id: string) => void;
  onDeleteRecent: (id: string) => void;
}

const COMMON_BAUD_RATES = [
  9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600, 1000000, 2000000,
];

export function Sidebar({
  open,
  onCloseMobile,
  mode,
  onModeChange,
  status,
  serialPorts,
  selectedPortIndex,
  onSelectPortIndex,
  onRequestSerialPort,
  onRefreshSerialPorts,
  serialSettings,
  onUpdateSerialSettings,
  onConnectSerial,
  sshHost,
  onSshHostChange,
  sshUsername,
  onSshUsernameChange,
  sshCredentials,
  onSshCredentialsChange,
  sshSettings,
  onUpdateSshSettings,
  onConnectSsh,
  recentConnections,
  onSelectRecent,
  onTogglePin,
  onDeleteRecent,
}: SidebarProps) {
  const [serialAccordionOpen, setSerialAccordionOpen] = useState(false);
  const [sshAccordionOpen, setSshAccordionOpen] = useState(false);
  const [showKeyInput, setShowKeyInput] = useState(false);
  const keyFileInputRef = useRef<HTMLInputElement | null>(null);

  const webSerialSupported = isWebSerialSupported();
  const isBusy = status === 'connecting';

  const handleKeyFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onSshCredentialsChange({
          ...sshCredentials,
          privateKey: reader.result,
        });
        setShowKeyInput(true);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  if (!open) return null;

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-30 md:hidden"
        onClick={onCloseMobile}
      />

      <aside className="fixed md:static inset-y-0 left-0 top-12 md:top-0 z-40 w-80 shrink-0 border-r border-zinc-800/80 bg-zinc-950 flex flex-col h-[calc(100vh-3rem)] md:h-full select-none">
        {/* Mode Toggle */}
        <div className="p-3 border-b border-zinc-800/80">
          <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-zinc-900 border border-zinc-800/80">
            <button
              type="button"
              onClick={() => onModeChange('serial')}
              className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                mode === 'serial'
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Usb className="w-3.5 h-3.5" />
              <span>Serial</span>
            </button>
            <button
              type="button"
              onClick={() => onModeChange('ssh')}
              className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                mode === 'ssh'
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Server className="w-3.5 h-3.5" />
              <span>SSH</span>
            </button>
          </div>
        </div>

        {/* Connection Form */}
        <div className="p-3 border-b border-zinc-800/80 space-y-3">
          {mode === 'serial' ? (
            <>
              {!webSerialSupported && (
                <div className="text-[11px] leading-relaxed text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-md p-2">
                  Web Serial API requires a Chromium browser (Chrome, Edge, Opera) over HTTPS or localhost.
                </div>
              )}

              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={onRequestSerialPort}
                  disabled={!webSerialSupported || isBusy}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-100 border border-zinc-700/80 disabled:opacity-40 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Select COM Port</span>
                </button>
                <button
                  type="button"
                  onClick={onRefreshSerialPorts}
                  disabled={!webSerialSupported}
                  className="p-2 rounded-md bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 disabled:opacity-40 transition-colors"
                  title="Refresh authorized ports"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                  Authorized Ports
                </label>
                <select
                  value={serialPorts.length > 0 ? selectedPortIndex : -1}
                  onChange={(e) => onSelectPortIndex(Number(e.target.value))}
                  disabled={serialPorts.length === 0}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500/60 disabled:opacity-50"
                >
                  {serialPorts.length === 0 ? (
                    <option value={-1}>No authorized ports yet</option>
                  ) : (
                    serialPorts.map((port, idx) => (
                      <option key={idx} value={idx}>
                        {formatSerialPortLabel(port, idx)}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Serial Settings Accordion */}
              <div className="border border-zinc-800/80 rounded-md bg-zinc-900/40 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setSerialAccordionOpen((v) => !v)}
                  className="w-full flex items-center justify-between px-2.5 py-2 text-xs font-medium text-zinc-300 hover:text-zinc-100 hover:bg-zinc-900/80 transition-colors"
                >
                  <span>Serial Settings</span>
                  <span className="flex items-center gap-1.5 text-[11px] text-zinc-500 font-mono">
                    {serialSettings.baudRate} {serialSettings.dataBits}
                    {serialSettings.parity[0].toUpperCase()}
                    {serialSettings.stopBits}
                    {serialAccordionOpen ? (
                      <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
                    )}
                  </span>
                </button>

                {serialAccordionOpen && (
                  <div className="px-2.5 pb-2.5 pt-1 border-t border-zinc-800/60 grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                        Baud Rate
                      </label>
                      <select
                        value={serialSettings.baudRate}
                        onChange={(e) =>
                          onUpdateSerialSettings({
                            ...serialSettings,
                            baudRate: Number(e.target.value),
                          })
                        }
                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs font-mono text-zinc-100 focus:outline-none focus:border-emerald-500/60"
                      >
                        {COMMON_BAUD_RATES.map((rate) => (
                          <option key={rate} value={rate}>
                            {rate}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                        Data Bits
                      </label>
                      <select
                        value={serialSettings.dataBits}
                        onChange={(e) =>
                          onUpdateSerialSettings({
                            ...serialSettings,
                            dataBits: Number(e.target.value) as 7 | 8,
                          })
                        }
                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs font-mono text-zinc-100 focus:outline-none focus:border-emerald-500/60"
                      >
                        <option value={8}>8</option>
                        <option value={7}>7</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                        Stop Bits
                      </label>
                      <select
                        value={serialSettings.stopBits}
                        onChange={(e) =>
                          onUpdateSerialSettings({
                            ...serialSettings,
                            stopBits: Number(e.target.value) as 1 | 2,
                          })
                        }
                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs font-mono text-zinc-100 focus:outline-none focus:border-emerald-500/60"
                      >
                        <option value={1}>1</option>
                        <option value={2}>2</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                        Parity
                      </label>
                      <select
                        value={serialSettings.parity}
                        onChange={(e) =>
                          onUpdateSerialSettings({
                            ...serialSettings,
                            parity: e.target.value as SerialParity,
                          })
                        }
                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500/60"
                      >
                        <option value="none">None</option>
                        <option value="even">Even</option>
                        <option value="odd">Odd</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                        Flow Control
                      </label>
                      <select
                        value={serialSettings.flowControl}
                        onChange={(e) =>
                          onUpdateSerialSettings({
                            ...serialSettings,
                            flowControl: e.target.value as SerialFlowControl,
                          })
                        }
                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500/60"
                      >
                        <option value="none">None</option>
                        <option value="hardware">Hardware</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={onConnectSerial}
                disabled={!webSerialSupported || serialPorts.length === 0 || isBusy}
                className="w-full py-2 rounded-md text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                {isBusy ? 'Connecting...' : 'Connect Serial'}
              </button>
            </>
          ) : (
            <form
              className="space-y-2.5"
              onSubmit={(e) => {
                e.preventDefault();
                onConnectSsh();
              }}
            >
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                    Host / IP
                  </label>
                  <input
                    type="text"
                    value={sshHost}
                    onChange={(e) => onSshHostChange(e.target.value)}
                    placeholder="192.168.1.10"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-2.5 py-1.5 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/60"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                    Port
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={sshSettings.port}
                    onChange={(e) =>
                      onUpdateSshSettings({
                        ...sshSettings,
                        port: Math.max(1, Math.min(65535, Number(e.target.value) || 22)),
                      })
                    }
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-2.5 py-1.5 text-xs font-mono text-zinc-100 focus:outline-none focus:border-emerald-500/60"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                    Username
                  </label>
                  <input
                    type="text"
                    value={sshUsername}
                    onChange={(e) => onSshUsernameChange(e.target.value)}
                    placeholder="root"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-2.5 py-1.5 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/60"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    value={sshCredentials.password ?? ''}
                    onChange={(e) =>
                      onSshCredentialsChange({
                        ...sshCredentials,
                        password: e.target.value,
                      })
                    }
                    placeholder="••••••••"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-2.5 py-1.5 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/60"
                  />
                </div>
              </div>

              {/* Optional Private Key */}
              <div>
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setShowKeyInput((v) => !v)}
                    className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors"
                  >
                    <KeyRound className="w-3 h-3" />
                    <span>
                      {sshCredentials.privateKey
                        ? 'Private key attached'
                        : 'Add private key (optional)'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => keyFileInputRef.current?.click()}
                    className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    <Upload className="w-3 h-3" />
                    <span>Upload</span>
                  </button>
                  <input
                    ref={keyFileInputRef}
                    type="file"
                    accept=".pem,.key,.pub,text/plain"
                    onChange={handleKeyFileUpload}
                    className="hidden"
                  />
                </div>
                {showKeyInput && (
                  <textarea
                    rows={3}
                    value={sshCredentials.privateKey ?? ''}
                    onChange={(e) =>
                      onSshCredentialsChange({
                        ...sshCredentials,
                        privateKey: e.target.value,
                      })
                    }
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                    className="mt-1.5 w-full bg-zinc-900 border border-zinc-800 rounded-md p-2 text-[11px] font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/60 resize-none"
                  />
                )}
              </div>

              {/* SSH Settings Accordion */}
              <div className="border border-zinc-800/80 rounded-md bg-zinc-900/40 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setSshAccordionOpen((v) => !v)}
                  className="w-full flex items-center justify-between px-2.5 py-2 text-xs font-medium text-zinc-300 hover:text-zinc-100 hover:bg-zinc-900/80 transition-colors"
                >
                  <span>SSH Settings</span>
                  <span className="flex items-center gap-1.5 text-[11px] text-zinc-500 font-mono">
                    :{sshSettings.port}
                    {sshAccordionOpen ? (
                      <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
                    )}
                  </span>
                </button>

                {sshAccordionOpen && (
                  <div className="px-2.5 pb-2.5 pt-1 border-t border-zinc-800/60 space-y-2">
                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                        Local Relay URL
                      </label>
                      <input
                        type="text"
                        value={sshSettings.relayUrl}
                        onChange={(e) =>
                          onUpdateSshSettings({
                            ...sshSettings,
                            relayUrl: e.target.value,
                          })
                        }
                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs font-mono text-zinc-100 focus:outline-none focus:border-emerald-500/60"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                          Port
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={65535}
                          value={sshSettings.port}
                          onChange={(e) =>
                            onUpdateSshSettings({
                              ...sshSettings,
                              port: Math.max(1, Math.min(65535, Number(e.target.value) || 22)),
                            })
                          }
                          className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs font-mono text-zinc-100 focus:outline-none focus:border-emerald-500/60"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                          Keepalive (s)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={3600}
                          value={sshSettings.keepaliveInterval}
                          onChange={(e) =>
                            onUpdateSshSettings({
                              ...sshSettings,
                              keepaliveInterval: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs font-mono text-zinc-100 focus:outline-none focus:border-emerald-500/60"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                        Terminal Type
                      </label>
                      <input
                        type="text"
                        value={sshSettings.termType}
                        onChange={(e) =>
                          onUpdateSshSettings({
                            ...sshSettings,
                            termType: e.target.value || 'xterm-256color',
                          })
                        }
                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs font-mono text-zinc-100 focus:outline-none focus:border-emerald-500/60"
                      />
                    </div>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={!sshHost.trim() || !sshUsername.trim() || isBusy}
                className="w-full py-2 rounded-md text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                {isBusy ? 'Connecting...' : 'Connect SSH'}
              </button>
            </form>
          )}
        </div>

        {/* Recent Connections */}
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="px-3 py-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Recent Connections
            </span>
            <span className="text-[11px] text-zinc-600 font-mono">
              {recentConnections.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-1">
            {recentConnections.length === 0 ? (
              <div className="px-2 py-6 text-center text-xs text-zinc-600">
                No recent connections yet.
              </div>
            ) : (
              recentConnections.map((conn) => (
                <div
                  key={conn.id}
                  onClick={() => onSelectRecent(conn)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectRecent(conn);
                    }
                  }}
                  className="group relative flex items-center gap-2 px-2.5 py-2 rounded-md hover:bg-zinc-900/90 border border-transparent hover:border-zinc-800/80 cursor-pointer transition-colors"
                >
                  <div className="shrink-0 text-zinc-500">
                    {conn.mode === 'serial' ? (
                      <Usb className="w-3.5 h-3.5" />
                    ) : (
                      <Server className="w-3.5 h-3.5" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {conn.pinned && (
                        <Pin className="w-3 h-3 text-emerald-400 shrink-0" />
                      )}
                      <span className="text-xs font-mono text-zinc-200 truncate">
                        {conn.label}
                      </span>
                    </div>
                    <div className="text-[10px] text-zinc-500 truncate mt-0.5">
                      {conn.mode === 'serial' && conn.serialConfig
                        ? `${conn.serialConfig.baudRate} ${conn.serialConfig.dataBits}${conn.serialConfig.parity[0].toUpperCase()}${conn.serialConfig.stopBits}`
                        : conn.sshConfig
                          ? `SSH · :${conn.sshConfig.port}`
                          : conn.mode.toUpperCase()}
                    </div>
                  </div>

                  {/* Hover actions */}
                  <div
                    className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => onTogglePin(conn.id)}
                      className={`p-1 rounded hover:bg-zinc-800 transition-colors ${
                        conn.pinned
                          ? 'text-emerald-400 hover:text-emerald-300'
                          : 'text-zinc-500 hover:text-zinc-200'
                      }`}
                      title={conn.pinned ? 'Unpin' : 'Pin to top'}
                      aria-label={conn.pinned ? 'Unpin' : 'Pin to top'}
                    >
                      {conn.pinned ? (
                        <PinOff className="w-3.5 h-3.5" />
                      ) : (
                        <Pin className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteRecent(conn.id)}
                      className="p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 transition-colors"
                      title="Delete connection"
                      aria-label="Delete connection"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
