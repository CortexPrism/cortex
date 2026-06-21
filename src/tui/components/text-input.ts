import { Component } from '../component.ts';
import type { RenderContext } from '../component.ts';
import type { KeyEvent } from '../input-engine.ts';
import type { CompletionCandidate } from '../completions.ts';
import { compositeProvider } from '../completions.ts';

export class TextInput extends Component {
  private text = '';
  private cursorPos = 0;
  private history: string[] = [];
  private historyIdx = -1;
  private prompt = '> ';
  private onSubmit: ((text: string) => void) | null = null;
  private onCompletionRequest: ((input: string, pos: number) => CompletionCandidate[]) | null =
    null;
  showCompletions = false;

  setPrompt(p: string): void {
    this.prompt = p;
  }

  setOnSubmit(cb: (text: string) => void): void {
    this.onSubmit = cb;
  }

  setOnCompletionRequest(cb: (input: string, pos: number) => CompletionCandidate[]): void {
    this.onCompletionRequest = cb;
  }

  getText(): string {
    return this.text;
  }

  setText(t: string): void {
    this.text = t;
    this.cursorPos = t.length;
    this.requestRender();
  }

  clear(): void {
    this.text = '';
    this.cursorPos = 0;
    this.historyIdx = -1;
    this.requestRender();
  }

  addToHistory(line: string): void {
    if (line && this.history[this.history.length - 1] !== line) {
      this.history.push(line);
    }
    this.historyIdx = -1;
  }

  override onKeyPress(event: KeyEvent): boolean {
    if (event.ctrl) {
      return this.handleCtrlKey(event);
    }

    if (event.alt) {
      return this.handleAltKey(event);
    }

    switch (event.key) {
      case 'enter': {
        if (this.text.trim() && this.onSubmit) {
          this.addToHistory(this.text);
          this.onSubmit(this.text);
        }
        return true;
      }
      case 'backspace':
        if (this.cursorPos > 0) {
          this.text = this.text.slice(0, this.cursorPos - 1) +
            this.text.slice(this.cursorPos);
          this.cursorPos--;
          this.showCompletions = false;
          this.requestRender();
        }
        return true;
      case 'delete':
        if (this.cursorPos < this.text.length) {
          this.text = this.text.slice(0, this.cursorPos) +
            this.text.slice(this.cursorPos + 1);
          this.requestRender();
        }
        return true;
      case 'left':
        this.cursorPos = Math.max(0, this.cursorPos - 1);
        this.requestRender();
        return true;
      case 'right':
        this.cursorPos = Math.min(this.text.length, this.cursorPos + 1);
        this.requestRender();
        return true;
      case 'up':
        if (this.history.length > 0) {
          this.historyIdx = Math.min(this.historyIdx + 1, this.history.length - 1);
          this.text = this.history[this.history.length - 1 - this.historyIdx];
          this.cursorPos = this.text.length;
          this.requestRender();
        }
        return true;
      case 'down':
        if (this.historyIdx > 0) {
          this.historyIdx--;
          this.text = this.history[this.history.length - 1 - this.historyIdx];
        } else {
          this.historyIdx = -1;
          this.text = '';
        }
        this.cursorPos = this.text.length;
        this.requestRender();
        return true;
      case 'home':
        this.cursorPos = 0;
        this.requestRender();
        return true;
      case 'end':
        this.cursorPos = this.text.length;
        this.requestRender();
        return true;
      case 'tab':
        this.handleTabCompletion();
        return true;
      case 'escape':
        return false;
      default:
        if (event.key.length === 1) {
          this.text = this.text.slice(0, this.cursorPos) + event.key +
            this.text.slice(this.cursorPos);
          this.cursorPos++;
          this.showCompletions = true;
          this.requestRender();
          return true;
        }
    }
    return false;
  }

  private handleCtrlKey(event: KeyEvent): boolean {
    switch (event.key) {
      case 'a': {
        this.cursorPos = 0;
        this.requestRender();
        return true;
      }
      case 'e': {
        this.cursorPos = this.text.length;
        this.requestRender();
        return true;
      }
      case 'k': {
        this.text = this.text.slice(0, this.cursorPos);
        this.requestRender();
        return true;
      }
      case 'u': {
        this.text = '';
        this.cursorPos = 0;
        this.requestRender();
        return true;
      }
      case 'w': {
        const before = this.text.slice(0, this.cursorPos);
        const after = this.text.slice(this.cursorPos);
        const words = before.split(/\b/);
        words.pop();
        this.text = words.join('') + after;
        this.cursorPos = words.join('').length;
        this.requestRender();
        return true;
      }
      case 'd': {
        if (this.cursorPos < this.text.length) {
          this.text = this.text.slice(0, this.cursorPos) +
            this.text.slice(this.cursorPos + 1);
          this.requestRender();
        }
        return true;
      }
      case 'r': {
        this.showCompletions = true;
        this.requestRender();
        return true;
      }
      case 'c':
        return false;
    }
    return false;
  }

  private handleAltKey(event: KeyEvent): boolean {
    switch (event.key) {
      case 'f': {
        const rest = this.text.slice(this.cursorPos);
        const match = rest.match(/\S+\s*/);
        if (match) {
          this.cursorPos += match[0].length;
        } else {
          this.cursorPos = this.text.length;
        }
        this.requestRender();
        return true;
      }
      case 'b': {
        const before = this.text.slice(0, this.cursorPos);
        const words = before.match(/(\s*\S+)$/);
        if (words && words.index !== undefined && words.index < before.length) {
          this.cursorPos = words.index;
        } else {
          this.cursorPos = 0;
        }
        this.requestRender();
        return true;
      }
      case 'd': {
        const rest = this.text.slice(this.cursorPos);
        const match = rest.match(/\S+\s*/);
        if (match) {
          this.text = this.text.slice(0, this.cursorPos) +
            rest.slice(match[0].length);
          this.requestRender();
        }
        return true;
      }
    }
    return false;
  }

  private handleTabCompletion(): void {
    const provider = this.onCompletionRequest ?? compositeProvider;
    const candidates = provider(this.text, this.cursorPos);
    if (candidates.length === 1) {
      this.text = candidates[0].label;
      this.cursorPos = this.text.length;
      this.requestRender();
    }
  }

  getCompletionCandidates(): CompletionCandidate[] {
    const provider = this.onCompletionRequest ?? compositeProvider;
    return provider(this.text, this.cursorPos);
  }

  render(ctx: RenderContext): void {
    const promptStyle = ctx.theme.styles['prompt'] ?? { fg: '92' };
    const maxTextWidth = ctx.width - this.prompt.length;

    ctx.buffer.drawText(ctx.x, ctx.y, this.prompt, promptStyle);

    const displayStart = Math.max(0, this.cursorPos - maxTextWidth + 2);
    const displayText = this.text.slice(displayStart, displayStart + maxTextWidth);
    ctx.buffer.drawText(ctx.x + this.prompt.length, ctx.y, displayText);

    const cursorX = ctx.x + this.prompt.length + (this.cursorPos - displayStart);
    if (cursorX < ctx.x + ctx.width) {
      if (this.cursorPos < this.text.length) {
        const charAtCursor = this.text[this.cursorPos] ?? ' ';
        ctx.buffer.setCell(cursorX, ctx.y, charAtCursor, { inverse: true });
      } else {
        ctx.buffer.setCell(cursorX, ctx.y, ' ', { inverse: true });
      }
    }
  }
}
