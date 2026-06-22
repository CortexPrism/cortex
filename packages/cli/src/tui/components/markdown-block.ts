import { Component } from '../component.ts';
import type { RenderContext } from '../component.ts';

export class MarkdownBlock extends Component {
  private lines: string[] = [];

  setContent(markdown: string): void {
    this.lines = markdown.split('\n');
    this.requestRender();
  }

  render(ctx: RenderContext): void {
    const defaultStyle = ctx.theme.styles['default'] ?? {};
    const headingStyle = ctx.theme.styles['heading'] ?? { bold: true };
    const codeStyle = ctx.theme.styles['code'] ?? {};
    const boldStyle = ctx.theme.styles['bold'] ?? { bold: true };
    const italicStyle = ctx.theme.styles['italic'] ?? { italic: true };
    const mutedStyle = ctx.theme.styles['muted'] ?? { dim: true };
    const codeBlockStyle = ctx.theme.styles['code.block'] ?? {};

    let y = ctx.y;
    for (let i = 0; i < this.lines.length && y < ctx.y + ctx.height; i++) {
      const line = this.lines[i];
      const rendered = this.renderLine(line, {
        heading: headingStyle,
        code: codeStyle,
        bold: boldStyle,
        italic: italicStyle,
        muted: mutedStyle,
        codeBlock: codeBlockStyle,
        default: defaultStyle,
      });

      let cx = ctx.x;
      for (const segment of rendered) {
        if (cx >= ctx.x + ctx.width) break;
        const remaining = ctx.x + ctx.width - cx;
        const text = segment.text.slice(0, remaining);
        ctx.buffer.drawText(cx, y, text, segment.style);
        cx += text.length;
      }
      y++;
    }
  }

  private renderLine(
    line: string,
    styles: Record<string, import('../buffer.ts').CellStyle>,
  ): Array<{ text: string; style: import('../buffer.ts').CellStyle }> {
    if (line.startsWith('```')) {
      return [{ text: line, style: styles.codeBlock }];
    }

    if (line.startsWith('# ')) {
      return [{ text: line, style: styles.heading }];
    }
    if (line.startsWith('## ')) {
      return [{ text: line, style: styles.heading }];
    }
    if (line.startsWith('### ')) {
      return [{ text: line, style: styles.heading }];
    }

    if (line.startsWith('> ')) {
      return [{ text: line, style: styles.muted }];
    }

    if (line.startsWith('* ') || line.startsWith('- ') || line.match(/^\d+\.\s/)) {
      return [{ text: line, style: styles.default }];
    }

    const segments: Array<{ text: string; style: import('../buffer.ts').CellStyle }> = [];
    let i = 0;
    while (i < line.length) {
      if (line[i] === '`' && line.indexOf('`', i + 1) > i) {
        const end = line.indexOf('`', i + 1);
        segments.push({ text: line.slice(i, end + 1), style: styles.code });
        i = end + 1;
        continue;
      }
      if (line.slice(i).startsWith('**') && line.indexOf('**', i + 2) > i) {
        const end = line.indexOf('**', i + 2);
        segments.push({ text: line.slice(i, end + 2), style: styles.bold });
        i = end + 2;
        continue;
      }
      if (line[i] === '*' && line.indexOf('*', i + 1) > i) {
        const end = line.indexOf('*', i + 1);
        segments.push({ text: line.slice(i, end + 1), style: styles.italic });
        i = end + 1;
        continue;
      }
      let j = i;
      while (j < line.length && !'`*'.includes(line[j])) j++;
      if (j > i) {
        segments.push({ text: line.slice(i, j), style: styles.default });
      }
      i = j;
    }

    return segments.length > 0 ? segments : [{ text: line, style: styles.default }];
  }
}
