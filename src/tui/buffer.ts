export interface CellStyle {
  fg?: string;
  bg?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  inverse?: boolean;
}

export interface Cell {
  char: string;
  style: CellStyle;
}

const EMPTY_CELL: Cell = { char: ' ', style: {} };

function cloneStyle(s: CellStyle): CellStyle {
  return {
    fg: s.fg,
    bg: s.bg,
    bold: s.bold,
    dim: s.dim,
    italic: s.italic,
    underline: s.underline,
    inverse: s.inverse,
  };
}

function styleEqual(a: CellStyle, b: CellStyle): boolean {
  return a.fg === b.fg &&
    a.bg === b.bg &&
    a.bold === b.bold &&
    a.dim === b.dim &&
    a.italic === b.italic &&
    a.underline === a.underline &&
    a.inverse === b.inverse;
}

export class CellBuffer {
  width: number;
  height: number;
  private cells: Cell[][];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.cells = this.createGrid(width, height);
  }

  private createGrid(w: number, h: number): Cell[][] {
    const grid: Cell[][] = [];
    for (let y = 0; y < h; y++) {
      const row: Cell[] = [];
      for (let x = 0; x < w; x++) {
        row.push({ char: ' ', style: {} });
      }
      grid.push(row);
    }
    return grid;
  }

  resize(w: number, h: number): void {
    const oldCells = this.cells;
    this.width = w;
    this.height = h;
    this.cells = this.createGrid(w, h);
    for (let y = 0; y < Math.min(h, oldCells.length); y++) {
      for (let x = 0; x < Math.min(w, oldCells[y]?.length ?? 0); x++) {
        if (oldCells[y]?.[x]) {
          this.cells[y][x] = { char: oldCells[y][x].char, style: cloneStyle(oldCells[y][x].style) };
        }
      }
    }
  }

  setCell(x: number, y: number, char: string, style?: CellStyle): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    this.cells[y][x] = {
      char: char.length > 0 ? char[0] : ' ',
      style: style ? cloneStyle(style) : {},
    };
  }

  getCell(x: number, y: number): Cell {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return EMPTY_CELL;
    return this.cells[y][x];
  }

  fillRect(
    x: number,
    y: number,
    w: number,
    h: number,
    char: string,
    style?: CellStyle,
  ): void {
    const endX = Math.min(x + w, this.width);
    const endY = Math.min(y + h, this.height);
    for (let cy = Math.max(y, 0); cy < endY; cy++) {
      for (let cx = Math.max(x, 0); cx < endX; cx++) {
        this.setCell(cx, cy, char, style);
      }
    }
  }

  drawText(x: number, y: number, text: string, style?: CellStyle): void {
    for (let i = 0; i < text.length && x + i < this.width; i++) {
      if (y >= 0 && y < this.height) {
        this.setCell(x + i, y, text[i], style);
      }
    }
  }

  drawTextWrapped(
    x: number,
    y: number,
    text: string,
    maxWidth: number,
    maxHeight: number,
    style?: CellStyle,
  ): number {
    let cx = x;
    let cy = y;
    let word = '';
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '\n') {
        if (cx + word.length < x + maxWidth) {
          this.drawText(cx, cy, word, style);
          cx += word.length;
        }
        cx = x;
        cy++;
        word = '';
        if (cy >= y + maxHeight) break;
        continue;
      }
      if (ch === ' ' && cx + word.length >= x + maxWidth) {
        cx = x;
        cy++;
        if (cx + word.length < x + maxWidth) {
          this.drawText(cx, cy, word, style);
          cx += word.length;
        }
        word = '';
        if (cy >= y + maxHeight) break;
        continue;
      }
      word += ch;
      if (ch === ' ') {
        if (cx + word.length < x + maxWidth) {
          this.drawText(cx, cy, word, style);
          cx += word.length;
        } else {
          cx = x;
          cy++;
          if (cy >= y + maxHeight) break;
          this.drawText(cx, cy, word.trimStart(), style);
          cx += word.trimStart().length;
        }
        word = '';
      }
    }
    if (word && cy < y + maxHeight) {
      if (cx + word.length < x + maxWidth) {
        this.drawText(cx, cy, word, style);
      } else if (cy + 1 < y + maxHeight) {
        this.drawText(x, cy + 1, word, style);
      }
    }
    return cy;
  }

  clear(style?: CellStyle): void {
    const s = style ?? {};
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.cells[y][x] = { char: ' ', style: cloneStyle(s) };
      }
    }
  }

  clone(): CellBuffer {
    const buf = new CellBuffer(this.width, this.height);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        buf.cells[y][x] = {
          char: this.cells[y][x].char,
          style: cloneStyle(this.cells[y][x].style),
        };
      }
    }
    return buf;
  }

  diffAndFlush(prev: CellBuffer | null, writer: { writeSync(p: Uint8Array): number }): void {
    const out: string[] = [];
    let lastStyle = '';
    let lastX = -1;
    let lastY = -1;

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const cell = this.cells[y][x];
        const prevCell = prev?.cells[y]?.[x];

        if (
          prev &&
          prevCell &&
          prevCell.char === cell.char &&
          styleEqual(prevCell.style, cell.style)
        ) {
          continue;
        }

        const styleStr = styleToAnsi(cell.style);
        if (styleStr !== lastStyle) {
          out.push(styleStr);
          lastStyle = styleStr;
        }

        if (lastY !== y || lastX + 1 !== x) {
          out.push(`\x1b[${y + 1};${x + 1}H`);
        }

        out.push(cell.char);
        lastX = x;
        lastY = y;
      }
    }

    if (out.length > 0) {
      writer.writeSync(new TextEncoder().encode(out.join('')));
    }
  }
}

export function styleToAnsi(style: CellStyle): string {
  const codes: string[] = [];

  if (style.bold) codes.push('1');
  if (style.dim) codes.push('2');
  if (style.italic) codes.push('3');
  if (style.underline) codes.push('4');
  if (style.inverse) codes.push('7');
  if (!style.bold && !style.dim && !style.italic && !style.underline && !style.inverse) {
    codes.push('0');
  }

  if (style.fg) {
    codes.push(style.fg.includes(';') ? `38;${style.fg}` : style.fg);
  }
  if (style.bg) {
    codes.push(style.bg.includes(';') ? `48;${style.bg}` : style.bg);
  }

  return `\x1b[${codes.join(';')}m`;
}

export function mergeStyles(base: CellStyle, overrides?: CellStyle): CellStyle {
  if (!overrides) return cloneStyle(base);
  return {
    fg: overrides.fg ?? base.fg,
    bg: overrides.bg ?? base.bg,
    bold: overrides.bold ?? base.bold,
    dim: overrides.dim ?? base.dim,
    italic: overrides.italic ?? base.italic,
    underline: overrides.underline ?? base.underline,
    inverse: overrides.inverse ?? base.inverse,
  };
}
