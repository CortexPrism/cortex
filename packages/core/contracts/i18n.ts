export interface ITranslationMap {
  [key: string]: string | ITranslationMap;
}

export interface II18nConfig {
  locale: string;
  fallbackLocale: string;
  localesDir: string;
}

export interface II18nService {
  t(key: string, params?: Record<string, string | number>): string;
  getLocale(): string;
  init(locale?: string, localesDir?: string): Promise<void>;
}
