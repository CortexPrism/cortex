import { Component } from '../component.ts';
import type { RenderContext } from '../component.ts';

export interface ToolCallInfo {
  name: string;
  status: 'running' | 'success' | 'error';
  durationMs?: number;
  result?: string;
  expanded?: boolean;
}

export class ToolCard extends Component {
  tool: ToolCallInfo;

  constructor(tool: ToolCallInfo) {
    super();
    this.tool = tool;
  }

  render(ctx: RenderContext): void {
    const nameStyle = ctx.theme.styles['tool.name'] ?? { fg: '95' };
    const successStyle = ctx.theme.styles['status.success'] ?? { fg: '32' };
    const errorStyle = ctx.theme.styles['status.error'] ?? { fg: '31' };
    const mutedStyle = ctx.theme.styles['muted'] ?? { dim: true };
    const defaultStyle = ctx.theme.styles['default'] ?? {};

    const icon = this.tool.status === 'running'
      ? this.spinnerChar()
      : this.tool.status === 'success'
      ? '\u2713'
      : '\u2717';

    const iconStyle = this.tool.status === 'running'
      ? nameStyle
      : this.tool.status === 'success'
      ? successStyle
      : errorStyle;

    const dur = this.tool.durationMs ? ` (${this.tool.durationMs}ms)` : '';
    const header = `${icon} ${this.tool.name}${dur}`;

    ctx.buffer.drawText(ctx.x + 1, ctx.y, icon, iconStyle);
    ctx.buffer.drawText(ctx.x + 3, ctx.y, this.tool.name, nameStyle);
    ctx.buffer.drawText(ctx.x + 3 + this.tool.name.length, ctx.y, dur, mutedStyle);

    if (this.tool.expanded && this.tool.result && ctx.height > 1) {
      const resultLines = this.tool.result.split('\n');
      for (let i = 0; i < Math.min(resultLines.length, ctx.height - 1); i++) {
        const text = resultLines[i].slice(0, ctx.width - 4);
        ctx.buffer.drawText(ctx.x + 4, ctx.y + 1 + i, text, defaultStyle);
      }
    }

    for (let x = header.length + 1; x < ctx.width; x++) {
      ctx.buffer.setCell(ctx.x + x, ctx.y, ' ', defaultStyle);
    }
  }

  private spinnerFrame = 0;
  private spinnerChar(): string {
    const frames = [
      '\u280B',
      '\u2819',
      '\u2839',
      '\u2838',
      '\u283C',
      '\u2834',
      '\u2826',
      '\u2827',
      '\u2807',
      '\u280F',
    ];
    const ch = frames[this.spinnerFrame % frames.length];
    this.spinnerFrame++;
    return ch;
  }
}
