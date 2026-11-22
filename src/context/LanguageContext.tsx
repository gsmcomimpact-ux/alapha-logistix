import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import {
  AppSubPath,
  buildLocalizedPath,
  DEFAULT_LOCALE,
  DICTIONARIES,
  extractLocaleFromPath,
  getInitialLocale,
  getLocaleConfig,
  LOCALE_STORAGE_KEY,
  LocaleCode,
  LocaleConfig,
  stripLocalePrefix,
  SUPPORTED_LOCALES,
  TranslationDictionary,
} from '../i18n';

export type { AppSubPath };

interface LanguageContextValue {
  locale: LocaleCode;
  localeConfig: LocaleConfig;
  t: TranslationDictionary;
  subPath: AppSubPath;
  setLocale: (next: LocaleCode, options?: { updateUrl?: boolean }) => void;
  navigateTo: (targetSubPath: AppSubPath, sectionId?: string) => void;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

function upsertMetaTag(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertLinkTag(rel: string, href: string, hreflang?: string) {
  const selector = hreflang
    ? `link[rel="${rel}"][hreflang="${hreflang}"]`
    : `link[rel="${rel}"]:not([hreflang])`;
  let el = document.head.querySelector<HTMLLinkElement>(selector);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    if (hreflang) el.setAttribute('hreflang', hreflang);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleCode>(() => getInitialLocale());
  const [subPath, setSubPath] = useState<AppSubPath>(() =>
    typeof window !== 'undefined' ? stripLocalePrefix(window.location.pathname) : '/'
  );

  // Normalize unprefixed URLs ('/' or '/administration') to canonical SEO localized URLs on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const currentSub = stripLocalePrefix(window.location.pathname);
    setSubPath(currentSub);

    const targetUrl =
      buildLocalizedPath(locale, currentSub) +
      window.location.search +
      window.location.hash;
    const currentUrl = window.location.pathname + window.location.search + window.location.hash;
    // Normalize to canonical URLs: '/' -> '/fr', '/administration' -> '/administrateur', etc.
    if (targetUrl !== currentUrl) {
      window.history.replaceState({}, '', targetUrl);
    }
  }, []);

  // Synchronize browser Back/Forward navigation (popstate)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePopState = () => {
      const nextSub = stripLocalePrefix(window.location.pathname);
      setSubPath(nextSub);
      const urlLocale = extractLocaleFromPath(window.location.pathname);
      if (urlLocale) {
        setLocaleState(urlLocale);
        try {
          window.localStorage.setItem(LOCALE_STORAGE_KEY, urlLocale);
        } catch {
          // ignore storage errors
        }
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const setLocale = useCallback(
    (next: LocaleCode, options: { updateUrl?: boolean } = {}) => {
      const { updateUrl = true } = options;
      setLocaleState(next);
      try {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
      } catch {
        // ignore storage errors
      }

      if (updateUrl && typeof window !== 'undefined') {
        const currentSub = stripLocalePrefix(window.location.pathname);
        const nextPath = buildLocalizedPath(next, currentSub);
        const nextUrl = nextPath + window.location.search + window.location.hash;
        if (window.location.pathname + window.location.search + window.location.hash !== nextUrl) {
          window.history.pushState({}, '', nextUrl);
        }
      }
    },
    []
  );

  const navigateTo = useCallback(
    (targetSubPath: AppSubPath, sectionId?: string) => {
      setSubPath(targetSubPath);
      if (typeof window !== 'undefined') {
        const cleanSection = sectionId ? sectionId.replace(/^#/, '') : '';
        const hashSuffix = cleanSection ? `#${cleanSection}` : '';
        const nextUrl = `${buildLocalizedPath(locale, targetSubPath)}${hashSuffix}`;
        window.history.pushState({}, '', nextUrl);
        if (cleanSection) {
          window.requestAnimationFrame(() => {
            window.setTimeout(() => {
              const target = document.getElementById(cleanSection);
              if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }, 60);
          });
        } else {
          window.scrollTo({ top: 0, behavior: 'auto' });
        }
      }
    },
    [locale]
  );

  const localeConfig = getLocaleConfig(locale);
  const t = DICTIONARIES[locale];

  // Dynamically update document lang/dir, SEO meta tags, canonical, hreflang alternates, and JSON-LD
  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;

    const origin = window.location.origin;
    const localizedPath = buildLocalizedPath(locale, subPath);
    const canonicalUrl = `${origin}${localizedPath}`;
    const pageTitle =
      subPath === '/administration'
        ? t.seo.adminTitle
        : subPath === '/espace-client'
          ? t.seo.clientPortalTitle
          : t.seo.title;
    const ogTitle =
      subPath === '/administration'
        ? t.seo.adminTitle
        : subPath === '/espace-client'
          ? t.seo.clientPortalTitle
          : t.seo.ogTitle;

    document.documentElement.lang = localeConfig.code;
    document.documentElement.dir = localeConfig.dir;
    document.title = pageTitle;

    const logoUrl = `${origin}/assets/aistudio/logo_alpha_87701e6c.jpeg`;

    upsertMetaTag('name', 'description', t.seo.description);
    upsertMetaTag('name', 'keywords', t.seo.keywords);
    upsertMetaTag('property', 'og:title', ogTitle);
    upsertMetaTag('property', 'og:description', t.seo.ogDescription);
    upsertMetaTag('property', 'og:image', logoUrl);
    upsertMetaTag('property', 'og:locale', localeConfig.ogLocale);
    upsertMetaTag('property', 'og:url', canonicalUrl);
    upsertMetaTag('name', 'twitter:title', ogTitle);
    upsertMetaTag('name', 'twitter:description', t.seo.ogDescription);
    upsertMetaTag('name', 'twitter:image', logoUrl);

    upsertLinkTag('canonical', canonicalUrl);

    for (const loc of SUPPORTED_LOCALES) {
      upsertLinkTag('alternate', `${origin}${buildLocalizedPath(loc.code, subPath)}`, loc.hreflang);
    }
    upsertLinkTag('alternate', `${origin}${buildLocalizedPath(DEFAULT_LOCALE, subPath)}`, 'x-default');

    // Schema.org structured data synced to active locale
    let jsonLdScript = document.getElementById('alg-jsonld') as HTMLScriptElement | null;
    if (!jsonLdScript) {
      jsonLdScript = document.createElement('script');
      jsonLdScript.id = 'alg-jsonld';
      jsonLdScript.type = 'application/ld+json';
      document.head.appendChild(jsonLdScript);
    }
    jsonLdScript.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Alpha Logistix Group',
      url: canonicalUrl,
      logo: logoUrl,
      description: t.seo.description,
      keywords: t.seo.keywords,
      knowsAbout: t.seo.serviceTypes,
      hasOfferCatalog: {
        '@type': 'OfferCatalog',
        name: t.services.title,
        itemListElement: t.seo.serviceTypes.map((serviceName) => ({
          '@type': 'Offer',
          itemOffered: {
            '@type': 'Service',
            name: serviceName,
          },
        })),
      },
      inLanguage: localeConfig.code,
      availableLanguage: SUPPORTED_LOCALES.map((loc) => loc.nativeName),
      telephone: '+227 89 99 44 53',
      email: 'commercial@alphalogistixgroup.com',
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Niamey',
        addressCountry: 'NE',
      },
      areaServed: ['Niger', 'Benin', 'Togo', 'Ghana', 'Ivory Coast', 'West Africa', 'Africa', 'China', 'United Arab Emirates'],
    });
  }, [locale, localeConfig, subPath, t]);

  return (
    <LanguageContext.Provider
      value={{
        locale,
        localeConfig,
        t,
        subPath,
        setLocale,
        navigateTo,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return ctx;
}
