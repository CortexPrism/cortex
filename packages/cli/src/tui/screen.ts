import { CellBuffer } from './buffer.ts';

export function getTermCols(): number {
  try {
    return Deno.consoleSize()?.columns ?? 80;
  } catch {
    return 80;
  }
}

export function getTermRows(): number {
  try {
    return Deno.consoleSize()?.rows ?? 24;
  } catch {
    return 24;
  }
}

export async function execShell(cmd: string): Promise<string> {
  const proc = new Deno.Command('bash', {
    args: ['-c', cmd],
    stdout: 'piped',
    stderr: 'piped',
    cwd: Deno.cwd(),
  });
  const output = await proc.output();
  const stdout = new TextDecoder().decode(output.stdout);
  const stderr = new TextDecoder().decode(output.stderr);
  const result = [stdout, stderr].filter(Boolean).join('\n') ||
    `(exit code: ${output.code})`;
  return `$ ${cmd}\n${result.slice(0, 2000)}`;
}

export class VirtualScreen {
  buffer: CellBuffer;
  private prevBuffer: CellBuffer | null = null;
  private writer: { writeSync(p: Uint8Array): number };

  constructor(width: number, height: number, writer?: { writeSync(p: Uint8Array): number }) {
    this.buffer = new CellBuffer(width, height);
    this.writer = writer ?? Deno.stdout;
  }

  get width(): number {
    return this.buffer.width;
  }

  get height(): number {
    return this.buffer.height;
  }

  resize(w: number, h: number): void {
    this.buffer.resize(w, h);
    this.prevBuffer = null;
  }

  flush(): void {
    this.buffer.diffAndFlush(this.prevBuffer, this.writer);
    this.prevBuffer = this.buffer.clone();
  }

  clear(): void {
    this.buffer.clear();
    this.flush();
  }

  hideCursor(): void {
    this.writer.writeSync(new TextEncoder().encode('\x1b[?25l'));
  }

  showCursor(): void {
    this.writer.writeSync(new TextEncoder().encode('\x1b[?25h'));
  }

  moveCursor(x: number, y: number): void {
    this.writer.writeSync(
      new TextEncoder().encode(`\x1b[${y + 1};${x + 1}H`),
    );
  }

  reset(): void {
    this.showCursor();
    this.writer.writeSync(new TextEncoder().encode('\x1b[2J\x1b[H'));
  }
}
