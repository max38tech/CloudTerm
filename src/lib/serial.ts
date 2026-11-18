import type { SerialSettings, TerminalTransport } from '../types/terminal';

export interface SerialPortInfo {
  usbVendorId?: number;
  usbProductId?: number;
}

export interface WebSerialPort {
  getInfo(): SerialPortInfo;
  open(options: {
    baudRate: number;
    dataBits?: 7 | 8;
    stopBits?: 1 | 2;
    parity?: 'none' | 'even' | 'odd';
    flowControl?: 'none' | 'hardware';
  }): Promise<void>;
  close(): Promise<void>;
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
}

interface NavigatorWithSerial extends Navigator {
  serial?: {
    requestPort(): Promise<WebSerialPort>;
    getPorts(): Promise<WebSerialPort[]>;
  };
}

export function isWebSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

export async function getAuthorizedPorts(): Promise<WebSerialPort[]> {
  const nav = navigator as NavigatorWithSerial;
  if (!nav.serial) return [];
  return nav.serial.getPorts();
}

export async function requestSerialPort(): Promise<WebSerialPort> {
  const nav = navigator as NavigatorWithSerial;
  if (!nav.serial) {
    throw new Error('Web Serial API is not supported in this browser. Use Chrome, Edge, or Opera.');
  }
  return nav.serial.requestPort();
}

export function formatSerialPortLabel(port: WebSerialPort, index?: number): string {
  const info = port.getInfo();
  if (info.usbVendorId !== undefined && info.usbProductId !== undefined) {
    const vid = info.usbVendorId.toString(16).padStart(4, '0').toUpperCase();
    const pid = info.usbProductId.toString(16).padStart(4, '0').toUpperCase();
    return `USB Serial (${vid}:${pid})`;
  }
  return index !== undefined ? `Serial Port #${index + 1}` : 'Serial Port';
}

export async function connectSerialPort(
  port: WebSerialPort,
  settings: SerialSettings,
  callbacks: {
    onData: (data: Uint8Array) => void;
    onClose: (error?: Error) => void;
  }
): Promise<TerminalTransport> {
  await port.open({
    baudRate: settings.baudRate,
    dataBits: settings.dataBits,
    stopBits: settings.stopBits,
    parity: settings.parity,
    flowControl: settings.flowControl,
  });

  let closed = false;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  const textEncoder = new TextEncoder();

  const readLoop = async () => {
    while (port.readable && !closed) {
      reader = port.readable.getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value && value.length > 0) {
            callbacks.onData(value);
          }
        }
      } catch (err) {
        if (!closed) {
          callbacks.onClose(err instanceof Error ? err : new Error(String(err)));
        }
        break;
      } finally {
        reader.releaseLock();
        reader = null;
      }
    }
    if (!closed) {
      closed = true;
      callbacks.onClose();
    }
  };

  void readLoop();

  return {
    write: async (data: string | Uint8Array) => {
      if (closed || !port.writable) return;
      const writer = port.writable.getWriter();
      try {
        const bytes = typeof data === 'string' ? textEncoder.encode(data) : data;
        await writer.write(bytes);
      } finally {
        writer.releaseLock();
      }
    },
    disconnect: async () => {
      if (closed) return;
      closed = true;
      try {
        if (reader) {
          await reader.cancel();
        }
      } catch {
        // Ignore reader cancel errors
      }
      try {
        await port.close();
      } catch {
        // Ignore close errors
      }
      callbacks.onClose();
    },
  };
}
