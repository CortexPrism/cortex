import { Component } from '../component.ts';
import type { RenderContext } from '../component.ts';

export class DiffBlock extends Component {
  private lines: string[] = [];

  setDiff(diffText: string): void {
    this.lines = diffText.split('\n');
    this.requestRender();
  }

  render(ctx: RenderContext): void {
    const addedStyle = ctx.theme.styles['diff.added'] ?? { fg: '32' };
    const removedStyle = ctx.theme.styles['diff.removed'] ?? { fg: '31' };
    const headerStyle = ctx.theme.styles['diff.header'] ?? { dim: true };
    const defaultStyle = ctx.theme.styles['default'] ?? {};

    let y = ctx.y;
    for (let i = 0; i < this.lines.length && y < ctx.y + ctx.height; i++) {
      const line = this.lines[i];
      let style = defaultStyle;
      let displayLine = line;

      if (line.startsWith('@@')) {
        style = headerStyle;
      } else if (line.startsWith('+')) {
        style = addedStyle;
      } else if (line.startsWith('-')) {
        style = removedStyle;
      } else if (
        line.startsWith('diff ') || line.startsWith('index ') ||
        line.startsWith('---') || line.startsWith('+++')
      ) {
        style = headerStyle;
      }

      const text = displayLine.slice(0, ctx.width);
      ctx.buffer.drawText(ctx.x, y, text, style);
      for (let x = text.length; x < ctx.width; x++) {
        ctx.buffer.setCell(ctx.x + x, y, ' ', defaultStyle);
      }
      y++;
    }
  }
}
