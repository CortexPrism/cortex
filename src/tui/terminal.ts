export interface TuiMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

export interface TuiToolCall {
  name: string;
  status: 'running' | 'success' | 'error';
  durationMs?: number;
  result?: string;
}

export class TerminalUI {
  private messages: TuiMessage[] = [];
  private tools: TuiToolCall[] = [];
  private input = '';
  private cursorPos = 0;
  private focus: 'chat' | 'tools' | 'input' = 'input';
  private status = 'idle';
  private history: string[] = [];
  private historyIdx = -1;
  private scrollOffset = 0;
  private cols = 80;
  private rows = 24;
  private running = false;
  private onSend: ((msg: string) => void) | null = null;
  private onCancel: (() => void) | null = null;

  constructor() {
    this.cols = 80;
    this.rows = 24;
    try {
      const size = Deno.consoleSize();
      if (size) {
        this.cols = size.columns;
        this.rows = size.rows;
      }
    } catch { /* use defaults */ }
  }

  setOnSend(cb: (msg: string) => void): void {
    this.onSend = cb;
  }

  setOnCancel(cb: () => void): void {
    this.onCancel = cb;
  }

  addMessage(msg: TuiMessage): void {
    this.messages.push(msg);
    this.render();
  }

  updateLastMessage(content: string): void {
    if (this.messages.length > 0) {
      this.messages[this.messages.length - 1].content += content;
    }
    this.render();
  }

  addToolCall(tool: TuiToolCall): void {
    this.tools.push(tool);
    this.render();
  }

  updateToolCall(name: string, updates: Partial<TuiToolCall>): void {
    const tool = [...this.tools].reverse().find((t) => t.name === name);
    if (tool) Object.assign(tool, updates);
    this.render();
  }

  setStatus(status: string): void {
    this.status = status;
    this.render();
  }

  private async render(): Promise<void> {
    const cols = this.cols;
    const rows = this.rows;
    const splitCol = Math.floor(cols * 0.7);
    const chatWidth = splitCol - 1;
    const toolsWidth = cols - splitCol - 1;
    const inputRow = rows - 2;
    const statusRow = rows - 1;
    const chatRows = inputRow - 1;

    const lines: string[] = [];
    lines.push('\x1b[2J\x1b[H');

    for (let r = 0; r < rows; r++) {
      lines.push(`\x1b[${r + 1};1H`);
      if (r === 0) {
        const title = ' Cortex — TUI ';
        lines.push(`\x1b[7m${title.padEnd(cols)}\x1b[0m`);
        continue;
      }
      if (r === inputRow) {
        lines.push('\x1b[7m');
        const prompt = `> ${this.input}`;
        const truncated = prompt.slice(0, cols - 2);
        lines.push(truncated.padEnd(cols));
        lines.push('\x1b[0m');
        lines.push(`\x1b[${inputRow + 1};${Math.min(this.input.length + 2, cols)}H`);
        continue;
      }
      if (r === statusRow) {
        const s = ` [${this.status}] | Messages: ${this.messages.length} | Tools: ${this.tools.length} | Ctrl+C: cancel | Ctrl+L: clear | /: tools `;
        lines.push(`\x1b[7m${s.padEnd(cols)}\x1b[0m`);
        continue;
      }

      const chatLine: string[] = [];
      const toolsLine: string[] = [];

      const msgIdx = r - 1 - this.scrollOffset;
      if (msgIdx >= 0 && msgIdx < this.messages.length) {
        const msg = this.messages[msgIdx];
        const prefix = msg.role === 'user' ? 'You: ' : msg.role === 'system' ? '-- ' : 'Bot: ';
        const text = wrapLine(prefix + msg.content, chatWidth);
        chatLine.push(text.padEnd(chatWidth).slice(0, chatWidth));
      } else {
        chatLine.push(' '.repeat(chatWidth));
      }

      const toolIdx = r - 1;
      if (toolIdx >= 0 && toolIdx < this.tools.length) {
        const t = this.tools[toolIdx];
        const icon = t.status === 'success' ? '✓' : t.status === 'error' ? '✗' : '…';
        const dur = t.durationMs ? ` (${t.durationMs}ms)` : '';
        toolsLine.push(`${icon} ${t.name}${dur}`.padEnd(toolsWidth).slice(0, toolsWidth));
      } else {
        toolsLine.push(' '.repeat(toolsWidth));
      }

      lines.push(chatLine[0]);
      lines.push(`\x1b[${r + 1};${splitCol + 1}H`);
      lines.push(toolsLine[0]);
    }

    Deno.stdout.writeSync(new TextEncoder().encode(lines.join('')));
    Deno.stdout.writeSync(new TextEncoder().encode(`\x1b[${inputRow + 1};${Math.min(this.input.length + 3, cols)}H`));
  }

  async start(): Promise<void> {
    this.running = true;
    Deno.stdin.setRaw(true, { cbreak: true });
    this.render();

    const buf = new Uint8Array(1024);
    const reader = Deno.stdin.readable.getReader();

    while (this.running) {
      const { value, done } = await reader.read();
      if (done) break;
      const n = value ? Math.min(value.length, 1024) : 0;
      if (n > 0) buf.set(value.slice(0, n));

      for (let i = 0; i < n; i++) {
        const byte = buf[i];

        if (byte === 3) {
          if (this.onCancel) this.onCancel();
          continue;
        }
        if (byte === 12) {
          this.messages = [];
          this.tools = [];
          this.render();
          continue;
        }
        if (byte === 13) {
          if (this.input.trim() && this.onSend) {
            this.history.push(this.input);
            this.historyIdx = -1;
            this.addMessage({ role: 'user', content: this.input });
            this.onSend(this.input);
            this.input = '';
            this.cursorPos = 0;
          }
          continue;
        }
        if (byte === 127) {
          if (this.cursorPos > 0) {
            this.input = this.input.slice(0, this.cursorPos - 1) + this.input.slice(this.cursorPos);
            this.cursorPos--;
            this.render();
          }
          continue;
        }
        if (byte === 27 && i + 2 < n && buf[i + 1] === 91) {
          i += 2;
          const code = buf[i];
          if (code === 65) {
            if (this.history.length > 0) {
              this.historyIdx = Math.min(this.historyIdx + 1, this.history.length - 1);
              this.input = this.history[this.history.length - 1 - this.historyIdx];
              this.cursorPos = this.input.length;
              this.render();
            }
          } else if (code === 66) {
            if (this.historyIdx > 0) {
              this.historyIdx--;
              this.input = this.history[this.history.length - 1 - this.historyIdx];
            } else {
              this.historyIdx = -1;
              this.input = '';
            }
            this.cursorPos = this.input.length;
            this.render();
          } else if (code === 67) {
            this.cursorPos = Math.min(this.cursorPos + 1, this.input.length);
            this.render();
          } else if (code === 68) {
            this.cursorPos = Math.max(this.cursorPos - 1, 0);
            this.render();
          }
          continue;
        }
        if (byte >= 32 && byte <= 126) {
          const char = String.fromCharCode(byte);
          this.input = this.input.slice(0, this.cursorPos) + char + this.input.slice(this.cursorPos);
          this.cursorPos++;
          this.render();
        }
      }
    }
  }

  stop(): void {
    this.running = false;
    Deno.stdin.setRaw(false);
    Deno.stdout.writeSync(new TextEncoder().encode('\x1b[2J\x1b[H'));
  }
}

function wrapLine(text: string, width: number): string {
  if (text.length <= width) return text;
  const visible = text.replace(/\x1b\[[0-9;]*m/g, '');
  if (visible.length <= width) return text;
  return visible.slice(0, width);
}
