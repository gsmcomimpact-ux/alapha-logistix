import { FormEvent, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Lock,
  LogOut,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  UserPlus,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { FIELD_LIMITS } from '../types/logistics';
import { ClientAccountSetup } from './ClientAccountSetup';
import { ClientTrackingWorkspace } from './ClientTrackingWorkspace';
import { LanguageSwitcher } from './LanguageSwitcher';

type AuthMode = 'login' | 'register' | 'reset';

function GoogleBadge() {
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
      />
    </svg>
  );
}

export function ClientPortalPage() {
  const {
    user,
    authReady,
    userProfile,
    clientAccountStatus,
    loadingProfile,
    authError,
    clearAuthError,
    signInWithGoogle,
    signInWithEmail,
    registerWithEmail,
    resetClientPassword,
    signOutUser,
  } = useAuth();
  const { locale, t, navigateTo } = useLanguage();

  const [mode, setMode] = useState<AuthMode>('login');
  const [showPassword, setShowPassword] = useState(false);

  // Login fields
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register fields
  const [fullName, setFullName] = useState('');
  const [company, setCompany] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('Niamey');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');

  // Reset password fields
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [editingPendingProfile, setEditingPendingProfile] = useState(false);

  const ca = t.clientAuth;

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setLocalError(null);
    setResetSent(false);
    clearAuthError();
  };

  const handleLoginSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(null);
    clearAuthError();

    const cleanEmail = loginEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
      setLocalError(ca.errEmail);
      return;
    }
    if (loginPassword.length < 6) {
      setLocalError(ca.errPasswordLength);
      return;
    }

    setSubmitting(true);
    try {
      await signInWithEmail(cleanEmail, loginPassword);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(null);
    clearAuthError();

    const cleanName = fullName.trim();
    const cleanCompany = company.trim();
    const cleanPhone = phone.trim();
    const cleanCity = city.trim();
    const cleanEmail = regEmail.trim().toLowerCase();

    if (cleanName.length < 2 || cleanName.length > FIELD_LIMITS.fullNameMax) {
      setLocalError(ca.errName);
      return;
    }
    if (cleanCompany.length < 1 || cleanCompany.length > FIELD_LIMITS.companyMax) {
      setLocalError(ca.errCompany);
      return;
    }
    if (cleanPhone.length < 4 || cleanPhone.length > FIELD_LIMITS.phoneMax) {
      setLocalError(ca.errPhone);
      return;
    }
    if (cleanCity.length < 2 || cleanCity.length > FIELD_LIMITS.cityMax) {
      setLocalError(ca.errCity);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
      setLocalError(ca.errEmail);
      return;
    }
    if (regPassword.length < 6) {
      setLocalError(ca.errPasswordLength);
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setLocalError(ca.errPasswordMatch);
      return;
    }

    setSubmitting(true);
    try {
      await registerWithEmail({
        fullName: cleanName,
        company: cleanCompany,
        phone: cleanPhone,
        city: cleanCity,
        email: cleanEmail,
        password: regPassword,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(null);
    setResetSent(false);
    clearAuthError();

    const cleanEmail = resetEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
      setLocalError(ca.errEmail);
      return;
    }

    setSubmitting(true);
    try {
      const res = await resetClientPassword(cleanEmail);
      if (res.ok) {
        setResetSent(true);
      } else if (res.error) {
        setLocalError(res.error);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const displayedError = localError || authError;

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 text-slate-900">
      {/* Dedicated Client Portal Header (Matches AdminPortalPage structure) */}
      <header className="bg-slate-900 text-white border-b border-slate-800">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="bg-white rounded-md p-0.5 shrink-0">
              <img
                src="/assets/aistudio/logo_alpha_87701e6c.jpeg"
                alt={t.footer.logoAlt}
                className="h-8 w-8 object-contain"
              />
            </div>
            <span className="font-display text-sm sm:text-lg font-bold tracking-tight truncate">
              {ca.headerBrand}
            </span>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            <LanguageSwitcher variant="dark" />

            <button
              type="button"
              onClick={() => navigateTo('/')}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">{ca.publicSite}</span>
            </button>

            {user && (
              <button
                type="button"
                onClick={() => void signOutUser()}
                className="inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap min-h-[38px]"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">{t.common.signOut}</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 py-10 lg:py-14">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
          {!authReady ? (
            <div className="max-w-lg mx-auto bg-white border border-slate-200 rounded-xl p-8 space-y-3" aria-busy="true">
              <div className="h-8 w-52 bg-slate-100 rounded animate-pulse" />
              <div className="h-24 bg-slate-100 rounded animate-pulse" />
            </div>
          ) : !user ? (
            <div className="max-w-lg mx-auto space-y-5">
              <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-orange-600">
                    <Lock className="w-4 h-4" aria-hidden="true" />
                    <span>{ca.eyebrow}</span>
                  </div>
                  <img
                    src="/assets/aistudio/logo_alpha_87701e6c.jpeg"
                    alt={t.footer.logoAlt}
                    className="h-12 w-12 object-contain"
                  />
                </div>

                <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
                  {mode === 'reset' ? ca.resetTitle : ca.title}
                </h1>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  {mode === 'reset' ? ca.resetDesc : ca.subtitle}
                </p>

                {/* Mode Switcher Tabs (Sign In / Create Account) */}
                {mode !== 'reset' && (
                  <div
                    role="tablist"
                    aria-label={ca.eyebrow}
                    className="mt-6 grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={mode === 'login'}
                      onClick={() => switchMode('login')}
                      className={`py-2.5 px-3 text-xs sm:text-sm font-semibold rounded-md transition-colors cursor-pointer ${
                        mode === 'login'
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {ca.tabLogin}
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={mode === 'register'}
                      onClick={() => switchMode('register')}
                      className={`inline-flex items-center justify-center gap-1.5 py-2.5 px-3 text-xs sm:text-sm font-semibold rounded-md transition-colors cursor-pointer ${
                        mode === 'register'
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <UserPlus className="w-3.5 h-3.5 text-orange-600" aria-hidden="true" />
                      <span>{ca.tabRegister}</span>
                    </button>
                  </div>
                )}

                {displayedError && (
                  <div
                    role="alert"
                    className="mt-5 p-3 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-800 flex items-start justify-between gap-3"
                  >
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                      <span>{displayedError}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setLocalError(null);
                        clearAuthError();
                      }}
                      className="underline cursor-pointer shrink-0"
                    >
                      {t.common.close}
                    </button>
                  </div>
                )}

                {/* LOGIN FORM */}
                {mode === 'login' && (
                  <form onSubmit={handleLoginSubmit} noValidate className="mt-6 space-y-4">
                    <div>
                      <label
                        htmlFor="client-login-email"
                        className="block text-xs font-semibold text-slate-800 mb-1.5"
                      >
                        {ca.emailLabel}
                      </label>
                      <input
                        id="client-login-email"
                        type="email"
                        autoComplete="email"
                        maxLength={FIELD_LIMITS.emailMax}
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        placeholder="client@entreprise.com"
                        className="w-full min-h-[44px] px-3.5 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <label
                          htmlFor="client-login-password"
                          className="block text-xs font-semibold text-slate-800"
                        >
                          {ca.passwordLabel}
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setResetEmail(loginEmail);
                            switchMode('reset');
                          }}
                          className="text-xs font-medium text-sky-700 hover:text-sky-800 hover:underline cursor-pointer"
                        >
                          {ca.forgotPassword}
                        </button>
                      </div>
                      <div className="relative">
                        <input
                          id="client-login-password"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="current-password"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full min-h-[44px] pl-3.5 pr-11 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          aria-label={showPassword ? ca.hidePassword : ca.showPassword}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-slate-800 cursor-pointer"
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4" aria-hidden="true" />
                          ) : (
                            <Eye className="w-4 h-4" aria-hidden="true" />
                          )}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full min-h-[44px] px-5 py-2.5 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
                    >
                      {submitting ? ca.loggingInBtn : ca.loginBtn}
                    </button>
                  </form>
                )}

                {/* REGISTER FORM */}
                {mode === 'register' && (
                  <form onSubmit={handleRegisterSubmit} noValidate className="mt-6 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label
                          htmlFor="client-reg-name"
                          className="block text-xs font-semibold text-slate-800 mb-1.5"
                        >
                          {t.accountSetup.fullNameLabel}
                        </label>
                        <input
                          id="client-reg-name"
                          type="text"
                          autoComplete="name"
                          maxLength={FIELD_LIMITS.fullNameMax}
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="Moussa Abdoulaye"
                          className="w-full min-h-[42px] px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="client-reg-company"
                          className="block text-xs font-semibold text-slate-800 mb-1.5"
                        >
                          {t.accountSetup.companyLabel}
                        </label>
                        <input
                          id="client-reg-company"
                          type="text"
                          autoComplete="organization"
                          maxLength={FIELD_LIMITS.companyMax}
                          value={company}
                          onChange={(e) => setCompany(e.target.value)}
                          placeholder="Sahel Import-Export SARL"
                          className="w-full min-h-[42px] px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label
                          htmlFor="client-reg-phone"
                          className="block text-xs font-semibold text-slate-800 mb-1.5"
                        >
                          {t.accountSetup.phoneLabel}
                        </label>
                        <input
                          id="client-reg-phone"
                          type="tel"
                          autoComplete="tel"
                          maxLength={FIELD_LIMITS.phoneMax}
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="+227 90 00 00 00"
                          className="w-full min-h-[42px] px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="client-reg-city"
                          className="block text-xs font-semibold text-slate-800 mb-1.5"
                        >
                          {t.accountSetup.cityLabel}
                        </label>
                        <input
                          id="client-reg-city"
                          type="text"
                          autoComplete="address-level2"
                          maxLength={FIELD_LIMITS.cityMax}
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          placeholder="Niamey"
                          className="w-full min-h-[42px] px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="client-reg-email"
                        className="block text-xs font-semibold text-slate-800 mb-1.5"
                      >
                        {ca.emailLabel}
                      </label>
                      <input
                        id="client-reg-email"
                        type="email"
                        autoComplete="email"
                        maxLength={FIELD_LIMITS.emailMax}
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        placeholder="client@entreprise.com"
                        className="w-full min-h-[42px] px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label
                          htmlFor="client-reg-password"
                          className="block text-xs font-semibold text-slate-800 mb-1.5"
                        >
                          {ca.passwordLabel}
                        </label>
                        <div className="relative">
                          <input
                            id="client-reg-password"
                            type={showPassword ? 'text' : 'password'}
                            autoComplete="new-password"
                            value={regPassword}
                            onChange={(e) => setRegPassword(e.target.value)}
                            placeholder={ca.passwordPlaceholder}
                            className="w-full min-h-[42px] pl-3 pr-10 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            aria-label={showPassword ? ca.hidePassword : ca.showPassword}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-800 cursor-pointer"
                          >
                            {showPassword ? (
                              <EyeOff className="w-4 h-4" aria-hidden="true" />
                            ) : (
                              <Eye className="w-4 h-4" aria-hidden="true" />
                            )}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label
                          htmlFor="client-reg-confirm"
                          className="block text-xs font-semibold text-slate-800 mb-1.5"
                        >
                          {ca.confirmPasswordLabel}
                        </label>
                        <input
                          id="client-reg-confirm"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="new-password"
                          value={regConfirmPassword}
                          onChange={(e) => setRegConfirmPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full min-h-[42px] px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20"
                        />
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-500 leading-relaxed bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
                      {ca.registerNotice}
                    </p>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full min-h-[44px] px-5 py-2.5 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
                    >
                      {submitting ? ca.creatingBtn : ca.registerBtn}
                    </button>
                  </form>
                )}

                {/* PASSWORD RESET FORM */}
                {mode === 'reset' && (
                  <form onSubmit={handleResetSubmit} noValidate className="mt-6 space-y-4">
                    <div>
                      <label
                        htmlFor="client-reset-email"
                        className="block text-xs font-semibold text-slate-800 mb-1.5"
                      >
                        {ca.emailLabel}
                      </label>
                      <input
                        id="client-reset-email"
                        type="email"
                        autoComplete="email"
                        maxLength={FIELD_LIMITS.emailMax}
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        placeholder="client@entreprise.com"
                        className="w-full min-h-[44px] px-3.5 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20"
                      />
                    </div>

                    {resetSent && (
                      <div
                        role="status"
                        className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-900 flex items-start gap-2"
                      >
                        <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
                        <span>{ca.resetSentMsg}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full min-h-[44px] px-5 py-2.5 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
                    >
                      {submitting ? ca.sendingResetBtn : ca.sendResetBtn}
                    </button>

                    <button
                      type="button"
                      onClick={() => switchMode('login')}
                      className="w-full py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                    >
                      {ca.backToLogin}
                    </button>
                  </form>
                )}

                {/* GOOGLE SIGN-IN ALTERNATIVE */}
                {mode !== 'reset' && (
                  <>
                    <div className="my-5 flex items-center gap-3">
                      <div className="h-px flex-1 bg-slate-200" />
                      <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                        {ca.orDivider}
                      </span>
                      <div className="h-px flex-1 bg-slate-200" />
                    </div>

                    <button
                      type="button"
                      onClick={() => void signInWithGoogle()}
                      className="w-full min-h-[44px] px-4 py-2.5 inline-flex items-center justify-center gap-2.5 text-sm font-semibold text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors cursor-pointer"
                    >
                      <GoogleBadge />
                      <span>{mode === 'register' ? ca.registerGoogle : ca.continueGoogle}</span>
                    </button>
                  </>
                )}
              </div>

              {/* Support Strip */}
              <div className="bg-slate-900 text-slate-200 rounded-xl px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-sky-400 shrink-0" aria-hidden="true" />
                  <a
                    href="tel:+22789994453"
                    className="font-mono font-semibold text-white hover:text-sky-300 tabular-nums"
                  >
                    +227 89 99 44 53
                  </a>
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <Mail className="w-4 h-4 text-sky-400 shrink-0" aria-hidden="true" />
                  <a
                    href="mailto:commercial@alphalogistixgroup.com"
                    className="hover:text-white transition-colors"
                  >
                    commercial@alphalogistixgroup.com
                  </a>
                </div>
              </div>
            </div>
          ) : loadingProfile ? (
            <div className="max-w-lg mx-auto bg-white border border-slate-200 rounded-xl p-8 space-y-3" aria-busy="true">
              <div className="h-8 w-56 bg-slate-100 rounded animate-pulse" />
              <div className="h-24 bg-slate-100 rounded animate-pulse" />
            </div>
          ) : !userProfile ? (
            <ClientAccountSetup />
          ) : editingPendingProfile ? (
            <ClientAccountSetup
              isEditing
              onSaved={() => setEditingPendingProfile(false)}
              onCancel={() => setEditingPendingProfile(false)}
            />
          ) : clientAccountStatus === 'pending' ? (
            /* PENDING ADMIN VALIDATION CARD */
            <div className="max-w-xl mx-auto bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-sm">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-800">
                <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{ca.pendingEyebrow}</span>
              </div>

              <h1 className="mt-4 font-display text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                {ca.pendingTitle}
              </h1>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">{ca.pendingDesc}</p>

              <div className="mt-6 bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2.5 text-xs">
                <p className="font-semibold text-slate-900">{ca.pendingDetailsTitle}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-600">
                  <p>
                    <span className="text-slate-400">
                      {t.accountSetup.companyLabel}
                      {locale === 'en' ? ': ' : ' : '}
                    </span>
                    <span className="font-medium text-slate-900">{userProfile.company}</span>
                  </p>
                  <p>
                    <span className="text-slate-400">
                      {t.accountSetup.fullNameLabel}
                      {locale === 'en' ? ': ' : ' : '}
                    </span>
                    <span className="font-medium text-slate-900">{userProfile.fullName}</span>
                  </p>
                  <p>
                    <span className="text-slate-400">
                      {ca.emailLabel}
                      {locale === 'en' ? ': ' : ' : '}
                    </span>
                    <span className="font-medium text-slate-900">{userProfile.email}</span>
                  </p>
                  <p>
                    <span className="text-slate-400">
                      {t.accountSetup.phoneLabel}
                      {locale === 'en' ? ': ' : ' : '}
                    </span>
                    <span className="font-mono font-medium text-slate-900">{userProfile.phone}</span>
                  </p>
                  <p>
                    <span className="text-slate-400">
                      {t.accountSetup.cityLabel}
                      {locale === 'en' ? ': ' : ' : '}
                    </span>
                    <span className="font-medium text-slate-900">{userProfile.city}</span>
                  </p>
                </div>
              </div>

              <p className="mt-4 text-xs text-sky-700 font-medium">{ca.pendingNote}</p>

              <div className="mt-6 pt-5 border-t border-slate-200 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setEditingPendingProfile(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-orange-700 bg-white hover:bg-orange-50 border border-orange-300 rounded-lg transition-colors cursor-pointer min-h-[40px]"
                >
                  <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{ca.editProfileBtn}</span>
                </button>

                <a
                  href="https://wa.me/22789994453"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors min-h-[40px]"
                >
                  <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{ca.contactSupportBtn}</span>
                </a>
              </div>
            </div>
          ) : clientAccountStatus === 'rejected' ? (
            <div className="max-w-lg mx-auto bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-sm">
              <p className="text-xs font-semibold text-red-700">{ca.rejectedEyebrow}</p>
              <h1 className="mt-2 font-display text-xl font-bold text-slate-900">
                {ca.rejectedTitle}
              </h1>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">{ca.rejectedDesc}</p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void signOutUser()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg cursor-pointer min-h-[44px]"
                >
                  <LogOut className="w-4 h-4" aria-hidden="true" />
                  <span>{t.common.signOut}</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigateTo('/')}
                  className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer min-h-[44px]"
                >
                  {ca.publicSite}
                </button>
              </div>
            </div>
          ) : (
            <ClientTrackingWorkspace onGoToContact={() => navigateTo('/', 'contact')} />
          )}
        </div>
      </main>
    </div>
  );
}
