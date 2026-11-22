import { useState } from 'react';
import { ArrowRight, Calculator } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { LocaleCode } from '../i18n';
import { QuotePrefill, ServiceCategory } from '../types/logistics';

interface FreightCalculatorProps {
  onApplyToQuote: (prefill: QuotePrefill) => void;
}

type CalcMode = 'fcl' | 'lcl' | 'air' | 'road';

interface LocalizedPlace {
  id: string;
  labels: Record<LocaleCode, string>;
}

const CHINA_PORTS: LocalizedPlace[] = [
  { id: 'shanghai', labels: { fr: 'Port de Shanghai (Chine)', en: 'Port of Shanghai (China)' } },
  { id: 'ningbo', labels: { fr: 'Port de Ningbo-Zhoushan (Chine)', en: 'Port of Ningbo-Zhoushan (China)' } },
  { id: 'shenzhen', labels: { fr: 'Port de Shenzhen / Yantian (Chine)', en: 'Port of Shenzhen / Yantian (China)' } },
  { id: 'guangzhou', labels: { fr: 'Port de Guangzhou / Nansha (Chine)', en: 'Port of Guangzhou / Nansha (China)' } },
  { id: 'qingdao', labels: { fr: 'Port de Qingdao (Chine)', en: 'Port of Qingdao (China)' } },
  { id: 'tianjin', labels: { fr: 'Port de Tianjin / Xingang (Chine)', en: 'Port of Tianjin / Xingang (China)' } },
];

const AIR_HUBS: LocalizedPlace[] = [
  {
    id: 'dubai',
    labels: {
      fr: 'Dubaï — Hub Aérien DXB / DWC (Émirats Arabes Unis)',
      en: 'Dubai — Air Hub DXB / DWC (UAE)',
    },
  },
  {
    id: 'can_hkg',
    labels: {
      fr: 'Guangzhou / Hong Kong — Fret Aérien (Chine)',
      en: 'Guangzhou / Hong Kong — Air Freight (China)',
    },
  },
  {
    id: 'ist_cdg',
    labels: {
      fr: 'Istanbul / Paris CDG — Fret Aérien',
      en: 'Istanbul / Paris CDG — Air Freight',
    },
  },
];

const WEST_AFRICA_PORTS: LocalizedPlace[] = [
  { id: 'cotonou', labels: { fr: 'Port de Cotonou (Bénin)', en: 'Port of Cotonou (Benin)' } },
  { id: 'lome', labels: { fr: 'Port de Lomé (Togo)', en: 'Port of Lomé (Togo)' } },
  { id: 'tema', labels: { fr: 'Port de Tema (Ghana)', en: 'Port of Tema (Ghana)' } },
  { id: 'abidjan', labels: { fr: 'Port d’Abidjan (Côte d’Ivoire)', en: 'Port of Abidjan (Ivory Coast)' } },
];

const ALL_ORIGINS = [...CHINA_PORTS, ...AIR_HUBS, ...WEST_AFRICA_PORTS];

const DESTINATIONS = [
  'Niamey (Niger)',
  'Maradi (Niger)',
  'Zinder (Niger)',
  'Tahoua (Niger)',
  'Dosso (Niger)',
  'Ouagadougou (Burkina Faso)',
  'Bamako (Mali)',
];

const CONTAINER_SPECS = {
  '20dc': {
    labels: { fr: '20 pieds Standard (Dry)', en: '20ft Standard (Dry)' },
    volume: 33.2,
    maxPayloadKg: 28200,
  },
  '40dc': {
    labels: { fr: '40 pieds Standard (Dry)', en: '40ft Standard (Dry)' },
    volume: 67.7,
    maxPayloadKg: 28800,
  },
  '40hc': {
    labels: { fr: '40 pieds High Cube', en: '40ft High Cube' },
    volume: 76.3,
    maxPayloadKg: 28600,
  },
  '40rf': {
    labels: { fr: '40 pieds Frigorifique (Reefer)', en: '40ft Refrigerated (Reefer)' },
    volume: 59.3,
    maxPayloadKg: 29500,
  },
} as const;

type ContainerKey = keyof typeof CONTAINER_SPECS;

export function FreightCalculator({ onApplyToQuote }: FreightCalculatorProps) {
  const { locale, localeConfig, t } = useLanguage();
  const [mode, setMode] = useState<CalcMode>('fcl');
  const [originId, setOriginId] = useState<string>(CHINA_PORTS[0].id);
  const [destination, setDestination] = useState(DESTINATIONS[0]);

  const airIds = new Set(AIR_HUBS.map((p) => p.id));
  const westAfricaIds = new Set(WEST_AFRICA_PORTS.map((p) => p.id));

  const handleModeChange = (nextMode: CalcMode) => {
    setMode(nextMode);
    if (nextMode === 'air' && !airIds.has(originId)) {
      setOriginId(AIR_HUBS[0].id);
    } else if ((nextMode === 'fcl' || nextMode === 'lcl') && airIds.has(originId)) {
      setOriginId(CHINA_PORTS[0].id);
    } else if (nextMode === 'road' && !westAfricaIds.has(originId)) {
      setOriginId(WEST_AFRICA_PORTS[0].id);
    }
  };

  // FCL state
  const [containerType, setContainerType] = useState<ContainerKey>('40hc');
  const [containerCount, setContainerCount] = useState<number>(1);

  // LCL / Air / Road state
  const [packages, setPackages] = useState<number>(4);
  const [lengthCm, setLengthCm] = useState<number>(120);
  const [widthCm, setWidthCm] = useState<number>(80);
  const [heightCm, setHeightCm] = useState<number>(100);
  const [grossWeightKg, setGrossWeightKg] = useState<number>(850);

  const safePackages = Math.max(1, Number.isFinite(packages) ? packages : 1);
  const safeL = Math.max(1, Number.isFinite(lengthCm) ? lengthCm : 1);
  const safeW = Math.max(1, Number.isFinite(widthCm) ? widthCm : 1);
  const safeH = Math.max(1, Number.isFinite(heightCm) ? heightCm : 1);
  const safeWeight = Math.max(1, Number.isFinite(grossWeightKg) ? grossWeightKg : 1);
  const safeContainers = Math.max(1, Number.isFinite(containerCount) ? containerCount : 1);

  const totalVolumeM3 = ((safeL * safeW * safeH) / 1_000_000) * safePackages;
  const airVolumetricKg = ((safeL * safeW * safeH) / 6000) * safePackages;
  const roadVolumetricKg = totalVolumeM3 * 333.33;

  const chargeableWeightKg =
    mode === 'air'
      ? Math.max(safeWeight, airVolumetricKg)
      : mode === 'road'
        ? Math.max(safeWeight, roadVolumetricKg)
        : safeWeight;

  const seaFreightUnits = Math.max(totalVolumeM3, safeWeight / 1000);

  const selectedSpec = CONTAINER_SPECS[containerType];
  const fclTotalVolume = selectedSpec.volume * safeContainers;
  const fclTotalPayload = selectedSpec.maxPayloadKg * safeContainers;

  const selectedOriginObj = ALL_ORIGINS.find((p) => p.id === originId) ?? CHINA_PORTS[0];
  const originLabel = selectedOriginObj.labels[locale];

  const handleTransferToQuote = () => {
    let service: ServiceCategory = 'Fret maritime';
    let summary = '';

    if (mode === 'fcl') {
      service = 'Fret maritime';
      summary =
        locale === 'en'
          ? `Corridor: ${originLabel} -> ${destination}\nMode: ${t.calculator.quoteSummaryFcl} — ${safeContainers} x ${selectedSpec.labels.en} (Approx. capacity ${fclTotalVolume.toFixed(1)} m³).`
          : `Corridor : ${originLabel} -> ${destination}\nMode : ${t.calculator.quoteSummaryFcl} — ${safeContainers} x ${selectedSpec.labels.fr} (Capacité env. ${fclTotalVolume.toFixed(1)} m³).`;
    } else if (mode === 'lcl') {
      service = 'Fret maritime';
      summary =
        locale === 'en'
          ? `Corridor: ${originLabel} -> ${destination}\nMode: ${t.calculator.quoteSummaryLcl} — ${safePackages} pkg (${safeL}x${safeW}x${safeH} cm), Volume: ${totalVolumeM3.toFixed(2)} m³, Gross weight: ${safeWeight} kg (Freight tons: ${seaFreightUnits.toFixed(2)} W/M).`
          : `Corridor : ${originLabel} -> ${destination}\nMode : ${t.calculator.quoteSummaryLcl} — ${safePackages} colis (${safeL}x${safeW}x${safeH} cm), Volume : ${totalVolumeM3.toFixed(2)} m³, Poids brut : ${safeWeight} kg (Unités payantes : ${seaFreightUnits.toFixed(2)} UP).`;
    } else if (mode === 'air') {
      service = 'Fret aérien';
      summary =
        locale === 'en'
          ? `Corridor: ${originLabel} -> ${destination}\nMode: ${t.calculator.quoteSummaryAir} — ${safePackages} pkg (${safeL}x${safeW}x${safeH} cm), Volume: ${totalVolumeM3.toFixed(2)} m³, Gross weight: ${safeWeight} kg, IATA chargeable weight: ${Math.ceil(chargeableWeightKg)} kg.`
          : `Corridor : ${originLabel} -> ${destination}\nMode : ${t.calculator.quoteSummaryAir} — ${safePackages} colis (${safeL}x${safeW}x${safeH} cm), Volume : ${totalVolumeM3.toFixed(2)} m³, Poids brut : ${safeWeight} kg, Poids taxable IATA : ${Math.ceil(chargeableWeightKg)} kg.`;
    } else {
      service = 'Corridor routier';
      summary =
        locale === 'en'
          ? `Corridor: ${originLabel} -> ${destination}\nMode: ${t.calculator.quoteSummaryRoad} — ${safePackages} pkg (${safeL}x${safeW}x${safeH} cm), Volume: ${totalVolumeM3.toFixed(2)} m³, Gross weight: ${safeWeight} kg, Chargeable weight: ${Math.ceil(chargeableWeightKg)} kg.`
          : `Corridor : ${originLabel} -> ${destination}\nMode : ${t.calculator.quoteSummaryRoad} — ${safePackages} colis (${safeL}x${safeW}x${safeH} cm), Volume : ${totalVolumeM3.toFixed(2)} m³, Poids brut : ${safeWeight} kg, Poids taxable : ${Math.ceil(chargeableWeightKg)} kg.`;
    }

    onApplyToQuote({
      service,
      summary,
      origin: originLabel,
      destination,
    });
  };

  return (
    <section id="simulateur" className="py-16 lg:py-20 bg-white border-b border-slate-200">
      <div className="max-w-[1200px] mx-auto px-6 lg:px-8">
        <div className="max-w-2xl mb-10">
          <p className="text-xs font-medium text-sky-700">{t.calculator.eyebrow}</p>
          <h2
            className="mt-2 font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900"
            style={{ textWrap: 'balance' }}
          >
            {t.calculator.title}
          </h2>
          <p className="mt-3 text-base text-slate-600 leading-relaxed">
            {t.calculator.subtitle}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          {/* Left: Calculator Controls */}
          <div className="lg:col-span-7 bg-slate-50 border border-slate-200 rounded-xl p-6 sm:p-8 flex flex-col justify-between">
            <div>
              {/* Mode Switcher */}
              <div className="mb-6">
                <span className="block text-xs font-medium text-slate-500 mb-2">
                  {t.calculator.modeLabel}
                </span>
                <div
                  role="tablist"
                  aria-label={t.calculator.modeLabel}
                  className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-slate-200/70 rounded-lg"
                >
                  {(
                    [
                      { key: 'fcl', label: t.calculator.modes.fcl },
                      { key: 'lcl', label: t.calculator.modes.lcl },
                      { key: 'air', label: t.calculator.modes.air },
                      { key: 'road', label: t.calculator.modes.road },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      role="tab"
                      aria-selected={mode === item.key}
                      onClick={() => handleModeChange(item.key)}
                      className={`px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer min-h-[38px] ${
                        mode === item.key
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Corridor Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <div>
                  <label
                    htmlFor="sim-origin"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    {t.calculator.originLabel}
                  </label>
                  <select
                    id="sim-origin"
                    value={originId}
                    onChange={(e) => setOriginId(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20"
                  >
                    <optgroup label={t.calculator.originGroups.china}>
                      {CHINA_PORTS.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.labels[locale]}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label={t.calculator.originGroups.air}>
                      {AIR_HUBS.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.labels[locale]}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label={t.calculator.originGroups.westAfrica}>
                      {WEST_AFRICA_PORTS.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.labels[locale]}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="sim-destination"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    {t.calculator.destinationLabel}
                  </label>
                  <select
                    id="sim-destination"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20"
                  >
                    {DESTINATIONS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Dynamic Inputs */}
              {mode === 'fcl' ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <label
                      htmlFor="sim-container-type"
                      className="block text-xs font-medium text-slate-700 mb-1.5"
                    >
                      {t.calculator.containerTypeLabel}
                    </label>
                    <select
                      id="sim-container-type"
                      value={containerType}
                      onChange={(e) => setContainerType(e.target.value as ContainerKey)}
                      className="w-full min-h-[42px] px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20"
                    >
                      {Object.entries(CONTAINER_SPECS).map(([key, spec]) => (
                        <option key={key} value={key}>
                          {spec.labels[locale]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="sim-container-count"
                      className="block text-xs font-medium text-slate-700 mb-1.5"
                    >
                      {t.calculator.containerCountLabel}
                    </label>
                    <input
                      id="sim-container-count"
                      type="number"
                      min={1}
                      max={50}
                      value={containerCount}
                      onChange={(e) => setContainerCount(Number(e.target.value))}
                      className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div>
                    <label
                      htmlFor="sim-packages"
                      className="block text-xs font-medium text-slate-700 mb-1.5"
                    >
                      {t.calculator.packagesLabel}
                    </label>
                    <input
                      id="sim-packages"
                      type="number"
                      min={1}
                      value={packages}
                      onChange={(e) => setPackages(Number(e.target.value))}
                      className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="sim-length"
                      className="block text-xs font-medium text-slate-700 mb-1.5"
                    >
                      {t.calculator.lengthLabel}
                    </label>
                    <input
                      id="sim-length"
                      type="number"
                      min={1}
                      value={lengthCm}
                      onChange={(e) => setLengthCm(Number(e.target.value))}
                      className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="sim-width"
                      className="block text-xs font-medium text-slate-700 mb-1.5"
                    >
                      {t.calculator.widthLabel}
                    </label>
                    <input
                      id="sim-width"
                      type="number"
                      min={1}
                      value={widthCm}
                      onChange={(e) => setWidthCm(Number(e.target.value))}
                      className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="sim-height"
                      className="block text-xs font-medium text-slate-700 mb-1.5"
                    >
                      {t.calculator.heightLabel}
                    </label>
                    <input
                      id="sim-height"
                      type="number"
                      min={1}
                      value={heightCm}
                      onChange={(e) => setHeightCm(Number(e.target.value))}
                      className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label
                      htmlFor="sim-weight"
                      className="block text-xs font-medium text-slate-700 mb-1.5"
                    >
                      {t.calculator.weightLabel}
                    </label>
                    <input
                      id="sim-weight"
                      type="number"
                      min={1}
                      value={grossWeightKg}
                      onChange={(e) => setGrossWeightKg(Number(e.target.value))}
                      className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                    />
                  </div>
                </div>
              )}
            </div>

            <p className="mt-6 pt-4 border-t border-slate-200 text-xs text-slate-500">
              {t.calculator.standardsNote}
            </p>
          </div>

          {/* Right: Live Result Summary */}
          <div className="lg:col-span-5 bg-slate-900 text-slate-100 rounded-xl p-6 sm:p-8 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs font-medium text-sky-400">
                  {t.calculator.summaryEyebrow}
                </span>
                <Calculator className="w-4 h-4 text-slate-400" aria-hidden="true" />
              </div>

              <h3 className="mt-2 font-display text-lg font-semibold text-white">
                {originLabel} → {destination}
              </h3>

              <div className="mt-6 border-t border-slate-800 divide-y divide-slate-800">
                {mode === 'fcl' ? (
                  <>
                    <div className="py-4 flex items-center justify-between gap-4">
                      <span className="text-sm text-slate-400">
                        {t.calculator.equipmentSelected}
                      </span>
                      <span className="font-mono text-sm font-semibold text-white tabular-nums">
                        {safeContainers} × {selectedSpec.labels[locale]}
                      </span>
                    </div>
                    <div className="py-4 flex items-center justify-between gap-4">
                      <span className="text-sm text-slate-400">{t.calculator.usableVolume}</span>
                      <span className="font-mono text-xl font-semibold text-white tabular-nums">
                        {fclTotalVolume.toFixed(1)} m³
                      </span>
                    </div>
                    <div className="py-4 flex items-center justify-between gap-4">
                      <span className="text-sm text-slate-400">{t.calculator.maxPayload}</span>
                      <span className="font-mono text-base font-semibold text-sky-400 tabular-nums">
                        {fclTotalPayload.toLocaleString(localeConfig.intlLocale)} kg
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="py-4 flex items-center justify-between gap-4">
                      <span className="text-sm text-slate-400">{t.calculator.totalVolume}</span>
                      <span className="font-mono text-xl font-semibold text-white tabular-nums">
                        {totalVolumeM3.toFixed(2)} m³
                      </span>
                    </div>
                    <div className="py-4 flex items-center justify-between gap-4">
                      <span className="text-sm text-slate-400">{t.calculator.grossWeight}</span>
                      <span className="font-mono text-base font-medium text-slate-200 tabular-nums">
                        {safeWeight.toLocaleString(localeConfig.intlLocale)} kg
                      </span>
                    </div>
                    <div className="py-4 flex items-center justify-between gap-4">
                      <span className="text-sm text-slate-400">
                        {mode === 'lcl'
                          ? t.calculator.chargeableUnits
                          : t.calculator.chargeableWeight}
                      </span>
                      <span className="font-mono text-xl font-semibold text-sky-400 tabular-nums">
                        {mode === 'lcl'
                          ? `${seaFreightUnits.toFixed(2)} ${locale === 'en' ? 'W/M' : 'UP'}`
                          : `${Math.ceil(chargeableWeightKg).toLocaleString(localeConfig.intlLocale)} kg`}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={handleTransferToQuote}
              className="mt-6 w-full inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-3 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400"
            >
              <span>{t.calculator.transferCta}</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
