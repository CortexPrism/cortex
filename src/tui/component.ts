import type { CellBuffer, CellStyle } from './buffer.ts';
import type { Theme } from './style.ts';
import type { VirtualScreen } from './screen.ts';
import type { KeyEvent } from './input-engine.ts';

export interface RenderContext {
  buffer: CellBuffer;
  theme: Theme;
  t: (key: string, params?: Record<string, string | number>) => string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export abstract class Component {
  x = 0;
  y = 0;
  width = 0;
  height = 0;
  parent: Component | null = null;
  children: Component[] = [];
  visible = true;
  focused = false;

  onMount(): void {}
  onUpdate(): void {}
  onDestroy(): void {}
  onResize(_cols: number, _rows: number): void {}
  onKeyPress(_event: KeyEvent): boolean {
    return false;
  }

  abstract render(ctx: RenderContext): void;

  mount(child: Component): void {
    child.parent = this;
    this.children.push(child);
    child.onMount();
  }

  unmount(child: Component): void {
    const idx = this.children.indexOf(child);
    if (idx >= 0) {
      this.children.splice(idx, 1);
      child.parent = null;
      child.onDestroy();
    }
  }

  unmountAll(): void {
    for (const child of [...this.children]) {
      this.unmount(child);
    }
  }

  requestRender(): void {
    // deno-lint-ignore no-this-alias
    let root: Component = this;
    while (root.parent) root = root.parent;
    // deno-lint-ignore no-explicit-any
    if (typeof (root as any).scheduleRender === 'function') {
      // deno-lint-ignore no-explicit-any
      (root as any).scheduleRender();
    }
  }

  findFocused(): Component | null {
    if (this.focused) return this;
    for (const child of this.children) {
      const found = child.findFocused();
      if (found) return found;
    }
    return null;
  }

  dispatchKey(event: KeyEvent): boolean {
    for (let i = this.children.length - 1; i >= 0; i--) {
      if (this.children[i].dispatchKey(event)) return true;
    }
    return this.onKeyPress(event);
  }

  get theme(): Theme {
    // deno-lint-ignore no-this-alias
    let comp: Component | null = this;
    while (comp) {
      // deno-lint-ignore no-explicit-any
      const root = comp as any as RootComponentInternals;
      if (root._theme) return root._theme;
      comp = comp.parent;
    }
    return { name: 'none', styles: {} };
  }

  get i18n(): (key: string, params?: Record<string, string | number>) => string {
    // deno-lint-ignore no-this-alias
    let comp: Component | null = this;
    while (comp) {
      // deno-lint-ignore no-explicit-any
      const root = comp as any as RootComponentInternals;
      if (root._tFn) return root._tFn;
      comp = comp.parent;
    }
    return (k: string) => k;
  }

  get screen(): VirtualScreen | null {
    // deno-lint-ignore no-this-alias
    let comp: Component | null = this;
    while (comp) {
      // deno-lint-ignore no-explicit-any
      const root = comp as any as RootComponentInternals;
      if (root._screen) return root._screen;
      comp = comp.parent;
    }
    return null;
  }
}

interface RootComponentInternals {
  _theme?: Theme;
  _tFn?: (key: string, params?: Record<string, string | number>) => string;
  _screen?: VirtualScreen;
  scheduleRender(): void;
}

export class Root extends Component {
  _theme: Theme;
  _tFn: (key: string, params?: Record<string, string | number>) => string;
  _screen: VirtualScreen;
  private renderScheduled = false;

  constructor(
    screen: VirtualScreen,
    theme: Theme,
    tFn: (key: string, params?: Record<string, string | number>) => string,
  ) {
    super();
    this._screen = screen;
    this._theme = theme;
    this._tFn = tFn;
    this.width = screen.width;
    this.height = screen.height;
  }

  scheduleRender(): void {
    if (!this.renderScheduled) {
      this.renderScheduled = true;
      queueMicrotask(() => {
        this.renderScheduled = false;
        this.renderTree();
      });
    }
  }

  renderTree(): void {
    this._screen.buffer.clear();
    this.renderChildren(this._screen.buffer, this._theme, this._tFn);
    this._screen.flush();
  }

  private renderChildren(
    buffer: CellBuffer,
    theme: Theme,
    tFn: (key: string, params?: Record<string, string | number>) => string,
  ): void {
    for (const child of this.children) {
      if (!child.visible) continue;
      const ctx: RenderContext = {
        buffer,
        theme,
        t: tFn,
        x: child.x,
        y: child.y,
        width: child.width,
        height: child.height,
      };
      child.render(ctx);
    }
  }

  override render(_ctx: RenderContext): void {}

  override onResize(cols: number, rows: number): void {
    this._screen.resize(cols, rows);
    this.width = cols;
    this.height = rows;
    for (const child of this.children) {
      child.onResize(cols, rows);
    }
  }
}
