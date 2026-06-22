import { bold, cyan, dim } from '@std/fmt/colors';
import { getTermSize } from './animations.ts';

const CORTEX_BLOCKS = [
  '▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄',
  '██░██████░█████░████████░██████░▒█████░██░██░██',
  '██░██░░░░██░░░██░░░██░░░░██░░░░░██░░░░░██░██░░░',
  '██░██░░░░██░░░██░░░██░░░░██████░██████░░░░██░░░',
  '██░██░░░░██░░░██░░░██░░░░██░░░░░██░░░░░░░░░░░░░',
  '██░██████░█████░██░░░██░░░░██████░██████░░░░██░',
  '▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀',
];

const GRADIENT_START = 0x6366f1;
const GRADIENT_END = 0x06b6d4;

export function renderLogo(): void {
  const { cols } = getTermSize();
  const width = 49;
  const padding = Math.max(0, Math.floor((cols - width) / 2));

  for (const line of CORTEX_BLOCKS) {
    console.log(' '.repeat(padding) + cyan(line));
  }
}

export async function renderLogoAnimated(msPerLine = 80): Promise<void> {
  const { cols } = getTermSize();
  const width = 49;
  const padding = Math.max(0, Math.floor((cols - width) / 2));

  for (const line of CORTEX_BLOCKS) {
    console.log(' '.repeat(padding) + cyan(line));
    await new Promise((r) => setTimeout(r, msPerLine));
  }
}

export async function renderLogoGradientAnimated(): Promise<void> {
  const { cols } = getTermSize();
  const width = 49;
  const padding = Math.max(0, Math.floor((cols - width) / 2));

  for (let pass = 0; pass < 3; pass++) {
    const totalChars = CORTEX_BLOCKS.reduce((s, l) => s + l.length, 0);
    let charIdx = 0;

    for (const line of CORTEX_BLOCKS) {
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
        return ch === ' ' ? ' ' : `${color}${ch}\x1b[0m`;
      }).join('');
      console.log(' '.repeat(padding) + rendered);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
}

export async function renderWelcomeScreen(): Promise<void> {
  const { rows, cols } = getTermSize();
  const logoHeight = CORTEX_BLOCKS.length;
  const topPadding = Math.max(1, Math.floor((rows - logoHeight - 6) / 2));

  for (let i = 0; i < topPadding; i++) console.log('');

  await renderLogoAnimated(50);

  console.log('');

  const tagline = 'Your Agentic AI Harness';
  const tagPadding = Math.max(0, Math.floor((cols - tagline.length) / 2));
  console.log(' '.repeat(tagPadding) + dim(tagline));

  console.log('');

  const prompt = bold(cyan('  [ Press Enter to begin ]  '));
  const promptPadding = Math.max(0, Math.floor((cols - 28) / 2));
  console.log(' '.repeat(promptPadding) + prompt);

  const buf = new Uint8Array(1024);
  await Deno.stdin.read(buf);
}
