import { ArrowRight, LogIn, LogOut, Phone, UserCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { buildLocalizedPath } from '../i18n';

export function TrackingPortal() {
  const { user, authReady, signOutUser } = useAuth();
  const { locale, t, navigateTo } = useLanguage();
  const portalHref = buildLocalizedPath(locale, '/espace-client');

  return (
    <section id="tracking" className="py-16 lg:py-20 bg-slate-100/70 border-b border-slate-200">
      <div className="max-w-[1200px] mx-auto px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div className="max-w-2xl">
            <p className="text-xs font-medium text-sky-700">{t.portal.eyebrow}</p>
            <h2
              className="mt-2 font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900"
              style={{ textWrap: 'balance' }}
            >
              {t.portal.title}
            </h2>
            <p className="mt-3 text-base text-slate-600 leading-relaxed">{t.portal.subtitle}</p>
          </div>

          {authReady && user && (
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <span className="text-xs text-slate-600">
                {t.portal.connectedAs}{' '}
                <span className="font-medium text-slate-900">{user.email}</span>
              </span>
              <button
                type="button"
                onClick={() => void signOutUser()}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-orange-700 bg-white border border-orange-300 hover:bg-orange-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap min-h-[40px]"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t.common.signOut}</span>
              </button>
            </div>
          )}
        </div>

        {/* Dedicated Single-Page Gateway Card */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-8 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-sky-700">
                <UserCheck className="w-4 h-4" aria-hidden="true" />
                <span>{t.portal.cardEyebrow}</span>
              </div>
              <h3 className="mt-3 font-display text-xl font-bold text-slate-900">
                {t.portal.cardTitle}
              </h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed max-w-[60ch]">
                {t.portal.cardDesc}
              </p>

              <div className="mt-6 pt-6 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-slate-600">
                <div>
                  <p className="font-semibold text-slate-900">{t.portal.step1Title}</p>
                  <p className="mt-1">{t.portal.step1Desc}</p>
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{t.portal.step2Title}</p>
                  <p className="mt-1">{t.portal.step2Desc}</p>
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{t.portal.step3Title}</p>
                  <p className="mt-1">{t.portal.step3Desc}</p>
                </div>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href={portalHref}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                  e.preventDefault();
                  navigateTo('/espace-client');
                }}
                className="inline-flex items-center justify-center gap-2.5 px-6 py-3 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors cursor-pointer min-h-[44px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
              >
                {authReady && user ? (
                  <>
                    <span>{t.portal.openWorkspaceCta}</span>
                    <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" aria-hidden="true" />
                    <span>{t.portal.signInCta}</span>
                  </>
                )}
              </a>
            </div>
          </div>

          {/* Client Support Card */}
          <div className="lg:col-span-4 bg-slate-900 text-slate-100 rounded-xl p-8 flex flex-col justify-between">
            <div>
              <p className="text-xs font-semibold text-sky-400">{t.portal.assistEyebrow}</p>
              <h3 className="mt-3 font-display text-lg font-bold text-white">
                {t.portal.assistTitle}
              </h3>
              <p className="mt-2 text-sm text-slate-300 leading-relaxed">{t.portal.assistDesc}</p>
            </div>

            <div className="mt-6 pt-6 border-t border-slate-800 space-y-3">
              <a
                href="tel:+22789994453"
                className="inline-flex items-center gap-2 font-mono text-sm font-semibold text-white hover:text-sky-300 tabular-nums"
              >
                <Phone className="w-4 h-4 text-sky-400" aria-hidden="true" />
                <span>+227 89 99 44 53</span>
              </a>
              <p className="text-xs text-slate-400">commercial@alphalogistixgroup.com</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
