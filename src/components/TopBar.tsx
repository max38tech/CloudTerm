import type { User } from 'firebase/auth';
import {
  LogIn,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  PlugZap,
  RotateCw,
  Terminal,
  Unplug,
} from 'lucide-react';
import type { ConnectionStatus } from '../types/terminal';

interface TopBarProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  status: ConnectionStatus;
  activeTarget: string | null;
  canReconnect: boolean;
  onDisconnect: () => void;
  onReconnect: () => void;
  user: User | null;
  firebaseEnabled: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
}

const STATUS_META: Record<
  ConnectionStatus,
  { label: string; dotClass: string; textClass: string }
> = {
  connected: {
    label: 'Connected',
    dotClass: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]',
    textClass: 'text-emerald-400',
  },
  connecting: {
    label: 'Connecting',
    dotClass: 'bg-amber-400 animate-pulse',
    textClass: 'text-amber-400',
  },
  disconnected: {
    label: 'Disconnected',
    dotClass: 'bg-zinc-500',
    textClass: 'text-zinc-400',
  },
  error: {
    label: 'Error',
    dotClass: 'bg-rose-500',
    textClass: 'text-rose-400',
  },
};

export function TopBar({
  sidebarOpen,
  onToggleSidebar,
  status,
  activeTarget,
  canReconnect,
  onDisconnect,
  onReconnect,
  user,
  firebaseEnabled,
  onSignIn,
  onSignOut,
}: TopBarProps) {
  const meta = STATUS_META[status];

  return (
    <header className="h-12 shrink-0 border-b border-zinc-800/80 bg-zinc-950 px-3 flex items-center justify-between gap-3 select-none">
      <div className="flex items-center gap-2.5 min-w-0">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70 transition-colors"
          title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {sidebarOpen ? (
            <PanelLeftClose className="w-4 h-4" />
          ) : (
            <PanelLeftOpen className="w-4 h-4" />
          )}
        </button>

        <div className="flex items-center gap-2 shrink-0">
          <div className="w-6 h-6 rounded-md bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Terminal className="w-3.5 h-3.5" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-zinc-100 hidden sm:inline">
            CloudTerm
          </span>
        </div>

        <div className="h-4 w-px bg-zinc-800 mx-1 hidden sm:block" />

        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${meta.dotClass}`} />
          <span className={`text-xs font-medium shrink-0 ${meta.textClass}`}>
            {meta.label}
          </span>
          {activeTarget && (
            <span
              className="text-xs font-mono text-zinc-300 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded truncate max-w-[180px] sm:max-w-[300px]"
              title={activeTarget}
            >
              {activeTarget}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {status === 'connected' || status === 'connecting' ? (
          <button
            type="button"
            onClick={onDisconnect}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-rose-500/10 text-rose-300 border border-rose-500/25 hover:bg-rose-500/20 transition-colors"
          >
            <Unplug className="w-3.5 h-3.5" />
            <span>Disconnect</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onReconnect}
            disabled={!canReconnect}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-zinc-900 text-zinc-200 border border-zinc-800 hover:bg-zinc-800 disabled:opacity-40 disabled:pointer-events-none transition-colors"
            title={canReconnect ? 'Reconnect to last target' : 'No previous target'}
          >
            {canReconnect ? (
              <RotateCw className="w-3.5 h-3.5" />
            ) : (
              <PlugZap className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">Reconnect</span>
          </button>
        )}

        {firebaseEnabled && (
          <>
            <div className="h-4 w-px bg-zinc-800" />
            {user ? (
              <div className="flex items-center gap-2">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'User'}
                    className="w-6 h-6 rounded-full border border-zinc-700"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[11px] font-medium text-zinc-200">
                    {(user.displayName || user.email || 'U')[0].toUpperCase()}
                  </div>
                )}
                <button
                  type="button"
                  onClick={onSignOut}
                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70 transition-colors"
                  title={`Sign out (${user.email || user.displayName || 'Account'})`}
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Sign out</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onSignIn}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-zinc-100 text-zinc-950 hover:bg-white transition-colors"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign in with Google</span>
              </button>
            )}
          </>
        )}
      </div>
    </header>
  );
}
