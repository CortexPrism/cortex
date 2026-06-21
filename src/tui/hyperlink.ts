export function osc8Link(url: string, text: string): string {
  return `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`;
}

export function formatOsc8(url: string, text: string): string {
  return osc8Link(url, text);
}
