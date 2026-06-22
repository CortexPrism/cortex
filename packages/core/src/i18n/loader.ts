import { exists } from '@std/fs';
import type { I18nConfig, LocaleFile, TranslationMap } from './types.ts';

const cache = new Map<string, TranslationMap>();

let config: I18nConfig = {
  locale: 'en',
  fallbackLocale: 'en',
  localesDir: '',
};

export function configureLoader(cfg: I18nConfig): void {
  config = cfg;
}

export async function loadLocale(locale: string): Promise<TranslationMap> {
  if (cache.has(locale)) {
    return cache.get(locale)!;
  }

  const filePath = `${config.localesDir}/${locale}.json`;

  try {
    if (!(await exists(filePath))) {
      if (locale !== config.fallbackLocale) {
        console.warn(
          `[i18n] Locale file not found: ${filePath}, falling back to ${config.fallbackLocale}`,
        );
      }
      return locale === config.fallbackLocale ? {} : await loadLocale(config.fallbackLocale);
    }

    const raw = await Deno.readTextFile(filePath);
    const parsed = JSON.parse(raw) as LocaleFile;
    const translations = parsed as unknown as TranslationMap;
    cache.set(locale, translations);
    return translations;
  } catch (e) {
    console.warn(`[i18n] Failed to load locale "${locale}": ${(e as Error).message}`);
    if (locale !== config.fallbackLocale) {
      return await loadLocale(config.fallbackLocale);
    }
    return {};
  }
}
