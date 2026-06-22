import type { CellStyle } from './buffer.ts';
import { mergeStyles } from './buffer.ts';

export interface Theme {
  name: string;
  styles: Record<string, CellStyle>;
}

export function resolveStyle(theme: Theme, name: string): CellStyle {
  return theme.styles[name] ?? {};
}

export function applyStyle(theme: Theme, names: string[]): CellStyle {
  let result: CellStyle = {};
  for (const name of names) {
    const style = theme.styles[name];
    if (style) result = mergeStyles(result, style);
  }
  return result;
}

const COLORS = {
  black: '30',
  red: '31',
  green: '32',
  yellow: '33',
  blue: '34',
  magenta: '35',
  cyan: '36',
  white: '37',
  brightBlack: '90',
  brightRed: '91',
  brightGreen: '92',
  brightYellow: '93',
  brightBlue: '94',
  brightMagenta: '95',
  brightCyan: '96',
  brightWhite: '97',
};

const BG_COLORS: Record<string, string> = {};
for (const [k, v] of Object.entries(COLORS)) {
  BG_COLORS[k] = String(parseInt(v) + 10);
}

export function fg(color: keyof typeof COLORS): string {
  return COLORS[color];
}

export function bg(color: keyof typeof COLORS): string {
  return BG_COLORS[color];
}

export const DEFAULT_STYLES: Record<string, CellStyle> = {
  default: {},
  heading: { bold: true, fg: COLORS.brightWhite },
  subheading: { bold: true, fg: COLORS.brightCyan },
  code: { fg: COLORS.brightGreen },
  'code.block': { fg: COLORS.yellow },
  'diff.added': { fg: COLORS.green },
  'diff.removed': { fg: COLORS.red },
  'diff.header': { dim: true, fg: COLORS.brightBlack },
  'status.info': { fg: COLORS.cyan },
  'status.error': { fg: COLORS.red },
  'status.warning': { fg: COLORS.yellow },
  'status.success': { fg: COLORS.green },
  muted: { dim: true },
  inverse: { inverse: true },
  bold: { bold: true },
  dim: { dim: true },
  italic: { italic: true },
  underline: { underline: true },
  prompt: { fg: COLORS.brightGreen },
  'user.role': { fg: COLORS.brightBlue, bold: true },
  'assistant.role': { fg: COLORS.brightGreen, bold: true },
  'system.role': { fg: COLORS.brightBlack, bold: true },
  'tool.name': { fg: COLORS.brightMagenta },
  'completion.selected': { inverse: true },
  link: { fg: COLORS.blue, underline: true },
};
