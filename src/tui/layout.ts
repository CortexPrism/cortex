import { Component } from './component.ts';
import type { RenderContext } from './component.ts';
import type { KeyEvent } from './input-engine.ts';

interface SplitChild {
  component: Component;
  size: number | string;
}

export class HSplit extends Component {
  private items: SplitChild[] = [];

  add(component: Component, size: number | string): void {
    this.items.push({ component, size });
  }

  override onMount(): void {
    super.onMount();
    for (const { component } of this.items) {
      component.parent = this;
      component.onMount();
    }
  }

  override render(ctx: RenderContext): void {
    const totalWidth = ctx.width;
    const sizes = this.resolveSizes(totalWidth);

    let cx = ctx.x;
    for (let i = 0; i < this.items.length; i++) {
      const { component } = this.items[i];
      const w = sizes[i];
      component.x = cx;
      component.y = ctx.y;
      component.width = w;
      component.height = ctx.height;
      component.render({
        buffer: ctx.buffer,
        theme: ctx.theme,
        t: ctx.t,
        x: cx,
        y: ctx.y,
        width: w,
        height: ctx.height,
      });
      cx += w;
    }
  }

  private resolveSizes(totalWidth: number): number[] {
    const sizes: number[] = new Array(this.items.length).fill(0);
    let remaining = totalWidth;
    let flexCount = 0;

    for (let i = 0; i < this.items.length; i++) {
      const size = this.items[i].size;
      if (typeof size === 'number') {
        sizes[i] = size;
        remaining -= size;
      } else {
        flexCount++;
      }
    }

    if (flexCount > 0) {
      const perFlex = Math.max(0, Math.floor(remaining / flexCount));
      let assigned = 0;
      for (let i = 0; i < this.items.length; i++) {
        if (typeof this.items[i].size !== 'number') {
          sizes[i] = assigned === flexCount - 1 ? remaining - assigned * perFlex : perFlex;
          assigned++;
        }
      }
    } else {
      remaining = Math.max(0, remaining);
      sizes[sizes.length - 1] += remaining;
    }

    return sizes;
  }
}

export class VSplit extends Component {
  private items: SplitChild[] = [];

  add(component: Component, size: number | string): void {
    this.items.push({ component, size });
  }

  override onMount(): void {
    super.onMount();
    for (const { component } of this.items) {
      component.parent = this;
      component.onMount();
    }
  }

  override render(ctx: RenderContext): void {
    const totalHeight = ctx.height;
    const sizes = this.resolveSizes(totalHeight);

    let cy = ctx.y;
    for (let i = 0; i < this.items.length; i++) {
      const { component } = this.items[i];
      const h = sizes[i];
      component.x = ctx.x;
      component.y = cy;
      component.width = ctx.width;
      component.height = h;
      component.render({
        buffer: ctx.buffer,
        theme: ctx.theme,
        t: ctx.t,
        x: ctx.x,
        y: cy,
        width: ctx.width,
        height: h,
      });
      cy += h;
    }
  }

  private resolveSizes(totalHeight: number): number[] {
    const sizes: number[] = new Array(this.items.length).fill(0);
    let remaining = totalHeight;
    let flexCount = 0;

    for (let i = 0; i < this.items.length; i++) {
      const size = this.items[i].size;
      if (typeof size === 'number') {
        sizes[i] = size;
        remaining -= size;
      } else {
        flexCount++;
      }
    }

    if (flexCount > 0) {
      const perFlex = Math.max(0, Math.floor(remaining / flexCount));
      let assigned = 0;
      for (let i = 0; i < this.items.length; i++) {
        if (typeof this.items[i].size !== 'number') {
          sizes[i] = assigned === flexCount - 1 ? remaining - assigned * perFlex : perFlex;
          assigned++;
        }
      }
    } else {
      remaining = Math.max(0, remaining);
      sizes[sizes.length - 1] += remaining;
    }

    return sizes;
  }
}

export class ScrollView extends Component {
  private scrollOffset = 0;
  private contentHeight = 0;
  private maxScroll = 0;

  setContentHeight(h: number): void {
    this.contentHeight = h;
    this.maxScroll = Math.max(0, h - this.height);
    if (this.scrollOffset > this.maxScroll) {
      this.scrollOffset = this.maxScroll;
    }
  }

  getOffset(): number {
    return this.scrollOffset;
  }

  scrollTo(offset: number): void {
    this.scrollOffset = Math.max(0, Math.min(offset, this.maxScroll));
    this.requestRender();
  }

  scrollBy(delta: number): void {
    this.scrollTo(this.scrollOffset + delta);
  }

  scrollToBottom(): void {
    this.scrollTo(this.maxScroll);
  }

  override onKeyPress(event: KeyEvent): boolean {
    if (event.key === 'pageup') {
      this.scrollBy(-this.height);
      return true;
    }
    if (event.key === 'pagedown') {
      this.scrollBy(this.height);
      return true;
    }
    if (event.key === 'up' || (event.key === 'k' && event.ctrl)) {
      this.scrollBy(-1);
      return true;
    }
    if (event.key === 'down' || (event.key === 'j' && event.ctrl)) {
      this.scrollBy(1);
      return true;
    }
    if (event.key === 'home' || (event.key === '<' && event.shift)) {
      this.scrollTo(0);
      return true;
    }
    if (event.key === 'end' || (event.key === '>' && event.shift)) {
      this.scrollToBottom();
      return true;
    }
    return false;
  }

  override render(ctx: RenderContext): void {
    this.maxScroll = Math.max(0, this.contentHeight - ctx.height);
    if (this.scrollOffset > this.maxScroll) {
      this.scrollOffset = this.maxScroll;
    }

    for (const child of this.children) {
      if (!child.visible) continue;
      const childCtx: RenderContext = {
        ...ctx,
        x: child.x,
        y: child.y - this.scrollOffset,
        width: child.width,
        height: child.height,
      };
      child.render(childCtx);
    }
  }
}

export class Box extends Component {
  private paddingTop = 0;
  private paddingBottom = 0;
  private paddingLeft = 0;
  private paddingRight = 0;

  padding(top: number, right: number, bottom: number, left: number): this {
    this.paddingTop = top;
    this.paddingRight = right;
    this.paddingBottom = bottom;
    this.paddingLeft = left;
    return this;
  }

  override onMount(): void {
    super.onMount();
    for (const child of this.children) {
      child.parent = this;
      child.onMount();
    }
  }

  override render(ctx: RenderContext): void {
    const innerCtx: RenderContext = {
      buffer: ctx.buffer,
      theme: ctx.theme,
      t: ctx.t,
      x: ctx.x + this.paddingLeft,
      y: ctx.y + this.paddingTop,
      width: ctx.width - this.paddingLeft - this.paddingRight,
      height: ctx.height - this.paddingTop - this.paddingBottom,
    };

    for (const child of this.children) {
      if (!child.visible) continue;
      child.x = innerCtx.x;
      child.y = innerCtx.y;
      child.width = innerCtx.width;
      child.height = innerCtx.height;
      child.render(innerCtx);
    }
  }
}
