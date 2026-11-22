import { useLanguage } from '../context/LanguageContext';
import teamLeadershipImg from '../assets/images/team_african_leadership_1795099274266.jpg';
import { ResilientImage } from './ResilientImage';

export function TeamSection() {
  const { t } = useLanguage();

  return (
    <section id="equipe" className="py-16 lg:py-20 bg-slate-50 border-b border-slate-200">
      <div className="max-w-[1200px] mx-auto px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
          {/* Left: Documentary African Leadership Photo */}
          <div className="lg:col-span-6 flex flex-col">
            <div className="relative flex-1 min-h-[280px] lg:min-h-[380px] rounded-xl overflow-hidden border border-slate-200 bg-slate-900">
              <ResilientImage
                src={teamLeadershipImg}
                alt={t.team.imageAlt}
                fallbackTitle={t.team.imageFallback}
                className="w-full h-full object-cover object-center"
              />
            </div>
          </div>

          {/* Right: Editorial Commitments */}
          <div className="lg:col-span-6 flex flex-col justify-between py-1">
            <div>
              <p className="text-xs font-medium text-sky-700">{t.team.eyebrow}</p>
              <h2
                className="mt-2 font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900"
                style={{ textWrap: 'balance' }}
              >
                {t.team.title}
              </h2>
              <p className="mt-3 text-base text-slate-600 leading-relaxed">{t.team.description}</p>
            </div>

            <div className="mt-8 border-t border-slate-200 divide-y divide-slate-200">
              {t.team.commitments.map((item) => (
                <div key={item.index} className="py-4 flex items-start gap-4">
                  <span className="font-mono text-xs font-semibold text-slate-400 tabular-nums mt-1 shrink-0">
                    {item.index}
                  </span>
                  <div>
                    <h3 className="font-display text-sm font-semibold text-slate-900">
                      {item.title}
                    </h3>
                    <p className="mt-1 text-xs sm:text-sm text-slate-600 leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
