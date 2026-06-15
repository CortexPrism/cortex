import { bold, cyan, dim, green, red, yellow } from '@std/fmt/colors';
import { ANSI_RESET, cursorPos, getTermSize } from './animations.ts';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const AI_SPINNER_FRAMES = ['🧠', '🤔', '💭', '✨'];

export interface SpinnerHandle {
  stop(message?: string): void;
  succeed(message?: string): void;
  fail(message?: string): void;
  update(text: string): void;
}

export function spinner(text: string): SpinnerHandle {
  let running = true;
  let frame = 0;
  let currentText = text;
  const row = getTermSize().rows;

  const intervalId = setInterval(() => {
    if (!running) return;
    frame = (frame + 1) % SPINNER_FRAMES.length;
    const out = `${cursorPos(row, 1)} ${cyan(SPINNER_FRAMES[frame])} ${currentText}${ANSI_RESET}`;
    Deno.stdout.writeSync(new TextEncoder().encode(out));
  }, 100);

  Deno.stdout.writeSync(
    new TextEncoder().encode(
      `${cursorPos(row, 1)} ${cyan(SPINNER_FRAMES[0])} ${text}${ANSI_RESET}`,
    ),
  );

  return {
    stop(message?: string) {
      running = false;
      clearInterval(intervalId);
      if (message !== undefined) {
        const out = `${cursorPos(row, 1)} ${dim('·')} ${message}    \n`;
        Deno.stdout.writeSync(new TextEncoder().encode(out));
      } else {
        const out = `${cursorPos(row, 1)}${' '.repeat(80)}\r`;
        Deno.stdout.writeSync(new TextEncoder().encode(out));
      }
    },
    succeed(message?: string) {
      running = false;
      clearInterval(intervalId);
      const msg = message ?? currentText;
      const out = `${cursorPos(row, 1)} ${green('✓')} ${msg}    \n`;
      Deno.stdout.writeSync(new TextEncoder().encode(out));
    },
    fail(message?: string) {
      running = false;
      clearInterval(intervalId);
      const msg = message ?? currentText;
      const out = `${cursorPos(row, 1)} ${red('✗')} ${msg}    \n`;
      Deno.stdout.writeSync(new TextEncoder().encode(out));
    },
    update(text: string) {
      currentText = text;
    },
  };
}

export function aiThinkingIndicator(): SpinnerHandle {
  const handle = spinner('Thinking...');
  let frame = 0;
  const origStop = handle.stop.bind(handle);
  const origUpdate = handle.update.bind(handle);

  const thinkingInterval = setInterval(() => {
    frame = (frame + 1) % AI_SPINNER_FRAMES.length;
    const thought = ['', '..', '...'][frame % 3];
    origUpdate(`Thinking${thought}`);
  }, 400);

  return {
    ...handle,
    stop(msg?: string) {
      clearInterval(thinkingInterval);
      origStop(msg);
    },
    succeed(msg?: string) {
      clearInterval(thinkingInterval);
      handle.succeed(msg);
    },
    fail(msg?: string) {
      clearInterval(thinkingInterval);
      handle.fail(msg);
    },
  };
}

export function progressBar(
  current: number,
  total: number,
  label = '',
  width = 40,
): void {
  const pct = total > 0 ? Math.min(current / total, 1) : 0;
  const filled = Math.round(pct * width);
  const empty = width - filled;
  const bar = cyan('█'.repeat(filled)) + dim('░'.repeat(empty));
  const pctStr = `${Math.round(pct * 100)}%`;
  const row = getTermSize().rows;
  const out = `${cursorPos(row, 1)} ${bar} ${bold(pctStr)}${
    label ? ' ' + dim(label) : ''
  }${ANSI_RESET}`;
  Deno.stdout.writeSync(new TextEncoder().encode(out));
  if (pct >= 1) {
    Deno.stdout.writeSync(new TextEncoder().encode('\n'));
  }
}

export async function typewriterEffect(
  text: string,
  delay = 20,
  colorFn: (s: string) => string = (s) => s,
): Promise<void> {
  const chars = [...text];
  for (const ch of chars) {
    await new Promise((r) => setTimeout(r, delay));
    Deno.stdout.writeSync(new TextEncoder().encode(colorFn(ch)));
  }
  Deno.stdout.writeSync(new TextEncoder().encode('\n'));
}

export async function fadeTransition(duration = 600): Promise<void> {
  const steps = 8;
  const stepMs = duration / steps;
  const { rows, cols } = getTermSize();

  for (let i = 0; i < steps; i++) {
    const shade = Math.floor((i / steps) * 232) + 23;
    const color = `\x1b[48;5;${shade}m`;
    for (let r = 1; r <= rows; r++) {
      const line = color + ' '.repeat(cols) + ANSI_RESET;
      Deno.stdout.writeSync(new TextEncoder().encode(cursorPos(r, 1) + line));
    }
    await new Promise((r) => setTimeout(r, stepMs));
  }
  await new Promise((r) => setTimeout(r, 100));
  for (let r = 1; r <= rows; r++) {
    Deno.stdout.writeSync(new TextEncoder().encode(cursorPos(r, 1) + ' '.repeat(cols)));
  }
}

export function successBadge(message: string): void {
  const line = ` ${green('●')} ${bold(message)}`;
  Deno.stdout.writeSync(new TextEncoder().encode(line + '\n'));
}

export function errorBadge(message: string): void {
  const line = ` ${red('●')} ${bold(message)}`;
  Deno.stdout.writeSync(new TextEncoder().encode(line + '\n'));
}

export function infoBadge(message: string): void {
  const line = ` ${cyan('●')} ${dim(message)}`;
  Deno.stdout.writeSync(new TextEncoder().encode(line + '\n'));
}

export function stepHeader(step: number, total: number, title: string): void {
  console.log('');
  const sep = dim('─'.repeat(50));
  console.log(sep);
  console.log(`  ${bold(cyan(`Step ${step}/${total}`))}  ${bold(title)}`);
  console.log(sep);
}

export function separator(): void {
  console.log(dim('─'.repeat(50)));
}
