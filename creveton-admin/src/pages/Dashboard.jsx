import './Dashboard.css';
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Users, Gamepad2, FileCheck2, Trophy, ArrowRight, Check, X,
  Server, Database, Zap, RefreshCw, Inbox, BarChart3, PieChart as PieIcon,
  Activity, Target, Gauge as GaugeIcon, Sparkles, HeartPulse, CalendarClock,
  Volume2, VolumeX, Download, LineChart as LineIcon, AreaChart as AreaIcon, Play,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell,
} from 'recharts';
import dashboardService from '../services/dashboard.service';
import sessionsService from '../services/sessions.service';
import questionsService from '../services/questions.service';
import tournamentsService from '../services/tournaments.service';
import analyticsService from '../services/analytics.service';
import healthService from '../services/health.service';
import leaderboardService from '../services/leaderboard.service';
import { useApiData } from '../hooks/useApiData';
import i18n from '../i18n';
import { num, dateFr, pct } from '../utils/format';
import { themeLabels, themeBadgeColors, levelLabels } from '../constants/theme';
import PageHeader from '../components/PageHeader';
import Avatar from '../components/Avatar';
import KpiCard from '../components/KpiCard';
import ThemeBadge from '../components/ThemeBadge';
import { Skeleton, SkeletonKpis, SkeletonCard } from '../components/Skeleton';
import { notify } from '../components/Toast';

const truncate = (s, n = 55) => (s && s.length > n ? `${s.slice(0, n)}…` : s);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers TEMPS — isolés hors du rendu (react-hooks/purity interdit Date.now()
// et new Date() sans arg directement dans le rendu ou un useMemo).
// ─────────────────────────────────────────────────────────────────────────────

/** « à l'instant » / « il y a X min » / « il y a X h » / date courte. */
function relativeFr(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return '—';
  const min = Math.floor(diff / 60000);
  if (min < 1) return i18n.t('common.justNow');
  if (min < 60) return i18n.t('common.agoMinutes', { n: min });
  const h = Math.floor(min / 60);
  if (h < 24) return i18n.t('common.agoHours', { n: h });
  const d = Math.floor(h / 24);
  if (d < 7) return i18n.t('common.agoDays', { n: d });
  return dateFr(iso);
}

/** Décompte « dans 9 h 23 min » / « dans 3 j » ; null si > 7 j ou passé. */
function countdownFr(iso) {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(diff) || diff <= 0) return null;
  const min = Math.floor(diff / 60000);
  if (min < 60) return i18n.t('common.inMinutes', { n: min });
  const h = Math.floor(min / 60);
  if (h < 48) return i18n.t('common.inHoursMinutes', { h, m: min % 60 });
  const d = Math.floor(h / 24);
  return i18n.t('common.inDays', { n: d });
}

/** Durée lisible à partir d'un nombre de secondes : « 2 j 14 h », « 3 h 12 min ». */
function uptimeFr(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  if (!s) return '—';
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return i18n.t('common.durationDaysHours', { d, h });
  if (h > 0) return i18n.t('common.durationHoursMinutes', { h, m });
  if (m > 0) return i18n.t('common.durationMinutes', { n: m });
  return i18n.t('common.durationSeconds', { n: s });
}

/** Date ISO (AAAA-MM-JJ) → libellé court « 21 juin » pour l'axe / tooltip. */
function dayLabel(iso) {
  if (!iso) return '';
  return dateFr(iso, 'dd MMM');
}

/** Mesure RÉELLE de la latence du fetch /health (Date.now hors rendu). */
async function fetchHealthTimed() {
  const t0 = Date.now();
  const data = await healthService.get();
  const ms = Date.now() - t0;
  return { ...data, _latencyMs: ms };
}

/**
 * Agrège la série journalière par granularité (jour/semaine/mois). Les barres et
 * libellés restent dérivés des VRAIES données (analytics.daily), jamais inventés.
 */
function aggregateSeries(daily, granularity) {
  if (granularity === 'day') {
    return daily.map((d) => ({ label: dayLabel(d.date), inscriptions: Number(d.signups) || 0, parties: Number(d.games) || 0 }));
  }
  const buckets = new Map();
  daily.forEach((d) => {
    const date = new Date(d.date);
    let key; let label;
    if (granularity === 'month') {
      key = `${date.getFullYear()}-${date.getMonth()}`;
      label = dateFr(d.date, 'MMM yyyy');
    } else {
      // Semaine : ancre sur le lundi du bucket.
      const day = (date.getDay() + 6) % 7;
      const monday = new Date(date);
      monday.setDate(date.getDate() - day);
      key = monday.toISOString().slice(0, 10);
      label = dateFr(monday.toISOString(), 'dd MMM');
    }
    const cur = buckets.get(key) || { label, inscriptions: 0, parties: 0 };
    cur.inscriptions += Number(d.signups) || 0;
    cur.parties += Number(d.games) || 0;
    buckets.set(key, cur);
  });
  return Array.from(buckets.values());
}

/** Exporte le SVG d'un graphe recharts en PNG (sans dépendance externe). */
function exportChartPng(container, filename, t) {
  const svg = container && container.querySelector('svg');
  if (!svg) { notify.error(t('dashboard.notify.chartUnavailable')); return; }
  const xml = new XMLSerializer().serializeToString(svg);
  const rect = svg.getBoundingClientRect();
  const scale = 2;
  const img = new Image();
  const svg64 = `data:image/svg+xml;base64,${window.btoa(unescape(encodeURIComponent(xml)))}`;
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = rect.width * scale;
    canvas.height = rect.height * scale;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const a = document.createElement('a');
    a.download = filename;
    a.href = canvas.toDataURL('image/png');
    a.click();
    notify.success(t('dashboard.notify.chartExported'));
  };
  img.onerror = () => notify.error(t('dashboard.notify.exportFailed'));
  img.src = svg64;
}

/** Bip discret WebAudio à l'arrivée d'un nouvel item (toggle son du feed). */
function softBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 660;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
    osc.onended = () => ctx.close();
  } catch { /* audio indisponible — silencieux */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetchers (module-level → deps littérales côté useApiData).
// ─────────────────────────────────────────────────────────────────────────────

const fetchAll = async () => {
  const settle = (p, fb) => Promise.resolve(p).then((r) => r).catch(() => fb);
  const [overview, sessions] = await Promise.all([
    settle(dashboardService.overview(), {
      kpis: {}, recent_users: [], pending_questions: [], system: {},
      content_health: null, upcoming_tournaments: [],
    }),
    settle(sessionsService.list({ limit: 100 }), { data: [] }),
  ]);
  return { ...overview, sessions: (sessions && sessions.data) || [] };
};

const fetchTop = () => leaderboardService.get({ scope: 'weekly' })
  .then((r) => (r && r.data) || [])
  .catch(() => []);

const PERIODS = [
  { key: '7d', i18nKey: 'dashboard.misc.period7d' },
  { key: '30d', i18nKey: 'dashboard.misc.period30d' },
  { key: '90d', i18nKey: 'dashboard.misc.period90d' },
];

const FEED_FILTERS = [
  { key: 'all', i18nKey: 'dashboard.activity.filters.all' },
  { key: 'game', i18nKey: 'dashboard.activity.filters.games' },
  { key: 'signup', i18nKey: 'dashboard.activity.filters.signups' },
  { key: 'moderation', i18nKey: 'dashboard.activity.filters.moderation' },
];

const CHART_TYPES = [
  { key: 'area', i18nKey: 'dashboard.misc.chartArea', icon: <AreaIcon size={15} /> },
  { key: 'bar', i18nKey: 'dashboard.misc.chartBar', icon: <BarChart3 size={15} /> },
  { key: 'line', i18nKey: 'dashboard.misc.chartLine', icon: <LineIcon size={15} /> },
];

const GRANULARITIES = [
  { key: 'day', i18nKey: 'dashboard.chart.day' },
  { key: 'week', i18nKey: 'dashboard.chart.week' },
  { key: 'month', i18nKey: 'dashboard.chart.month' },
];

const MOD_SORTS = [
  { key: 'recent', i18nKey: 'dashboard.misc.sortRecent' },
  { key: 'theme', i18nKey: 'dashboard.misc.sortTheme' },
  { key: 'level', i18nKey: 'dashboard.misc.sortLevel' },
];

const LEVEL_ORDER = { beginner: 0, intermediate: 1, expert: 2 };
const MEDAL = ['#d4a017', '#9aa3ad', '#b27a44']; // or, argent, bronze

// ─────────────────────────────────────────────────────────────────────────────

/** Ligne d'un service système (carte sombre). */
function SysLine({ icon, label, latency, stateLabel }) {
  return (
    <div className="dash-sys-line">
      <span className="dash-sys-ic">{icon}</span>
      <span className="dash-sys-name">{label}</span>
      <span className="dash-sys-state">
        <span className="dash-sys-dot" />
        {stateLabel}
      </span>
      {latency != null && <span className="dash-sys-ms">{latency} ms</span>}
    </div>
  );
}

/** Tooltip custom du graphe d'activité (jamais de NaN). */
function ActivityTooltip({ active, payload, label, t }) {
  if (!active || !payload || !payload.length) return null;
  const signups = payload.find((p) => p.dataKey === 'inscriptions');
  const games = payload.find((p) => p.dataKey === 'parties');
  return (
    <div className="dash-tip">
      <div className="dash-tip-day">{label}</div>
      <div className="dash-tip-row">
        <span className="dash-tip-sw" style={{ background: '#2a8a4f' }} />
        {num(signups ? signups.value : 0)} {t('dashboard.misc.signupsLabel')}
      </div>
      <div className="dash-tip-row">
        <span className="dash-tip-sw" style={{ background: '#d4a017' }} />
        {num(games ? games.value : 0)} {t('dashboard.misc.gamesLabel')}
      </div>
    </div>
  );
}

/** Carte KPI secondaire compacte (ligne 2). */
function MiniKpi({ icon, label, value, tone = 'green' }) {
  return (
    <div className={`dash-kpi2 dash-kpi2--${tone}`}>
      <span className="dash-kpi2-ic">{icon}</span>
      <div className="dash-kpi2-body">
        <span className="dash-kpi2-val">{value}</span>
        <span className="dash-kpi2-lbl">{label}</span>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <SkeletonKpis />
      <div className="grid grid-kpi dash-gap"><SkeletonCard h={84} /><SkeletonCard h={84} /><SkeletonCard h={84} /><SkeletonCard h={84} /></div>
      <div className="grid grid-dash dash-gap">
        <SkeletonCard h={380} />
        <SkeletonCard h={380} />
        <SkeletonCard h={380} />
      </div>
      <SkeletonCard h={280} />
    </>
  );
}

export default function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, loading, refetch } = useApiData(fetchAll, [], { pollMs: 30000 });
  const { data: health } = useApiData(fetchHealthTimed, [], { pollMs: 30000 });
  const { data: top, loading: loadingTop } = useApiData(fetchTop, [], { pollMs: 60000 });

  const [period, setPeriod] = useState('7d');
  const chartFetcher = useCallback(() => analyticsService.get({ period }), [period]);
  const { data: analytics, loading: loadingChart } = useApiData(chartFetcher, [period], { pollMs: 60000 });

  // Questions en cours de disparition (animation slide-up avant refetch).
  const [leaving, setLeaving] = useState([]);
  // Feed : filtre, pagination, son.
  const [feedFilter, setFeedFilter] = useState('all');
  const [feedVisible, setFeedVisible] = useState(8);
  const [sound, setSound] = useState(false);
  // Modération : tri.
  const [modSort, setModSort] = useState('recent');
  // Graphe : type + granularité.
  const [chartType, setChartType] = useState('area');
  const [granularity, setGranularity] = useState('day');

  const feedScrollRef = useRef(null);
  const chartRef = useRef(null);
  const prevFeedTop = useRef(null);

  const kpis = useMemo(() => (data && data.kpis) || {}, [data]);
  const recentUsers = useMemo(() => (data && data.recent_users) || [], [data]);
  const pending = useMemo(() => (data && data.pending_questions) || [], [data]);
  const system = useMemo(() => (data && data.system) || {}, [data]);
  const sessions = useMemo(() => (data && data.sessions) || [], [data]);
  const contentHealth = useMemo(() => (data && data.content_health) || null, [data]);
  const upcoming = useMemo(() => (data && data.upcoming_tournaments) || [], [data]);

  // ─── Séries KPI : Utilisateurs ← daily.signups, Parties ← daily.games ───
  const daily = useMemo(() => (analytics && analytics.daily) || [], [analytics]);

  const usersSpark = useMemo(() => daily.map((d) => Number(d.signups) || 0), [daily]);
  const gamesSpark = useMemo(() => daily.map((d) => Number(d.games) || 0), [daily]);

  // Variation « vs hier » = 2 derniers points de `daily` (seulement Users/Parties).
  const deltaPct = (series) => {
    if (!series || series.length < 2) return null;
    const prev = series[series.length - 2];
    const last = series[series.length - 1];
    if (!prev) return null;
    return Math.round(((last - prev) / prev) * 100);
  };
  const usersDelta = period === '7d' ? deltaPct(usersSpark) : null;
  const gamesDelta = period === '7d' ? deltaPct(gamesSpark) : null;

  // ─── Activité récente : inscriptions + parties + à modérer, triées desc ───
  const feedAll = useMemo(() => {
    const items = [
      ...recentUsers.map((u) => ({
        key: `u-${u.id}`, kind: 'signup', date: u.created_at, name: u.name,
        to: '/users',
        node: <>{t('dashboard.misc.feedSignup')} <strong>{u.name}</strong>{u.ville ? ` · ${u.ville}` : ''}</>,
      })),
      ...sessions.map((s) => ({
        key: `s-${s.id}`, kind: 'game', date: s.played_at, name: (s.user && s.user.name) || '?',
        to: '/sessions',
        node: (
          <>
            <strong>{(s.user && s.user.name) || '?'}</strong> {t('dashboard.misc.feedPlayed')} {themeLabels[s.theme] || s.theme}
            {' · '}{levelLabels[s.level] || s.level}{s.score != null ? ` · ${num(s.score)} ${t('dashboard.misc.pts')}` : ''}
          </>
        ),
      })),
      ...pending.map((q) => ({
        key: `q-${q.id}`, kind: 'moderation', date: q.created_at, name: q.text_fr || t('dashboard.misc.questionFallback'),
        to: '/questions',
        node: <>{t('dashboard.misc.feedModeration')} · {themeLabels[q.theme] || q.theme}</>,
      })),
    ];
    return items
      .filter((it) => it.date)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [recentUsers, sessions, pending, t]);

  const feed = useMemo(() => feedAll
    .filter((it) => feedFilter === 'all' || it.kind === feedFilter)
    .slice(0, feedVisible), [feedAll, feedFilter, feedVisible]);

  const feedCounts = useMemo(() => ({
    all: feedAll.length,
    game: feedAll.filter((i) => i.kind === 'game').length,
    signup: feedAll.filter((i) => i.kind === 'signup').length,
    moderation: feedAll.filter((i) => i.kind === 'moderation').length,
  }), [feedAll]);

  // Auto-scroll + bip lorsqu'un nouvel item apparaît en tête (clé du 1er item change).
  useEffect(() => {
    const topKey = feedAll.length ? feedAll[0].key : null;
    if (prevFeedTop.current && topKey && topKey !== prevFeedTop.current) {
      if (feedScrollRef.current) feedScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      if (sound) softBeep();
    }
    prevFeedTop.current = topKey;
  }, [feedAll, sound]);

  // ─── Modération triée ───
  const pendingSorted = useMemo(() => {
    const list = [...pending];
    if (modSort === 'theme') list.sort((a, b) => (a.theme || '').localeCompare(b.theme || ''));
    else if (modSort === 'level') list.sort((a, b) => (LEVEL_ORDER[a.level] ?? 9) - (LEVEL_ORDER[b.level] ?? 9));
    else list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return list;
  }, [pending, modSort]);

  // ─── Graphique activité par période/granularité ───
  const chartData = useMemo(() => aggregateSeries(daily, granularity), [daily, granularity]);
  const hasChartData = chartData.some((d) => d.inscriptions > 0 || d.parties > 0);

  // ─── Répartition thèmes (donut) dérivée des parties récentes ───
  const themeDist = useMemo(() => {
    const counts = {};
    sessions.forEach((s) => { if (s.theme) counts[s.theme] = (counts[s.theme] || 0) + 1; });
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return {
      total,
      slices: Object.entries(counts)
        .map(([theme, count]) => ({
          theme,
          label: themeLabels[theme] || theme,
          color: (themeBadgeColors[theme] && themeBadgeColors[theme].fg) || '#6b7280',
          count,
          pct: total ? Math.round((count / total) * 100) : 0,
        }))
        .sort((a, b) => b.count - a.count),
    };
  }, [sessions]);

  // ─── Santé du contenu : pool par thème (max pour échelle des barres) ───
  const poolMax = useMemo(() => {
    if (!contentHealth) return 0;
    return Math.max(1, ...contentHealth.pool_by_theme.map((p) => p.count));
  }, [contentHealth]);

  // ─── Top joueurs (semaine) ───
  const topPlayers = useMemo(() => (top || []).slice(0, 5), [top]);

  const decide = async (q, to) => {
    setLeaving((prev) => [...prev, q.id]);
    try {
      await questionsService.transition(q.id, to, to === 'rejected' ? t('dashboard.misc.rejectedFromDashboard') : undefined);
      notify.success(to === 'approved' ? t('toast.approved') : t('toast.rejected'));
      setTimeout(() => { setLeaving((prev) => prev.filter((id) => id !== q.id)); refetch(); }, 240);
    } catch {
      setLeaving((prev) => prev.filter((id) => id !== q.id));
      notify.error(t('dashboard.notify.actionFailed'));
    }
  };

  const approveAll = async () => {
    const ids = pendingSorted.map((q) => q.id);
    setLeaving((prev) => [...prev, ...ids]);
    try {
      await Promise.all(pendingSorted.map((q) => questionsService.transition(q.id, 'approved')));
      notify.success(t('dashboard.notify.bulkApproved', { n: ids.length }));
      setTimeout(() => { setLeaving([]); refetch(); }, 280);
    } catch {
      setLeaving([]);
      notify.error(t('dashboard.notify.bulkApproveFailed'));
    }
  };

  const startTournament = async (tour) => {
    try {
      await tournamentsService.start(tour.id);
      notify.success(t('toast.tournamentStarted'));
      refetch();
    } catch (e) {
      notify.error(e?.response?.data?.error?.message || t('dashboard.notify.startFailed'));
    }
  };

  if (loading && !data) {
    return (
      <>
        <PageHeader title={t('dashboard.title')} description={t('dashboard.subtitle')} />
        <DashboardSkeleton />
      </>
    );
  }

  const apiLatency = health && typeof health._latencyMs === 'number' ? health._latencyMs : null;

  return (
    <>
      <PageHeader title={t('dashboard.title')} description={t('dashboard.subtitle')} />

      {/* ─── Ligne 1 : 4 KPI premium ─── */}
      <div className="grid grid-kpi dash-gap">
        <KpiCard
          icon={<Users size={22} />} tone="green"
          label={t('dashboard.kpi.users')} value={kpis.total_users ?? 0}
          spark={usersSpark} delta={usersDelta}
        />
        <KpiCard
          icon={<Gamepad2 size={22} />} tone="gold"
          label={t('dashboard.kpi.gamesToday')} value={kpis.games_today ?? 0}
          spark={gamesSpark} delta={gamesDelta}
        />
        <KpiCard
          icon={<FileCheck2 size={22} />} tone="blue"
          label={t('dashboard.kpi.activeQuestions')} value={kpis.active_questions ?? 0}
        />
        <KpiCard
          icon={<Trophy size={22} />} tone="violet"
          label={t('dashboard.kpi.openTournaments')} value={kpis.open_tournaments ?? 0}
        />
      </div>

      {/* ─── Ligne 2 : 4 KPI secondaires compacts ─── */}
      <div className="dash-kpi2-grid dash-gap">
        <MiniKpi icon={<Activity size={18} />} tone="green" label={t('dashboard.kpi.dauMau')} value={pct(analytics ? analytics.dau_mau_ratio : null, 0)} />
        <MiniKpi icon={<Target size={18} />} tone="gold" label={t('dashboard.kpi.avgScore')} value={num(kpis.avg_score ?? 0)} />
        <MiniKpi icon={<GaugeIcon size={18} />} tone="blue" label={t('dashboard.kpi.successRate')} value={`${kpis.success_rate ?? 0} %`} />
        <MiniKpi icon={<Sparkles size={18} />} tone="violet" label={t('dashboard.kpi.xpDistributed')} value={num(kpis.xp_distributed ?? 0)} />
      </div>

      {/* ─── Ligne 3 : Activité (40%) · À modérer (35%) · Système (25%) ─── */}
      <div className="grid grid-dash dash-gap">
        {/* Col 1 — Activité récente */}
        <div className="card card-pad dash-activity">
          <div className="dash-card-head">
            <div>
              <h3 className="card-title">{t('dashboard.activity.title')}</h3>
              <p className="card-sub">{t('dashboard.misc.activitySub')}</p>
            </div>
            <button
              type="button"
              className={`dash-sound ${sound ? 'is-on' : ''}`}
              onClick={() => setSound((s) => !s)}
              title={sound ? t('dashboard.a11y.soundOff') : t('dashboard.a11y.soundOn')}
              aria-pressed={sound}
            >
              {sound ? <Volume2 size={15} /> : <VolumeX size={15} />}
            </button>
          </div>
          <div className="dash-feed-filters" role="tablist" aria-label={t('dashboard.a11y.activityFilter')}>
            {FEED_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={feedFilter === f.key}
                className={`dash-feed-filter ${feedFilter === f.key ? 'is-active' : ''}`}
                onClick={() => { setFeedFilter(f.key); setFeedVisible(8); }}
              >
                {t(f.i18nKey)}<span className="dash-feed-filter-n">{feedCounts[f.key]}</span>
              </button>
            ))}
          </div>
          {feed.length === 0 ? (
            <div className="dash-empty">
              <Inbox size={26} color="#9ca3af" />
              <span className="dash-empty-title">{t('dashboard.empty.activityTitle')}</span>
              <span>{t('dashboard.empty.activitySub')}</span>
            </div>
          ) : (
            <>
              <div className="dash-feed dash-feed--scroll" ref={feedScrollRef}>
                {feed.map((it) => (
                  <Link className="dash-feed-item" key={it.key} to={it.to}>
                    <Avatar name={it.name} size="sm" />
                    <span className="dash-feed-text">
                      <span className={`dash-feed-ic dash-feed-ic--${it.kind}`} aria-hidden="true">
                        {it.kind === 'game' ? '🎮' : it.kind === 'signup' ? '👤' : '✅'}
                      </span>
                      {it.node}
                    </span>
                    <span className="dash-feed-time">{relativeFr(it.date)}</span>
                  </Link>
                ))}
              </div>
              <div className="dash-activity-foot">
                {feedVisible < feedCounts[feedFilter] ? (
                  <button type="button" className="dash-more-btn" onClick={() => setFeedVisible((v) => v + 20)}>
                    {t('dashboard.activity.seeMore')}
                  </button>
                ) : <span />}
                <Link className="dash-gold-link" to="/sessions">{t('dashboard.misc.allActivity')} <ArrowRight size={14} /></Link>
              </div>
            </>
          )}
        </div>

        {/* Col 2 — À modérer */}
        <div className="card card-pad">
          <div className="dash-card-head">
            <div>
              <h3 className="card-title">{t('dashboard.moderation.title')}</h3>
              <p className="card-sub">{t('dashboard.misc.moderationSub')}</p>
            </div>
            {pending.length > 0 && <span className="dash-count">{pending.length}</span>}
          </div>
          {pending.length === 0 ? (
            <div className="dash-empty">
              <Check size={26} color="#5eca84" />
              <span className="dash-empty-title">{t('dashboard.moderation.upToDate')}</span>
              <span>{t('dashboard.moderation.noPending')}</span>
            </div>
          ) : (
            <>
              <div className="dash-mod-toolbar">
                <div className="dash-mod-sort">
                  {MOD_SORTS.map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      className={`dash-mod-sort-btn ${modSort === s.key ? 'is-active' : ''}`}
                      onClick={() => setModSort(s.key)}
                    >
                      {t(s.i18nKey)}
                    </button>
                  ))}
                </div>
                {pending.length < 5 && (
                  <button type="button" className="btn btn-sm btn-success" onClick={approveAll}>
                    <Check size={14} /> {t('dashboard.moderation.approveAll')}
                  </button>
                )}
              </div>
              <div className="dash-mod-list">
                {pendingSorted.map((q) => (
                  <div className={`dash-q-item ${leaving.includes(q.id) ? 'dash-q-leaving' : ''}`} key={q.id}>
                    <div className="dash-q-text">{truncate(q.text_fr)}</div>
                    <div className="dash-q-meta">
                      <ThemeBadge theme={q.theme} />
                      {q.level && <span className="dash-q-level">{levelLabels[q.level] || q.level}</span>}
                    </div>
                    <div className="dash-q-actions">
                      <button className="btn btn-sm btn-success" onClick={() => decide(q, 'approved')}>
                        <Check size={14} /> {t('dashboard.moderation.approve')}
                      </button>
                      <button className="btn btn-sm btn-danger-ghost" onClick={() => decide(q, 'rejected')}>
                        <X size={14} /> {t('dashboard.moderation.reject')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="dash-activity-foot">
            <Link className="card-link" to="/questions">{t('dashboard.moderation.manage')} <ArrowRight size={14} /></Link>
          </div>
        </div>

        {/* Col 3 — Système (carte sombre) */}
        <div className="card card-pad card-dark dash-system">
          <h3 className="card-title">{t('dashboard.misc.systemTitle')}</h3>
          <p className="card-sub" style={{ marginBottom: 6 }}>{t('dashboard.misc.systemSub')}</p>
          <div className="dash-sys-lines">
            <SysLine icon={<Server size={15} />} label={t('dashboard.system.api')} latency={apiLatency} stateLabel={t('dashboard.system.operational')} />
            <SysLine icon={<Database size={15} />} label={t('dashboard.system.database')} stateLabel={t('dashboard.system.operational')} />
            <SysLine icon={<Zap size={15} />} label={t('dashboard.system.redis')} stateLabel={t('dashboard.system.operational')} />
          </div>
          <div className="dash-sys-foot">
            <div className="dash-sys-frow">
              <RefreshCw size={14} color="rgba(255,255,255,0.5)" />
              <span className="dash-sys-flabel">{t('dashboard.system.lastSync')}</span>
              <span className="dash-sys-fval">{relativeFr(system.last_sync)}</span>
            </div>
            <div className="dash-sys-frow">
              <span className="dash-online-dot" />
              <span className="dash-sys-flabel">{t('dashboard.system.online')}</span>
              <span className="dash-sys-fval dash-sys-fval--num">{num(kpis.online_now ?? 0)}</span>
            </div>
            <div className="dash-sys-frow">
              <Server size={14} color="rgba(255,255,255,0.5)" />
              <span className="dash-sys-flabel">{t('dashboard.misc.uptime')}</span>
              <span className="dash-sys-fval">{uptimeFr(health && health.system && health.system.uptime_s)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Ligne 4 : Santé du contenu · Prochains tournois ─── */}
      <div className="grid dash-row-bottom dash-gap">
        {/* Santé du contenu */}
        <div className="card card-pad">
          <div className="dash-card-head">
            <div>
              <h3 className="card-title">{t('dashboard.contentHealth.title')}</h3>
              <p className="card-sub">{t('dashboard.misc.contentHealthSub')}</p>
            </div>
            <HeartPulse size={18} color="#2a8a4f" aria-hidden="true" />
          </div>
          {!contentHealth ? (
            <div className="dash-empty"><HeartPulse size={26} color="#9ca3af" /><span className="dash-empty-title">{t('dashboard.empty.contentHealthTitle')}</span></div>
          ) : (
            <>
              <div className="dash-health-grid">
                <Link to="/questions?health=never" className="dash-health-cell">
                  <span className="dash-health-num">{num(contentHealth.never_asked)}</span>
                  <span className="dash-health-lbl">{t('dashboard.contentHealth.neverPlayed')}</span>
                </Link>
                <Link to="/questions?health=hard" className="dash-health-cell">
                  <span className="dash-health-num dash-health-num--warn">{num(contentHealth.too_hard)}</span>
                  <span className="dash-health-lbl">{t('dashboard.misc.tooHardLabel')}</span>
                </Link>
                <Link to="/questions?health=easy" className="dash-health-cell">
                  <span className="dash-health-num dash-health-num--easy">{num(contentHealth.too_easy)}</span>
                  <span className="dash-health-lbl">{t('dashboard.misc.tooEasyLabel')}</span>
                </Link>
              </div>
              <div className="dash-health-pool">
                <div className="dash-health-pool-title">{t('dashboard.misc.poolApprovedByTheme')}</div>
                {contentHealth.pool_by_theme.map((p) => (
                  <div className="dash-pool-row" key={p.theme}>
                    <span className="dash-pool-name">
                      <span className="dash-pool-emoji" aria-hidden="true">{(themeBadgeColors[p.theme] && themeBadgeColors[p.theme].emoji) || '•'}</span>
                      {themeLabels[p.theme] || p.theme}
                    </span>
                    <span className="dash-pool-bar">
                      <span
                        className="dash-pool-fill"
                        style={{ width: `${Math.round((p.count / poolMax) * 100)}%`, background: (themeBadgeColors[p.theme] && themeBadgeColors[p.theme].fg) || '#2a8a4f' }}
                      />
                    </span>
                    <span className="dash-pool-count">{p.count}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Prochains tournois */}
        <div className="card card-pad">
          <div className="dash-card-head">
            <div>
              <h3 className="card-title">{t('dashboard.nextTournaments')}</h3>
              <p className="card-sub">{t('dashboard.misc.nextTournamentsSub')}</p>
            </div>
            <Link className="card-link" to="/tournaments">{t('dashboard.misc.all')} <ArrowRight size={14} /></Link>
          </div>
          {upcoming.length === 0 ? (
            <div className="dash-empty">
              <CalendarClock size={26} color="#9ca3af" />
              <span className="dash-empty-title">{t('dashboard.empty.tournamentsTitle')}</span>
              <span>{t('dashboard.empty.tournamentsSub')}</span>
            </div>
          ) : (
            <div className="dash-tour-list">
              {upcoming.map((tour) => {
                const cd = countdownFr(tour.starts_at);
                return (
                  <div className="dash-tour-item" key={tour.id}>
                    <span className="dash-tour-emoji" aria-hidden="true">{(themeBadgeColors[tour.theme] && themeBadgeColors[tour.theme].emoji) || '🏆'}</span>
                    <div className="dash-tour-main">
                      <button type="button" className="dash-tour-name" onClick={() => navigate(`/tournaments/${tour.id}`)}>{tour.name}</button>
                      <div className="dash-tour-meta">
                        {cd ? <span className="dash-tour-cd">⏳ {cd}</span> : <span>{dateFr(tour.starts_at, "dd MMM 'à' HH'h'mm")}</span>}
                        <span className="dash-tour-players">{num(tour.registered_players)}{tour.max_players ? ` / ${num(tour.max_players)}` : ''} {t('dashboard.misc.players')}</span>
                      </div>
                    </div>
                    <button type="button" className="btn btn-sm btn-success dash-tour-start" onClick={() => startTournament(tour)}>
                      <Play size={13} /> {t('dashboard.misc.start')}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ─── Ligne 5 : graphique d'activité full-width ─── */}
      <div className="card card-pad dash-gap">
        <div className="dash-card-head">
          <div>
            <h3 className="card-title">{t('dashboard.misc.chartTitle')}</h3>
            <p className="card-sub">{t('dashboard.misc.chartSub')}</p>
          </div>
          <div className="dash-chart-tools">
            <div className="dash-seg" role="tablist" aria-label={t('dashboard.a11y.chartType')}>
              {CHART_TYPES.map((c) => (
                <button key={c.key} type="button" className={`dash-seg-btn ${chartType === c.key ? 'is-active' : ''}`} onClick={() => setChartType(c.key)} title={t(c.i18nKey)} aria-label={t(c.i18nKey)}>
                  {c.icon}
                </button>
              ))}
            </div>
            <div className="dash-pills" role="tablist" aria-label={t('dashboard.a11y.granularity')}>
              {GRANULARITIES.map((g) => (
                <button key={g.key} type="button" className={`dash-pill ${granularity === g.key ? 'is-active' : ''}`} onClick={() => setGranularity(g.key)}>{t(g.i18nKey)}</button>
              ))}
            </div>
            <div className="dash-pills" role="tablist" aria-label={t('dashboard.a11y.period')}>
              {PERIODS.map((p) => (
                <button key={p.key} type="button" role="tab" aria-selected={period === p.key} className={`dash-pill ${period === p.key ? 'is-active' : ''}`} onClick={() => setPeriod(p.key)}>{t(p.i18nKey)}</button>
              ))}
            </div>
            <button type="button" className="dash-icon-btn" onClick={() => exportChartPng(chartRef.current, 'activite-creveton.png', t)} title={t('dashboard.a11y.exportPng')} aria-label={t('dashboard.a11y.exportPng')}>
              <Download size={15} />
            </button>
          </div>
        </div>
        <div className="dash-chart-legend dash-chart-legend--top">
          <span className="dash-legend-item"><span className="dash-legend-sw" style={{ background: '#2a8a4f' }} /> {t('dashboard.chart.signups')}</span>
          <span className="dash-legend-item"><span className="dash-legend-sw" style={{ background: '#d4a017' }} /> {t('dashboard.chart.games')}</span>
        </div>
        {loadingChart && !analytics ? (
          <Skeleton w="100%" h={220} r={12} />
        ) : hasChartData ? (
          <div ref={chartRef}>
            <ResponsiveContainer width="100%" height={220}>
              {chartType === 'bar' ? (
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef1ee" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#6b7280', fontFamily: 'Space Grotesk' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} minTickGap={16} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#6b7280', fontFamily: 'Space Grotesk' }} tickLine={false} axisLine={false} width={34} />
                  <Tooltip content={<ActivityTooltip t={t} />} cursor={{ fill: 'rgba(42,138,79,0.06)' }} />
                  <Bar dataKey="inscriptions" fill="#2a8a4f" radius={[4, 4, 0, 0]} maxBarSize={26} />
                  <Bar dataKey="parties" fill="#d4a017" radius={[4, 4, 0, 0]} maxBarSize={26} />
                </BarChart>
              ) : chartType === 'line' ? (
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef1ee" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#6b7280', fontFamily: 'Space Grotesk' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} minTickGap={16} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#6b7280', fontFamily: 'Space Grotesk' }} tickLine={false} axisLine={false} width={34} />
                  <Tooltip content={<ActivityTooltip t={t} />} cursor={{ stroke: 'rgba(42,138,79,0.25)', strokeWidth: 1 }} />
                  <Line type="monotone" dataKey="inscriptions" stroke="#2a8a4f" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="parties" stroke="#d4a017" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              ) : (
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dashGradSignups" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2a8a4f" stopOpacity={0.20} />
                      <stop offset="100%" stopColor="#2a8a4f" stopOpacity={0.01} />
                    </linearGradient>
                    <linearGradient id="dashGradGames" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#d4a017" stopOpacity={0.20} />
                      <stop offset="100%" stopColor="#d4a017" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef1ee" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#6b7280', fontFamily: 'Space Grotesk' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} minTickGap={16} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#6b7280', fontFamily: 'Space Grotesk' }} tickLine={false} axisLine={false} width={34} />
                  <Tooltip content={<ActivityTooltip t={t} />} cursor={{ stroke: 'rgba(42,138,79,0.25)', strokeWidth: 1 }} />
                  <Area type="monotone" dataKey="inscriptions" stroke="#2a8a4f" strokeWidth={2} fill="url(#dashGradSignups)" dot={false} activeDot={{ r: 4 }} />
                  <Area type="monotone" dataKey="parties" stroke="#d4a017" strokeWidth={2} fill="url(#dashGradGames)" dot={false} activeDot={{ r: 4 }} />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="dash-empty" style={{ padding: '40px 12px' }}>
            <BarChart3 size={30} color="#9ca3af" />
            <span className="dash-empty-title">{t('dashboard.empty.chartTitle')}</span>
            <span>{t('dashboard.empty.chartSub')}</span>
          </div>
        )}
      </div>

      {/* ─── Ligne 6 : Top joueurs · Répartition thèmes ─── */}
      <div className="grid dash-row-bottom dash-gap">
        {/* Top joueurs (semaine) */}
        <div className="card card-pad">
          <div className="dash-card-head">
            <div>
              <h3 className="card-title">{t('dashboard.misc.topPlayersTitle')}</h3>
              <p className="card-sub">{t('dashboard.misc.topPlayersSub')}</p>
            </div>
            <Link className="card-link" to="/classement">{t('dashboard.misc.leaderboardLink')} <ArrowRight size={14} /></Link>
          </div>
          {loadingTop && !top ? (
            <div className="dash-top-list">
              {[0, 1, 2, 3, 4].map((i) => (
                <div className="dash-top-row" key={i}>
                  <Skeleton w={24} h={24} r={12} />
                  <Skeleton w={36} h={36} r={10} />
                  <Skeleton w="40%" h={14} />
                  <Skeleton w={48} h={14} style={{ marginLeft: 'auto' }} />
                </div>
              ))}
            </div>
          ) : topPlayers.length === 0 ? (
            <div className="dash-empty">
              <Trophy size={26} color="#9ca3af" />
              <span className="dash-empty-title">{t('dashboard.empty.topPlayersTitle')}</span>
              <span>{t('dashboard.empty.topPlayersSub')}</span>
            </div>
          ) : (
            <div className="dash-top-list">
              {topPlayers.map((p, i) => (
                <div className="dash-top-row" key={p.user_id || i}>
                  <span
                    className={`dash-rank ${i < 3 ? 'dash-rank--medal' : ''}`}
                    style={i < 3 ? { background: MEDAL[i], color: '#fff' } : undefined}
                  >
                    {p.rank ?? i + 1}
                  </span>
                  <Avatar name={p.name} size="sm" />
                  <span className="dash-top-name">{p.name}{p.ville ? <span className="dash-top-city"> · {p.ville}</span> : null}</span>
                  <span className="dash-top-score">{num(p.score ?? 0)} {t('dashboard.misc.pts')}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Répartition thèmes (donut dérivé des parties récentes) */}
        <div className="card card-pad">
          <div className="dash-card-head">
            <div>
              <h3 className="card-title">{t('dashboard.misc.themeDistTitle')}</h3>
              <p className="card-sub">{t('dashboard.misc.themeDistSub')}</p>
            </div>
            <PieIcon size={18} color="#2a8a4f" aria-hidden="true" />
          </div>
          {themeDist.total === 0 ? (
            <div className="dash-empty">
              <PieIcon size={26} color="#9ca3af" />
              <span className="dash-empty-title">{t('dashboard.empty.themeDistTitle')}</span>
              <span>{t('dashboard.empty.themeDistSub')}</span>
            </div>
          ) : (
            <div className="dash-donut-wrap">
              <div className="dash-donut">
                <ResponsiveContainer width={160} height={160}>
                  <PieChart>
                    <Pie
                      data={themeDist.slices}
                      dataKey="count"
                      nameKey="label"
                      innerRadius={48}
                      outerRadius={72}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {themeDist.slices.map((s) => <Cell key={s.theme} fill={s.color} />)}
                    </Pie>
                    <Tooltip formatter={(value, name) => [`${num(value)} ${t('dashboard.misc.gamesLabel')}`, name]} contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', fontFamily: 'Space Grotesk', fontSize: 13 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="dash-donut-center">
                  <span className="dash-donut-num">{num(themeDist.total)}</span>
                  <span className="dash-donut-lbl">{t('dashboard.misc.gamesLabel')}</span>
                </div>
              </div>
              <ul className="dash-donut-legend">
                {themeDist.slices.map((s) => (
                  <li key={s.theme}>
                    <span className="dash-legend-sw" style={{ background: s.color }} />
                    <span className="dash-donut-leg-label">{s.label}</span>
                    <span className="dash-donut-leg-pct">{s.pct}%</span>
                    <span className="dash-donut-leg-count">{num(s.count)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
