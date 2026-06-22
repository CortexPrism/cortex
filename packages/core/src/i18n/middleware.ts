import { i18n } from './service.ts';

export function parseAcceptLanguage(header: string | null): string | null {
  if (!header) return null;

  const locales = header
    .split(',')
    .map((entry) => {
      const [tag, qVal] = entry.trim().split(';');
      const lang = tag?.split('-')[0]?.toLowerCase();
      const q = qVal ? parseFloat(qVal.split('=')[1]) : 1.0;
      return { lang, q };
    })
    .filter((e) => e.lang && /^[a-z]{2}$/.test(e.lang!))
    .sort((a, b) => b.q - a.q);

  return locales[0]?.lang ?? null;
}

export function extractLocale(req: Request): string {
  const envLocale = Deno.env.get('CORTEX_LOCALE');
  if (envLocale) return envLocale;

  const configured = i18n.getLocale();
  if (configured && configured !== 'en') return configured;

  const acceptLang = parseAcceptLanguage(req.headers.get('Accept-Language'));
  if (acceptLang) return acceptLang;

  return 'en';
}
