import { ReactNode, useState } from 'react';
import {
  Building2,
  Eye,
  Factory,
  Fuel,
  Globe2,
  HardHat,
  HeartHandshake,
  Mountain,
  Package,
  Plane,
  Sprout,
  Target,
  Truck,
  Landmark,
  ShieldCheck,
  Store,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

type Bi = { fr: string; en: string };

function SectionHeader({ eyebrow, title, desc }: { eyebrow: string; title: string; desc?: string }) {
  return (
    <div className="max-w-2xl mb-10">
      <p className="text-xs font-medium text-sky-700">{eyebrow}</p>
      <h2
        className="mt-2 font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900"
        style={{ textWrap: 'balance' }}
      >
        {title}
      </h2>
      {desc && <p className="mt-3 text-base text-slate-600 leading-relaxed">{desc}</p>}
    </div>
  );
}

function Card({ icon, title, desc }: { icon: ReactNode; title: string; desc?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6">
      <div className="text-sky-700" aria-hidden="true">{icon}</div>
      <h3 className="mt-3 font-display text-base font-bold text-slate-900">{title}</h3>
      {desc && <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{desc}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ About */

export function AboutSection() {
  const { locale } = useLanguage();
  const l = (b: Bi) => b[locale];
  const items: Array<{ icon: ReactNode; title: Bi; desc: Bi }> = [
    {
      icon: <Target className="w-6 h-6" />,
      title: { fr: 'Mission', en: 'Mission' },
      desc: {
        fr: 'Organiser et coordonner vos flux de transport multimodal, de transit douanier et de logistique de projets, avec fiabilité et transparence.',
        en: 'Organise and coordinate your multimodal transport, customs clearance and project logistics flows with reliability and transparency.',
      },
    },
    {
      icon: <Eye className="w-6 h-6" />,
      title: { fr: 'Vision', en: 'Vision' },
      desc: {
        fr: 'Devenir un partenaire logistique de référence pour les entreprises et organisations opérant en Afrique de l’Ouest et sur les corridors internationaux.',
        en: 'Become a reference logistics partner for companies and organisations operating in West Africa and on international corridors.',
      },
    },
    {
      icon: <ShieldCheck className="w-6 h-6" />,
      title: { fr: 'Rigueur & conformité', en: 'Rigour & compliance' },
      desc: {
        fr: 'Des dossiers documentaires vérifiés en amont et une application stricte des règlements douaniers.',
        en: 'Documentation checked upfront and strict application of customs regulations.',
      },
    },
    {
      icon: <HeartHandshake className="w-6 h-6" />,
      title: { fr: 'Proximité client', en: 'Client proximity' },
      desc: {
        fr: 'Des équipes joignables, un suivi en ligne et un interlocuteur dédié du départ à la livraison.',
        en: 'Reachable teams, online tracking and a dedicated contact from departure to delivery.',
      },
    },
  ];
  return (
    <section id="apropos" className="py-16 lg:py-20 bg-white border-b border-slate-200">
      <div className="max-w-[1200px] mx-auto px-6 lg:px-8">
        <SectionHeader
          eyebrow={l({ fr: 'À propos', en: 'About us' })}
          title={l({
            fr: 'Alpha Logistix : transport, transit et logistique en Afrique',
            en: 'Alpha Logistix: transport, transit and logistics in Africa',
          })}
          desc={l({
            fr: 'Alpha Logistix Group intervient dans l’organisation et la coordination des opérations de transport multimodal, de transit douanier, de transport routier, maritime et aérien, ainsi que dans la logistique de projets.',
            en: 'Alpha Logistix Group organises and coordinates multimodal transport, customs clearance, road, sea and air freight, as well as project logistics.',
          })}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {items.map((it) => (
            <Card key={it.title.fr} icon={it.icon} title={l(it.title)} desc={l(it.desc)} />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------- Extra services */

export function ExtraServicesSection({ onRequestQuote }: { onRequestQuote: () => void }) {
  const { locale } = useLanguage();
  const l = (b: Bi) => b[locale];
  const items: Array<{ icon: ReactNode; title: Bi; desc: Bi }> = [
    {
      icon: <Truck className="w-6 h-6" />,
      title: { fr: 'Transport routier spécialisé', en: 'Specialised road transport' },
      desc: {
        fr: 'Conteneurs, marchandises conventionnelles, transport exceptionnel et hors gabarit, marchandises sensibles.',
        en: 'Containers, conventional cargo, exceptional and out-of-gauge loads, sensitive goods.',
      },
    },
    {
      icon: <HardHat className="w-6 h-6" />,
      title: { fr: 'Logistique de projets', en: 'Project logistics' },
      desc: {
        fr: 'Colis lourds et hors gabarit, projets industriels et énergétiques, coordination des opérations complexes.',
        en: 'Heavy and out-of-gauge cargo, industrial and energy projects, coordination of complex operations.',
      },
    },
    {
      icon: <Package className="w-6 h-6" />,
      title: { fr: 'Déménagement international', en: 'International removals' },
      desc: {
        fr: 'Déménagement professionnel et particulier : emballage, manutention et transport international.',
        en: 'Corporate and private removals: packing, handling and international transport.',
      },
    },
    {
      icon: <Plane className="w-6 h-6" />,
      title: { fr: 'Expéditions urgentes', en: 'Urgent shipments' },
      desc: {
        fr: 'Fret aérien import/export et coordination avec les compagnies aériennes.',
        en: 'Air freight import/export and coordination with airlines.',
      },
    },
  ];
  return (
    <section id="services-complementaires" className="py-16 lg:py-20 bg-slate-50 border-b border-slate-200">
      <div className="max-w-[1200px] mx-auto px-6 lg:px-8">
        <SectionHeader
          eyebrow={l({ fr: 'Expertises complémentaires', en: 'Additional expertise' })}
          title={l({
            fr: 'Des solutions pour les opérations complexes',
            en: 'Solutions for complex operations',
          })}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {items.map((it) => (
            <Card key={it.title.fr} icon={it.icon} title={l(it.title)} desc={l(it.desc)} />
          ))}
        </div>
        <button
          type="button"
          onClick={onRequestQuote}
          className="mt-8 px-6 py-3 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg min-h-[44px] cursor-pointer"
        >
          {l({ fr: 'Demander une cotation', en: 'Request a quote' })}
        </button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------- Corridors map */

interface Corridor {
  id: string;
  port: Bi;
  country: Bi;
  x: number;
  y: number;
}

const NIAMEY = { x: 360, y: 80 };

const CORRIDORS: Corridor[] = [
  { id: 'tema', port: { fr: 'Tema', en: 'Tema' }, country: { fr: 'Ghana', en: 'Ghana' }, x: 130, y: 290 },
  { id: 'lome', port: { fr: 'Lomé', en: 'Lomé' }, country: { fr: 'Togo', en: 'Togo' }, x: 235, y: 295 },
  { id: 'cotonou', port: { fr: 'Cotonou', en: 'Cotonou' }, country: { fr: 'Bénin', en: 'Benin' }, x: 335, y: 295 },
  { id: 'lagos', port: { fr: 'Lagos', en: 'Lagos' }, country: { fr: 'Nigéria', en: 'Nigeria' }, x: 440, y: 290 },
];

export function CorridorsMapSection() {
  const { locale } = useLanguage();
  const l = (b: Bi) => b[locale];
  const [active, setActive] = useState<string>('cotonou');

  return (
    <section id="corridors" className="py-16 lg:py-20 bg-white border-b border-slate-200">
      <div className="max-w-[1200px] mx-auto px-6 lg:px-8">
        <SectionHeader
          eyebrow={l({ fr: 'Corridors logistiques', en: 'Logistics corridors' })}
          title={l({
            fr: 'Les corridors ouest-africains vers Niamey',
            en: 'West African corridors to Niamey',
          })}
          desc={l({
            fr: 'Cotonou, Lomé, Tema et Lagos : sélectionnez un corridor pour le visualiser. Autres corridors régionaux et internationaux sur demande.',
            en: 'Cotonou, Lomé, Tema and Lagos: select a corridor to highlight it. Other regional and international corridors on request.',
          })}
        />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 bg-slate-50 border border-slate-200 rounded-xl p-4">
            <svg
              viewBox="0 0 560 340"
              role="img"
              aria-label={l({
                fr: 'Schéma des corridors entre les ports du golfe de Guinée et Niamey',
                en: 'Diagram of corridors between Gulf of Guinea ports and Niamey',
              })}
              className="w-full h-auto"
            >
              <rect x="0" y="322" width="560" height="18" fill="#e0f2fe" />
              <text x="280" y="335" textAnchor="middle" fontSize="11" fill="#0369a1">
                {l({ fr: 'Golfe de Guinée', en: 'Gulf of Guinea' })}
              </text>
              {CORRIDORS.map((c) => {
                const on = c.id === active;
                return (
                  <line
                    key={c.id}
                    x1={c.x}
                    y1={c.y}
                    x2={NIAMEY.x}
                    y2={NIAMEY.y}
                    stroke={on ? '#ea580c' : '#94a3b8'}
                    strokeWidth={on ? 4 : 2}
                    strokeDasharray={on ? undefined : '6 6'}
                  />
                );
              })}
              {CORRIDORS.map((c) => {
                const on = c.id === active;
                return (
                  <g
                    key={c.id}
                    tabIndex={0}
                    role="button"
                    aria-label={`${l(c.port)} – Niamey`}
                    onClick={() => setActive(c.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setActive(c.id);
                    }}
                    className="cursor-pointer"
                  >
                    <circle cx={c.x} cy={c.y} r={on ? 11 : 8} fill={on ? '#ea580c' : '#0369a1'} />
                    <text x={c.x} y={c.y - 16} textAnchor="middle" fontSize="12" fontWeight={on ? 700 : 500} fill="#0f172a" stroke="#f8fafc" strokeWidth="4" paintOrder="stroke">
                      {l(c.port)}
                    </text>
                    <text x={c.x} y={c.y + 22} textAnchor="middle" fontSize="10" fill="#475569" stroke="#f8fafc" strokeWidth="4" paintOrder="stroke">
                      {l(c.country)}
                    </text>
                  </g>
                );
              })}
              <circle cx={NIAMEY.x} cy={NIAMEY.y} r="13" fill="#0f172a" />
              <text x={NIAMEY.x} y={NIAMEY.y - 20} textAnchor="middle" fontSize="13" fontWeight="700" fill="#0f172a">
                Niamey
              </text>
              <text x={NIAMEY.x + 20} y={NIAMEY.y + 4} textAnchor="start" fontSize="11" fill="#475569" stroke="#f8fafc" strokeWidth="4" paintOrder="stroke">
                Niger
              </text>
            </svg>
            <p className="mt-2 text-xs text-slate-500">
              {l({ fr: 'Schéma indicatif, hors échelle.', en: 'Indicative diagram, not to scale.' })}
            </p>
          </div>
          <ul className="lg:col-span-5 space-y-2">
            {CORRIDORS.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setActive(c.id)}
                  aria-pressed={c.id === active}
                  className={`w-full text-left px-4 py-3 rounded-lg border text-sm min-h-[44px] cursor-pointer ${
                    c.id === active
                      ? 'bg-orange-50 border-orange-300 text-slate-900 font-semibold'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {l(c.port)} ({l(c.country)}) → Niamey (Niger)
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- Sectors */

export function SectorsSection() {
  const { locale } = useLanguage();
  const l = (b: Bi) => b[locale];
  const sectors: Array<{ icon: ReactNode; label: Bi }> = [
    { icon: <Fuel className="w-5 h-5" />, label: { fr: 'Industrie et énergie', en: 'Industry and energy' } },
    { icon: <Building2 className="w-5 h-5" />, label: { fr: 'Bâtiment et travaux publics', en: 'Construction and public works' } },
    { icon: <Mountain className="w-5 h-5" />, label: { fr: 'Mines et carrières', en: 'Mining and quarrying' } },
    { icon: <Store className="w-5 h-5" />, label: { fr: 'Importateurs et distributeurs', en: 'Importers and distributors' } },
    { icon: <Globe2 className="w-5 h-5" />, label: { fr: 'Organisations internationales et ONG', en: 'International organisations and NGOs' } },
    { icon: <Landmark className="w-5 h-5" />, label: { fr: 'Projets gouvernementaux', en: 'Government projects' } },
    { icon: <Sprout className="w-5 h-5" />, label: { fr: 'Agriculture et agro-industrie', en: 'Agriculture and agro-industry' } },
    { icon: <Factory className="w-5 h-5" />, label: { fr: 'Logistique de projets industriels', en: 'Industrial project logistics' } },
  ];
  return (
    <section id="secteurs" className="py-16 lg:py-20 bg-slate-50 border-b border-slate-200">
      <div className="max-w-[1200px] mx-auto px-6 lg:px-8">
        <SectionHeader
          eyebrow={l({ fr: 'Secteurs d’activité', en: 'Industries served' })}
          title={l({
            fr: 'Des solutions adaptées à chaque secteur',
            en: 'Solutions tailored to each industry',
          })}
        />
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {sectors.map((s) => (
            <li
              key={s.label.fr}
              className="flex items-center gap-3 bg-white border border-slate-200 rounded-lg px-4 py-3 text-sm text-slate-800"
            >
              <span className="text-sky-700 shrink-0" aria-hidden="true">{s.icon}</span>
              <span>{l(s.label)}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
