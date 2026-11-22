import { FormEvent, useState } from 'react';
import { CheckCircle2, KeyRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

const inputCls =
  'w-full min-h-[44px] px-3.5 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20';

export function ChangePasswordForm() {
  const { hasPasswordLogin, changePassword } = useAuth();
  const { locale } = useLanguage();
  const en = locale === 'en';
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const reset = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);
    if (next !== confirm) {
      setFeedback({
        ok: false,
        text: en ? 'The two passwords do not match.' : 'Les deux mots de passe ne correspondent pas.',
      });
      return;
    }
    setBusy(true);
    const res = await changePassword(current, next);
    setBusy(false);
    if (res.ok) {
      reset();
      setFeedback({
        ok: true,
        text: en ? 'Password updated.' : 'Mot de passe mis à jour.',
      });
    } else {
      setFeedback({ ok: false, text: res.error ?? (en ? 'Update failed.' : 'Échec de la mise à jour.') });
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900 cursor-pointer"
      >
        <KeyRound className="w-4 h-4 text-sky-700" aria-hidden="true" />
        <span>{en ? 'Change my password' : 'Changer mon mot de passe'}</span>
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4" noValidate>
          {hasPasswordLogin ? (
            <div>
              <label htmlFor="pw-current" className="block text-xs font-medium text-slate-700 mb-1">
                {en ? 'Current password' : 'Mot de passe actuel'}
              </label>
              <input
                id="pw-current"
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                className={inputCls}
              />
            </div>
          ) : (
            <p className="sm:col-span-3 text-xs text-slate-600">
              {en
                ? 'No password is set on this account yet. You will be asked to confirm with Google, then the password below will be created.'
                : 'Aucun mot de passe n’est défini sur ce compte. Une confirmation Google vous sera demandée, puis le mot de passe ci-dessous sera créé.'}
            </p>
          )}
          <div>
            <label htmlFor="pw-new" className="block text-xs font-medium text-slate-700 mb-1">
              {en ? 'New password (8+ characters)' : 'Nouveau mot de passe (8 caractères min.)'}
            </label>
            <input
              id="pw-new"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="pw-confirm" className="block text-xs font-medium text-slate-700 mb-1">
              {en ? 'Confirm new password' : 'Confirmer le nouveau mot de passe'}
            </label>
            <input
              id="pw-confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="sm:col-span-3 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={busy || !next || !confirm || (hasPasswordLogin && !current)}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-60 rounded-lg min-h-[44px] cursor-pointer"
            >
              {busy ? (en ? 'Saving…' : 'Enregistrement…') : en ? 'Update password' : 'Mettre à jour'}
            </button>
            {feedback && (
              <p
                role={feedback.ok ? 'status' : 'alert'}
                className={`flex items-center gap-1.5 text-xs font-medium ${
                  feedback.ok ? 'text-emerald-700' : 'text-red-700'
                }`}
              >
                {feedback.ok && <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />}
                <span>{feedback.text}</span>
              </p>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
