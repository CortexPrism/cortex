import type { CellBuffer, CellStyle } from './buffer.ts';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const BRAILLE_BAR = ['⣀', '⣄', '⣤', '⣦', '⣶', '⣷', '⣿'];
const ASCII_BAR = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

export class Spinner {
  private frame = 0;

  nextFrame(): string {
    const ch = SPINNER_FRAMES[this.frame % SPINNER_FRAMES.length];
    this.frame++;
    return ch;
  }

  render(
    buffer: CellBuffer,
    x: number,
    y: number,
    style?: CellStyle,
  ): void {
    buffer.setCell(x, y, this.nextFrame(), style);
  }

  reset(): void {
    this.frame = 0;
  }
}

export class ProgressBar {
  private current = 0;
  private total: number;

  constructor(total: number) {
    this.total = total;
  }

  setProgress(current: number): void {
    this.current = Math.max(0, Math.min(current, this.total));
  }

  render(
    buffer: CellBuffer,
    x: number,
    y: number,
    width: number,
    style?: CellStyle,
    useBraille?: boolean,
  ): void {
    const ratio = this.total > 0 ? this.current / this.total : 0;
    const filled = Math.floor(ratio * width);
    const remaining = width - filled;

    for (let i = 0; i < filled; i++) {
      const chars = useBraille ? BRAILLE_BAR : ASCII_BAR;
      buffer.setCell(x + i, y, chars[chars.length - 1], style);
    }
    for (let i = 0; i < remaining; i++) {
      buffer.setCell(x + filled + i, y, ' ', { dim: true });
    }
  }

  // deno-lint-ignore no-unused-vars
  get percentage(): number {
    return this.total > 0 ? Math.round((this.current / this.total) * 100) : 0;
  }
}
