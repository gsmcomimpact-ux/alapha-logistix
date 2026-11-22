import { ArrowRight, MessageCircle, Phone } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import heroTeamImg from '../assets/images/hero_african_logistics_team_1795099274122.jpg';
import { ResilientImage } from './ResilientImage';

interface HeroSectionProps {
  onEstimateClick: () => void;
}

export function HeroSection({ onEstimateClick }: HeroSectionProps) {
  const { locale, t } = useLanguage();

  const whatsappText = encodeURIComponent(
    locale === 'en'
      ? 'Hello Alpha Logistix Group, I would like to request a freight quote.'
      : 'Bonjour Alpha Logistix Group, je souhaite obtenir une cotation.'
  );

  return (
    <section id="top" className="pt-10 pb-14 lg:pt-14 lg:pb-18 border-b border-slate-200 bg-white">
      <div className="max-w-[1200px] mx-auto px-6 lg:px-8">
        {/* 2-Column Hero Split */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
          {/* Left Column */}
          <div className="lg:col-span-6 flex flex-col justify-between py-2">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
                <span className="font-mono text-slate-700">alphalogistixgroup.com</span>
                <span aria-hidden="true">·</span>
                <span>{t.hero.eyebrow}</span>
              </div>

              <h1
                className="mt-5 font-display font-bold tracking-tight text-slate-900 leading-[1.08]"
                style={{
                  fontSize: 'clamp(2.25rem, 4vw, 3.35rem)',
                  textWrap: 'balance',
                }}
              >
                {t.hero.headline}
              </h1>

              <p className="mt-5 text-base lg:text-lg text-slate-600 leading-relaxed max-w-[60ch]">
                {t.hero.subheadline}
              </p>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-200">
              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={onEstimateClick}
                  className="inline-flex items-center justify-center gap-2 min-h-[44px] px-6 py-3 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
                >
                  <span>{t.hero.ctaEstimate}</span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>

                <a
                  href={`https://wa.me/22789994453?text=${whatsappText}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 text-sm font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
                >
                  <MessageCircle className="w-4 h-4 text-emerald-700" aria-hidden="true" />
                  <span>{t.hero.ctaWhatsapp}</span>
                </a>

                <a
                  href="tel:+22789994453"
                  className="inline-flex items-center gap-2 min-h-[44px] px-1 text-sm font-semibold text-slate-800 hover:text-sky-700 transition-colors whitespace-nowrap shrink-0"
                >
                  <Phone className="w-4 h-4 text-sky-700" aria-hidden="true" />
                  <span className="font-mono tabular-nums">+227 89 99 44 53</span>
                </a>
              </div>

              <p className="mt-4 text-xs text-slate-500">
                {t.hero.salesEmailLabel}{' '}
                <a
                  href="mailto:commercial@alphalogistixgroup.com"
                  className="font-medium text-slate-700 hover:text-sky-700 underline underline-offset-4"
                >
                  commercial@alphalogistixgroup.com
                </a>
              </p>
            </div>
          </div>

          {/* Right Column: Stretched Editorial Photo */}
          <div className="lg:col-span-6 flex flex-col">
            <div className="relative flex-1 min-h-[300px] lg:min-h-[430px] rounded-xl overflow-hidden border border-slate-200 bg-slate-900">
              <ResilientImage
                src={heroTeamImg}
                alt={t.hero.imageAlt}
                fallbackTitle={t.hero.imageFallback}
                className="w-full h-full object-cover object-center"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/85 via-slate-950/40 to-transparent p-6">
                <p className="text-xs font-medium text-slate-100">{t.hero.imageCaption}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Full-Width 4-Column Operational Strip Directly Below Hero Split */}
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border border-slate-200 rounded-xl bg-slate-50 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
          <div className="p-5">
            <p className="text-xs font-medium text-slate-500">{t.hero.stripChinaLabel}</p>
            <p className="mt-1.5 font-display text-base font-semibold text-slate-900">
              {t.hero.stripChinaValue}
            </p>
          </div>
          <div className="p-5">
            <p className="text-xs font-medium text-slate-500">{t.hero.stripCorridorsLabel}</p>
            <p className="mt-1.5 font-display text-base font-semibold text-slate-900">
              {t.hero.stripCorridorsValue}
            </p>
          </div>
          <div className="p-5">
            <p className="text-xs font-medium text-slate-500">{t.hero.stripPhoneLabel}</p>
            <div className="mt-1.5 flex items-center gap-3 flex-wrap">
              <a
                href="tel:+22789994453"
                className="font-mono text-base font-semibold text-slate-900 hover:text-sky-700 tabular-nums transition-colors"
              >
                +227 89 99 44 53
              </a>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <a
                href={`https://wa.me/22789994453?text=${whatsappText}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 underline underline-offset-4 whitespace-nowrap"
              >
                {t.hero.stripWhatsappLink}
              </a>
            </div>
          </div>
          <div className="p-5">
            <p className="text-xs font-medium text-slate-500">{t.hero.stripEmailLabel}</p>
            <a
              href="mailto:commercial@alphalogistixgroup.com"
              className="mt-1.5 block text-sm font-semibold text-sky-700 hover:text-sky-800 truncate transition-colors"
              title="commercial@alphalogistixgroup.com"
            >
              commercial@alphalogistixgroup.com
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
