import { configureLoader, loadLocale } from './loader.ts';
import type { I18nConfig, TranslationMap } from './types.ts';
import { PATHS } from '../config/paths.ts';

class I18nService {
  private translations: TranslationMap = {};
  private fallbackTranslations: TranslationMap = {};
  private currentLocale = 'en';
  private fallbackLocale = 'en';
  private initialized = false;

  async init(locale?: string, localesDir?: string): Promise<void> {
    const cfg: I18nConfig = {
      locale: locale || Deno.env.get('CORTEX_LOCALE') || 'en',
      fallbackLocale: 'en',
      localesDir: localesDir || PATHS.localesDir,
    };

    this.currentLocale = cfg.locale;
    this.fallbackLocale = cfg.fallbackLocale;

    configureLoader(cfg);

    this.fallbackTranslations = await loadLocale(cfg.fallbackLocale);

    if (cfg.locale !== cfg.fallbackLocale) {
      this.translations = await loadLocale(cfg.locale);
    } else {
      this.translations = this.fallbackTranslations;
    }

    this.initialized = true;
  }

  t(key: string, params?: Record<string, string | number>): string {
    if (!this.initialized) return key;

    const parts = key.split('.');
    let val: string | TranslationMap | undefined = this.translations;

    for (const part of parts) {
      if (typeof val !== 'object' || val === null || Array.isArray(val)) break;
      val = (val as TranslationMap)[part];
    }

    let result: string | undefined;

    if (typeof val === 'string') {
      result = val;
    } else {
      val = this.fallbackTranslations;
      for (const part of parts) {
        if (typeof val !== 'object' || val === null || Array.isArray(val)) break;
        val = (val as TranslationMap)[part];
      }
      if (typeof val === 'string') {
        result = val;
      }
    }

    if (!result) {
      return key;
    }

    if (params) {
      for (const [k, v] of Object.entries(params)) {
        result = result.replaceAll(`{${k}}`, String(v));
      }
    }

    return result;
  }

  getLocale(): string {
    return this.currentLocale;
  }

  async setLocale(locale: string): Promise<void> {
    this.currentLocale = locale;
    this.translations = await loadLocale(locale);
  }

  log(key: string, params?: Record<string, string | number>): void {
    console.log(this.t(key, params));
  }

  error(key: string, params?: Record<string, string | number>): void {
    console.error(this.t(key, params));
  }

  localizedError(
    key: string,
    status: number,
    params?: Record<string, string | number>,
  ): Response {
    const message = this.t(key, params);
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export const i18n = new I18nService();
