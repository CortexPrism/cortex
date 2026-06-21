import { Component } from '../component.ts';
import type { RenderContext } from '../component.ts';
import type { KeyEvent } from '../input-engine.ts';
import type { CompletionCandidate } from '../completions.ts';

export class CompletionMenu extends Component {
  candidates: CompletionCandidate[] = [];
  selectedIndex = 0;
  private onSelect: ((candidate: CompletionCandidate) => void) | null = null;

  setCandidates(candidates: CompletionCandidate[]): void {
    this.candidates = candidates;
    this.selectedIndex = 0;
    if (candidates.length > 0) {
      this.visible = true;
    }
    this.requestRender();
  }

  setOnSelect(cb: (candidate: CompletionCandidate) => void): void {
    this.onSelect = cb;
  }

  hide(): void {
    this.visible = false;
    this.candidates = [];
    this.requestRender();
  }

  override onKeyPress(event: KeyEvent): boolean {
    if (!this.visible) return false;

    if (event.key === 'up') {
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      this.requestRender();
      return true;
    }
    if (event.key === 'down') {
      this.selectedIndex = Math.min(
        this.candidates.length - 1,
        this.selectedIndex + 1,
      );
      this.requestRender();
      return true;
    }
    if (event.key === 'enter' || event.key === 'tab') {
      if (this.candidates[this.selectedIndex] && this.onSelect) {
        this.onSelect(this.candidates[this.selectedIndex]);
        this.hide();
      }
      return true;
    }
    if (event.key === 'escape') {
      this.hide();
      return true;
    }
    return false;
  }

  render(ctx: RenderContext): void {
    if (!this.visible || this.candidates.length === 0) return;

    const maxItems = Math.min(this.candidates.length, ctx.height);
    const selectedStyle = ctx.theme.styles['completion.selected'] ?? { inverse: true };
    const maxLabelLen = Math.min(
      Math.max(...this.candidates.map((c) => c.label.length)),
      ctx.width - 4,
    );

    for (let i = 0; i < maxItems; i++) {
      const cand = this.candidates[i];
      const label = cand.label.slice(0, maxLabelLen);
      const desc = cand.description
        ? ` ${cand.description.slice(0, ctx.width - label.length - 3)}`
        : '';
      const text = (label + desc).padEnd(ctx.width);

      if (i === this.selectedIndex) {
        ctx.buffer.drawText(ctx.x, ctx.y + i, text, selectedStyle);
      } else {
        ctx.buffer.drawText(ctx.x, ctx.y + i, text);
      }
    }
  }
}
