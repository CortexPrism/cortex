export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type DesktopAction =
  | { action: 'screenshot'; format: 'png' | 'jpeg' }
  | { action: 'click'; x: number; y: number }
  | { action: 'dblclick'; x: number; y: number }
  | { action: 'type'; text: string }
  | { action: 'keypress'; key: string; modifiers?: string[] }
  | { action: 'drag'; from: Point; to: Point }
  | { action: 'get_clipboard' }
  | { action: 'set_clipboard'; text: string }
  | { action: 'wait'; ms: number }
  | { action: 'move'; x: number; y: number }
  | { action: 'scroll'; direction: 'up' | 'down'; amount?: number };

export interface DesktopActionResult {
  success: boolean;
  error?: string;
  durationMs: number;
  output?: string;
  screenshot?: Uint8Array;
}

export interface DesktopAutomation {
  executeDesktopAction(action: DesktopAction): Promise<DesktopActionResult>;
  getDockerfile(): string;
  getEntrypointScript(): string;
}
