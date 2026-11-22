import { ArrowLeft, Lock, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { BOOTSTRAPPED_ADMIN_EMAIL } from '../lib/firebase';
import { AdminTrackingWorkspace } from './AdminTrackingWorkspace';
import { LanguageSwitcher } from './LanguageSwitcher';

export function AdminPortalPage() {
  const {
    user,
    authReady,
    loadingAdmin,
    isAdmin,
    isBootstrappedAdmin,
    staffRole,
    authError,
    clearAuthError,
    signInWithGoogle,
    signOutUser,
  } = useAuth();
  const { t, navigateTo } = useLanguage();

  const handleAdminLogout = async () => {
    try {
      window.sessionStorage.removeItem('alg_admin_gate_ok');
    } catch {
      // ignore storage errors
    }
    await signOutUser();
  };

  const fullyAuthenticatedAdmin =
    authReady && Boolean(user) && Boolean(user?.emailVerified) && isAdmin;
  const roleLabel = isBootstrappedAdmin
    ? t.admin.roleMain
    : staffRole === 'admin'
      ? t.admin.roleStaffAdmin
      : t.admin.roleOperator;

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 text-slate-900">
      {/* Dedicated Admin Header */}
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
              {t.admin.headerBrand}
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
              <span className="hidden sm:inline">{t.admin.publicSite}</span>
            </button>

            {user && (
              <button
                type="button"
                onClick={() => void handleAdminLogout()}
                className="inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap min-h-[38px]"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">{t.common.signOut}</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 py-12 lg:py-16">
        <div className="max-w-[1200px] mx-auto px-6 lg:px-8">
          {!authReady ? (
            <div className="max-w-lg mx-auto bg-white border border-slate-200 rounded-xl p-8" aria-busy="true">
              <div className="h-8 w-52 bg-slate-100 rounded animate-pulse" />
            </div>
          ) : !user ? (
            /* Direct Firebase Authentication + Server-Validated RBAC */
            <div className="max-w-lg mx-auto bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-orange-600">
                  <Lock className="w-4 h-4" aria-hidden="true" />
                  <span>{t.admin.restrictedAccess}</span>
                </div>
                <img
                  src="/assets/aistudio/logo_alpha_87701e6c.jpeg"
                  alt={t.footer.logoAlt}
                  className="h-12 w-12 object-contain"
                />
              </div>

              <p className="text-xs font-semibold text-sky-700">{t.admin.dbVerifyEyebrow}</p>
              <h1 className="mt-1 font-display text-xl sm:text-2xl font-bold text-slate-900">
                {t.admin.dbVerifyTitle}
              </h1>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                {t.admin.dbVerifyDescPrefix}
                <span className="font-mono text-xs text-slate-900">{BOOTSTRAPPED_ADMIN_EMAIL}</span>
                {t.admin.dbVerifyDescSuffix}
              </p>

              {authError && (
                <div
                  role="alert"
                  className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-800 flex items-center justify-between gap-3"
                >
                  <span>{authError}</span>
                  <button
                    type="button"
                    onClick={clearAuthError}
                    className="underline cursor-pointer shrink-0"
                  >
                    {t.common.close}
                  </button>
                </div>
              )}

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void signInWithGoogle()}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors cursor-pointer min-h-[44px]"
                >
                  <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                  <span>{t.admin.validateSessionBtn}</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigateTo('/')}
                  className="px-4 py-2.5 text-sm font-medium text-orange-700 bg-white border border-orange-300 hover:bg-orange-50 rounded-lg cursor-pointer min-h-[44px]"
                >
                  {t.common.cancel}
                </button>
              </div>
            </div>
          ) : !user.emailVerified ? (
            <div className="max-w-lg mx-auto bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
              <p className="text-xs font-semibold text-amber-700">{t.admin.unverifiedEmailEyebrow}</p>
              <h1 className="mt-2 font-display text-xl font-bold text-slate-900">
                {t.admin.unverifiedEmailTitle}
              </h1>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                {t.admin.unverifiedEmailDesc}
              </p>
              <div className="mt-6">
                <button
                  type="button"
                  onClick={() => void handleAdminLogout()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg cursor-pointer min-h-[44px]"
                >
                  <LogOut className="w-4 h-4" aria-hidden="true" />
                  <span>{t.admin.switchAccountBtn}</span>
                </button>
              </div>
            </div>
          ) : loadingAdmin ? (
            <div className="max-w-lg mx-auto bg-white border border-slate-200 rounded-xl p-8" aria-busy="true">
              <div className="h-8 w-52 bg-slate-100 rounded animate-pulse" />
            </div>
          ) : !isAdmin ? (
            /* Wrong Google account signed in */
            <div className="max-w-lg mx-auto bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
              <p className="text-xs font-semibold text-red-700">{t.admin.unauthorizedEyebrow}</p>
              <h1 className="mt-2 font-display text-xl font-bold text-slate-900">
                {t.admin.unauthorizedTitle} {user.email}
              </h1>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                {t.admin.unauthorizedDesc} ({BOOTSTRAPPED_ADMIN_EMAIL}).
              </p>
              <div className="mt-6">
                <button
                  type="button"
                  onClick={() => void handleAdminLogout()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg cursor-pointer min-h-[44px]"
                >
                  <LogOut className="w-4 h-4" aria-hidden="true" />
                  <span>{t.admin.switchAccountBtn}</span>
                </button>
              </div>
            </div>
          ) : fullyAuthenticatedAdmin ? (
            <div className="space-y-6">
              <div>
                <p className="text-xs font-medium text-sky-700">
                  {roleLabel} · {user.email}
                </p>
                <h1 className="mt-1 font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                  {t.admin.workspaceTitle}
                </h1>
              </div>
              <AdminTrackingWorkspace />
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
