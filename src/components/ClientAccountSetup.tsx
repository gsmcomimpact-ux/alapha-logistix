import { FormEvent, useState } from 'react';
import { AlertCircle, CheckCircle2, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { FIELD_LIMITS } from '../types/logistics';

interface ClientAccountSetupProps {
  onSaved?: () => void;
  onCancel?: () => void;
  isEditing?: boolean;
}

export function ClientAccountSetup({
  onSaved,
  onCancel,
  isEditing = false,
}: ClientAccountSetupProps) {
  const { user, userProfile, saveClientProfile, signOutUser } = useAuth();
  const { t } = useLanguage();

  const [fullName, setFullName] = useState(
    userProfile?.fullName || user?.displayName || ''
  );
  const [company, setCompany] = useState(userProfile?.company || '');
  const [phone, setPhone] = useState(userProfile?.phone || '');
  const [city, setCity] = useState(userProfile?.city || 'Niamey');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const cleanName = fullName.trim();
    const cleanCompany = company.trim();
    const cleanPhone = phone.trim();
    const cleanCity = city.trim();

    if (cleanName.length < 2 || cleanName.length > FIELD_LIMITS.fullNameMax) {
      setError(t.accountSetup.errName);
      return;
    }
    if (cleanCompany.length < 1 || cleanCompany.length > FIELD_LIMITS.companyMax) {
      setError(t.accountSetup.errCompany);
      return;
    }
    if (cleanPhone.length < 4 || cleanPhone.length > FIELD_LIMITS.phoneMax) {
      setError(t.accountSetup.errPhone);
      return;
    }
    if (cleanCity.length < 2 || cleanCity.length > FIELD_LIMITS.cityMax) {
      setError(t.accountSetup.errCity);
      return;
    }

    setSaving(true);
    try {
      await saveClientProfile({
        fullName: cleanName,
        company: cleanCompany,
        phone: cleanPhone,
        city: cleanCity,
      });
      onSaved?.();
    } catch {
      setError(t.accountSetup.errSave);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-sky-700">
            {isEditing ? t.accountSetup.eyebrowEdit : t.accountSetup.eyebrowCreate}
          </p>
          <h2 className="mt-1.5 font-display text-xl font-bold tracking-tight text-slate-900">
            {isEditing ? t.accountSetup.titleEdit : t.accountSetup.titleCreate}
          </h2>
        </div>
        {!isEditing && (
          <button
            type="button"
            onClick={() => void signOutUser()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[38px]"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t.common.signOut}</span>
          </button>
        )}
      </div>
      <p className="mt-2 text-sm text-slate-600 leading-relaxed">
        {t.accountSetup.introPrefix}{' '}
        <span className="font-medium text-slate-900">{user?.email}</span>.
      </p>

      <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
        <div>
          <label htmlFor="client-fullname" className="block text-sm font-medium text-slate-900 mb-1.5">
            {t.accountSetup.fullNameLabel}
          </label>
          <input
            id="client-fullname"
            type="text"
            maxLength={FIELD_LIMITS.fullNameMax}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Moussa Abdoulaye"
            className="w-full min-h-[44px] px-3.5 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20"
          />
        </div>

        <div>
          <label htmlFor="client-company" className="block text-sm font-medium text-slate-900 mb-1.5">
            {t.accountSetup.companyLabel}
          </label>
          <input
            id="client-company"
            type="text"
            maxLength={FIELD_LIMITS.companyMax}
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Sahel Import-Export SARL"
            className="w-full min-h-[44px] px-3.5 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="client-phone" className="block text-sm font-medium text-slate-900 mb-1.5">
              {t.accountSetup.phoneLabel}
            </label>
            <input
              id="client-phone"
              type="tel"
              maxLength={FIELD_LIMITS.phoneMax}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+227 90 00 00 00"
              className="w-full min-h-[44px] px-3.5 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20"
            />
          </div>

          <div>
            <label htmlFor="client-city" className="block text-sm font-medium text-slate-900 mb-1.5">
              {t.accountSetup.cityLabel}
            </label>
            <input
              id="client-city"
              type="text"
              maxLength={FIELD_LIMITS.cityMax}
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Niamey"
              className="w-full min-h-[44px] px-3.5 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20"
            />
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="flex items-center gap-2 text-xs font-medium text-red-700 pt-1"
          >
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </p>
        )}

        <div className="pt-3 flex flex-wrap items-center justify-end gap-3">
          {isEditing && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2.5 text-sm font-medium text-orange-700 bg-white border border-orange-300 hover:bg-orange-50 rounded-lg transition-colors cursor-pointer min-h-[44px]"
            >
              {t.common.cancel}
            </button>
          )}
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-60 rounded-lg transition-colors cursor-pointer min-h-[44px]"
          >
            <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
            <span>
              {saving
                ? t.common.saving
                : isEditing
                  ? t.accountSetup.submitEdit
                  : t.accountSetup.submitCreate}
            </span>
          </button>
        </div>
      </form>
    </div>
  );
}
