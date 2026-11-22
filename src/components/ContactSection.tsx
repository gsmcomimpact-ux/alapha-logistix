import { FormEvent, useEffect, useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { AlertCircle, Check, CheckCircle2, Copy, Globe, Mail, MessageCircle, Phone } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { db } from '../lib/firebase';
import { api } from '../lib/php/http';
import { FIELD_LIMITS, QuotePrefill, ServiceCategory, TRANSPORT_MODES } from '../types/logistics';

interface ContactSectionProps {
  prefill: QuotePrefill | null;
  onClearPrefill: () => void;
}

interface FormState {
  fullName: string;
  company: string;
  email: string;
  phone: string;
  service: ServiceCategory;
  originCountry: string;
  destinationCountry: string;
  cargoNature: string;
  weightKg: string;
  volumeM3: string;
  packaging: string;
  shipDate: string;
  message: string;
  website: string; // honeypot: must stay empty
}

const CONTACT_EMAIL = 'commercial@alphalogistixgroup.com';
const CONTACT_PHONE_DISPLAY = '+227 76 15 42 11';
const CONTACT_PHONE_HREF = 'tel:+22776154211';
const WHATSAPP_BASE_URL = 'https://wa.me/22776154211';

const INITIAL_FORM: FormState = {
  fullName: '',
  company: '',
  email: '',
  phone: '',
  service: 'Fret maritime',
  originCountry: '',
  destinationCountry: '',
  cargoNature: '',
  weightKg: '',
  volumeM3: '',
  packaging: '',
  shipDate: '',
  message: '',
  website: '',
};

function buildShipmentDetails(f: FormState, locale: string): string {
  const en = locale === 'en';
  const rows: Array<[string, string]> = [
    [en ? 'From' : 'Départ', f.originCountry],
    [en ? 'To' : 'Destination', f.destinationCountry],
    [en ? 'Cargo' : 'Marchandise', f.cargoNature],
    [en ? 'Weight (kg)' : 'Poids (kg)', f.weightKg],
    [en ? 'Volume (m³)' : 'Volume (m³)', f.volumeM3],
    [en ? 'Packaging' : 'Conditionnement', f.packaging],
    [en ? 'Planned shipping date' : 'Date d’expédition prévue', f.shipDate],
  ];
  return rows
    .filter(([, v]) => v.trim())
    .map(([k, v]) => `${k} : ${v.trim()}`)
    .join('\n');
}

export function ContactSection({ prefill, onClearPrefill }: ContactSectionProps) {
  const { user, userProfile } = useAuth();
  const { locale, t } = useLanguage();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submittedData, setSubmittedData] = useState<(FormState & { quoteCode?: string }) | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [copiedField, setCopiedField] = useState<'email' | 'phone' | null>(null);

  useEffect(() => {
    if (!user) return;
    setForm((prev) => ({
      ...prev,
      fullName: prev.fullName || userProfile?.fullName || user.displayName || '',
      company: prev.company || userProfile?.company || '',
      email: prev.email || user.email || '',
      phone: prev.phone || userProfile?.phone || '',
    }));
  }, [user, userProfile]);

  useEffect(() => {
    if (!prefill) return;
    setSubmittedData(null);
    setForm((prev) => ({
      ...prev,
      service: prefill.service,
      message: prefill.summary || prev.message,
    }));
  }, [prefill]);

  const handleCopy = async (value: string, field: 'email' | 'phone') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField(null), 2500);
    } catch {
      setCopiedField(null);
    }
  };

  const validate = (): boolean => {
    const nextErrors: Partial<Record<keyof FormState, string>> = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    if (form.fullName.trim().length < 2) {
      nextErrors.fullName = t.contact.errFullName;
    }
    if (!form.email.trim()) {
      nextErrors.email = t.contact.errEmailRequired;
    } else if (!emailRegex.test(form.email.trim())) {
      nextErrors.email = t.contact.errEmailInvalid;
    }
    if (!form.message.trim() || form.message.trim().length < 10) {
      nextErrors.message = t.contact.errMessageMin;
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (form.website) {
      // Honeypot filled: almost certainly a bot. Pretend success, send nothing.
      setForm(INITIAL_FORM);
      return;
    }
    if (!validate()) return;

    const cleanFullName = form.fullName.trim().slice(0, FIELD_LIMITS.companyMax);
    const cleanCompany = form.company.trim().slice(0, FIELD_LIMITS.companyMax);
    const cleanEmail = form.email.trim().toLowerCase().slice(0, FIELD_LIMITS.emailMax);
    const cleanPhone = form.phone.trim().slice(0, FIELD_LIMITS.phoneMax);
    const details = buildShipmentDetails(form, locale).slice(0, 500);
    const cleanMessage = `${details}${details ? '\n\n' : ''}${form.message.trim()}`.slice(
      0,
      FIELD_LIMITS.quoteMessageMax
    );
    const cleanOriginCountry = form.originCountry.trim();
    const cleanDestCountry = form.destinationCountry.trim();

    let savedQuoteCode: string | undefined;

    if (user && user.email) {
      setSubmitting(true);
      const quoteId = `quote-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const quoteCode = `COT-2026-${Math.floor(1000 + Math.random() * 9000)}`;
      try {
        await setDoc(doc(db, 'quoteRequests', quoteId), {
          id: quoteId,
          quoteCode,
          clientUid: user.uid,
          clientEmail: user.email.toLowerCase().slice(0, FIELD_LIMITS.emailMax),
          clientName: cleanFullName,
          company: cleanCompany,
          phone: cleanPhone,
          transportMode: form.service,
          origin: (cleanOriginCountry || prefill?.origin || '').slice(0, FIELD_LIMITS.originDestMax),
          destination: (cleanDestCountry || prefill?.destination || userProfile?.city || '').slice(
            0,
            FIELD_LIMITS.originDestMax
          ),
          message: cleanMessage,
          status: 'En attente',
          estimatedAmount: '',
          adminResponse: '',
          createdBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        savedQuoteCode = quoteCode;
      } catch {
        // Fallback smoothly to WhatsApp / E-mail confirmation if offline
      } finally {
        setSubmitting(false);
      }
    } else if (__PHP_BACKEND__) {
      // Visitors without an account: the PHP backend stores the request and e-mails the sales team.
      setSubmitting(true);
      try {
        const res = await api<{ quoteCode: string }>('/public/quote', {
          body: {
            fullName: cleanFullName,
            company: cleanCompany,
            email: cleanEmail,
            phone: cleanPhone,
            transportMode: form.service,
            origin: cleanOriginCountry || prefill?.origin || '',
            destination: cleanDestCountry || prefill?.destination || '',
            message: cleanMessage,
            website: form.website,
          },
        });
        savedQuoteCode = res.quoteCode;
      } catch {
        // Fall back to the WhatsApp / e-mail links shown after submission.
      } finally {
        setSubmitting(false);
      }
    }

    setSubmittedData({
      ...form,
      fullName: cleanFullName,
      company: cleanCompany,
      email: cleanEmail,
      phone: cleanPhone,
      message: cleanMessage,
      quoteCode: savedQuoteCode,
    });
    setForm(INITIAL_FORM);
    setErrors({});
    onClearPrefill();
  };

  const buildMailtoHref = (data: FormState) => {
    const localizedSvc = t.serviceLabels[data.service];
    const subject = encodeURIComponent(
      locale === 'en'
        ? `[Alpha Logistix Group Quote] ${localizedSvc}${data.company ? ` — ${data.company}` : ''}`
        : `[Devis Alpha Logistix Group] ${localizedSvc}${data.company ? ` — ${data.company}` : ''}`
    );
    const body = encodeURIComponent(
      locale === 'en'
        ? `Name: ${data.fullName}\nCompany: ${data.company || 'Not specified'}\nPhone: ${data.phone || 'Not specified'}\nEmail: ${data.email}\nService: ${localizedSvc}\n\nDetails:\n${data.message}`
        : `Nom : ${data.fullName}\nSociété : ${data.company || 'Non précisée'}\nTéléphone : ${data.phone || 'Non précisé'}\nE-mail : ${data.email}\nPrestation : ${localizedSvc}\n\nDétails :\n${data.message}`
    );
    return `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
  };

  const buildWhatsappHref = (data: FormState) => {
    const localizedSvc = t.serviceLabels[data.service];
    const text = encodeURIComponent(
      locale === 'en'
        ? `Hello Alpha Logistix Group,\n\nQuote request (${localizedSvc})\nName: ${data.fullName}${data.company ? `\nCompany: ${data.company}` : ''}\nEmail: ${data.email}${data.phone ? `\nPhone: ${data.phone}` : ''}\n\nDetails:\n${data.message}`
        : `Bonjour Alpha Logistix Group,\n\nDemande de cotation (${localizedSvc})\nNom : ${data.fullName}${data.company ? `\nSociété : ${data.company}` : ''}\nE-mail : ${data.email}${data.phone ? `\nTéléphone : ${data.phone}` : ''}\n\nDétails :\n${data.message}`
    );
    return `${WHATSAPP_BASE_URL}?text=${text}`;
  };

  const whatsappDirectText = encodeURIComponent(
    locale === 'en'
      ? 'Hello Alpha Logistix Group, I would like information regarding a shipment.'
      : 'Bonjour Alpha Logistix Group, je souhaite des informations pour une expédition.'
  );

  return (
    <section id="contact" className="py-16 lg:py-20 bg-white">
      <div className="max-w-[1200px] mx-auto px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          {/* Left Column: Direct Coordinates */}
          <div className="lg:col-span-5">
            <p className="text-xs font-medium text-sky-700">{t.contact.eyebrow}</p>
            <h2
              className="mt-2 font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900"
              style={{ textWrap: 'balance' }}
            >
              {t.contact.title}
            </h2>
            <p className="mt-3 text-base text-slate-600 leading-relaxed">
              {t.contact.description}
            </p>

            <div className="mt-8 border-t border-slate-200 divide-y divide-slate-200">
              {/* Phone */}
              <div className="py-5 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Phone className="w-5 h-5 text-slate-500 mt-0.5 shrink-0" aria-hidden="true" />
                  <div>
                    <p className="text-xs font-medium text-slate-500">{t.contact.phoneLabel}</p>
                    <a
                      href={CONTACT_PHONE_HREF}
                      className="mt-0.5 block font-mono text-base font-semibold text-slate-900 hover:text-sky-700 tabular-nums transition-colors"
                    >
                      {CONTACT_PHONE_DISPLAY}
                    </a>
                    <p className="mt-1 text-xs text-slate-500">{t.contact.phoneHours}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy('+22776154211', 'phone')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-md hover:bg-orange-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[36px]"
                >
                  {copiedField === 'phone' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                      <span>{t.contact.copied}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{t.contact.copy}</span>
                    </>
                  )}
                </button>
              </div>

              {/* WhatsApp Direct */}
              <div className="py-5 flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <MessageCircle className="w-5 h-5 text-emerald-700 mt-0.5 shrink-0" aria-hidden="true" />
                  <div>
                    <p className="text-xs font-medium text-slate-500">{t.contact.whatsappTitle}</p>
                    <p className="mt-0.5 text-sm font-semibold text-slate-900">
                      {t.contact.whatsappSubtitle}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{t.contact.whatsappDesc}</p>
                  </div>
                </div>
                <a
                  href={`${WHATSAPP_BASE_URL}?text=${whatsappDirectText}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-md transition-colors whitespace-nowrap shrink-0 min-h-[36px]"
                >
                  <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{t.contact.whatsappOpen}</span>
                </a>
              </div>

              {/* Email */}
              <div className="py-5 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <Mail className="w-5 h-5 text-slate-500 mt-0.5 shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-500">{t.contact.emailLabel}</p>
                    <a
                      href={`mailto:${CONTACT_EMAIL}`}
                      className="mt-0.5 block text-sm font-semibold text-slate-900 hover:text-sky-700 truncate transition-colors"
                    >
                      {CONTACT_EMAIL}
                    </a>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(CONTACT_EMAIL, 'email')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-md hover:bg-orange-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[36px]"
                >
                  {copiedField === 'email' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                      <span>{t.contact.copied}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{t.contact.copy}</span>
                    </>
                  )}
                </button>
              </div>

              {/* Website */}
              <div className="py-5 flex items-start gap-3">
                <Globe className="w-5 h-5 text-slate-500 mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="text-xs font-medium text-slate-500">{t.contact.portalLabel}</p>
                  <p className="mt-0.5 font-mono text-sm font-semibold text-slate-900">
                    alphalogistixgroup.com
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{t.contact.portalLocations}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Quote Form */}
          <div className="lg:col-span-7 bg-slate-50 border border-slate-200 rounded-xl p-6 sm:p-8">
            {submittedData ? (
              <div role="status" className="py-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2
                    className="w-6 h-6 text-sky-700 shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <div>
                    <h3 className="font-display text-lg font-semibold text-slate-900">
                      {submittedData.quoteCode
                        ? `${t.contact.confirmedSavedTitle} (${submittedData.quoteCode})`
                        : t.contact.confirmedReadyTitle}
                    </h3>
                    <p className="mt-1 text-sm text-slate-600 leading-relaxed">
                      {locale === 'en' ? 'Thank you' : 'Merci'} {submittedData.fullName}.{' '}
                      {locale === 'en' ? 'Your inquiry for' : 'Votre dossier pour le pôle'}{' '}
                      <span className="font-medium text-slate-900">
                        {t.serviceLabels[submittedData.service]}
                      </span>{' '}
                      {submittedData.quoteCode
                        ? t.contact.confirmedSavedBody
                        : t.contact.confirmedReadyBody}{' '}
                      <span className="font-medium text-slate-900">{CONTACT_EMAIL}</span>.
                    </p>
                  </div>
                </div>

                <div className="mt-6 p-4 rounded-lg bg-white border border-slate-200 text-sm text-slate-700 space-y-1.5">
                  <p>
                    <span className="font-medium text-slate-900">
                      {locale === 'en' ? 'Contact:' : 'Contact :'}
                    </span>{' '}
                    {submittedData.fullName}
                    {submittedData.company ? ` (${submittedData.company})` : ''}
                  </p>
                  <p>
                    <span className="font-medium text-slate-900">
                      {locale === 'en' ? 'Email:' : 'E-mail :'}
                    </span>{' '}
                    {submittedData.email}
                  </p>
                  {submittedData.phone && (
                    <p>
                      <span className="font-medium text-slate-900">
                        {locale === 'en' ? 'Phone:' : 'Téléphone :'}
                      </span>{' '}
                      {submittedData.phone}
                    </p>
                  )}
                  <p>
                    <span className="font-medium text-slate-900">
                      {locale === 'en' ? 'Service:' : 'Prestation :'}
                    </span>{' '}
                    {t.serviceLabels[submittedData.service]}
                  </p>
                  <p className="pt-1 whitespace-pre-line text-slate-600">{submittedData.message}</p>
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <a
                    href={buildWhatsappHref(submittedData)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors min-h-[44px]"
                  >
                    <MessageCircle className="w-4 h-4" aria-hidden="true" />
                    <span>{t.contact.sendWhatsapp}</span>
                  </a>
                  <a
                    href={buildMailtoHref(submittedData)}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors min-h-[44px]"
                  >
                    <Mail className="w-4 h-4" aria-hidden="true" />
                    <span>{t.contact.sendEmail}</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => setSubmittedData(null)}
                    className="px-4 py-2.5 text-sm font-medium text-orange-700 bg-white border border-orange-300 hover:bg-orange-50 rounded-lg transition-colors cursor-pointer min-h-[44px]"
                  >
                    {t.contact.newRequest}
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} noValidate className="space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="font-display text-lg font-semibold text-slate-900">
                      {t.contact.formTitle}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">{t.contact.formSubtitle}</p>
                  </div>
                  {prefill && (
                    <button
                      type="button"
                      onClick={() => {
                        onClearPrefill();
                        setForm(INITIAL_FORM);
                      }}
                      className="text-xs font-medium text-orange-600 hover:text-orange-700 underline underline-offset-4 self-start cursor-pointer"
                    >
                      {t.contact.resetParams}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="contact-fullname"
                      className="block text-sm font-medium text-slate-900 mb-1.5"
                    >
                      {t.contact.fullNameLabel}
                    </label>
                    <input
                      id="contact-fullname"
                      type="text"
                      maxLength={FIELD_LIMITS.companyMax}
                      value={form.fullName}
                      onChange={(e) => {
                        setForm({ ...form, fullName: e.target.value });
                        if (errors.fullName) setErrors({ ...errors, fullName: undefined });
                      }}
                      placeholder="Ibrahim Mahamadou"
                      className="w-full min-h-[44px] px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20"
                    />
                    {errors.fullName && (
                      <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-red-700">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span>{errors.fullName}</span>
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="contact-company"
                      className="block text-sm font-medium text-slate-900 mb-1.5"
                    >
                      {t.contact.companyLabel}{' '}
                      <span className="text-slate-400 font-normal">{t.contact.optional}</span>
                    </label>
                    <input
                      id="contact-company"
                      type="text"
                      maxLength={FIELD_LIMITS.companyMax}
                      value={form.company}
                      onChange={(e) => setForm({ ...form, company: e.target.value })}
                      placeholder="Sahel Distribution SARL"
                      className="w-full min-h-[44px] px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="contact-email"
                      className="block text-sm font-medium text-slate-900 mb-1.5"
                    >
                      {t.contact.emailFieldLabel}
                    </label>
                    <input
                      id="contact-email"
                      type="email"
                      maxLength={FIELD_LIMITS.emailMax}
                      value={form.email}
                      onChange={(e) => {
                        setForm({ ...form, email: e.target.value });
                        if (errors.email) setErrors({ ...errors, email: undefined });
                      }}
                      placeholder="nom@entreprise.com"
                      className="w-full min-h-[44px] px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20"
                    />
                    {errors.email && (
                      <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-red-700">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span>{errors.email}</span>
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="contact-phone"
                      className="block text-sm font-medium text-slate-900 mb-1.5"
                    >
                      {t.contact.phoneFieldLabel}{' '}
                      <span className="text-slate-400 font-normal">{t.contact.optional}</span>
                    </label>
                    <input
                      id="contact-phone"
                      type="tel"
                      maxLength={FIELD_LIMITS.phoneMax}
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      placeholder="+227 ..."
                      className="w-full min-h-[44px] px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="contact-service"
                    className="block text-sm font-medium text-slate-900 mb-1.5"
                  >
                    {t.contact.serviceLabel}
                  </label>
                  <select
                    id="contact-service"
                    value={form.service}
                    onChange={(e) =>
                      setForm({ ...form, service: e.target.value as ServiceCategory })
                    }
                    className="w-full min-h-[44px] px-3.5 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20"
                  >
                    {TRANSPORT_MODES.map((svc) => (
                      <option key={svc} value={svc}>
                        {t.serviceLabels[svc]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="contact-origin" className="block text-sm font-medium text-slate-900 mb-1.5">
                      {(locale === 'en' ? 'Country of origin' : 'Pays de départ')}
                    </label>
                    <input
                      id="contact-origin"
                      type="text"
                      maxLength={80}
                      value={form.originCountry}
                      onChange={(e) => setForm({ ...form, originCountry: e.target.value })}
                      placeholder="Chine"
                      className="w-full min-h-[44px] px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20"
                    />
                  </div>
                  <div>
                    <label htmlFor="contact-destination" className="block text-sm font-medium text-slate-900 mb-1.5">
                      {(locale === 'en' ? 'Destination country' : 'Pays de destination')}
                    </label>
                    <input
                      id="contact-destination"
                      type="text"
                      maxLength={80}
                      value={form.destinationCountry}
                      onChange={(e) => setForm({ ...form, destinationCountry: e.target.value })}
                      placeholder="Niger"
                      className="w-full min-h-[44px] px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20"
                    />
                  </div>
                  <div>
                    <label htmlFor="contact-cargo" className="block text-sm font-medium text-slate-900 mb-1.5">
                      {(locale === 'en' ? 'Nature of goods' : 'Nature de la marchandise')}
                    </label>
                    <input
                      id="contact-cargo"
                      type="text"
                      maxLength={80}
                      value={form.cargoNature}
                      onChange={(e) => setForm({ ...form, cargoNature: e.target.value })}
                      placeholder="Matériel électrique"
                      className="w-full min-h-[44px] px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20"
                    />
                  </div>
                  <div>
                    <label htmlFor="contact-packaging" className="block text-sm font-medium text-slate-900 mb-1.5">
                      {(locale === 'en' ? 'Packaging type' : 'Type de conditionnement')}
                    </label>
                    <input
                      id="contact-packaging"
                      type="text"
                      maxLength={80}
                      value={form.packaging}
                      onChange={(e) => setForm({ ...form, packaging: e.target.value })}
                      placeholder="Palettes, cartons, vrac..."
                      className="w-full min-h-[44px] px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20"
                    />
                  </div>
                  <div>
                    <label htmlFor="contact-weight" className="block text-sm font-medium text-slate-900 mb-1.5">
                      {(locale === 'en' ? 'Weight (kg)' : 'Poids (kg)')}
                    </label>
                    <input
                      id="contact-weight"
                      type="number" min={0}
                      maxLength={80}
                      value={form.weightKg}
                      onChange={(e) => setForm({ ...form, weightKg: e.target.value })}
                      placeholder="850"
                      className="w-full min-h-[44px] px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20"
                    />
                  </div>
                  <div>
                    <label htmlFor="contact-volume" className="block text-sm font-medium text-slate-900 mb-1.5">
                      {(locale === 'en' ? 'Volume (m³)' : 'Volume (m³)')}
                    </label>
                    <input
                      id="contact-volume"
                      type="number" min={0} step="any"
                      maxLength={80}
                      value={form.volumeM3}
                      onChange={(e) => setForm({ ...form, volumeM3: e.target.value })}
                      placeholder="4.5"
                      className="w-full min-h-[44px] px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20"
                    />
                  </div>
                  <div>
                    <label htmlFor="contact-shipdate" className="block text-sm font-medium text-slate-900 mb-1.5">
                      {(locale === 'en' ? 'Planned shipping date' : 'Date d’expédition prévue')}
                    </label>
                    <input
                      id="contact-shipdate"
                      type="date"
                      maxLength={80}
                      value={form.shipDate}
                      onChange={(e) => setForm({ ...form, shipDate: e.target.value })}
                      placeholder=""
                      className="w-full min-h-[44px] px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20"
                    />
                  </div>
                </div>

                <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                  <label htmlFor="contact-website">Website</label>
                  <input
                    id="contact-website"
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={form.website}
                    onChange={(e) => setForm({ ...form, website: e.target.value })}
                  />
                </div>

                <div>
                  <label
                    htmlFor="contact-message"
                    className="block text-sm font-medium text-slate-900 mb-1.5"
                  >
                    {t.contact.detailsLabel}
                  </label>
                  <textarea
                    id="contact-message"
                    rows={4}
                    maxLength={FIELD_LIMITS.quoteMessageMax}
                    value={form.message}
                    onChange={(e) => {
                      setForm({ ...form, message: e.target.value });
                      if (errors.message) setErrors({ ...errors, message: undefined });
                    }}
                    placeholder={t.contact.detailsPlaceholder}
                    className="w-full px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20 resize-y"
                  />
                  {errors.message && (
                    <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-red-700">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>{errors.message}</span>
                    </p>
                  )}
                </div>

                <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <p className="text-xs text-slate-500">{t.contact.confidentialNote}</p>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-6 py-2.5 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-60 rounded-lg transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer min-h-[44px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
                  >
                    {submitting ? t.contact.submittingBtn : t.contact.submitBtn}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
