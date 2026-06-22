import { loadLocale } from './loader.ts';
import type { TranslationMap } from './types.ts';

const EXPOSED_NAMESPACES = ['ui', 'common'];

function pickNamespaces(source: TranslationMap, namespaces: string[]): TranslationMap {
  const result: TranslationMap = {};
  for (const ns of namespaces) {
    const val = source[ns];
    if (val !== undefined) {
      result[ns] = val;
    }
  }
  return result;
}

export async function handleI18nApi(path: string): Promise<Response | null> {
  const prefix = '/api/i18n/';

  if (!path.startsWith(prefix)) return null;

  const requestedLocale = path.slice(prefix.length);
  if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(requestedLocale)) {
    return new Response(JSON.stringify({ error: 'Invalid locale format' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const translations = await loadLocale(requestedLocale);
  const exposed = pickNamespaces(translations, EXPOSED_NAMESPACES);

  return new Response(JSON.stringify(exposed), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
