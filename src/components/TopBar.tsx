import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { buildLocalizedPath } from '../i18n';
import { LanguageSwitcher } from './LanguageSwitcher';

interface TopBarProps {
  onPortalClick: () => void;
}

export function TopBar({ onPortalClick }: TopBarProps) {
  const { user } = useAuth();
  const { locale, t } = useLanguage();

  const ctaLabel = user ? t.nav.myTracking : t.nav.clientPortal;
  const homeHref = buildLocalizedPath(locale, '/');

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-slate-200">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4 lg:gap-8">
        {/* Zone 1: Brand Logo & Wordmark */}
        <a
          href={`${homeHref}#top`}
          onClick={(e) => {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="inline-flex items-center gap-2.5 sm:gap-3 font-display text-base sm:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-600 rounded-sm"
        >
          <img
            src="/assets/aistudio/logo_alpha_87701e6c.jpeg"
            alt={t.footer.logoAlt}
            className="h-12 w-12 sm:h-14 sm:w-14 object-contain shrink-0"
          />
          <span className="hidden sm:inline">{t.common.brandName}</span>
          <span className="sm:hidden">Alpha Logistix</span>
        </a>

        {/* Zone 2: 4 concise single-line nav links */}
        <nav
          aria-label={t.nav.mainNavLabel}
          className="hidden md:flex items-center gap-6 lg:gap-8 text-sm font-medium text-slate-600"
        >
          <a
            href="#services"
            className="hover:text-slate-900 hover:underline underline-offset-4 decoration-slate-300 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-600 rounded-sm"
          >
            {t.nav.services}
          </a>
          <a
            href="#simulateur"
            className="hover:text-slate-900 hover:underline underline-offset-4 decoration-slate-300 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-600 rounded-sm"
          >
            {t.nav.calculator}
          </a>
          <a
            href="#tracking"
            className="hover:text-slate-900 hover:underline underline-offset-4 decoration-slate-300 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-600 rounded-sm"
          >
            {t.nav.tracking}
          </a>
          <a
            href="#contact"
            className="hover:text-slate-900 hover:underline underline-offset-4 decoration-slate-300 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-600 rounded-sm"
          >
            {t.nav.contact}
          </a>
        </nav>

        {/* Zone 3: Visible Language Selector + Primary CTA */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          <LanguageSwitcher variant="light" />
          <button
            type="button"
            onClick={onPortalClick}
            className="px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-orange-600 rounded-lg hover:bg-orange-700 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 min-h-[40px]"
          >
            {ctaLabel}
          </button>
        </div>
      </div>
    </header>
  );
}
