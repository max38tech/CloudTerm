import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  RefreshCw,
  Terminal,
  X,
} from 'lucide-react';

export type RelayStatus = 'checking' | 'online' | 'offline';
type Platform = 'linux' | 'macos' | 'windows';

interface RelaySetupModalProps {
  open: boolean;
  onClose: () => void;
  relayUrl: string;
  relayStatus: RelayStatus;
  onCheckRelay: () => Promise<boolean>;
}

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'linux';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('win')) return 'windows';
  if (ua.includes('mac')) return 'macos';
  return 'linux';
}

const GITHUB_RELEASES_URL =
  'https://github.com/max38tech/CloudTerm/releases/latest';

export function RelaySetupModal({
  open,
  onClose,
  relayUrl,
  relayStatus,
  onCheckRelay,
}: RelaySetupModalProps) {
  const [platform, setPlatform] = useState<Platform>(detectPlatform);
  const [copied, setCopied] = useState(false);

  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://cloudterm.app';

  const installCommand = useMemo(() => {
    if (platform === 'windows') {
      return `irm ${origin}/install.ps1 | iex`;
    }
    return `curl -fsSL ${origin}/install.sh | bash`;
  }, [origin, platform]);

  const scriptPath = platform === 'windows' ? '/install.ps1' : '/install.sh';
  const scriptFilename = platform === 'windows' ? 'install.ps1' : 'install.sh';

  useEffect(() => {
    if (!open || relayStatus === 'online') return;
    const interval = window.setInterval(() => {
      void onCheckRelay();
    }, 2500);
    return () => window.clearInterval(interval);
  }, [open, relayStatus, onCheckRelay]);

  if (!open) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(installCommand);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may be unavailable in non-secure contexts
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">
                Install CloudTerm SSH Relay
              </h2>
              <p className="text-xs text-zinc-400">
                Local WebSocket-to-SSH bridge ({relayUrl})
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Live Relay Status */}
          <div
            className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg border text-xs ${
              relayStatus === 'online'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {relayStatus === 'online' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
              )}
              <span className="truncate">
                {relayStatus === 'online'
                  ? `Relay connected at ${relayUrl}`
                  : relayStatus === 'checking'
                    ? `Checking ${relayUrl}...`
                    : `Relay not detected at ${relayUrl} (listening...)`}
              </span>
            </div>

            <button
              type="button"
              onClick={() => void onCheckRelay()}
              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-zinc-900/80 border border-zinc-700/70 text-zinc-200 hover:bg-zinc-800 shrink-0 transition-colors"
            >
              <RefreshCw
                className={`w-3 h-3 ${relayStatus === 'checking' ? 'animate-spin' : ''}`}
              />
              <span>Check</span>
            </button>
          </div>

          <p className="text-xs text-zinc-400 leading-relaxed">
            Browsers cannot open raw TCP sockets directly for SSH. Run this
            one-line installer to download and start{' '}
            <code className="text-zinc-200 font-mono">cloudterm-relay</code>{' '}
            locally without cloning the repository:
          </p>

          {/* OS Selector */}
          <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-zinc-900 border border-zinc-800/80">
            {(
              [
                { id: 'linux', label: 'Linux' },
                { id: 'macos', label: 'macOS' },
                { id: 'windows', label: 'Windows' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setPlatform(tab.id)}
                className={`py-1.5 rounded-md text-xs font-medium transition-colors ${
                  platform === tab.id
                    ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Primary Windows 1-click installer */}
          {platform === 'windows' && (
            <div className="space-y-2">
              <a
                href="/install-cloudterm-relay.cmd"
                download="install-cloudterm-relay.cmd"
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Download Windows Installer (.cmd)</span>
              </a>
              <p className="text-[11px] text-zinc-500">
                Open the downloaded file to install and start the relay automatically (no terminal commands needed).
              </p>
            </div>
          )}

          {/* Command Box */}
          <div className="space-y-2">
            <div className="text-[11px] font-medium text-zinc-400">
              {platform === 'windows'
                ? 'Or run in PowerShell:'
                : 'Run in your terminal:'}
            </div>
            <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5">
              <code className="flex-1 text-xs font-mono text-emerald-300 overflow-x-auto whitespace-nowrap">
                {installCommand}
              </code>
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-100 shrink-0 transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Alternative Download Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2">
              <a
                href={scriptPath}
                download={scriptFilename}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-900 border border-zinc-800 text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download {scriptFilename}</span>
              </a>
              <a
                href={GITHUB_RELEASES_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>GitHub Releases</span>
              </a>
            </div>

            <button
              type="button"
              onClick={onClose}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                relayStatus === 'online'
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
              }`}
            >
              {relayStatus === 'online' ? 'Done' : 'Close'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
