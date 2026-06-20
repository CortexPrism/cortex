export interface TranslationMap {
  [key: string]: string | TranslationMap;
}

export interface I18nMeta {
  locale: string;
  version: string;
  lastUpdated: string;
  direction?: 'ltr' | 'rtl';
}

export interface LocaleFile {
  _meta: I18nMeta;
  [key: string]: string | TranslationMap | I18nMeta;
}

export interface I18nConfig {
  locale: string;
  fallbackLocale: string;
  localesDir: string;
}
