import { Globe } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { LocaleCode, SUPPORTED_LOCALES } from '../i18n';

interface LanguageSwitcherProps {
  variant?: 'light' | 'dark';
}

export function LanguageSwitcher({ variant = 'light' }: LanguageSwitcherProps) {
  const { locale, t, setLocale } = useLanguage();

  // Automatically switch to a compact native <select> if more than 4 languages are registered later
  if (SUPPORTED_LOCALES.length > 4) {
    return (
      <div className="inline-flex items-center gap-1.5">
        <Globe
          className={`w-4 h-4 shrink-0 ${
            variant === 'dark' ? 'text-slate-400' : 'text-slate-500'
          }`}
          aria-hidden="true"
        />
        <select
          aria-label={t.common.languageSelectorLabel}
          value={locale}
          onChange={(e) => setLocale(e.target.value as LocaleCode)}
          className={`min-h-[36px] px-2.5 py-1 text-xs font-semibold rounded-lg border focus:outline-none focus:ring-2 focus:ring-orange-500/40 cursor-pointer ${
            variant === 'dark'
              ? 'bg-slate-800 border-slate-700 text-white'
              : 'bg-white border-slate-300 text-slate-900'
          }`}
        >
          {SUPPORTED_LOCALES.map((loc) => (
            <option key={loc.code} value={loc.code}>
              {loc.shortLabel} — {loc.nativeName}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label={t.common.languageSelectorLabel}
      className={`inline-flex items-center gap-1 p-1 rounded-lg border shrink-0 ${
        variant === 'dark'
          ? 'bg-slate-800/90 border-slate-700'
          : 'bg-slate-100 border-slate-200'
      }`}
    >
      <Globe
        className={`w-3.5 h-3.5 ml-1.5 mr-0.5 shrink-0 ${
          variant === 'dark' ? 'text-slate-400' : 'text-slate-500'
        }`}
        aria-hidden="true"
      />
      {SUPPORTED_LOCALES.map((loc) => {
        const isActive = locale === loc.code;
        return (
          <button
            key={loc.code}
            type="button"
            lang={loc.code}
            onClick={() => setLocale(loc.code)}
            aria-current={isActive ? 'true' : undefined}
            aria-label={`${loc.nativeName} (${loc.shortLabel})`}
            title={loc.nativeName}
            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer min-h-[28px] whitespace-nowrap ${
              isActive
                ? 'bg-orange-600 text-white shadow-sm'
                : variant === 'dark'
                  ? 'text-slate-300 hover:text-white hover:bg-slate-700/70'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
            }`}
          >
            {loc.shortLabel}
          </button>
        );
      })}
    </div>
  );
}
