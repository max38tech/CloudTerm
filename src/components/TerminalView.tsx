import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

export interface TerminalHandle {
  write: (data: string | Uint8Array) => void;
  writeln: (text: string) => void;
  clear: () => void;
  focus: () => void;
  getDimensions: () => { cols: number; rows: number };
}

interface TerminalViewProps {
  onInput: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
}

export const TerminalView = forwardRef<TerminalHandle, TerminalViewProps>(
  function TerminalView({ onInput, onResize }, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const termRef = useRef<Terminal | null>(null);
    const fitRef = useRef<FitAddon | null>(null);
    const onInputRef = useRef(onInput);
    const onResizeRef = useRef(onResize);

    onInputRef.current = onInput;
    onResizeRef.current = onResize;

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const term = new Terminal({
        cursorBlink: true,
        cursorStyle: 'block',
        fontFamily:
          "'JetBrains Mono', 'Fira Code', 'Cascadia Code', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 13,
        lineHeight: 1.35,
        scrollback: 10000,
        convertEol: false,
        theme: {
          background: '#09090b',
          foreground: '#e4e4e7',
          cursor: '#10b981',
          cursorAccent: '#09090b',
          selectionBackground: 'rgba(16, 185, 129, 0.25)',
          black: '#18181b',
          red: '#f43f5e',
          green: '#10b981',
          yellow: '#f59e0b',
          blue: '#3b82f6',
          magenta: '#a855f7',
          cyan: '#06b6d4',
          white: '#e4e4e7',
          brightBlack: '#52525b',
          brightRed: '#fb7185',
          brightGreen: '#34d399',
          brightYellow: '#fbbf24',
          brightBlue: '#60a5fa',
          brightMagenta: '#c084fc',
          brightCyan: '#22d3ee',
          brightWhite: '#fafafa',
        },
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(container);

      termRef.current = term;
      fitRef.current = fitAddon;

      const fitTerminal = () => {
        try {
          fitAddon.fit();
          onResizeRef.current(term.cols, term.rows);
        } catch {
          // Ignore fit errors when container is hidden
        }
      };

      requestAnimationFrame(fitTerminal);

      term.writeln('\x1b[1;32mCloudTerm\x1b[0m — Select a Serial port or SSH host to connect.');
      term.writeln('');

      const dataSub = term.onData((data) => {
        onInputRef.current(data);
      });

      // Copy-on-select
      const selSub = term.onSelectionChange(() => {
        const selection = term.getSelection();
        if (selection) {
          void navigator.clipboard?.writeText(selection).catch(() => {});
        }
      });

      const resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(fitTerminal);
      });
      resizeObserver.observe(container);

      return () => {
        resizeObserver.disconnect();
        dataSub.dispose();
        selSub.dispose();
        term.dispose();
        termRef.current = null;
        fitRef.current = null;
      };
    }, []);

    useImperativeHandle(ref, () => ({
      write: (data: string | Uint8Array) => {
        termRef.current?.write(data);
      },
      writeln: (text: string) => {
        termRef.current?.writeln(text);
      },
      clear: () => {
        termRef.current?.clear();
      },
      focus: () => {
        termRef.current?.focus();
      },
      getDimensions: () => ({
        cols: termRef.current?.cols ?? 80,
        rows: termRef.current?.rows ?? 24,
      }),
    }));

    const handleContextMenu = async (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      try {
        const text = await navigator.clipboard?.readText();
        if (text) {
          onInputRef.current(text);
        }
      } catch {
        // Clipboard read permission denied or unavailable
      }
      termRef.current?.focus();
    };

    return (
      <div
        ref={containerRef}
        onContextMenu={handleContextMenu}
        className="w-full h-full bg-zinc-950 overflow-hidden"
      />
    );
  }
);
