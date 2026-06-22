import { Root } from './component.ts';
import type { Theme } from './style.ts';
import type { VirtualScreen } from './screen.ts';
import type { KeyEvent } from './input-engine.ts';

export class Renderer {
  root: Root;
  screen: VirtualScreen;
  private running = false;
  private frameId = 0;

  constructor(
    screen: VirtualScreen,
    theme: Theme,
    tFn: (key: string, params?: Record<string, string | number>) => string,
  ) {
    this.screen = screen;
    this.root = new Root(screen, theme, tFn);
  }

  mount(component: import('./component.ts').Component): void {
    this.root.mount(component);
  }

  setTheme(theme: Theme): void {
    this.root._theme = theme;
    this.root.scheduleRender();
  }

  scheduleRender(): void {
    if (this.running) {
      this.root.scheduleRender();
    }
  }

  handleResize(cols: number, rows: number): void {
    this.root.onResize(cols, rows);
    this.scheduleRender();
  }

  handleKey(event: KeyEvent): void {
    this.root.dispatchKey(event);
  }

  start(): void {
    this.running = true;
    this.screen.hideCursor();
    this.root.renderTree();

    const resize = (): void => {
      try {
        const size = Deno.consoleSize();
        if (size && (size.columns !== this.screen.width || size.rows !== this.screen.height)) {
          this.handleResize(size.columns, size.rows);
        }
      } catch { /* consoleSize not available */ }
    };

    if (typeof Deno.addSignalListener === 'function') {
      try {
        Deno.addSignalListener('SIGWINCH', resize);
      } catch { /* signal listener not available */ }
    }
  }

  stop(): void {
    this.running = false;
    this.screen.showCursor();
    this.screen.reset();
  }
}
