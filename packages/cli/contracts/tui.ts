/// <reference lib="dom" />

export interface ITuiComponent {
  render(): string;
  mount(container: HTMLElement): void;
  update(data: unknown): void;
}

export interface ITuiScreen {
  name: string;
  render(): string;
  onEnter?(): void;
  onLeave?(): void;
  handleInput(key: string): void;
}
