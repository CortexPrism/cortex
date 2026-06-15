import { bold, cyan, dim, green, magenta, yellow } from '@std/fmt/colors';

const ANSI_CLEAR = '\x1b[2J';
const ANSI_HIDE = '\x1b[?25l';
const ANSI_SHOW = '\x1b[?25h';
const ANSI_ALT_ENTER = '\x1b[?1049h';
const ANSI_ALT_EXIT = '\x1b[?1049l';
const ANSI_RESET = '\x1b[0m';
const ANSI_CURSOR_SAVE = '\x1b7';
const ANSI_CURSOR_RESTORE = '\x1b8';

let originalRaw: boolean | undefined;
let cleanupRegistered = false;

function ansiColor256(code: number): string {
  return `\x1b[38;5;${code}m`;
}

function ansiBg256(code: number): string {
  return `\x1b[48;5;${code}m`;
}

function cursorPos(row: number, col: number): string {
  return `\x1b[${row};${col}H`;
}

export function getTermSize(): { rows: number; cols: number } {
  try {
    const size = Deno.consoleSize();
    return { rows: size.rows, cols: size.columns };
  } catch {
    return { rows: 24, cols: 80 };
  }
}

export function enterAltScreen(): void {
  Deno.stdout.writeSync(new TextEncoder().encode(ANSI_ALT_ENTER + ANSI_HIDE));
}

export function exitAltScreen(): void {
  Deno.stdout.writeSync(new TextEncoder().encode(ANSI_SHOW + ANSI_ALT_EXIT));
}

export function clearScreen(): void {
  Deno.stdout.writeSync(new TextEncoder().encode(ANSI_CLEAR));
}

function restoreTerminal(): void {
  try {
    Deno.stdout.writeSync(new TextEncoder().encode(ANSI_SHOW + ANSI_ALT_EXIT + ANSI_RESET));
    if (originalRaw !== undefined && Deno.stdin.isTerminal()) {
      Deno.stdin.setRaw(originalRaw);
    }
  } catch {
    // terminal may already be closed
  }
}

export function registerCleanup(): void {
  if (cleanupRegistered) return;
  cleanupRegistered = true;
  if (Deno.stdin.isTerminal()) {
    originalRaw = true;
  }
  const sig = () => {
    restoreTerminal();
    Deno.exit(0);
  };
  try {
    Deno.addSignalListener('SIGINT', sig);
    Deno.addSignalListener('SIGTERM', sig);
  } catch {
    // signals not available on all platforms
  }
}

export interface FrameBuffer {
  width: number;
  height: number;
  data: string[][];
}

export function createFrameBuffer(width: number, height: number): FrameBuffer {
  return {
    width,
    height,
    data: Array.from({ length: height }, () => Array(width).fill(' ')),
  };
}

export function writeFrame(buf: FrameBuffer, offsetRow = 0, offsetCol = 0): void {
  const encoder = new TextEncoder();
  for (let y = 0; y < buf.height; y++) {
    const row = buf.data[y].join('');
    const trimmed = row.replace(/\s+$/, '');
    if (trimmed.length > 0) {
      const pos = cursorPos(offsetRow + y + 1, offsetCol + 1);
      Deno.stdout.writeSync(encoder.encode(pos + trimmed));
    }
  }
}

export class AnimationLoop {
  private running = false;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private lastFrame = 0;
  private fps: number;

  constructor(fps = 24) {
    this.fps = fps;
  }

  start(callback: (delta: number) => void): void {
    if (this.running) return;
    this.running = true;
    this.lastFrame = performance.now();
    const frameDuration = 1000 / this.fps;
    const loop = () => {
      if (!this.running) return;
      const now = performance.now();
      const delta = now - this.lastFrame;
      if (delta >= frameDuration) {
        this.lastFrame = now - (delta % frameDuration);
        callback(delta);
      }
      this.timerId = setTimeout(loop, Math.max(1, frameDuration - (performance.now() - now)));
    };
    loop();
  }

  stop(): void {
    this.running = false;
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  isRunning(): boolean {
    return this.running;
  }
}

export function renderAnsiGradient(text: string, startColor: number, endColor: number): string {
  const chars = [...text];
  const len = chars.length;
  return chars.map((ch, i) => {
    const t = len > 1 ? i / (len - 1) : 0;
    const r = Math.round(
      ((startColor >> 16) & 0xff) * (1 - t) + ((endColor >> 16) & 0xff) * t,
    );
    const g = Math.round(
      ((startColor >> 8) & 0xff) * (1 - t) + ((endColor >> 8) & 0xff) * t,
    );
    const b = Math.round(
      (startColor & 0xff) * (1 - t) + (endColor & 0xff) * t,
    );
    const ansi = `\x1b[38;2;${r};${g};${b}m`;
    return `${ansi}${ch}`;
  }).join('') + ANSI_RESET;
}

export {
  ANSI_CURSOR_RESTORE,
  ANSI_CURSOR_SAVE,
  ANSI_HIDE,
  ANSI_RESET,
  ANSI_SHOW,
  ansiColor256,
  cursorPos,
};
