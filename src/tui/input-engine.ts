export interface KeyEvent {
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  raw: number[];
}

type KeyHandler = (event: KeyEvent) => boolean;

export class InputEngine {
  private bindings: Map<string, KeyHandler[]> = new Map();
  private running = false;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private dispatch: ((event: KeyEvent) => void) | null = null;
  private escapeBuf: number[] = [];
  private inEscape = false;

  onKey(handler: (event: KeyEvent) => void): void {
    this.dispatch = handler;
  }

  bind(keys: string, handler: KeyHandler): void {
    const existing = this.bindings.get(keys) ?? [];
    existing.push(handler);
    this.bindings.set(keys, existing);
  }

  unbind(keys: string, handler?: KeyHandler): void {
    if (!handler) {
      this.bindings.delete(keys);
      return;
    }
    const existing = this.bindings.get(keys);
    if (existing) {
      const idx = existing.indexOf(handler);
      if (idx >= 0) existing.splice(idx, 1);
      if (existing.length === 0) this.bindings.delete(keys);
    }
  }

  async start(): Promise<void> {
    this.running = true;
    Deno.stdin.setRaw(true, { cbreak: true });
    this.reader = Deno.stdin.readable.getReader();

    while (this.running) {
      const { value, done } = await this.reader.read();
      if (done) break;
      if (!value) continue;

      for (let i = 0; i < value.length; i++) {
        const byte = value[i];
        const event = this.decodeByte(byte, value, i);
        if (event) {
          const handled = this.dispatchBinding(event);
          if (!handled && this.dispatch) {
            this.dispatch(event);
          }
          if (event.key === 'c' && event.ctrl) {
            i = value.length;
          }
        }
      }
    }
  }

  stop(): void {
    this.running = false;
    Deno.stdin.setRaw(false);
    try {
      this.reader?.cancel();
    } catch { /* ignore */ }
    this.reader = null;
  }

  private decodeByte(byte: number, buf: Uint8Array, idx: number): KeyEvent | null {
    if (this.inEscape) {
      this.escapeBuf.push(byte);
      if (this.escapeBuf.length === 1 && byte === 91) {
        return null;
      }
      if (this.escapeBuf.length >= 2) {
        return this.decodeEscapeSeq();
      }
      return null;
    }

    if (byte === 27) {
      if (buf.length > idx + 1) {
        this.escapeBuf = [byte];
        this.inEscape = true;
        return null;
      }
      return { key: 'escape', ctrl: false, alt: false, shift: false, meta: false, raw: [27] };
    }

    if (byte === 13) {
      return {
        key: 'enter',
        ctrl: false,
        alt: false,
        shift: false,
        meta: false,
        raw: [13],
      };
    }

    if (byte === 9) {
      return {
        key: 'tab',
        ctrl: false,
        alt: false,
        shift: false,
        meta: false,
        raw: [9],
      };
    }

    if (byte >= 32 && byte <= 126) {
      return {
        key: String.fromCharCode(byte),
        ctrl: false,
        alt: false,
        shift: false,
        meta: false,
        raw: [byte],
      };
    }

    if (byte === 0) {
      return {
        key: 'ctrl+space',
        ctrl: true,
        alt: false,
        shift: false,
        meta: false,
        raw: [0],
      };
    }

    return null;
  }

  private decodeEscapeSeq(): KeyEvent | null {
    const b = this.escapeBuf;
    this.inEscape = false;
    this.escapeBuf = [];

    if (b[0] !== 27 || b[1] !== 91) {
      if (b.length === 2 && b[0] === 27) {
        const key = String.fromCharCode(b[1]);
        return { key, alt: true, ctrl: false, shift: false, meta: false, raw: b };
      }
      return { key: 'escape', ctrl: false, alt: false, shift: false, meta: false, raw: b };
    }

    const code = b[2];
    if (b.length === 3) {
      switch (code) {
        case 65:
          return { key: 'up', ctrl: false, alt: false, shift: false, meta: false, raw: b };
        case 66:
          return { key: 'down', ctrl: false, alt: false, shift: false, meta: false, raw: b };
        case 67:
          return { key: 'right', ctrl: false, alt: false, shift: false, meta: false, raw: b };
        case 68:
          return { key: 'left', ctrl: false, alt: false, shift: false, meta: false, raw: b };
        case 72:
          return { key: 'home', ctrl: false, alt: false, shift: false, meta: false, raw: b };
        case 70:
          return { key: 'end', ctrl: false, alt: false, shift: false, meta: false, raw: b };
        case 90:
          return { key: 'tab', ctrl: false, alt: false, shift: true, meta: false, raw: b };
        default: {
          const shiftMap: Record<number, string> = {
            50: '@',
            51: '#',
            52: '$',
            53: '%',
            54: '^',
            55: '&',
            56: '*',
            57: '(',
          };
          return {
            key: shiftMap[code] ?? String.fromCharCode(code),
            ctrl: false,
            alt: false,
            shift: true,
            meta: false,
            raw: b,
          };
        }
      }
    }

    if (b.length >= 4) {
      if (code === 51 && b[3] === 126) {
        return { key: 'delete', ctrl: false, alt: false, shift: false, meta: false, raw: b };
      }
      if (code === 49 && b[3] === 126) {
        return { key: 'home', ctrl: false, alt: false, shift: false, meta: false, raw: b };
      }
      if (code === 52 && b[3] === 126) {
        return { key: 'end', ctrl: false, alt: false, shift: false, meta: false, raw: b };
      }
      if (code === 53 && b[3] === 126) {
        return { key: 'pageup', ctrl: false, alt: false, shift: false, meta: false, raw: b };
      }
      if (code === 54 && b[3] === 126) {
        return { key: 'pagedown', ctrl: false, alt: false, shift: false, meta: false, raw: b };
      }

      if (code >= 49 && code <= 54 && b[3] === 59 && b.length >= 5) {
        const mod = b[4];
        const target = b[5];
        const ctrl = mod >= 5;
        const alt = mod === 3 || mod === 4 || mod === 7 || mod === 8;
        const ctrlAlt = mod === 7 || mod === 8;

        switch (target) {
          case 65:
            return { key: 'up', ctrl, alt: alt || ctrlAlt, shift: false, meta: false, raw: b };
          case 66:
            return { key: 'down', ctrl, alt: alt || ctrlAlt, shift: false, meta: false, raw: b };
          case 67:
            return { key: 'right', ctrl, alt: alt || ctrlAlt, shift: false, meta: false, raw: b };
          case 68:
            return { key: 'left', ctrl, alt: alt || ctrlAlt, shift: false, meta: false, raw: b };
        }
      }
    }

    return {
      key: `esc[${String.fromCharCode(code)}`,
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
      raw: b,
    };
  }

  private dispatchBinding(event: KeyEvent): boolean {
    let chord = '';
    if (event.ctrl) chord += 'ctrl+';
    if (event.alt) chord += 'alt+';
    if (event.shift) chord += 'shift+';
    if (event.meta) chord += 'meta+';
    chord += event.key.toLowerCase();

    const handlers = this.bindings.get(chord);
    if (handlers) {
      for (const handler of handlers) {
        if (handler(event)) return true;
      }
    }
    return false;
  }
}

export const inputEngine = new InputEngine();
