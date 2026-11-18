import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  DEFAULT_SERIAL_SETTINGS,
  DEFAULT_SSH_SETTINGS,
  type RecentConnection,
  type SerialConnectionConfig,
  type SshConnectionConfig,
  type UserPreferences,
} from '../types/terminal';

const PREFS_STORAGE_KEY = 'cloudterm:prefs:v1';
const CONNECTIONS_STORAGE_KEY = 'cloudterm:connections:v1';

export function loadLocalPreferences(): UserPreferences {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) {
      return {
        serialDefaults: { ...DEFAULT_SERIAL_SETTINGS },
        sshDefaults: { ...DEFAULT_SSH_SETTINGS },
      };
    }
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    return {
      serialDefaults: {
        ...DEFAULT_SERIAL_SETTINGS,
        ...(parsed.serialDefaults ?? {}),
      },
      sshDefaults: {
        ...DEFAULT_SSH_SETTINGS,
        ...(parsed.sshDefaults ?? {}),
      },
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return {
      serialDefaults: { ...DEFAULT_SERIAL_SETTINGS },
      sshDefaults: { ...DEFAULT_SSH_SETTINGS },
    };
  }
}

export function saveLocalPreferences(prefs: UserPreferences): void {
  try {
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadLocalConnections(): RecentConnection[] {
  try {
    const raw = localStorage.getItem(CONNECTIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return sortConnections(parsed as RecentConnection[]);
  } catch {
    return [];
  }
}

export function saveLocalConnections(connections: RecentConnection[]): void {
  try {
    localStorage.setItem(CONNECTIONS_STORAGE_KEY, JSON.stringify(connections));
  } catch {
    // Ignore storage quota errors
  }
}

export function sortConnections(connections: RecentConnection[]): RecentConnection[] {
  return [...connections].sort((a, b) => {
    if (a.pinned !== b.pinned) {
      return a.pinned ? -1 : 1;
    }
    return b.lastUsedAt - a.lastUsedAt;
  });
}

function sanitizeId(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9._:-]/g, '_')
    .slice(0, 120);
}

export function buildSerialConnectionId(config: SerialConnectionConfig): string {
  if (config.usbVendorId !== undefined && config.usbProductId !== undefined) {
    return sanitizeId(`serial_${config.usbVendorId}_${config.usbProductId}`);
  }
  return sanitizeId(`serial_${config.portName || 'port'}`);
}

export function buildSshConnectionId(config: SshConnectionConfig): string {
  const user = config.username || 'user';
  return sanitizeId(`ssh_${user}_${config.host}_${config.port}`);
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result as Partial<T>;
}

export function sanitizeConnectionForStorage(conn: RecentConnection): RecentConnection {
  const base: RecentConnection = {
    id: conn.id.slice(0, 128),
    mode: conn.mode,
    label: conn.label.slice(0, 200),
    pinned: Boolean(conn.pinned),
    lastUsedAt: conn.lastUsedAt,
  };

  if (conn.mode === 'serial' && conn.serialConfig) {
    base.serialConfig = stripUndefined({
      baudRate: conn.serialConfig.baudRate,
      dataBits: conn.serialConfig.dataBits,
      stopBits: conn.serialConfig.stopBits,
      parity: conn.serialConfig.parity,
      flowControl: conn.serialConfig.flowControl,
      usbVendorId: conn.serialConfig.usbVendorId,
      usbProductId: conn.serialConfig.usbProductId,
      portName: conn.serialConfig.portName,
    }) as SerialConnectionConfig;
  }

  if (conn.mode === 'ssh' && conn.sshConfig) {
    // Explicitly whitelist only non-secret SSH metadata
    base.sshConfig = stripUndefined({
      host: conn.sshConfig.host,
      port: conn.sshConfig.port,
      username: conn.sshConfig.username,
      relayUrl: conn.sshConfig.relayUrl,
      keepaliveInterval: conn.sshConfig.keepaliveInterval,
      termType: conn.sshConfig.termType,
    }) as SshConnectionConfig;
  }

  return base;
}

export async function syncPreferencesToFirestore(
  uid: string,
  prefs: UserPreferences
): Promise<void> {
  if (!db) return;
  const ref = doc(db, 'users', uid);
  await setDoc(
    ref,
    {
      serialDefaults: {
        baudRate: prefs.serialDefaults.baudRate,
        dataBits: prefs.serialDefaults.dataBits,
        stopBits: prefs.serialDefaults.stopBits,
        parity: prefs.serialDefaults.parity,
        flowControl: prefs.serialDefaults.flowControl,
      },
      sshDefaults: {
        port: prefs.sshDefaults.port,
        relayUrl: prefs.sshDefaults.relayUrl,
        keepaliveInterval: prefs.sshDefaults.keepaliveInterval,
        termType: prefs.sshDefaults.termType,
      },
      updatedAt: Date.now(),
    },
    { merge: true }
  );
}

export async function upsertConnectionToFirestore(
  uid: string,
  conn: RecentConnection
): Promise<void> {
  if (!db) return;
  const clean = sanitizeConnectionForStorage(conn);
  const ref = doc(db, 'users', uid, 'connections', clean.id);
  await setDoc(ref, clean, { merge: true });
}

export async function deleteConnectionFromFirestore(
  uid: string,
  connectionId: string
): Promise<void> {
  if (!db) return;
  const ref = doc(db, 'users', uid, 'connections', connectionId);
  await deleteDoc(ref);
}

export function subscribeToFirestoreData(
  uid: string,
  onPrefs: (prefs: UserPreferences) => void,
  onConnections: (connections: RecentConnection[]) => void
): Unsubscribe {
  if (!db) {
    return () => {};
  }

  const userRef = doc(db, 'users', uid);
  const unsubUser = onSnapshot(
    userRef,
    (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as Partial<UserPreferences>;
      const merged: UserPreferences = {
        serialDefaults: {
          ...DEFAULT_SERIAL_SETTINGS,
          ...(data.serialDefaults ?? {}),
        },
        sshDefaults: {
          ...DEFAULT_SSH_SETTINGS,
          ...(data.sshDefaults ?? {}),
        },
        updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : Date.now(),
      };
      saveLocalPreferences(merged);
      onPrefs(merged);
    },
    (err) => {
      console.warn('Firestore preferences listener error:', err);
    }
  );

  const connsRef = collection(db, 'users', uid, 'connections');
  const unsubConns = onSnapshot(
    connsRef,
    (snap) => {
      const items: RecentConnection[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data() as RecentConnection;
        if (data && data.id && data.mode && data.label) {
          items.push(data);
        }
      });
      const sorted = sortConnections(items);
      saveLocalConnections(sorted);
      onConnections(sorted);
    },
    (err) => {
      console.warn('Firestore connections listener error:', err);
    }
  );

  return () => {
    unsubUser();
    unsubConns();
  };
}
