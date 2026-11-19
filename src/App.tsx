import { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { Sidebar } from './components/Sidebar';
import { RelaySetupModal, type RelayStatus } from './components/RelaySetupModal';
import { TerminalView, type TerminalHandle } from './components/TerminalView';
import { TopBar } from './components/TopBar';
import {
  auth,
  isFirebaseConfigured,
  signInWithGoogle,
  signOutUser,
} from './lib/firebase';
import {
  connectSerialPort,
  formatSerialPortLabel,
  getAuthorizedPorts,
  isWebSerialSupported,
  requestSerialPort,
  type WebSerialPort,
} from './lib/serial';
import { checkSshRelayHealth, connectSshRelay } from './lib/ssh';
import {
  buildSerialConnectionId,
  buildSshConnectionId,
  deleteConnectionFromFirestore,
  loadLocalConnections,
  loadLocalPreferences,
  sanitizeConnectionForStorage,
  saveLocalConnections,
  saveLocalPreferences,
  sortConnections,
  subscribeToFirestoreData,
  syncPreferencesToFirestore,
  upsertConnectionToFirestore,
} from './lib/storage';
import type {
  ConnectionMode,
  ConnectionStatus,
  RecentConnection,
  SerialConnectionConfig,
  SerialSettings,
  SshConnectionConfig,
  SshCredentials,
  SshSettings,
  TerminalTransport,
} from './types/terminal';

export function App() {
  const initialPrefs = useRef(loadLocalPreferences());

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mode, setMode] = useState<ConnectionMode>('serial');
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [activeTarget, setActiveTarget] = useState<string | null>(null);

  // Auth
  const [user, setUser] = useState<User | null>(null);

  // Serial state
  const [serialPorts, setSerialPorts] = useState<WebSerialPort[]>([]);
  const [selectedPortIndex, setSelectedPortIndex] = useState(0);
  const [serialSettings, setSerialSettings] = useState<SerialSettings>(
    initialPrefs.current.serialDefaults
  );

  // SSH state
  const [sshHost, setSshHost] = useState('');
  const [sshUsername, setSshUsername] = useState('');
  const [sshCredentials, setSshCredentials] = useState<SshCredentials>({});
  const [sshSettings, setSshSettings] = useState<SshSettings>(
    initialPrefs.current.sshDefaults
  );
  const [relayStatus, setRelayStatus] = useState<RelayStatus>('checking');
  const [relayModalOpen, setRelayModalOpen] = useState(false);
  const [relayBannerDismissed, setRelayBannerDismissed] = useState(false);

  // Recent connections
  const [recentConnections, setRecentConnections] = useState<RecentConnection[]>(
    () => loadLocalConnections()
  );

  const terminalRef = useRef<TerminalHandle | null>(null);
  const transportRef = useRef<TerminalTransport | null>(null);
  const lastConnectionRef = useRef<RecentConnection | null>(null);
  const connectionAttemptRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Auth & Firestore sync
  useEffect(() => {
    if (!auth) return;
    let unsubFirestore: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      if (unsubFirestore) {
        unsubFirestore();
        unsubFirestore = null;
      }

      if (nextUser) {
        unsubFirestore = subscribeToFirestoreData(
          nextUser.uid,
          (prefs) => {
            setSerialSettings(prefs.serialDefaults);
            setSshSettings(prefs.sshDefaults);
          },
          (conns) => {
            setRecentConnections(conns);
          }
        );
      } else {
        setRecentConnections(loadLocalConnections());
      }
    });

    return () => {
      unsubAuth();
      if (unsubFirestore) unsubFirestore();
    };
  }, []);

  // Load authorized serial ports
  const refreshSerialPorts = useCallback(async () => {
    if (!isWebSerialSupported()) return;
    try {
      const ports = await getAuthorizedPorts();
      setSerialPorts(ports);
      setSelectedPortIndex((prev) =>
        ports.length === 0 ? 0 : Math.min(prev, ports.length - 1)
      );
    } catch {
      // Ignore serial enumeration errors
    }
  }, []);

  useEffect(() => {
    void refreshSerialPorts();
  }, [refreshSerialPorts]);

  const checkRelay = useCallback(async () => {
    setRelayStatus('checking');
    const ok = await checkSshRelayHealth(sshSettings.relayUrl);
    setRelayStatus(ok ? 'online' : 'offline');
    return ok;
  }, [sshSettings.relayUrl]);

  useEffect(() => {
    void checkRelay();
  }, [checkRelay]);

  const handleRequestSerialPort = async () => {
    try {
      const port = await requestSerialPort();
      const ports = await getAuthorizedPorts();
      setSerialPorts(ports);
      const idx = ports.indexOf(port);
      if (idx >= 0) {
        setSelectedPortIndex(idx);
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'NotFoundError') {
        terminalRef.current?.writeln(`\r\n\x1b[31m[Serial] ${err.message}\x1b[0m`);
      }
    }
  };

  // Sticky preferences
  const handleUpdateSerialSettings = (next: SerialSettings) => {
    setSerialSettings(next);
    const updatedPrefs = {
      serialDefaults: next,
      sshDefaults: sshSettings,
      updatedAt: Date.now(),
    };
    saveLocalPreferences(updatedPrefs);
    if (user) {
      void syncPreferencesToFirestore(user.uid, updatedPrefs);
    }
  };

  const handleUpdateSshSettings = (next: SshSettings) => {
    setSshSettings(next);
    const updatedPrefs = {
      serialDefaults: serialSettings,
      sshDefaults: next,
      updatedAt: Date.now(),
    };
    saveLocalPreferences(updatedPrefs);
    if (user) {
      void syncPreferencesToFirestore(user.uid, updatedPrefs);
    }
  };

  // Record connection attempt (success or failure)
  const recordConnectionAttempt = useCallback(
    (draft: Omit<RecentConnection, 'pinned' | 'lastUsedAt'>) => {
      setRecentConnections((prev) => {
        const existing = prev.find((c) => c.id === draft.id);
        const item = sanitizeConnectionForStorage({
          ...draft,
          pinned: existing?.pinned ?? false,
          lastUsedAt: Date.now(),
        });
        const filtered = prev.filter((c) => c.id !== item.id);
        const next = sortConnections([item, ...filtered]);
        saveLocalConnections(next);
        if (user) {
          void upsertConnectionToFirestore(user.uid, item);
        }
        lastConnectionRef.current = item;
        return next;
      });
    },
    [user]
  );

  const disconnectActive = useCallback(async () => {
    connectionAttemptRef.current += 1;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (transportRef.current) {
      const t = transportRef.current;
      transportRef.current = null;
      setStatus('disconnected');
      terminalRef.current?.writeln('\r\n\x1b[33m[Connection] Disconnected.\x1b[0m');
      await t.disconnect();
    } else {
      setStatus((prev) => {
        if (prev === 'connecting') {
          terminalRef.current?.writeln('\r\n\x1b[33m[Connection] Cancelled.\x1b[0m');
          return 'disconnected';
        }
        return prev;
      });
    }
  }, []);

  const connectSerialWith = useCallback(
    async (port: WebSerialPort, settings: SerialSettings, labelOverride?: string) => {
      await disconnectActive();
      const attemptId = ++connectionAttemptRef.current;

      const info = port.getInfo();
      const label = labelOverride || formatSerialPortLabel(port);
      const serialConfig: SerialConnectionConfig = {
        ...settings,
        usbVendorId: info.usbVendorId,
        usbProductId: info.usbProductId,
        portName: label,
      };
      const connId = buildSerialConnectionId(serialConfig);

      recordConnectionAttempt({
        id: connId,
        mode: 'serial',
        label,
        serialConfig,
      });

      setStatus('connecting');
      setActiveTarget(`${label} @ ${settings.baudRate}`);
      terminalRef.current?.writeln(
        `\r\n\x1b[36m[Serial] Opening ${label} (${settings.baudRate} ${settings.dataBits}${settings.parity[0].toUpperCase()}${settings.stopBits})...\x1b[0m`
      );

      try {
        const transport = await connectSerialPort(port, settings, {
          onData: (bytes) => terminalRef.current?.write(bytes),
          onClose: (err) => {
            if (transportRef.current === transport) {
              transportRef.current = null;
              setStatus(err ? 'error' : 'disconnected');
              terminalRef.current?.writeln(
                err
                  ? `\r\n\x1b[31m[Serial] Disconnected with error: ${err.message}\x1b[0m`
                  : `\r\n\x1b[33m[Serial] Port closed.\x1b[0m`
              );
            }
          },
        });

        if (attemptId !== connectionAttemptRef.current) {
          await transport.disconnect();
          return;
        }

        transportRef.current = transport;
        setStatus('connected');
        terminalRef.current?.writeln(`\x1b[32m[Serial] Connected.\x1b[0m`);
        terminalRef.current?.focus();
      } catch (err) {
        if (attemptId !== connectionAttemptRef.current) return;
        const msg = err instanceof Error ? err.message : String(err);
        setStatus('error');
        terminalRef.current?.writeln(`\x1b[31m[Serial] Failed: ${msg}\x1b[0m`);
      }
    },
    [disconnectActive, recordConnectionAttempt]
  );

  const connectSshWith = useCallback(
    async (config: SshConnectionConfig, creds: SshCredentials) => {
      await disconnectActive();
      const attemptId = ++connectionAttemptRef.current;
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const label = `${config.username}@${config.host}:${config.port}`;
      const connId = buildSshConnectionId(config);

      recordConnectionAttempt({
        id: connId,
        mode: 'ssh',
        label,
        sshConfig: config,
      });

      setStatus('connecting');
      setActiveTarget(label);
      terminalRef.current?.writeln(
        `\r\n\x1b[36m[SSH] Connecting to ${label} via ${config.relayUrl}...\x1b[0m`
      );

      const dims = terminalRef.current?.getDimensions() ?? { cols: 80, rows: 24 };

      try {
        const transport = await connectSshRelay(
          config,
          creds,
          dims,
          {
            onConnected: () => {
              if (attemptId !== connectionAttemptRef.current) return;
              setStatus('connected');
              terminalRef.current?.focus();
            },
            onData: (bytes) => terminalRef.current?.write(bytes),
            onClose: (err) => {
              if (transportRef.current === transport) {
                transportRef.current = null;
                setStatus(err ? 'error' : 'disconnected');
                terminalRef.current?.writeln(
                  err
                    ? `\r\n\x1b[31m[SSH] Connection closed: ${err.message}\x1b[0m`
                    : `\r\n\x1b[33m[SSH] Session closed.\x1b[0m`
                );
              }
            },
          },
          controller.signal
        );

        if (attemptId !== connectionAttemptRef.current) {
          await transport.disconnect();
          return;
        }

        abortControllerRef.current = null;
        transportRef.current = transport;
      } catch (err) {
        if (attemptId !== connectionAttemptRef.current) return;
        abortControllerRef.current = null;
        const msg = err instanceof Error ? err.message : String(err);
        setStatus('error');
        terminalRef.current?.writeln(`\x1b[31m[SSH] Failed: ${msg}\x1b[0m`);
        if (msg.includes('Unable to reach local SSH relay')) {
          setRelayStatus('offline');
          setRelayModalOpen(true);
        }
      }
    },
    [disconnectActive, recordConnectionAttempt]
  );

  const handleConnectSerial = () => {
    const port = serialPorts[selectedPortIndex];
    if (!port) return;
    void connectSerialWith(port, serialSettings, formatSerialPortLabel(port, selectedPortIndex));
  };

  const handleConnectSsh = () => {
    const host = sshHost.trim();
    const username = sshUsername.trim();
    if (!host || !username) return;
    void connectSshWith(
      {
        ...sshSettings,
        host,
        username,
      },
      sshCredentials
    );
  };

  const handleSelectRecent = async (conn: RecentConnection) => {
    if (conn.mode === 'ssh' && conn.sshConfig) {
      setMode('ssh');
      setSshHost(conn.sshConfig.host);
      setSshUsername(conn.sshConfig.username);
      const nextSettings: SshSettings = {
        port: conn.sshConfig.port,
        relayUrl: conn.sshConfig.relayUrl,
        keepaliveInterval: conn.sshConfig.keepaliveInterval,
        termType: conn.sshConfig.termType,
      };
      setSshSettings(nextSettings);
      await connectSshWith(conn.sshConfig, sshCredentials);
      return;
    }

    if (conn.mode === 'serial' && conn.serialConfig) {
      setMode('serial');
      const nextSettings: SerialSettings = {
        baudRate: conn.serialConfig.baudRate,
        dataBits: conn.serialConfig.dataBits,
        stopBits: conn.serialConfig.stopBits,
        parity: conn.serialConfig.parity,
        flowControl: conn.serialConfig.flowControl,
      };
      setSerialSettings(nextSettings);

      const ports = await getAuthorizedPorts();
      setSerialPorts(ports);

      let matchIdx = ports.findIndex((p) => {
        const info = p.getInfo();
        return (
          conn.serialConfig?.usbVendorId !== undefined &&
          info.usbVendorId === conn.serialConfig.usbVendorId &&
          info.usbProductId === conn.serialConfig.usbProductId
        );
      });

      if (matchIdx === -1 && ports.length > 0) {
        matchIdx = 0;
      }

      if (matchIdx >= 0) {
        setSelectedPortIndex(matchIdx);
        await connectSerialWith(ports[matchIdx], nextSettings, conn.label);
      } else {
        terminalRef.current?.writeln(
          `\r\n\x1b[33m[Serial] No authorized port found for "${conn.label}". Click "Select COM Port" to grant access.\x1b[0m`
        );
      }
    }
  };

  const handleReconnect = () => {
    const target = lastConnectionRef.current ?? recentConnections[0];
    if (target) {
      void handleSelectRecent(target);
    }
  };

  const handleTogglePin = (id: string) => {
    setRecentConnections((prev) => {
      const next = sortConnections(
        prev.map((c) => {
          if (c.id !== id) return c;
          const updated = { ...c, pinned: !c.pinned };
          if (user) {
            void upsertConnectionToFirestore(user.uid, updated);
          }
          return updated;
        })
      );
      saveLocalConnections(next);
      return next;
    });
  };

  const handleDeleteRecent = (id: string) => {
    setRecentConnections((prev) => {
      const next = prev.filter((c) => c.id !== id);
      saveLocalConnections(next);
      return next;
    });
    if (user) {
      void deleteConnectionFromFirestore(user.uid, id);
    }
  };

  const handleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      terminalRef.current?.writeln(`\r\n\x1b[31m[Auth] ${msg}\x1b[0m`);
    }
  };

  const handleSignOut = async () => {
    await signOutUser();
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-zinc-950 text-zinc-100 overflow-hidden">
      <TopBar
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        status={status}
        activeTarget={activeTarget}
        canReconnect={Boolean(lastConnectionRef.current || recentConnections[0])}
        onDisconnect={() => void disconnectActive()}
        onReconnect={handleReconnect}
        user={user}
        firebaseEnabled={isFirebaseConfigured}
        onSignIn={() => void handleSignIn()}
        onSignOut={() => void handleSignOut()}
      />

      <div className="flex-1 min-h-0 flex relative">
        <Sidebar
          open={sidebarOpen}
          onCloseMobile={() => setSidebarOpen(false)}
          mode={mode}
          onModeChange={setMode}
          status={status}
          serialPorts={serialPorts}
          selectedPortIndex={selectedPortIndex}
          onSelectPortIndex={setSelectedPortIndex}
          onRequestSerialPort={() => void handleRequestSerialPort()}
          onRefreshSerialPorts={() => void refreshSerialPorts()}
          serialSettings={serialSettings}
          onUpdateSerialSettings={handleUpdateSerialSettings}
          onConnectSerial={handleConnectSerial}
          sshHost={sshHost}
          onSshHostChange={setSshHost}
          sshUsername={sshUsername}
          onSshUsernameChange={setSshUsername}
          sshCredentials={sshCredentials}
          onSshCredentialsChange={setSshCredentials}
          sshSettings={sshSettings}
          onUpdateSshSettings={handleUpdateSshSettings}
          onConnectSsh={handleConnectSsh}
          relayStatus={relayStatus}
          onCheckRelay={() => void checkRelay()}
          onOpenRelaySetup={() => setRelayModalOpen(true)}
          recentConnections={recentConnections}
          onSelectRecent={(conn) => void handleSelectRecent(conn)}
          onTogglePin={handleTogglePin}
          onDeleteRecent={handleDeleteRecent}
        />

        <main className="flex-1 min-w-0 h-full bg-zinc-950 flex flex-col">
          {relayStatus === 'offline' && !relayBannerDismissed && (
            <div className="shrink-0 bg-amber-500/10 border-b border-amber-500/25 px-4 py-2 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-amber-200 min-w-0">
                <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                <span className="truncate">
                  Local SSH relay (<code className="font-mono">{sshSettings.relayUrl}</code>) not detected. Install it to enable SSH connections.
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setRelayModalOpen(true)}
                  className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold transition-colors"
                >
                  Install Relay
                </button>
                <button
                  type="button"
                  onClick={() => setRelayBannerDismissed(true)}
                  className="px-2 py-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/70 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          <div className="flex-1 min-h-0">
            <TerminalView
              ref={terminalRef}
              onInput={(data) => {
                void transportRef.current?.write(data);
              }}
              onResize={(cols, rows) => {
                transportRef.current?.resize?.(cols, rows);
              }}
            />
          </div>
        </main>
      </div>

      <RelaySetupModal
        open={relayModalOpen}
        onClose={() => setRelayModalOpen(false)}
        relayUrl={sshSettings.relayUrl}
        relayStatus={relayStatus}
        onCheckRelay={checkRelay}
      />
    </div>
  );
}

export default App;
