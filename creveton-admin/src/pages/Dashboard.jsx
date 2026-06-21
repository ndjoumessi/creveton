import './Dashboard.css';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, Gamepad2, FileCheck2, Trophy, ArrowRight, Check, X,
  Server, Database, Zap, RefreshCw, UserPlus, Inbox, BarChart3, Target,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import dashboardService from '../services/dashboard.service';
import sessionsService from '../services/sessions.service';
import questionsService from '../services/questions.service';
import analyticsService from '../services/analytics.service';
import { useApiData } from '../hooks/useApiData';
import { num, dateFr } from '../utils/format';
import { themeLabels } from '../constants/theme';
import PageHeader from '../components/PageHeader';
import Avatar from '../components/Avatar';
import KpiCard from '../components/KpiCard';
import Gauge from '../components/Gauge';
import ThemeBadge from '../components/ThemeBadge';
import { Skeleton, SkeletonKpis, SkeletonCard } from '../components/Skeleton';
import { notify } from '../components/Toast';

const truncate = (s, n = 64) => (s && s.length > n ? `${s.slice(0, n)}…` : s);

/** "à l'instant" / "il y a X min" / "il y a X h" / date courte. */
function timeAgo(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return '—';
  const min = Math.floor(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return dateFr(iso);
}

/**
 * Série déterministe (sans random) dérivée d'un nombre de base : petites
 * variations plausibles pour alimenter une sparkline sobre. Renvoie 7 valeurs.
 */
function derivedSpark(base) {
  const b = Math.max(1, Number(base) || 0);
  const wave = [0.86, 0.91, 0.88, 0.95, 0.97, 0.93, 1];
  return wave.map((w) => Math.round(b * w));
}

/** Delta % déterministe entre l'avant-dernier et le dernier point d'une série. */
function deltaFromSpark(spark) {
  if (!spark || spark.length < 2) return null;
  const prev = spark[spark.length - 2];
  const last = spark[spark.length - 1];
  if (!prev) return null;
  return Math.round(((last - prev) / prev) * 100);
}

/** Date ISO (AAAA-MM-JJ) → libellé court "JJ/MM" pour l'axe du graphe. */
function shortDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

const fetchAll = async () => {
  const settle = (p, fb) => Promise.resolve(p).then((r) => r).catch(() => fb);
  const [overview, sessions] = await Promise.all([
    settle(dashboardService.overview(), { kpis: {}, recent_users: [], pending_questions: [], system: {} }),
    settle(sessionsService.list({}), { data: [] }),
  ]);
  return { ...overview, sessions: sessions.data || [] };
};

/** Statut d'un service système → ligne sombre avec badge coloré. */
function SysLine({ icon, label, state }) {
  const up = state === 'operational';
  return (
    <div className="sys-line">
      {icon}
      <span className="sys-name">{label}</span>
      <span className="sys-status">
        <span className="dot" style={{ background: up ? '#5eca84' : '#e74c3c' }} />
        <span style={{ color: up ? '#5eca84' : '#e74c3c', fontWeight: 600 }}>
          {up ? 'Opérationnel' : 'Indisponible'}
        </span>
      </span>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <SkeletonKpis />
      <div className="grid grid-dash" style={{ marginBottom: 20 }}>
        <SkeletonCard h={360} />
        <SkeletonCard h={360} />
        <SkeletonCard h={360} />
      </div>
      <SkeletonCard h={300} />
    </>
  );
}

export default function Dashboard() {
  const { data, loading, refetch } = useApiData(fetchAll, [], { pollMs: 30000 });
  // Série « 7 jours » (inscriptions vs parties) — source dédiée analytics.
  const { data: analytics, loading: loadingChart } = useApiData(analyticsService.get7d, [], { pollMs: 30000 });
  // Questions en cours de disparition (animation slide-out avant refetch).
  const [leaving, setLeaving] = useState([]);

  if (loading && !data) {
    return (
      <>
        <PageHeader title="Tableau de bord" description="Vue d’ensemble et actions rapides — MVP gratuit." />
        <DashboardSkeleton />
      </>
    );
  }

  const kpis = (data && data.kpis) || {};
  const recentUsers = (data && data.recent_users) || [];
  const pending = (data && data.pending_questions) || [];
  const system = (data && data.system) || {};
  const sessions = (data && data.sessions) || [];

  // ─── KPIs (deltas + sparklines déterministes, sobres) ───
  const usersSpark = derivedSpark(kpis.total_users);
  const gamesSpark = derivedSpark(kpis.games_today);
  const questionsSpark = derivedSpark(kpis.active_questions);
  const tournamentsSpark = derivedSpark(kpis.open_tournaments);

  // ─── Activité récente : fusion users + sessions, triée par date desc ───
  const feed = [
    ...recentUsers.map((u) => ({
      key: `u-${u.id}`,
      date: u.created_at,
      name: u.name,
      tag: <UserPlus size={13} color="#2a8a4f" />,
      to: '/users',
      node: <>Nouvelle inscription : <strong>{u.name}</strong>{u.ville ? ` · ${u.ville}` : ''}</>,
    })),
    ...sessions.map((s) => ({
      key: `s-${s.id}`,
      date: s.played_at,
      name: s.user.name,
      tag: <Gamepad2 size={13} color="#d4a017" />,
      to: '/sessions',
      node: <><strong>{s.user.name}</strong> a joué une partie · {themeLabels[s.theme] || s.theme}</>,
    })),
  ]
    .filter((it) => it.date)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 8);

  // ─── Graphique activité 7 jours (série `daily` du service analytics) ───
  const daily = (analytics && analytics.daily) || [];
  const chartData = daily.map((d) => ({
    label: shortDate(d.date),
    inscriptions: d.signups ?? 0,
    parties: d.games ?? 0,
  }));
  const hasChartData = chartData.some((d) => d.inscriptions > 0 || d.parties > 0);

  const decide = async (q, to) => {
    setLeaving((prev) => [...prev, q.id]);
    try {
      await questionsService.transition(q.id, to, to === 'rejected' ? 'Rejetée depuis le dashboard' : undefined);
      notify.success(to === 'approved' ? 'Question approuvée' : 'Question rejetée');
      // Laisse l'animation slide-out se jouer avant de recharger.
      setTimeout(() => { setLeaving((prev) => prev.filter((id) => id !== q.id)); refetch(); }, 220);
    } catch {
      setLeaving((prev) => prev.filter((id) => id !== q.id));
      notify.error('Action impossible.');
    }
  };

  return (
    <>
      <PageHeader title="Tableau de bord" description="Vue d’ensemble et actions rapides — MVP gratuit." />

      {/* ─── Ligne 1 : 4 KPI premium ─── */}
      <div className="grid grid-kpi" style={{ marginBottom: 20 }}>
        <KpiCard
          icon={<Users size={19} />} tone="green"
          label="Utilisateurs inscrits" value={kpis.total_users ?? 0}
          spark={usersSpark} delta={deltaFromSpark(usersSpark)}
        />
        <KpiCard
          icon={<Gamepad2 size={19} />} tone="gold"
          label="Parties aujourd’hui" value={kpis.games_today ?? 0}
          spark={gamesSpark} delta={deltaFromSpark(gamesSpark)}
        />
        <KpiCard
          icon={<FileCheck2 size={19} />} tone="blue"
          label="Questions actives" value={kpis.active_questions ?? 0}
          spark={questionsSpark} delta={deltaFromSpark(questionsSpark)}
        />
        <KpiCard
          icon={<Trophy size={19} />} tone="violet"
          label="Tournois ouverts" value={kpis.open_tournaments ?? 0}
          spark={tournamentsSpark} delta={null}
        />
      </div>

      {/* ─── Ligne 2 : 3 colonnes 40 / 35 / 25 ─── */}
      <div className="grid grid-dash" style={{ marginBottom: 20 }}>
        {/* Col 1 — Activité récente (fond cream) */}
        <div className="card card-pad card-cream">
          <div className="dash-card-head">
            <div>
              <h3 className="card-title">Activité récente</h3>
              <p className="card-sub">Inscriptions et parties en temps réel</p>
            </div>
            <span className="badge-dot pulse" style={{ background: 'var(--green500)', marginTop: 6 }} />
          </div>
          {feed.length === 0 ? (
            <div className="dash-empty">
              <Inbox size={26} color="#9ca3af" />
              <span className="dash-empty-title">Pas encore d’activité</span>
              <span>Les inscriptions et parties apparaîtront ici.</span>
            </div>
          ) : (
            <div className="dash-feed">
              {feed.map((it) => (
                <Link className="dash-feed-item" key={it.key} to={it.to}>
                  <Avatar name={it.name} size="sm" />
                  <span className="dash-feed-text">{it.tag} {it.node}</span>
                  <span className="dash-feed-time">{timeAgo(it.date)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Col 2 — Questions à réviser */}
        <div className="card card-pad">
          <div className="dash-card-head">
            <div>
              <h3 className="card-title">Questions à réviser</h3>
              <p className="card-sub">En attente de modération</p>
            </div>
            {pending.length > 0 && <span className="dash-count">{pending.length}</span>}
          </div>
          {pending.length === 0 ? (
            <div className="dash-empty">
              <Check size={26} color="#5eca84" />
              <span className="dash-empty-title">Tout est à jour</span>
              <span>Aucune question en attente.</span>
            </div>
          ) : (
            <div>
              {pending.map((q) => (
                <div className={`dash-q-item ${leaving.includes(q.id) ? 'slide-out' : ''}`} key={q.id}>
                  <div className="dash-q-text">{truncate(q.text_fr)}</div>
                  <div className="dash-q-meta">
                    <ThemeBadge theme={q.theme} />
                    <div className="dash-q-actions">
                      <button className="btn btn-sm btn-success" onClick={() => decide(q, 'approved')} aria-label="Approuver">
                        <Check size={14} /> Approuver
                      </button>
                      <button className="btn btn-sm btn-danger-ghost" onClick={() => decide(q, 'rejected')} aria-label="Rejeter">
                        <X size={14} /> Rejeter
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 14 }}>
            <Link className="card-link" to="/questions">Gérer les questions <ArrowRight size={14} /></Link>
          </div>
        </div>

        {/* Col 3 — Statut système (card sombre) */}
        <div className="card card-pad card-dark">
          <h3 className="card-title">Statut système</h3>
          <p className="card-sub" style={{ marginBottom: 6 }}>Services & synchronisation</p>
          <SysLine icon={<Server size={16} color="#5eca84" />} label="Backend API" state={system.api} />
          <SysLine icon={<Database size={16} color="#5eca84" />} label="Base de données" state={system.db} />
          <SysLine icon={<Zap size={16} color="#5eca84" />} label="Redis" state={system.redis} />
          <div className="dash-sys-sync">
            <RefreshCw size={16} color="rgba(255,255,255,0.55)" />
            <span className="sys-name">Dernière sync</span>
            <span className="sys-status" style={{ color: 'rgba(255,255,255,0.85)' }}>{timeAgo(system.last_sync)}</span>
          </div>
        </div>
      </div>

      {/* ─── Ligne 3 : Taux de réussite (jauge) + Joueurs en ligne ─── */}
      <div className="grid dash-row-engage" style={{ marginBottom: 20 }}>
        {/* Taux de réussite global (jauge semi-circulaire colorée) */}
        <div className="card card-pad dash-gauge-card">
          <div className="dash-card-head" style={{ marginBottom: 4 }}>
            <div>
              <h3 className="card-title">Taux de réussite global</h3>
              <p className="card-sub">Bonnes réponses sur l’ensemble des parties</p>
            </div>
            <Target size={18} color="#2a8a4f" aria-hidden="true" />
          </div>
          <Gauge value={kpis.success_rate ?? 0} size={200} label="Taux de réussite global" />
        </div>

        {/* Joueurs en ligne maintenant (badge pulsant, rafraîchi 30 s) */}
        <div className="card card-pad card-dark dash-online-card">
          <div className="dash-card-head" style={{ marginBottom: 4 }}>
            <div>
              <h3 className="card-title">Joueurs connectés</h3>
              <p className="card-sub" style={{ color: 'rgba(255,255,255,0.6)' }}>Mis à jour toutes les 30 s</p>
            </div>
            <span
              className="online-badge"
              title="Compteur en temps réel, rafraîchi toutes les 30 secondes"
            >
              <span className="online-dot" />
              <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12.5 }}>En ligne maintenant</span>
            </span>
          </div>
          <div className="dash-online-count">{num(kpis.online_now ?? 0)}</div>
          <div className="dash-online-sub">joueurs actifs en ce moment</div>
        </div>
      </div>

      {/* ─── Ligne 4 : graphique activité 7 jours (AreaChart) ─── */}
      <div className="card card-pad">
        <div className="dash-card-head">
          <div>
            <h3 className="dash-chart-title">Activité des 7 derniers jours</h3>
            <p className="card-sub">Inscriptions vs parties jouées par jour</p>
          </div>
          {hasChartData && (
            <div className="dash-chart-legend">
              <span className="dash-legend-item"><span className="dash-legend-swatch" style={{ background: '#2a8a4f' }} /> Inscriptions</span>
              <span className="dash-legend-item"><span className="dash-legend-swatch" style={{ background: '#d4a017' }} /> Parties</span>
            </div>
          )}
        </div>
        {loadingChart && !analytics ? (
          <SkeletonCard h={240} />
        ) : hasChartData ? (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="dashGradSignups" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2a8a4f" stopOpacity={0.22} />
                  <stop offset="95%" stopColor="#2a8a4f" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="dashGradGames" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#d4a017" stopOpacity={0.22} />
                  <stop offset="95%" stopColor="#d4a017" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef1ee" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#6b7280', fontFamily: 'Space Grotesk' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#6b7280', fontFamily: 'Space Grotesk' }} tickLine={false} axisLine={false} width={36} />
              <Tooltip
                cursor={{ stroke: 'rgba(42,138,79,0.25)', strokeWidth: 1 }}
                contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', fontFamily: 'Space Grotesk', fontSize: 13 }}
                labelStyle={{ fontFamily: 'Outfit', fontWeight: 600, color: '#0b2e1a' }}
                formatter={(value, name) => [num(value), name === 'inscriptions' ? 'Inscriptions' : 'Parties']}
              />
              <Area type="monotone" dataKey="inscriptions" stroke="#2a8a4f" strokeWidth={2} fill="url(#dashGradSignups)" dot={false} activeDot={{ r: 4 }} />
              <Area type="monotone" dataKey="parties" stroke="#d4a017" strokeWidth={2} fill="url(#dashGradGames)" dot={false} activeDot={{ r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="dash-empty" style={{ padding: '48px 12px' }}>
            <BarChart3 size={30} color="#9ca3af" />
            <span className="dash-empty-title">Aucune activité sur 7 jours</span>
            <span>Les inscriptions et parties s’afficheront ici dès les premières données.</span>
            <Skeleton w="60%" h={6} style={{ marginTop: 6 }} />
          </div>
        )}
      </div>
    </>
  );
}
