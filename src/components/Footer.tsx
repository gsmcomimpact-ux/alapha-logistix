import { MouseEvent } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { buildLocalizedPath } from '../i18n';
import { LanguageSwitcher } from './LanguageSwitcher';

export function Footer() {
  const { locale, t, navigateTo } = useLanguage();
  const adminHref = buildLocalizedPath(locale, '/administration');
  const clientPortalHref = buildLocalizedPath(locale, '/espace-client');

  const handleAdminClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigateTo('/administration');
  };

  const handleClientPortalClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigateTo('/espace-client');
  };

  return (
    <footer className="bg-slate-900 text-slate-300 py-12 border-t border-slate-800">
      <div className="max-w-[1200px] mx-auto px-6 lg:px-8 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
        <div className="flex items-start gap-3.5">
          <div className="bg-white rounded-lg p-1 shrink-0">
            <img
              src="/assets/aistudio/logo_alpha_87701e6c.jpeg"
              alt={t.footer.logoAlt}
              className="h-10 w-10 object-contain"
            />
          </div>
          <div>
            <p className="font-display text-base font-bold tracking-tight text-white">
              {t.common.brandName}
            </p>
            <p className="mt-1.5 text-xs text-slate-400">
              www.alphalogistixgroup.com ·{' '}
              <a href="tel:+22789994453" className="hover:text-white transition-colors">
                +227 89 99 44 53
              </a>{' '}
              ·{' '}
              <a
                href="https://wa.me/22789994453"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition-colors"
              >
                WhatsApp
              </a>{' '}
              ·{' '}
              <a
                href="mailto:commercial@alphalogistixgroup.com"
                className="hover:text-white transition-colors"
              >
                commercial@alphalogistixgroup.com
              </a>
            </p>
          </div>
        </div>

        <nav
          aria-label={t.nav.footerNavLabel}
          className="flex flex-wrap items-center gap-6 text-xs font-medium text-slate-300"
        >
          <a href="#services" className="hover:text-white transition-colors whitespace-nowrap">
            {t.nav.services}
          </a>
          <a href="#simulateur" className="hover:text-white transition-colors whitespace-nowrap">
            {t.nav.calculator}
          </a>
          <a href="#tracking" className="hover:text-white transition-colors whitespace-nowrap">
            {t.nav.tracking}
          </a>
          <a href="#equipe" className="hover:text-white transition-colors whitespace-nowrap">
            {t.nav.team}
          </a>
          <a href="#contact" className="hover:text-white transition-colors whitespace-nowrap">
            {t.nav.contact}
          </a>
          <a
            href={clientPortalHref}
            onClick={handleClientPortalClick}
            className="text-orange-400 hover:text-orange-300 transition-colors whitespace-nowrap"
          >
            {t.nav.clientPortal}
          </a>
          <a
            href={adminHref}
            onClick={handleAdminClick}
            className="text-slate-400 hover:text-white transition-colors whitespace-nowrap"
          >
            {t.nav.admin}
          </a>
        </nav>

        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <LanguageSwitcher variant="dark" />
          <p className="text-xs text-slate-400">{t.footer.copyright}</p>
        </div>
      </div>
    </footer>
  );
}
