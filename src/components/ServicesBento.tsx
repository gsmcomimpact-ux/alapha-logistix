import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import airCustomsImg from '../assets/images/service_african_air_customs_1795099274449.jpg';
import warehouseOpsImg from '../assets/images/service_african_warehouse_ops_1795099274232.jpg';
import { ResilientImage } from './ResilientImage';
import { ServiceCategory } from '../types/logistics';

interface ServicesBentoProps {
  onSelectServiceForQuote: (service: ServiceCategory) => void;
}

type FilterTab = 'all' | 'maritime' | 'air' | 'customs';

export function ServicesBento({ onSelectServiceForQuote }: ServicesBentoProps) {
  const { t } = useLanguage();
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');

  const showMaritime = activeFilter === 'all' || activeFilter === 'maritime';
  const showAir = activeFilter === 'all' || activeFilter === 'air';
  const showCustoms = activeFilter === 'all' || activeFilter === 'customs';

  return (
    <section id="services" className="py-16 lg:py-20 bg-slate-50 border-b border-slate-200">
      <div className="max-w-[1200px] mx-auto px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-10">
          <div className="max-w-2xl">
            <p className="text-xs font-medium text-sky-700">{t.services.eyebrow}</p>
            <h2
              className="mt-2 font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900"
              style={{ textWrap: 'balance' }}
            >
              {t.services.title}
            </h2>
          </div>

          {/* Interactive Filter Tabs */}
          <div
            role="tablist"
            aria-label={t.services.tabsAriaLabel}
            className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start lg:self-auto"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeFilter === 'all'}
              onClick={() => setActiveFilter('all')}
              className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[36px] ${
                activeFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.services.tabAll}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeFilter === 'maritime'}
              onClick={() => setActiveFilter('maritime')}
              className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[36px] ${
                activeFilter === 'maritime'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.services.tabMaritime}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeFilter === 'air'}
              onClick={() => setActiveFilter('air')}
              className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[36px] ${
                activeFilter === 'air'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.services.tabAir}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeFilter === 'customs'}
              onClick={() => setActiveFilter('customs')}
              className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[36px] ${
                activeFilter === 'customs'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.services.tabCustoms}
            </button>
          </div>
        </div>

        {/* Asymmetric Bento Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {showMaritime && (
            <article className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-8 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-4">
                  <h3 className="font-display text-xl font-semibold text-slate-900">
                    {t.services.maritimeTitle}
                  </h3>
                  <span className="text-xs font-mono text-slate-500 whitespace-nowrap shrink-0">
                    FCL · LCL · RORO
                  </span>
                </div>
                <p className="mt-3 text-sm sm:text-base text-slate-600 leading-relaxed max-w-[65ch]">
                  {t.services.maritimeDesc}
                </p>
              </div>

              <div className="mt-8 pt-6 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{t.services.chinaPortsTitle}</p>
                  <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                    {t.services.chinaPortsDesc}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{t.services.corridorsTitle}</p>
                  <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                    {t.services.corridorsDesc}
                  </p>
                </div>
                <div className="flex flex-col justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{t.services.blTrackingTitle}</p>
                    <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                      {t.services.blTrackingDesc}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectServiceForQuote('Fret maritime')}
                    className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-orange-600 hover:text-orange-700 cursor-pointer self-start whitespace-nowrap"
                  >
                    <span>{t.services.maritimeCta}</span>
                    <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </article>
          )}

          {showAir && (
            <article
              className={`${
                activeFilter === 'air' ? 'lg:col-span-3 md:grid md:grid-cols-2' : 'lg:col-span-1'
              } bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col`}
            >
              <div className="aspect-[4/3] w-full bg-slate-900 overflow-hidden">
                <ResilientImage
                  src={airCustomsImg}
                  alt={t.services.airImageAlt}
                  fallbackTitle={t.services.airFallback}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-6 flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="font-display text-lg font-semibold text-slate-900">
                    {t.services.airTitle}
                  </h3>
                  <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                    {t.services.airDesc}
                  </p>
                </div>
                <div className="mt-5 pt-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
                  <span>{t.services.airBadge}</span>
                  <button
                    type="button"
                    onClick={() => onSelectServiceForQuote('Fret aérien')}
                    className="inline-flex items-center gap-1 font-semibold text-orange-600 hover:text-orange-700 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <span>{t.services.airCta}</span>
                    <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </article>
          )}

          {showCustoms && (
            <>
              <article className="lg:col-span-1 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
                <div className="aspect-[4/3] w-full bg-slate-900 overflow-hidden">
                  <ResilientImage
                    src={warehouseOpsImg}
                    alt={t.services.warehouseImageAlt}
                    fallbackTitle={t.services.warehouseFallback}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-6 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="font-display text-lg font-semibold text-slate-900">
                      {t.services.warehouseTitle}
                    </h3>
                    <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                      {t.services.warehouseDesc}
                    </p>
                  </div>
                  <div className="mt-5 pt-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
                    <span>{t.services.warehouseBadge}</span>
                    <button
                      type="button"
                      onClick={() => onSelectServiceForQuote('Dédouanement & Entreposage')}
                      className="inline-flex items-center gap-1 font-semibold text-orange-600 hover:text-orange-700 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <span>{t.services.warehouseCta}</span>
                      <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </article>

              <article className="lg:col-span-2 bg-slate-900 text-slate-100 rounded-xl p-8 flex flex-col justify-between">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <h3 className="font-display text-xl font-semibold text-white">
                      {t.services.customsTitle}
                    </h3>
                    <span className="text-xs font-mono text-slate-400 whitespace-nowrap shrink-0">
                      UEMOA · CEDEAO · TRANSIT
                    </span>
                  </div>
                  <p className="mt-3 text-sm sm:text-base text-slate-300 leading-relaxed max-w-[65ch]">
                    {t.services.customsDesc}
                  </p>
                </div>

                <div className="mt-8 pt-6 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-300">
                    <span>{t.services.customsTag1}</span>
                    <span aria-hidden="true">·</span>
                    <span>{t.services.customsTag2}</span>
                    <span aria-hidden="true">·</span>
                    <span>{t.services.customsTag3}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectServiceForQuote('Dédouanement & Entreposage')}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[40px]"
                  >
                    <span>{t.services.customsCta}</span>
                    <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </article>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
