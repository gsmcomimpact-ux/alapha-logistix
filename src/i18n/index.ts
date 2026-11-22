import { en } from './locales/en';
import { fr } from './locales/fr';
import { LocaleCode, LocaleConfig, TranslationDictionary } from './types';

export type { LocaleCode, LocaleConfig, TranslationDictionary } from './types';

export const DEFAULT_LOCALE: LocaleCode = 'fr';
export const LOCALE_STORAGE_KEY = 'alg_locale';

/**
 * Central locale registry.
 * To add a new language later:
 * 1. Add its code to LocaleCode in src/i18n/types.ts
 * 2. Create src/i18n/locales/<code>.ts implementing TranslationDictionary
 * 3. Add its entry to LOCALE_REGISTRY below — SEO hreflang, URL routing, and switchers adapt automatically.
 */
interface LocaleEntry {
  config: LocaleConfig;
  dictionary: TranslationDictionary;
}

const LOCALE_REGISTRY: Record<LocaleCode, LocaleEntry> = {
  fr: {
    config: {
      code: 'fr',
      shortLabel: 'FR',
      nativeName: 'Français',
      hreflang: 'fr',
      ogLocale: 'fr_FR',
      intlLocale: 'fr-FR',
      dir: 'ltr',
    },
    dictionary: fr,
  },
  en: {
    config: {
      code: 'en',
      shortLabel: 'EN',
      nativeName: 'English',
      hreflang: 'en',
      ogLocale: 'en_US',
      intlLocale: 'en-US',
      dir: 'ltr',
    },
    dictionary: en,
  },
};

export const SUPPORTED_LOCALES: LocaleConfig[] = Object.values(LOCALE_REGISTRY).map(
  (entry) => entry.config
);

export const DICTIONARIES: Record<LocaleCode, TranslationDictionary> = {
  fr: LOCALE_REGISTRY.fr.dictionary,
  en: LOCALE_REGISTRY.en.dictionary,
};

export function isLocaleCode(value: string): value is LocaleCode {
  return Object.prototype.hasOwnProperty.call(LOCALE_REGISTRY, value);
}

export function getLocaleConfig(locale: LocaleCode): LocaleConfig {
  return LOCALE_REGISTRY[locale].config;
}

export function extractLocaleFromPath(pathname: string): LocaleCode | null {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return null;
  const candidate = segments[0].toLowerCase();
  return isLocaleCode(candidate) ? candidate : null;
}

export type AppSubPath = '/' | '/administration' | '/espace-client';

export function stripLocalePrefix(pathname: string): AppSubPath {
  const segments = pathname.split('/').filter(Boolean);
  const rest =
    segments.length > 0 && isLocaleCode(segments[0].toLowerCase())
      ? segments.slice(1)
      : segments;
  const normalized = `/${rest.join('/')}`.replace(/\/+$/, '').toLowerCase() || '/';
  // Canonical public URLs are /administrateur and /utilisateur (no locale prefix);
  // the legacy /administration and /espace-client paths are still accepted.
  if (normalized === '/administrateur' || normalized === '/administration') return '/administration';
  if (normalized === '/utilisateur' || normalized === '/espace-client') return '/espace-client';
  return '/';
}

export function isAdminSubPath(pathname: string): boolean {
  return stripLocalePrefix(pathname) === '/administration';
}

export function buildLocalizedPath(locale: LocaleCode, subPath: AppSubPath): string {
  if (subPath === '/administration') return '/administrateur';
  if (subPath === '/espace-client') return '/utilisateur';
  return `/${locale}`;
}

export function getInitialLocale(): LocaleCode {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;

  const fromUrl = extractLocaleFromPath(window.location.pathname);
  if (fromUrl) return fromUrl;

  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored && isLocaleCode(stored)) {
      return stored;
    }
  } catch {
    // ignore storage errors
  }

  const navLang = (
    typeof navigator !== 'undefined' ? navigator.language || '' : ''
  ).toLowerCase();
  const baseLang = navLang.split('-')[0];
  if (baseLang && isLocaleCode(baseLang)) {
    return baseLang;
  }

  return DEFAULT_LOCALE;
}
