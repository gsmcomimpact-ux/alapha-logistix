import { FormEvent, useState } from 'react';
import { AlertCircle, Search } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import {
  fetchPublicTracking,
  isValidTrackingCode,
  normalizeTrackingCode,
  POSITION_SOURCE_LABELS,
  PublicTrackingRecord,
} from '../lib/publicTracking';
import { SHIPMENT_STATUSES } from '../types/logistics';

export function PublicTrackingLookup() {
  const { locale, localeConfig, t } = useLanguage();
  const en = locale === 'en';
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PublicTrackingRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setResult(null);
    setError(null);
    const normalized = normalizeTrackingCode(code);
    if (!isValidTrackingCode(normalized)) {
      setError(en ? 'Please enter a valid reference (e.g. ALX-2026-00125).' : 'Veuillez saisir une référence valide (ex. ALX-2026-00125).');
      return;
    }
    setLoading(true);
    try {
      const record = await fetchPublicTracking(normalized);
      if (record) setResult(record);
      else setError(en ? 'No shipment found for this reference.' : 'Aucune expédition trouvée pour cette référence.');
    } catch {
      setError(en ? 'Tracking is temporarily unavailable. Please try again later.' : 'Le suivi est momentanément indisponible. Veuillez réessayer plus tard.');
    } finally {
      setLoading(false);
    }
  };

  const stepIndex = result ? SHIPMENT_STATUSES.indexOf(result.currentStatus) : -1;
  const updated = result?.updatedAt?.toDate?.();
  const statusLabel = (s: string) => (t.statusLabels as Record<string, string> | undefined)?.[s] ?? s;

  return (
    <div className="mb-6 bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
      <h3 className="font-display text-lg font-bold text-slate-900">
        {en ? 'Track a shipment by reference' : 'Suivre une expédition par référence'}
      </h3>
      <form onSubmit={handleSubmit} className="mt-4 flex flex-col sm:flex-row gap-3" noValidate>
        <label htmlFor="public-tracking-code" className="sr-only">
          {en ? 'Tracking reference' : 'Référence de suivi'}
        </label>
        <input
          id="public-tracking-code"
          type="text"
          value={code}
          maxLength={64}
          onChange={(e) => setCode(e.target.value)}
          placeholder="ALX-2026-00125"
          className="flex-1 min-h-[44px] px-3.5 py-2 text-sm font-mono uppercase text-slate-900 placeholder:text-slate-400 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20"
        />
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-sky-700 hover:bg-sky-800 disabled:opacity-60 rounded-lg min-h-[44px] cursor-pointer"
        >
          <Search className="w-4 h-4" aria-hidden="true" />
          <span>{loading ? (en ? 'Searching…' : 'Recherche…') : en ? 'Track' : 'Suivre'}</span>
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-3 flex items-center gap-1.5 text-xs font-medium text-red-700">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}

      {result && (
        <div className="mt-6 border-t border-slate-200 pt-6">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <div><dt className="text-xs text-slate-500">{en ? 'Reference' : 'Référence'}</dt><dd className="font-mono font-semibold text-slate-900">{result.trackingCode}</dd></div>
            <div><dt className="text-xs text-slate-500">{en ? 'Mode' : 'Mode de transport'}</dt><dd className="text-slate-900">{result.transportMode}</dd></div>
            <div><dt className="text-xs text-slate-500">{en ? 'Origin' : 'Origine'}</dt><dd className="text-slate-900">{result.origin}</dd></div>
            <div><dt className="text-xs text-slate-500">{en ? 'Destination' : 'Destination'}</dt><dd className="text-slate-900">{result.destination}</dd></div>
            <div><dt className="text-xs text-slate-500">{en ? 'Status' : 'Statut'}</dt><dd className="font-semibold text-slate-900">{statusLabel(result.currentStatus)}</dd></div>
            <div><dt className="text-xs text-slate-500">{en ? 'Last reported position' : 'Dernière position communiquée'}</dt><dd className="text-slate-900">{result.currentLocation}</dd></div>
            <div><dt className="text-xs text-slate-500">{en ? 'Estimated arrival' : 'Livraison prévisionnelle'}</dt><dd className="text-slate-900">{result.estimatedArrival || (en ? 'To be confirmed' : 'À confirmer')}</dd></div>
            <div>
              <dt className="text-xs text-slate-500">{en ? 'Information source' : 'Origine de l’information'}</dt>
              <dd className="text-slate-900">{POSITION_SOURCE_LABELS[result.positionSource]?.[en ? 'en' : 'fr'] ?? '—'}</dd>
            </div>
          </dl>
          {updated && (
            <p className="mt-3 text-xs text-slate-500">
              {en ? 'Last update: ' : 'Dernière mise à jour : '}
              {updated.toLocaleString(localeConfig.intlLocale)}
            </p>
          )}
          {stepIndex >= 0 && (
            <ol className="mt-5 flex flex-wrap gap-2" aria-label={en ? 'Shipment steps' : 'Étapes de l’expédition'}>
              {SHIPMENT_STATUSES.map((s, i) => (
                <li
                  key={s}
                  aria-current={i === stepIndex ? 'step' : undefined}
                  className={`px-2.5 py-1 text-xs rounded-full border ${
                    i < stepIndex
                      ? 'bg-sky-50 border-sky-200 text-sky-800'
                      : i === stepIndex
                        ? 'bg-orange-600 border-orange-600 text-white font-semibold'
                        : 'bg-white border-slate-200 text-slate-400'
                  }`}
                >
                  {statusLabel(s)}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
