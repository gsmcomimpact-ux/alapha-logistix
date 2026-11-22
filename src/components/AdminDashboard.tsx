import { ReactNode, useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Truck,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  ClientRecord,
  QuoteRequestRecord,
  QUOTE_STATUSES,
  SHIPMENT_STATUSES,
  ShipmentRecord,
  TRANSPORT_MODES,
  UserProfile,
} from '../types/logistics';

/* Chart colors — single sequential hue (blue), validated with the dataviz palette script.
   Marks carry the color; every label and value uses text tokens. */
const BAR = '#2a78d6';
const BAR_EMPHASIS = '#1c5cab';
const STALE_DAYS = 7;
const DAY_MS = 86_400_000;

type DashTab = 'tracking' | 'pendingRequests' | 'quotes' | 'clients';

interface AdminDashboardProps {
  shipments: ShipmentRecord[];
  quotes: QuoteRequestRecord[];
  users: UserProfile[];
  clients: ClientRecord[];
  onOpenTab: (tab: DashTab) => void;
  onOpenShipment: (shipmentId: string) => void;
}

function millis(ts?: { toMillis?: () => number } | null): number | null {
  try {
    return ts?.toMillis ? ts.toMillis() : null;
  } catch {
    return null;
  }
}

function pct(part: number, total: number): string {
  return total > 0 ? `${Math.round((part / total) * 100)} %` : '0 %';
}

function daysAgoLabel(ms: number | null, now: number): string {
  if (ms === null) return 'à l’instant';
  const d = Math.floor((now - ms) / DAY_MS);
  if (d <= 0) return 'aujourd’hui';
  return d === 1 ? 'il y a 1 jour' : `il y a ${d} jours`;
}

/* ------------------------------------------------------------- tooltip --- */
function Tip({ children, align = 'center' }: { children: ReactNode; align?: 'center' | 'left' | 'right' }) {
  // Edge columns anchor the bubble to their own edge so it never widens the page.
  const pos = align === 'left' ? 'left-0' : align === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2';
  return (
    <span
      role="tooltip"
      className={`pointer-events-none absolute ${pos} bottom-full mb-1 z-20 whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow-lg opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity`}
    >
      {children}
    </span>
  );
}

/* ----------------------------------------------------------- stat tile --- */
function StatTile({
  icon,
  label,
  value,
  hint,
  onClick,
  hero = false,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  hint?: string;
  onClick?: () => void;
  hero?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-sky-500 hover:shadow-sm transition cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${
        hero ? 'sm:col-span-2' : ''
      }`}
    >
      <span className="flex items-center gap-2 text-xs font-medium text-slate-600">
        <span className="text-sky-700" aria-hidden="true">
          {icon}
        </span>
        {label}
      </span>
      <span
        className={`mt-2 block font-display font-bold tabular-nums text-slate-900 ${
          hero ? 'text-5xl' : 'text-3xl'
        }`}
      >
        {value}
      </span>
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </button>
  );
}

/* ------------------------------------------------------ ranked bar list --- */
interface BarRow {
  label: string;
  value: number;
}

function BarList({ rows, total, unit }: { rows: BarRow[]; total: number; unit: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-1">
      {rows.map((r) => (
        <li
          key={r.label}
          tabIndex={0}
          className="group relative grid grid-cols-[minmax(0,10.5rem)_1fr_auto] items-center gap-3 rounded-md px-1 py-1.5 min-h-[36px] hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-2 focus-visible:outline-sky-600"
        >
          <span className="text-xs text-slate-700 truncate" title={r.label}>
            {r.label}
          </span>
          <span className="h-2.5 rounded-full bg-slate-100" aria-hidden="true">
            <span
              className="block h-full rounded-r-[4px] rounded-l-none"
              style={{
                width: `${(r.value / max) * 100}%`,
                minWidth: r.value > 0 ? 4 : 0,
                backgroundColor: BAR,
              }}
            />
          </span>
          <span className="text-xs font-semibold tabular-nums text-slate-900 w-8 text-right">
            {r.value}
          </span>
          <Tip>
            {r.label} : {r.value} {unit}
            {r.value > 1 && !unit.endsWith('s') ? 's' : ''} ({pct(r.value, total)})
          </Tip>
        </li>
      ))}
    </ul>
  );
}

function Card({
  title,
  subtitle,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`bg-white border border-slate-200 rounded-xl p-5 ${className}`}>
      <h3 className="font-display text-sm font-bold text-slate-900">{title}</h3>
      {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------ dashboard --- */
export function AdminDashboard({
  shipments,
  quotes,
  users,
  clients,
  onOpenTab,
  onOpenShipment,
}: AdminDashboardProps) {
  const now = Date.now();

  const stats = useMemo(() => {
    const delivered = shipments.filter((s) => s.currentStatus === 'Livré');
    const active = shipments.filter((s) => s.currentStatus !== 'Livré');
    const stale = active
      .map((s) => ({ s, ms: millis(s.updatedAt) }))
      .filter((x) => x.ms !== null && now - (x.ms as number) > STALE_DAYS * DAY_MS)
      .sort((a, b) => (a.ms as number) - (b.ms as number));
    const quotesToHandle = quotes.filter((q) => q.status === 'En attente' || q.status === "À l'étude");
    const pendingAccounts = users.filter((u) => (u.accountStatus ?? 'validated') === 'pending');
    const clientEmails = new Set<string>();
    clients.forEach((c) => clientEmails.add(c.email.toLowerCase()));
    users.forEach((u) => clientEmails.add(u.email.toLowerCase()));

    const byStatus = SHIPMENT_STATUSES.map((st) => ({
      label: st,
      value: shipments.filter((s) => s.currentStatus === st).length,
    }));
    const byMode = TRANSPORT_MODES.map((m) => ({
      label: m,
      value: shipments.filter((s) => s.transportMode === m).length,
    }));
    const byQuoteStatus = QUOTE_STATUSES.map((st) => ({
      label: st,
      value: quotes.filter((q) => q.status === st).length,
    }));

    // New shipments per month, last 6 months (current month included).
    const months: Array<{ key: string; label: string; value: number; current: boolean }> = [];
    const base = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', ''),
        value: 0,
        current: i === 0,
      });
    }
    shipments.forEach((s) => {
      const ms = millis(s.createdAt);
      if (ms === null) return;
      const d = new Date(ms);
      const m = months.find((x) => x.key === `${d.getFullYear()}-${d.getMonth()}`);
      if (m) m.value += 1;
    });

    const recent = [...shipments]
      .sort((a, b) => (millis(b.updatedAt) ?? now) - (millis(a.updatedAt) ?? now))
      .slice(0, 6);

    return {
      delivered,
      active,
      stale,
      quotesToHandle,
      pendingAccounts,
      clientCount: clientEmails.size,
      byStatus,
      byMode,
      byQuoteStatus,
      months,
      recent,
    };
  }, [shipments, quotes, users, clients, now]);

  const monthMax = Math.max(1, ...stats.months.map((m) => m.value));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-lg font-bold text-slate-900">Tableau de bord — suivi général</h2>
        <p className="text-xs text-slate-500">
          Vue d’ensemble en temps réel des expéditions, cotations et comptes clients.
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatTile
          hero
          icon={<Truck className="w-4 h-4" />}
          label="Expéditions en cours"
          value={stats.active.length}
          hint={`${shipments.length} dossier${shipments.length > 1 ? 's' : ''} au total`}
          onClick={() => onOpenTab('tracking')}
        />
        <StatTile
          icon={<CheckCircle2 className="w-4 h-4" />}
          label="Livrées"
          value={stats.delivered.length}
          hint={pct(stats.delivered.length, shipments.length) + ' des dossiers'}
          onClick={() => onOpenTab('tracking')}
        />
        <StatTile
          icon={<AlertTriangle className="w-4 h-4" />}
          label="À relancer"
          value={stats.stale.length}
          hint={`sans mise à jour > ${STALE_DAYS} j`}
          onClick={() => onOpenTab('tracking')}
        />
        <StatTile
          icon={<FileText className="w-4 h-4" />}
          label="Cotations à traiter"
          value={stats.quotesToHandle.length}
          hint={`${quotes.length} au total`}
          onClick={() => onOpenTab('quotes')}
        />
        <StatTile
          icon={<UserCheck className="w-4 h-4" />}
          label="Comptes à valider"
          value={stats.pendingAccounts.length}
          onClick={() => onOpenTab('pendingRequests')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Expéditions par statut" subtitle="Dans l’ordre du parcours, de la prise en charge à la livraison">
          {shipments.length === 0 ? (
            <p className="text-xs text-slate-500">Aucun dossier pour le moment.</p>
          ) : (
            <BarList rows={stats.byStatus} total={shipments.length} unit="dossier" />
          )}
        </Card>

        <Card title="Nouveaux dossiers par mois" subtitle="6 derniers mois — le mois en cours est en bleu foncé">
          <div className="flex items-end gap-2 h-40 border-b border-slate-200" role="group" aria-label="Nouveaux dossiers par mois">
            {stats.months.map((m, idx) => (
              <div
                key={m.key}
                tabIndex={0}
                className="group relative flex-1 h-full flex flex-col items-center justify-end focus-visible:outline-2 focus-visible:outline-sky-600 rounded-sm"
              >
                <span className="mb-1 text-xs font-semibold tabular-nums text-slate-900">{m.value}</span>
                <span
                  className="w-full max-w-[24px] rounded-t-[4px]"
                  style={{
                    height: `${Math.max(m.value > 0 ? 4 : 0, (m.value / monthMax) * 100)}px`,
                    maxHeight: '104px',
                    backgroundColor: m.current ? BAR_EMPHASIS : BAR,
                  }}
                  aria-hidden="true"
                />
                <Tip align={idx >= 4 ? 'right' : idx <= 1 ? 'left' : 'center'}>
                  {m.label} : {m.value} nouveau{m.value > 1 ? 'x' : ''} dossier{m.value > 1 ? 's' : ''}
                </Tip>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-1.5">
            {stats.months.map((m) => (
              <span key={m.key} className="flex-1 text-center text-xs text-slate-500 capitalize">
                {m.label}
              </span>
            ))}
          </div>
        </Card>

        <Card title="Par mode de transport">
          {shipments.length === 0 ? (
            <p className="text-xs text-slate-500">Aucun dossier pour le moment.</p>
          ) : (
            <BarList rows={stats.byMode} total={shipments.length} unit="dossier" />
          )}
        </Card>

        <Card title="Cotations par statut">
          {quotes.length === 0 ? (
            <p className="text-xs text-slate-500">Aucune demande de cotation pour le moment.</p>
          ) : (
            <BarList rows={stats.byQuoteStatus} total={quotes.length} unit="cotation" />
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card
          title="Dossiers à relancer"
          subtitle={`Expéditions en cours sans mise à jour depuis plus de ${STALE_DAYS} jours`}
        >
          {stats.stale.length === 0 ? (
            <p className="flex items-center gap-2 text-xs text-slate-600">
              <CheckCircle2 className="w-4 h-4 text-sky-700" aria-hidden="true" />
              Tous les dossiers en cours ont été mis à jour récemment.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {stats.stale.slice(0, 6).map(({ s, ms }) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onOpenShipment(s.id)}
                    className="w-full text-left py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50 rounded-md px-1 cursor-pointer"
                  >
                    <span className="min-w-0">
                      <span className="block font-mono text-xs font-semibold text-slate-900">{s.trackingCode}</span>
                      <span className="block text-xs text-slate-600 truncate">
                        {s.clientName} · {s.currentLocation}
                      </span>
                    </span>
                    <span className="shrink-0 inline-flex items-center gap-1 text-xs text-amber-800">
                      <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                      {daysAgoLabel(ms, now)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Activité récente" subtitle="Derniers dossiers mis à jour">
          {stats.recent.length === 0 ? (
            <p className="text-xs text-slate-500">Aucune activité pour le moment.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {stats.recent.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onOpenShipment(s.id)}
                    className="w-full text-left py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50 rounded-md px-1 cursor-pointer"
                  >
                    <span className="min-w-0">
                      <span className="block font-mono text-xs font-semibold text-slate-900">{s.trackingCode}</span>
                      <span className="block text-xs text-slate-600 truncate">
                        {s.currentStatus} · {s.currentLocation}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-slate-500">
                      {daysAgoLabel(millis(s.updatedAt), now)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-slate-500">
        <Users className="w-3.5 h-3.5" aria-hidden="true" />
        {stats.clientCount} client{stats.clientCount > 1 ? 's' : ''} enregistré{stats.clientCount > 1 ? 's' : ''} (dossiers
        clients et comptes inscrits confondus).
      </p>
    </div>
  );
}
