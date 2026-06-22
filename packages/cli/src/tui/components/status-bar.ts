import { Component } from '../component.ts';
import type { RenderContext } from '../component.ts';

export class StatusBar extends Component {
  model = '';
  inputTokens = 0;
  outputTokens = 0;
  contextPercent = 0;
  cost = 0;
  sessionName = '';
  extra = '';

  render(ctx: RenderContext): void {
    const style = ctx.theme.styles['status.bar'] ?? { inverse: true };
    const parts: string[] = [];

    if (this.model) parts.push(this.model);
    if (this.inputTokens > 0 || this.outputTokens > 0) {
      parts.push(`${this.formatTokens(this.inputTokens)}/${this.formatTokens(this.outputTokens)}`);
    }
    if (this.contextPercent > 0) {
      parts.push(`${this.contextPercent}% ctx`);
    }
    if (this.cost > 0) {
      parts.push(`$${this.cost.toFixed(3)}`);
    }
    if (this.sessionName) parts.push(this.sessionName);
    if (this.extra) parts.push(this.extra);

    const text = ' ' + parts.join(' · ') + ' ';
    ctx.buffer.drawText(ctx.x, ctx.y, text.slice(0, ctx.width), style);
    for (let x = text.length; x < ctx.width; x++) {
      ctx.buffer.setCell(ctx.x + x, ctx.y, ' ', style);
    }
  }

  private formatTokens(n: number): string {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
  }
}
