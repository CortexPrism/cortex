import { Component, type RenderContext } from '../component.ts';
import type { KeyEvent } from '../input-engine.ts';
import { ScrollView } from '../layout.ts';
import type { MarkdownBlock } from './markdown-block.ts';
import type { CodeBlock } from './code-block.ts';
import type { DiffBlock } from './diff-block.ts';
import type { ToolCallInfo } from './tool-card.ts';
import { ToolCard } from './tool-card.ts';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  tools?: ToolCallInfo[];
  diff?: string;
}

export class ChatView extends Component {
  private messages: ChatMessage[] = [];
  private scrollView: ScrollView;
  private contentHeight = 0;

  constructor() {
    super();
    this.scrollView = new ScrollView();
  }

  get scroll(): ScrollView {
    return this.scrollView;
  }

  getCurrentMessages(): ChatMessage[] {
    return this.messages;
  }

  addMessage(msg: ChatMessage): void {
    this.messages = [...this.messages, msg];
    this.contentHeight = this.measureContent();
    this.scrollView.setContentHeight(this.contentHeight);
    this.scrollView.scrollToBottom();
    this.requestRender();
  }

  updateLastMessage(content: string): void {
    if (this.messages.length > 0) {
      const last = { ...this.messages[this.messages.length - 1] };
      last.content = content;
      this.messages = [...this.messages.slice(0, -1), last];
      this.contentHeight = this.measureContent();
      this.scrollView.setContentHeight(this.contentHeight);
      this.scrollView.scrollToBottom();
      this.requestRender();
    }
  }

  appendToLastMessage(chunk: string): void {
    if (this.messages.length > 0) {
      const lastIdx = this.messages.length - 1;
      this.messages[lastIdx].content += chunk;
      this.contentHeight = this.measureContent();
      this.scrollView.setContentHeight(this.contentHeight);
      this.scrollView.scrollToBottom();
      this.requestRender();
    }
  }

  addToolCall(tool: ToolCallInfo): void {
    if (this.messages.length > 0) {
      const last = { ...this.messages[this.messages.length - 1] };
      last.tools = [...(last.tools ?? []), tool];
      this.messages = [...this.messages.slice(0, -1), last];
      this.contentHeight = this.measureContent();
      this.scrollView.setContentHeight(this.contentHeight);
      this.scrollView.scrollToBottom();
      this.requestRender();
    }
  }

  updateToolCall(toolName: string, updates: Partial<ToolCallInfo>): void {
    const msgs = this.messages.map((m) => {
      if (!m.tools) return m;
      const tools = m.tools.map((t) => t.name === toolName ? { ...t, ...updates } : t);
      return { ...m, tools };
    });
    this.messages = msgs;
    this.contentHeight = this.measureContent();
    this.scrollView.setContentHeight(this.contentHeight);
    this.requestRender();
  }

  clear(): void {
    this.messages = [];
    this.contentHeight = 0;
    this.scrollView.setContentHeight(0);
    this.requestRender();
  }

  override onKeyPress(event: KeyEvent): boolean {
    return this.scrollView.onKeyPress(event);
  }

  private measureContent(): number {
    let h = 0;
    for (const msg of this.messages) {
      h += msg.content.split('\n').length + 1;
      if (msg.tools) {
        for (const tool of msg.tools) {
          h += tool.expanded && tool.result ? tool.result.split('\n').length + 1 : 1;
        }
      }
      if (msg.diff) {
        h += msg.diff.split('\n').length + 1;
      }
    }
    return h;
  }

  render(ctx: RenderContext): void {
    this.scrollView.x = ctx.x;
    this.scrollView.y = ctx.y;
    this.scrollView.width = ctx.width;
    this.scrollView.height = ctx.height;
    this.scrollView.setContentHeight(this.contentHeight);

    const userRoleStyle = ctx.theme.styles['user.role'] ?? { fg: '94', bold: true };
    const assistantRoleStyle = ctx.theme.styles['assistant.role'] ?? { fg: '92', bold: true };
    const systemRoleStyle = ctx.theme.styles['system.role'] ?? { dim: true };
    const defaultStyle = ctx.theme.styles['default'] ?? {};

    const offset = this.scrollView.getOffset();
    let y = ctx.y - offset;

    for (const msg of this.messages) {
      if (y + 1 > ctx.y + ctx.height) break;

      const roleLabel = msg.role === 'user' ? 'You' : msg.role === 'system' ? '--' : 'Bot';
      const roleStyle = msg.role === 'user'
        ? userRoleStyle
        : msg.role === 'system'
        ? systemRoleStyle
        : assistantRoleStyle;

      if (y >= ctx.y) {
        ctx.buffer.drawText(ctx.x, y, `${roleLabel}:`, roleStyle);
      }

      const contentLines = msg.content.split('\n');
      for (let i = 0; i < contentLines.length; i++) {
        y++;
        if (y >= ctx.y && y < ctx.y + ctx.height) {
          const line = contentLines[i];
          if (line.startsWith('```')) {
            ctx.buffer.drawText(
              ctx.x + 2,
              y,
              line.slice(0, ctx.width - 2),
              ctx.theme.styles['code.block'] ?? {},
            );
          } else {
            ctx.buffer.drawText(ctx.x + 2, y, line.slice(0, ctx.width - 2), defaultStyle);
          }
        }
      }
      y++;

      if (msg.tools) {
        for (const tool of msg.tools) {
          if (y >= ctx.y && y < ctx.y + ctx.height) {
            const card = new ToolCard(tool);
            card.x = ctx.x;
            card.y = y;
            card.width = ctx.width;
            card.height = tool.expanded ? 10 : 1;
            card.render({
              buffer: ctx.buffer,
              theme: ctx.theme,
              t: ctx.t,
              x: ctx.x,
              y,
              width: ctx.width,
              height: tool.expanded ? 10 : 1,
            });
          }
          y += tool.expanded && tool.result ? tool.result.split('\n').length + 1 : 1;
        }
      }

      if (msg.diff) {
        const diffLines = msg.diff.split('\n');
        for (let i = 0; i < diffLines.length; i++) {
          if (y >= ctx.y && y < ctx.y + ctx.height) {
            const line = diffLines[i];
            let style = defaultStyle;
            if (line.startsWith('+')) {
              style = ctx.theme.styles['diff.added'] ?? { fg: '32' };
            } else if (line.startsWith('-')) {
              style = ctx.theme.styles['diff.removed'] ?? { fg: '31' };
            } else if (
              line.startsWith('@@') || line.startsWith('diff') || line.startsWith('---') ||
              line.startsWith('+++')
            ) {
              style = ctx.theme.styles['diff.header'] ?? { dim: true };
            }
            ctx.buffer.drawText(ctx.x + 2, y, line.slice(0, ctx.width - 2), style);
          }
          y++;
        }
      }
    }
  }
}
