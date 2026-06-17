/**
 * Keyboard Control
 *
 * Provides keyboard control functionality using xdotool.
 * Supports typing text, pressing keys, and key combinations.
 */

export interface KeyboardController {
  type(text: string, delay?: number): Promise<void>;
  press(key: string): Promise<void>;
  hold(key: string, duration: number): Promise<void>;
  combo(keys: string[]): Promise<void>;
}

/**
 * Normalize key names to xdotool format
 *
 * Maps common key names to the format expected by xdotool
 */
export function normalizeKey(key: string): string {
  const keyMap: Record<string, string> = {
    // Modifiers
    'ctrl': 'ctrl',
    'control': 'ctrl',
    'alt': 'alt',
    'option': 'alt',
    'shift': 'shift',
    'super': 'super',
    'win': 'super',
    'cmd': 'super',
    'meta': 'super',

    // Special keys
    'enter': 'Return',
    'return': 'Return',
    'esc': 'Escape',
    'escape': 'Escape',
    'tab': 'Tab',
    'space': 'space',
    'backspace': 'BackSpace',
    'delete': 'Delete',
    'del': 'Delete',
    'insert': 'Insert',
    'home': 'Home',
    'end': 'End',
    'pageup': 'Page_Up',
    'pagedown': 'Page_Down',
    'pgup': 'Page_Up',
    'pgdn': 'Page_Down',

    // Arrow keys
    'up': 'Up',
    'down': 'Down',
    'left': 'Left',
    'right': 'Right',

    // Function keys (F1-F12)
    'f1': 'F1',
    'f2': 'F2',
    'f3': 'F3',
    'f4': 'F4',
    'f5': 'F5',
    'f6': 'F6',
    'f7': 'F7',
    'f8': 'F8',
    'f9': 'F9',
    'f10': 'F10',
    'f11': 'F11',
    'f12': 'F12',

    // Caps lock, num lock, scroll lock
    'capslock': 'Caps_Lock',
    'numlock': 'Num_Lock',
    'scrolllock': 'Scroll_Lock',
  };

  const normalized = keyMap[key.toLowerCase()];
  return normalized ?? key;
}

/**
 * Parse a key combination string (e.g., "ctrl+s", "alt+shift+t")
 */
export function parseKeyCombo(combo: string): string[] {
  return combo.split('+').map((k) => normalizeKey(k.trim()));
}

/**
 * Execute xdotool command
 */
async function execXdotool(display: string, args: string[]): Promise<void> {
  const cmd = new Deno.Command('xdotool', {
    args,
    env: { DISPLAY: display },
    stdout: 'piped',
    stderr: 'piped',
  });

  const { code, stderr } = await cmd.output();

  if (code !== 0) {
    const error = new TextDecoder().decode(stderr);
    throw new Error(`xdotool command failed: ${error}`);
  }
}

class XdotoolKeyboardController implements KeyboardController {
  constructor(private display: string) {}

  async type(text: string, delay = 12): Promise<void> {
    // xdotool type with delay between keystrokes (in milliseconds)
    const args = ['type', '--delay', delay.toString(), '--', text];
    await execXdotool(this.display, args);
  }

  async press(key: string): Promise<void> {
    // Check if it's a key combination (e.g., "ctrl+s")
    if (key.includes('+')) {
      const keys = parseKeyCombo(key);
      await this.combo(keys);
    } else {
      const normalized = normalizeKey(key);
      await execXdotool(this.display, ['key', normalized]);
    }
  }

  async hold(key: string, duration: number): Promise<void> {
    const normalized = normalizeKey(key);
    // Press key down
    await execXdotool(this.display, ['keydown', normalized]);
    // Wait for duration (convert seconds to milliseconds)
    await new Promise((resolve) => setTimeout(resolve, duration * 1000));
    // Release key
    await execXdotool(this.display, ['keyup', normalized]);
  }

  async combo(keys: string[]): Promise<void> {
    // Join keys with + for xdotool key command
    const normalized = keys.map((k) => normalizeKey(k));
    const comboString = normalized.join('+');
    await execXdotool(this.display, ['key', comboString]);
  }
}

/**
 * Create a keyboard controller for the specified display
 */
export function createKeyboardController(display: string): KeyboardController {
  return new XdotoolKeyboardController(display);
}
