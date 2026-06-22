import { Component } from '../component.ts';
import type { RenderContext } from '../component.ts';

export class Header extends Component {
  title: string;
  subtitle: string;

  constructor(title: string, subtitle?: string) {
    super();
    this.title = title;
    this.subtitle = subtitle ?? '';
  }

  render(ctx: RenderContext): void {
    const titleStyle = ctx.theme.styles['title.bar'] ?? { inverse: true };
    const fullText = this.subtitle ? ` ${this.title} · ${this.subtitle} ` : ` ${this.title} `;

    ctx.buffer.drawText(ctx.x, ctx.y, fullText.slice(0, ctx.width), titleStyle);
    for (let x = fullText.length; x < ctx.width; x++) {
      ctx.buffer.setCell(ctx.x + x, ctx.y, ' ', titleStyle);
    }
  }
}
