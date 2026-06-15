import { bold, cyan, dim } from '@std/fmt/colors';
import { ANSI_RESET, cursorPos, getTermSize } from './animations.ts';

export const CORTEX_LOGO_SMALL = [
  '╔═══════════════════════════════════════════╗',
  '║                                           ║',
  '║   ██████╗ ██████╗ ██████╗ ████████╗      ║',
  '║  ██╔════╝██╔═══██╗██╔══██╗╚══██╔══╝      ║',
  '║  ██║     ██║   ██║██████╔╝   ██║         ║',
  '║  ██║     ██║   ██║██╔══██╗   ██║         ║',
  '║  ╚██████╗╚██████╔╝██║  ██║   ██║         ║',
  '║   ╚═════╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝         ║',
  '║                                           ║',
  '║       P R I S M   •   A I   O S           ║',
  '║                                           ║',
  '╚═══════════════════════════════════════════╝',
];

const GRADIENT_START = 0x6366f1;
const GRADIENT_END = 0x06b6d4;

export function renderLogo(colorFn?: (s: string) => string): void {
  const lines = CORTEX_LOGO_SMALL;
  const totalChars = lines.reduce((s, l) => s + l.length, 0);
  let charIdx = 0;

  for (const line of lines) {
    const rendered = [...line].map((ch) => {
      const t = totalChars > 1 ? charIdx / (totalChars - 1) : 0;
      const r = Math.round(
        ((GRADIENT_START >> 16) & 0xff) * (1 - t) + ((GRADIENT_END >> 16) & 0xff) * t,
      );
      const g = Math.round(
        ((GRADIENT_START >> 8) & 0xff) * (1 - t) + ((GRADIENT_END >> 8) & 0xff) * t,
      );
      const b = Math.round((GRADIENT_START & 0xff) * (1 - t) + (GRADIENT_END & 0xff) * t);
      const color = `\x1b[38;2;${r};${g};${b}m`;
      charIdx++;
      return ch === ' ' ? ' ' : `${color}${ch}${ANSI_RESET}`;
    }).join('');
    console.log(rendered);
  }
}

export async function renderLogoAnimated(msPerLine = 80): Promise<void> {
  const { cols } = getTermSize();
  const padding = Math.max(0, Math.floor((cols - 45) / 2));

  for (const line of CORTEX_LOGO_SMALL) {
    const padded = ' '.repeat(padding) + line;
    const chars = [...padded];
    let current = '';
    for (let i = 0; i < chars.length; i++) {
      current += chars[i];
      Deno.stdout.writeSync(new TextEncoder().encode(`\r${current}`));
      await new Promise((r) => setTimeout(r, 1));
    }
    Deno.stdout.writeSync(new TextEncoder().encode('\n'));
    await new Promise((r) => setTimeout(r, msPerLine));
  }
}

export async function renderLogoGradientAnimated(): Promise<void> {
  const { cols } = getTermSize();
  const padding = Math.max(0, Math.floor((cols - 45) / 2));

  for (let pass = 0; pass < 3; pass++) {
    const totalChars = CORTEX_LOGO_SMALL.reduce((s, l) => s + l.length, 0);
    let charIdx = 0;

    for (let lineIdx = 0; lineIdx < CORTEX_LOGO_SMALL.length; lineIdx++) {
      const line = CORTEX_LOGO_SMALL[lineIdx];
      const padded = ' '.repeat(padding);
      const rendered = [...line].map((ch) => {
        const t = totalChars > 1 ? charIdx / (totalChars - 1) : 0;
        const r = Math.round(
          ((GRADIENT_START >> 16) & 0xff) * (1 - t) + ((GRADIENT_END >> 16) & 0xff) * t,
        );
        const g = Math.round(
          ((GRADIENT_START >> 8) & 0xff) * (1 - t) + ((GRADIENT_END >> 8) & 0xff) * t,
        );
        const b = Math.round((GRADIENT_START & 0xff) * (1 - t) + (GRADIENT_END & 0xff) * t);
        const brightness = 0.5 + 0.5 * Math.sin(pass * Math.PI * 0.5 + charIdx * 0.1);
        const br = Math.round(r * brightness);
        const bg = Math.round(g * brightness);
        const bb = Math.round(b * brightness);
        const color = `\x1b[38;2;${br};${bg};${bb}m`;
        charIdx++;
        return ch === ' ' ? ' ' : `${color}${ch}${ANSI_RESET}`;
      }).join('');
      Deno.stdout.writeSync(
        new TextEncoder().encode(cursorPos(lineIdx + 1, 1) + padded + rendered),
      );
    }
    await new Promise((r) => setTimeout(r, 400));
  }
}

export async function renderWelcomeScreen(): Promise<void> {
  const { rows, cols } = getTermSize();
  const logoHeight = CORTEX_LOGO_SMALL.length;
  const logoWidth = 45;
  const topPadding = Math.max(1, Math.floor((rows - logoHeight - 6) / 2));
  const leftPadding = Math.max(0, Math.floor((cols - logoWidth) / 2));

  for (let i = 0; i < topPadding; i++) console.log('');

  await renderLogoAnimated(50);

  const tagline = '  Your AI Operating System  ';
  console.log('');
  const tagPadding = ' '.repeat(Math.max(0, Math.floor((cols - tagline.length) / 2)));
  console.log(tagPadding + dim(tagline));

  console.log('');

  const prompt = bold(cyan('  [ Press Enter to begin ]  '));
  const promptPadding = ' '.repeat(Math.max(0, Math.floor((cols - 28) / 2)));
  console.log(promptPadding + prompt);

  await new Promise<void>((resolve) => {
    const listener = (data: Uint8Array) => {
      const text = new TextDecoder().decode(data);
      if (text.includes('\r') || text.includes('\n')) {
        Deno.stdin.close();
        resolve();
      }
    };
    if (Deno.stdin.isTerminal()) {
      Deno.stdin.setRaw(true);
    }
    const readNext = () => {
      Deno.stdin.read(new Uint8Array(1024)).then((n) => {
        if (n !== null) listener(new Uint8Array(n));
        else resolve();
      }).catch(() => resolve());
    };
    readNext();
  });

  if (Deno.stdin.isTerminal()) {
    try {
      Deno.stdin.setRaw(false);
    } catch {
      // stdin may already be closed
    }
  }
}
