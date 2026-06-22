import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import Papa from 'papaparse';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Search, Eye, UserX, KeyRound, Trash2, UserPlus, ShieldCheck, Mail,
  Download, MoreVertical, Copy, Check,
} from 'lucide-react';
import usersService from '../services/users.service';
import sessionsService from '../services/sessions.service';
import { useApiData } from '../hooks/useApiData';
import i18n from '../i18n';
import { useAuthStore } from '../store/authStore';
import { USER_STATUS_KEYS } from '../constants/enums';
import { themeBadgeColors, levelLabels } from '../constants/theme';
import {
  num, dateFr, dateTimeFr, isToday, dayKey, lastDays,
} from '../utils/format';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import Drawer from '../components/Drawer';
import Modal from '../components/Modal';
import Avatar from '../components/Avatar';
import { Skeleton } from '../components/Skeleton';
import EmptyState from '../components/EmptyState';
import { notify } from '../components/Toast';
import './Utilisateurs.css';

const EMPTY_FILTERS = { ville: '', level: '', status: '', q: '', period: '', quick: 'all' };
const LEVELS = [1, 2, 3, 4, 5];
const FALLBACK_VILLES = ['Douala', 'Yaoundé', 'Bafoussam', 'Garoua', 'Kribi', 'Bertoua'];

// Bandes d'XP cumulées + métadonnées de niveau (1 → 5).
const LEVEL_XP = [0, 200, 500, 1200, 3000];
const LEVEL_META = [
  { name: 'Novice', color: '#6b7280', bg: '#f3f4f6', icon: '🌱' },
  { name: 'Apprenti', color: '#3b82f6', bg: '#e6f0ff', icon: '📘' },
  { name: 'Joueur', color: '#2a8a4f', bg: '#dcfce7', icon: '🎮' },
  { name: 'Expert', color: '#f59e0b', bg: '#fff4e0', icon: '🔥' },
  { name: 'Champion', color: '#d4a017', bg: '#fdf6e3', icon: '👑' },
];
const levelMeta = (lvl) => LEVEL_META[Math.min(Math.max(Number(lvl) || 1, 1), 5) - 1];

const INVITE_ROLES = ['moderator', 'admin'];
const ASSIGNABLE_ROLES = ['player', 'moderator', 'admin'];
// value → clé i18n (libellés résolus via t() au rendu).
const SUSPEND_DURATIONS = [
  { value: '1j', tKey: '1d' },
  { value: '7j', tKey: '7d' },
  { value: '30j', tKey: '30d' },
  { value: 'indef', tKey: 'indefinite' },
];
const QUICK_FILTERS = ['all', 'active', 'inactive', 'suspended', 'admins'];

const DAY = 86400000;

/** Config de thème depuis une clé réelle (parties), avec repli gracieux. */
function themeCfgByKey(key) {
  return themeBadgeColors[key] || { label: key || 'Thème', icon: '🎯', bg: '#f3f4f6', fg: '#6b7280' };
}

/** Vrai si un compte est administrateur (badge doré). */
function isAdminRole(role) {
  return role === 'admin' || role === 'super_admin';
}

/** Largeur (%) de la barre d'XP dans la bande du niveau courant. */
function levelProgress(level, xp) {
  if (level >= 5) return { pct: 100, remaining: 0, start: LEVEL_XP[4], end: LEVEL_XP[4], max: true };
  const start = LEVEL_XP[level - 1] ?? 0;
  const end = LEVEL_XP[level] ?? start + 1;
  const ratio = ((xp - start) / (end - start)) * 100;
  return {
    pct: Math.round(Math.max(0, Math.min(100, ratio))),
    remaining: Math.max(0, end - xp),
    start,
    end,
    max: false,
  };
}

/** Temps relatif FR ("il y a 3 h"). Renvoie '—' si date absente. */
function relativeFr(iso) {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const diff = Date.now() - t;
  if (diff < 0) return dateFr(iso);
  const min = Math.round(diff / 60000);
  if (min < 1) return i18n.t('common.justNow');
  if (min < 60) return i18n.t('common.agoMinutes', { n: min });
  const h = Math.round(min / 60);
  if (h < 24) return i18n.t('common.agoHours', { n: h });
  const d = Math.round(h / 24);
  if (d < 30) return i18n.t('common.agoDays', { n: d });
  const mo = Math.round(d / 30);
  if (mo < 12) return i18n.t('common.agoMonths', { n: mo });
  return i18n.t('common.agoYears', { n: Math.round(mo / 12) });
}

/** Agrège les vraies parties d'un joueur en métriques de fiche. */
function deriveStats(sessions) {
  const games = sessions.length;
  const totalScore = sessions.reduce((a, s) => a + (Number(s.score) || 0), 0);
  const totalQ = sessions.reduce((a, s) => a + (Number(s.question_count) || 0), 0);
  const totalCorrect = sessions.reduce((a, s) => a + (Number(s.correct_count) || 0), 0);
  const themeMap = {};
  sessions.forEach((s) => {
    if (!s.theme) return;
    themeMap[s.theme] = themeMap[s.theme] || { correct: 0, total: 0 };
    themeMap[s.theme].correct += Number(s.correct_count) || 0;
    themeMap[s.theme].total += Number(s.question_count) || 0;
  });
  const themePerf = Object.entries(themeMap)
    .map(([key, v]) => ({ key, rate: v.total ? Math.round((100 * v.correct) / v.total) : 0 }))
    .sort((a, b) => b.rate - a.rate);
  // Streak max : plus longue série chronologique de parties ≥ 70 % de réussite.
  const chrono = [...sessions].sort((a, b) => new Date(a.played_at) - new Date(b.played_at));
  let run = 0;
  let maxStreak = 0;
  chrono.forEach((s) => {
    const r = (Number(s.question_count) || 0) ? s.correct_count / s.question_count : 0;
    if (r >= 0.7) { run += 1; maxStreak = Math.max(maxStreak, run); } else run = 0;
  });
  return {
    games,
    avgScore: games ? Math.round(totalScore / games) : 0,
    successRate: totalQ ? Math.round((100 * totalCorrect) / totalQ) : 0,
    themePerf,
    maxStreak,
    chrono,
  };
}

/** Construit la heatmap des 30 derniers jours (réelle, depuis played_at) — les
 *  jours sont bucketés dans le fuseau de l'admin (dayKey/lastDays). */
function buildHeatmap(sessions) {
  const counts = {};
  sessions.forEach((s) => {
    const key = dayKey(s.played_at);
    if (key) counts[key] = (counts[key] || 0) + 1;
  });
  return lastDays(30).map(({ key, label }) => ({ key, label, count: counts[key] || 0 }));
}
const heatLevel = (c) => (c === 0 ? 0 : c <= 2 ? 1 : c <= 5 ? 2 : 3);

/** Applique les filtres période + pills rapides (fonction pure module — l'horloge
 *  est lue ici, hors du rendu React, pour respecter react-hooks/purity). */
function applyClientFilters(rows, period, quick) {
  const now = Date.now();
  return rows.filter((u) => {
    if (period === 'today' && !isToday(u.created_at)) return false;
    if (period === '7d' && now - new Date(u.created_at).getTime() > 7 * DAY) return false;
    if (period === '30d' && now - new Date(u.created_at).getTime() > 30 * DAY) return false;
    const la = u.last_active_at ? new Date(u.last_active_at).getTime() : null;
    if (quick === 'active' && !(la && now - la <= 7 * DAY)) return false;
    if (quick === 'inactive' && la && now - la <= 30 * DAY) return false;
    if (quick === 'suspended' && !(u.status === 'suspended' || u.status === 'banned')) return false;
    if (quick === 'admins' && !isAdminRole(u.role)) return false;
    return true;
  });
}

/* ---------- Badges ---------- */
function RoleBadge({ role }) {
  const { t } = useTranslation();
  if (role === 'super_admin') return <span className="u-role-badge u-role-super">👑 {t('users.roles.super_admin')}</span>;
  if (role === 'admin') return <span className="u-role-badge u-role-admin">🛡 {t('users.roles.admin')}</span>;
  if (role === 'moderator') return <span className="u-role-badge u-role-mod">🛡 {t('users.roles.moderator')}</span>;
  return <span className="u-role-badge u-role-player">🎮 {t('users.roles.player')}</span>;
}

function StatusDot({ status }) {
  const { t } = useTranslation();
  const map = {
    active: ['active', 'u-st-active'],
    suspended: ['suspended', 'u-st-susp'],
    banned: ['banned', 'u-st-ban'],
  };
  const [statusKey, cls] = map[status] || ['inactive', 'u-st-inactive'];
  return <span className={`u-status ${cls}`}><span className="u-status-dot" />{t(`users.statuses.${statusKey}`)}</span>;
}

function LevelPill({ level }) {
  const { t } = useTranslation();
  const m = levelMeta(level);
  return (
    <span className="u-level-pill" style={{ background: m.bg, color: m.color }}>
      {t('users.misc.levelShort', { level })} {t(`users.levels.${level}`)}
    </span>
  );
}

/* ---------- Onglet Profil ---------- */
function ProfilTab({ user, detail, copyCode, copied }) {
  const { t } = useTranslation();
  const d = detail || user;
  const suspended = user.status === 'suspended' || user.status === 'banned';
  const verified = d.phone_verified;
  return (
    <div className="stack" style={{ gap: 22 }}>
      <section>
        <div className="u-section-title">{t('users.drawer.information')}</div>
        <dl className="u-kv">
          <div><dt>{t('users.fields.email')}</dt><dd>{d.email || '—'}</dd></div>
          <div><dt>{t('users.columns.contact')}</dt><dd>{d.phone ? <span className="u-phone"><span className="u-flag">🇨🇲</span>{d.phone}</span> : '—'}</dd></div>
          <div><dt>{t('users.fields.city')}</dt><dd>{d.ville || '—'}</dd></div>
          <div><dt>{t('users.fields.age')}</dt><dd>{d.age ?? '—'}</dd></div>
          <div><dt>{t('users.fields.gender')}</dt><dd>{d.sexe ?? '—'}</dd></div>
          <div><dt>{t('users.fields.language')}</dt><dd>{(d.lang || 'fr').toUpperCase()}</dd></div>
          <div><dt>{t('users.columns.createdAt')}</dt><dd>{dateFr(d.created_at)}</dd></div>
          <div><dt>{t('users.fields.lastActivity')}</dt><dd title={d.last_active_at ? dateTimeFr(d.last_active_at) : undefined}>{relativeFr(d.last_active_at)}</dd></div>
        </dl>
      </section>

      <section>
        <div className="u-section-title">{t('users.drawer.account')}</div>
        <div className="u-account">
          <div className="u-account-row">
            <span className="u-account-k">{t('users.columns.status')}</span>
            <StatusDot status={user.status} />
          </div>
          {d.referral_code && (
            <div className="u-account-row">
              <span className="u-account-k">{t('users.drawer.referralCode')}</span>
              <button className="u-copy-pill" onClick={() => copyCode(d.referral_code)} title={t('users.drawer.copy')}>
                {copied ? <Check size={13} /> : <Copy size={13} />} {d.referral_code}
              </button>
            </div>
          )}
          {suspended && (
            <div className="u-suspension">
              {user.status === 'banned' ? t('users.misc.accountBanned') : t('users.misc.accountSuspended')} {t('users.misc.reasonNotLogged')}
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="u-section-title">{t('users.drawer.security')}</div>
        <div className="u-account">
          <div className="u-account-row">
            <span className="u-account-k">{t('users.columns.role')}</span>
            <RoleBadge role={d.role} />
          </div>
          <div className="u-account-row">
            <span className="u-account-k">{t('users.columns.contact')}</span>
            <span className={verified ? 'u-verified' : 'u-unverified'}>
              {verified ? t('users.drawer.phoneVerified') : t('users.drawer.phoneNotVerified')}
            </span>
          </div>
          <div className="u-account-row">
            <span className="u-account-k">{t('users.drawer.lastLogin')}</span>
            <span>{d.last_active_at ? dateTimeFr(d.last_active_at) : '—'}</span>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ---------- Onglet Progression ---------- */
function ProgressionTab({ user, sessions, loading }) {
  const { t } = useTranslation();
  const prog = levelProgress(user.level, user.total_xp);
  const m = levelMeta(user.level);
  const stats = useMemo(() => deriveStats(sessions), [sessions]);
  const nextLevel = user.level < 5 ? user.level + 1 : null;
  const nextName = nextLevel ? t(`users.levels.${nextLevel}`) : null;
  const lineData = useMemo(
    () => stats.chrono.slice(-8).map((s, i) => ({ i: i + 1, score: Number(s.score) || 0 })),
    [stats.chrono],
  );

  if (loading) return <div className="stack" style={{ gap: 16 }}>{[0, 1, 2].map((i) => <Skeleton key={i} w="100%" h={i === 0 ? 120 : 80} r={12} />)}</div>;

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="u-level-hero">
        <div className="u-level-medal" style={{ background: m.bg, color: m.color }}>{m.icon}</div>
        <div className="u-level-hero-title">{t('users.drawer.level')} {user.level} — {t(`users.levels.${user.level}`)}</div>
      </div>

      <div>
        <div className="u-xp-row">
          <span className="u-xp-current">{num(user.total_xp)} XP</span>
          <span className="u-xp-max">{prog.max ? t('users.misc.max') : `${num(prog.end)} XP`}</span>
        </div>
        <div className="u-xp-bar"><span style={{ width: `${prog.pct}%` }} /></div>
        <div className="u-xp-hint">
          {prog.max ? t('users.drawer.maxLevel') : t('users.drawer.xpToNext', { xp: num(prog.remaining) })}
        </div>
      </div>

      {!prog.max && (
        <div className="u-next-reward">
          {t('users.misc.nextReward', { name: nextName, badge: nextLevel === 5 ? t('users.misc.badgeGold') : t('users.misc.badgeHigher') })}
        </div>
      )}

      <div className="u-stat-grid">
        <div className="u-stat"><div className="u-stat-k">🎯 {t('users.drawer.games')}</div><div className="u-stat-v">{num(stats.games)}</div></div>
        <div className="u-stat"><div className="u-stat-k">⭐ {t('users.drawer.avgScore')}</div><div className="u-stat-v">{num(stats.avgScore)}</div></div>
        <div className="u-stat"><div className="u-stat-k">📈 {t('users.drawer.successRate')}</div><div className="u-stat-v">{stats.successRate} %</div></div>
        <div className="u-stat"><div className="u-stat-k">🔥 {t('users.drawer.maxStreak')}</div><div className="u-stat-v">{num(stats.maxStreak)}</div></div>
      </div>

      <div>
        <div className="u-section-title">{t('users.drawer.scoreEvolution')}</div>
        {lineData.length >= 2 ? (
          <div className="u-chart">
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={lineData} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
                <XAxis dataKey="i" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={42} />
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 12 }}
                  labelFormatter={(l) => `${t('common.games')} ${l}`}
                  formatter={(v) => [`${v} ${t('common.pts')}`, t('common.score')]}
                />
                <Line type="monotone" dataKey="score" stroke="#2a8a4f" strokeWidth={2.5} dot={{ r: 3, fill: '#2a8a4f' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : <p className="muted u-empty-note">{t('users.empty.notEnoughGames')}</p>}
      </div>

      <div>
        <div className="u-section-title">{t('users.drawer.performanceByTheme')}</div>
        {stats.themePerf.length ? (
          <div className="u-theme-perf">
            {stats.themePerf.map((tp) => {
              const cfg = themeCfgByKey(tp.key);
              return (
                <div className="u-theme-row" key={tp.key}>
                  <span className="u-theme-name">{cfg.icon} {cfg.label}</span>
                  <span className="u-theme-track"><span className="u-theme-fill" style={{ width: `${tp.rate}%`, background: cfg.fg }} /></span>
                  <span className="u-theme-pct">{tp.rate}%</span>
                </div>
              );
            })}
          </div>
        ) : <p className="muted u-empty-note">{t('users.empty.noThemeData')}</p>}
      </div>
    </div>
  );
}

/* ---------- Onglet Historique ---------- */
function HistoriqueTab({ sessions, loading }) {
  const { t } = useTranslation();
  const [theme, setTheme] = useState('');
  const themes = useMemo(() => [...new Set(sessions.map((s) => s.theme).filter(Boolean))], [sessions]);
  const list = useMemo(() => {
    const base = theme ? sessions.filter((s) => s.theme === theme) : sessions;
    return [...base].sort((a, b) => new Date(b.played_at) - new Date(a.played_at)).slice(0, 10);
  }, [sessions, theme]);

  if (loading) {
    return (
      <div className="stack" style={{ gap: 12 }}>
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} w="100%" h={72} r={12} />)}
      </div>
    );
  }
  if (!sessions.length) {
    return <EmptyState title={t('users.empty.noGamesTitle')} subtitle={t('users.empty.noGamesSubtitle')} />;
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div>
        <div className="u-section-title">{t('users.drawer.last10Games')}</div>
        <div className="u-hist-pills">
          <button className={`u-pill ${!theme ? 'on' : ''}`} onClick={() => setTheme('')}>{t('users.filters.all')}</button>
          {themes.map((th) => {
            const cfg = themeCfgByKey(th);
            return <button key={th} className={`u-pill ${theme === th ? 'on' : ''}`} onClick={() => setTheme(th)}>{cfg.icon} {cfg.label}</button>;
          })}
        </div>
      </div>
      {list.map((g) => {
        const cfg = themeCfgByKey(g.theme);
        const total = Number(g.question_count) || 0;
        const correct = Number(g.correct_count) || 0;
        const rate = total ? correct / total : 0;
        const mark = rate > 0.7 ? ['✓', 'good'] : rate < 0.5 ? ['✗', 'bad'] : ['○', 'mid'];
        return (
          <div className="u-hist-card" key={g.id} style={{ borderLeftColor: cfg.fg }}>
            <div className="u-hist-top">
              <span className="u-hist-theme">{cfg.icon} {cfg.label} · {levelLabels[g.level] || g.level}</span>
              <span className={`u-hist-mark u-mark-${mark[1]}`}>{mark[0]} {correct}/{total}</span>
            </div>
            <div className="u-hist-mid">{t('common.score')} : {num(g.score)} {t('common.pts')} · XP : +{num(g.xp_earned)}</div>
            <div className="u-hist-bot">{relativeFr(g.played_at)}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Onglet Activité ---------- */
function ActiviteTab({ sessions, loading }) {
  const { t } = useTranslation();
  const heat = useMemo(() => buildHeatmap(sessions), [sessions]);
  const recent = useMemo(
    () => [...sessions].sort((a, b) => new Date(b.played_at) - new Date(a.played_at)).slice(0, 8),
    [sessions],
  );

  if (loading) return <div className="stack" style={{ gap: 16 }}>{[0, 1].map((i) => <Skeleton key={i} w="100%" h={120} r={12} />)}</div>;

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div>
        <div className="u-section-title">{t('users.drawer.activityHeatmap')}</div>
        <div className="u-heatmap">
          {heat.map((d) => (
            <span
              key={d.key}
              className={`u-heat-cell u-heat-${heatLevel(d.count)}`}
              title={t('users.misc.gamesOnDay', { count: d.count, date: d.label })}
            />
          ))}
        </div>
        <div className="u-heat-legend">
          <span>{t('users.misc.heatLess')}</span>
          <span className="u-heat-cell u-heat-0" />
          <span className="u-heat-cell u-heat-1" />
          <span className="u-heat-cell u-heat-2" />
          <span className="u-heat-cell u-heat-3" />
          <span>{t('users.misc.heatMore')}</span>
        </div>
      </div>

      <div>
        <div className="u-section-title">{t('users.drawer.recentSessions')}</div>
        {recent.length ? (
          <div className="u-sessions-list">
            {recent.map((s) => {
              const cfg = themeCfgByKey(s.theme);
              return (
                <div className="u-session-row" key={s.id}>
                  <span className="u-session-when" title={dateTimeFr(s.played_at)}>{dateFr(s.played_at)}</span>
                  <span className="u-session-theme">{cfg.icon} {cfg.label}</span>
                  <span className="u-session-score">{num(s.score)} {t('common.pts')}</span>
                </div>
              );
            })}
          </div>
        ) : <p className="muted u-empty-note">{t('users.empty.noRecentSessions')}</p>}
      </div>

      <div>
        <div className="u-section-title">{t('users.drawer.reports')}</div>
        <p className="muted u-empty-note">{t('users.drawer.noReports')}</p>
      </div>
    </div>
  );
}

/* ---------- Menu contextuel d'une ligne ---------- */
function RowMenu({ user, onView, onMessage, onSuspend, onRole, onDelete }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <span className="u-rowmenu">
      <button className="icon-action" title={t('users.columns.actions')} onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>
        <MoreVertical size={17} />
      </button>
      {open && (
        <>
          <button className="u-menu-backdrop" aria-label={t('common.close')} onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
          <div className="u-menu" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => { setOpen(false); onView(user); }}><Eye size={14} /> {t('users.actions.view')}</button>
            <button onClick={() => { setOpen(false); onMessage(user); }}><Mail size={14} /> {t('users.actions.message')}</button>
            <button onClick={() => { setOpen(false); onSuspend(user); }}><UserX size={14} /> {t('users.actions.suspend')}</button>
            {onRole && <button onClick={() => { setOpen(false); onRole(user); }}><ShieldCheck size={14} /> {t('users.actions.changeRole')}</button>}
            <button className="danger" onClick={() => { setOpen(false); onDelete(user); }}><Trash2 size={14} /> {t('users.actions.delete')}</button>
          </div>
        </>
      )}
    </span>
  );
}

/* ---------- Formulaires (message / invitation) ---------- */
function MessageForm({ onSubmit }) {
  const { t } = useTranslation();
  const { register, handleSubmit } = useForm({ defaultValues: { subject: '', body: '' } });
  return (
    <form id="message-form" onSubmit={handleSubmit(onSubmit)}>
      <div className="field">
        <label>{t('users.fields.subject')} <span className="muted" style={{ fontWeight: 400 }}>{t('users.misc.optional')}</span></label>
        <input className="input" placeholder={t('users.placeholder.subject')} {...register('subject')} />
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>{t('users.fields.message')}</label>
        <textarea className="textarea" placeholder={t('users.placeholder.message')} {...register('body', { required: true })} />
      </div>
    </form>
  );
}

function InviteForm({ onSubmit }) {
  const { t } = useTranslation();
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: { email: '', name: '', role: 'moderator' },
  });
  return (
    <form id="invite-form" onSubmit={handleSubmit(onSubmit)}>
      <div className="field">
        <label>{t('users.fields.fullName')}</label>
        <input className="input" placeholder={t('users.placeholder.fullName')} {...register('name', { required: t('users.validation.nameRequired'), minLength: { value: 2, message: t('users.validation.nameMinLength') } })} />
        {errors.name && <span className="field-error">{errors.name.message}</span>}
      </div>
      <div className="field">
        <label>{t('users.fields.email')}</label>
        <input className="input" type="email" placeholder="admin@creveton.cm" {...register('email', { required: t('users.validation.emailRequired'), pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: t('users.validation.emailInvalid') } })} />
        {errors.email && <span className="field-error">{errors.email.message}</span>}
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>{t('users.columns.role')}</label>
        <select className="select" {...register('role')}>
          {INVITE_ROLES.map((r) => <option key={r} value={r}>{t(`users.roles.${r}`)}</option>)}
        </select>
      </div>
    </form>
  );
}

/* ---------- Contenu du Drawer (header sombre + onglets) ---------- */
function DrawerBody({ user, tab, setTab, onMessage, onSuspend, onReset }) {
  const { t } = useTranslation();
  const { data: detailData } = useApiData(() => usersService.get(user.id), [user.id]);
  const { data: sessData, loading: sessLoading } = useApiData(
    () => sessionsService.list({ user_id: user.id }),
    [user.id],
  );
  const sessions = useMemo(() => sessData?.data || [], [sessData]);
  const detail = detailData || null;
  const stats = useMemo(() => deriveStats(sessions), [sessions]);
  const [copied, setCopied] = useState(false);

  const copyCode = (code) => {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      notify.success(t('toast.copied'));
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => notify.error(t('users.notify.copyFailed')));
  };

  return (
    <>
      <div className="u-drawer-head">
        <div className="u-dh-top">
          <Avatar name={user.name} size="lg" />
          <div className="u-dh-id">
            <div className="u-dh-name">{user.name}</div>
            <div className="u-dh-badges"><RoleBadge role={user.role} /><StatusDot status={user.status} /></div>
            <div className="u-dh-contact">
              <span>{user.email}</span>
              {user.phone && <span>· {user.phone}</span>}
            </div>
          </div>
        </div>
        <div className="u-dh-metrics">
          <div><span className="u-dh-mv">{sessLoading ? '—' : num(stats.games)}</span><span className="u-dh-ml">{t('common.games')}</span></div>
          <div><span className="u-dh-mv">{sessLoading ? '—' : num(stats.avgScore)}</span><span className="u-dh-ml">{t('sessions.kpi.avgScore')}</span></div>
          <div><span className="u-dh-mv">{t('users.misc.levelShort', { level: user.level })}</span><span className="u-dh-ml">{t(`users.levels.${user.level}`)}</span></div>
        </div>
        <div className="u-dh-quick">
          <button className="btn btn-ghost-soft" onClick={() => onMessage(user)}><Mail size={14} /> {t('users.actions.message')}</button>
          <button className="btn btn-ghost-soft" onClick={() => onSuspend(user)}><UserX size={14} /> {t('users.drawer.suspend')}</button>
          <button className="btn btn-ghost-soft" onClick={() => onReset(user)}><KeyRound size={14} /> {t('users.drawer.resetPassword')}</button>
        </div>
      </div>

      <div className="u-tabs">
        {['profil', 'progression', 'historique', 'activite'].map((tk) => (
          <button key={tk} className={`u-tab ${tab === tk ? 'active' : ''}`} onClick={() => setTab(tk)}>
            {tk === 'profil' ? t('users.drawer.profile') : tk === 'progression' ? t('users.drawer.progression') : tk === 'historique' ? t('users.drawer.history') : t('users.drawer.activity')}
          </button>
        ))}
      </div>

      <div className="u-tab-body">
        {tab === 'profil' && <ProfilTab user={user} detail={detail} copyCode={copyCode} copied={copied} />}
        {tab === 'progression' && <ProgressionTab user={user} sessions={sessions} loading={sessLoading} />}
        {tab === 'historique' && <HistoriqueTab sessions={sessions} loading={sessLoading} />}
        {tab === 'activite' && <ActiviteTab sessions={sessions} loading={sessLoading} />}
      </div>
    </>
  );
}

/* ---------- Page ---------- */
export default function Utilisateurs() {
  const { t } = useTranslation();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState('profil');
  const [suspendFor, setSuspendFor] = useState(null);
  const [suspendDuration, setSuspendDuration] = useState('7j');
  const [suspendReason, setSuspendReason] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [tempPassword, setTempPassword] = useState('');
  const [messageFor, setMessageFor] = useState(null);
  const [messaging, setMessaging] = useState(false);
  const [roleFor, setRoleFor] = useState(null);

  const isSuperAdmin = useAuthStore((s) => s.role)() === 'super_admin';

  const { data, loading, refetch } = useApiData(
    () => usersService.list(filters),
    [filters.ville, filters.level, filters.status, filters.q],
  );
  const rows = useMemo(() => data?.data || [], [data]);

  const { data: statsData, loading: statsLoading, refetch: refetchStats } = useApiData(
    () => usersService.stats(),
    [],
  );
  const stats = statsData || {};

  // Filtres période + pills rapides, appliqués côté client.
  const filtered = useMemo(
    () => applyClientFilters(rows, filters.period, filters.quick),
    [rows, filters.period, filters.quick],
  );

  const setF = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

  const villes = useMemo(() => {
    const found = [...new Set(rows.map((u) => u.ville).filter(Boolean))].sort();
    return found.length ? found : FALLBACK_VILLES;
  }, [rows]);

  const openSelected = (u) => { setSelected(u); setTab('profil'); };

  /* Actions de modération */
  const submitSuspend = async () => {
    if (!suspendFor) return;
    if (suspendReason.trim().length < 10) { notify.error(t('users.validation.reasonRequired')); return; }
    const dur = SUSPEND_DURATIONS.find((d) => d.value === suspendDuration);
    const durationLabel = dur ? t(`users.drawer.suspendDuration.${dur.tKey}`) : '';
    const reason = [suspendReason.trim(), durationLabel && t('users.misc.durationLabel', { duration: durationLabel })].filter(Boolean).join(' — ');
    try {
      await usersService.suspend(suspendFor.id, reason);
      notify.success(t('toast.suspended'));
      setSuspendFor(null); setSuspendReason(''); setSelected(null);
      refetch(); refetchStats();
    } catch { notify.error(t('users.notify.suspendFailed')); }
  };

  const doResetPassword = async (u) => {
    if (!window.confirm(t('users.confirm.resetPassword', { name: u.name }))) return;
    try {
      await usersService.resetPassword(u.id);
      notify.success(t('users.notify.resetSent'));
    } catch { notify.error(t('users.notify.resetFailed')); }
  };

  const doChangeRole = async (u, role) => {
    if (!role || role === u.role) { setRoleFor(null); return; }
    try {
      await usersService.changeRole(u.id, role);
      notify.success(t('users.notify.roleChanged', { name: u.name, role: t(`users.roles.${role}`) }));
      setSelected((s) => (s ? { ...s, role } : s));
      setRoleFor(null);
      refetch();
    } catch { notify.error(t('users.notify.roleFailed')); }
  };

  const doRemove = async (u) => {
    if (!window.confirm(t('users.confirm.delete', { name: u.name }))) return;
    const typed = window.prompt(t('users.confirm.deletePrompt'));
    if (typed !== t('users.confirm.deleteKeyword')) { notify.error(t('users.notify.deleteCancelled')); return; }
    try {
      await usersService.remove(u.id);
      notify.success(t('users.notify.deleted'));
      setSelected(null); refetch(); refetchStats();
    } catch { notify.error(t('users.notify.deleteFailed')); }
  };

  const submitInvite = async (payload) => {
    setInviting(true);
    try {
      const res = await usersService.invite(payload);
      setTempPassword(res.temporary_password || '');
      notify.success(t('users.notify.accountCreated', { password: res.temporary_password }));
      refetch(); refetchStats();
    } catch { notify.error(t('users.notify.inviteFailed')); } finally { setInviting(false); }
  };
  const closeInvite = () => { setShowInvite(false); setTempPassword(''); };

  const submitMessage = async ({ subject, body }) => {
    if (!messageFor) return;
    setMessaging(true);
    try {
      await usersService.message(messageFor.id, { subject: subject?.trim(), body: body.trim() });
      notify.success(t('toast.messageSent'));
      setMessageFor(null);
    } catch {
      const params = [subject ? `subject=${encodeURIComponent(subject)}` : '', body ? `body=${encodeURIComponent(body)}` : ''].filter(Boolean).join('&');
      notify.error(t('users.notify.messageMailFallback'));
      window.location.href = `mailto:${messageFor.email}${params ? `?${params}` : ''}`;
      setMessageFor(null);
    } finally { setMessaging(false); }
  };

  const exportCsv = () => {
    if (!filtered.length) { notify.error(t('users.notify.nothingToExport')); return; }
    const csv = Papa.unparse(filtered.map((u) => ({
      [t('users.csv.name')]: u.name,
      [t('users.csv.email')]: u.email,
      [t('users.csv.phone')]: u.phone || '',
      [t('users.csv.city')]: u.ville || '',
      [t('users.csv.level')]: u.level,
      [t('users.csv.xp')]: u.total_xp,
      [t('users.csv.games')]: u.sessions_played ?? 0,
      [t('users.csv.avgScore')]: u.avg_score ?? 0,
      [t('users.csv.createdAt')]: dateFr(u.created_at),
    })));
    // BOM (\uFEFF) en tête pour qu'Excel ouvre l'UTF-8 correctement.
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `utilisateurs-creveton-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    notify.success(t('users.notify.exported', { count: filtered.length }));
  };

  const columns = [
    {
      accessorKey: 'name',
      header: t('users.columns.player'),
      cell: ({ row }) => {
        const u = row.original;
        return (
          <div className="u-cell-player">
            <Avatar name={u.name} size="sm" />
            <div className="u-id">
              <span className="u-id-line">
                <span className="cell-strong u-id-name">{u.name}</span>
                {isAdminRole(u.role) && <span className="badge badge-admin" title={t(`users.roles.${u.role}`)}><ShieldCheck size={11} /> {t('users.roles.admin')}</span>}
              </span>
              <span className="list-sub u-id-mail">{u.email}</span>
            </div>
          </div>
        );
      },
    },
    {
      id: 'contact',
      header: t('users.columns.contact'),
      enableSorting: false,
      cell: ({ row }) => {
        const u = row.original;
        return (
          <div className="u-contact">
            {u.phone ? <span className="u-phone"><span className="u-flag">🇨🇲</span>{u.phone}</span> : <span className="muted">—</span>}
            <span className="u-contact-city">📍 {u.ville || '—'}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'level',
      header: t('users.columns.level'),
      cell: ({ row }) => {
        const u = row.original;
        const prog = levelProgress(u.level, u.total_xp);
        return (
          <div className="u-levelcell">
            <LevelPill level={u.level} />
            <span className="u-xp-mini"><span style={{ width: `${prog.pct}%`, background: levelMeta(u.level).color }} /></span>
            <span className="u-xp-mini-label">{num(u.total_xp)}{prog.max ? '' : ` / ${num(prog.end)}`} XP</span>
          </div>
        );
      },
    },
    {
      id: 'activity',
      header: t('users.columns.activity'),
      enableSorting: false,
      cell: ({ row }) => {
        const u = row.original;
        return (
          <div className="u-activity">
            <span className="u-act-main">{num(u.sessions_played ?? 0)} {t('common.games')}</span>
            <span className="u-act-sub">{t('users.misc.avgPts', { value: num(u.avg_score ?? 0) })}</span>
            <span className="u-act-last">{u.last_played_at ? relativeFr(u.last_played_at) : t('users.misc.never')}</span>
          </div>
        );
      },
    },
    { accessorKey: 'status', header: t('users.columns.status'), cell: (c) => <StatusDot status={c.getValue()} /> },
    { accessorKey: 'role', header: t('users.columns.role'), cell: (c) => <RoleBadge role={c.getValue()} /> },
    {
      accessorKey: 'created_at',
      header: t('users.columns.createdAt'),
      cell: (c) => <span title={relativeFr(c.getValue())}>{dateFr(c.getValue())}</span>,
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="u-actions">
          <button className="icon-action" title={t('common.view')} onClick={(e) => { e.stopPropagation(); openSelected(row.original); }}>
            <Eye size={17} />
          </button>
          <RowMenu
            user={row.original}
            onView={openSelected}
            onMessage={setMessageFor}
            onSuspend={setSuspendFor}
            onRole={isSuperAdmin ? setRoleFor : null}
            onDelete={doRemove}
          />
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t('users.title')}
        description={t('users.subtitle')}
        actions={(
          <>
            <button className="btn btn-ghost" onClick={exportCsv} title={t('common.export')}>
              <Download size={16} /> {t('users.exportCsv')}
            </button>
            <button className="btn btn-primary" onClick={() => setShowInvite(true)}>
              <UserPlus size={16} /> {t('users.inviteAdmin')}
            </button>
          </>
        )}
      />

      {/* Bandeau KPI (sombre) */}
      <div className="u-banner">
        <div className="u-banner-item">
          <div className="u-banner-v">{statsLoading ? '—' : num(stats.total)}</div>
          <div className="u-banner-l">{t('users.stats.total')}</div>
          <div className="u-banner-sub">{t('users.misc.subTotal')}</div>
        </div>
        <div className="u-banner-item">
          <div className="u-banner-v" style={{ color: '#5eca84' }}>{statsLoading ? '—' : num(stats.active_7d)}</div>
          <div className="u-banner-l">{t('users.stats.active7d')}</div>
          <div className="u-banner-sub">{t('users.misc.subActive7d')}</div>
        </div>
        <div className="u-banner-item">
          <div className="u-banner-v" style={{ color: 'var(--gold)' }}>{statsLoading ? '—' : num(stats.new_today)}</div>
          <div className="u-banner-l">{t('users.stats.newToday')}</div>
          <div className="u-banner-sub">{t('users.misc.subNewToday')}</div>
        </div>
        <div className="u-banner-item">
          <div className="u-banner-v" style={{ color: '#e74c3c' }}>{statsLoading ? '—' : num(stats.blocked)}</div>
          <div className="u-banner-l">{t('users.stats.suspended')}</div>
          <div className="u-banner-sub">{t('users.misc.subSuspended')}</div>
        </div>
      </div>

      {/* Filtres */}
      <div className="card card-pad u-filters-card">
        <div className="search u-search-row">
          <Search size={16} />
          <input className="input" placeholder={t('users.search')} value={filters.q} onChange={(e) => setF('q', e.target.value)} />
        </div>
        <div className="u-filters-selects">
          <select className="select" value={filters.ville} onChange={(e) => setF('ville', e.target.value)}>
            <option value="">{t('users.allCities')}</option>
            {villes.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select className="select" value={filters.level} onChange={(e) => setF('level', e.target.value)}>
            <option value="">{t('users.allLevels')}</option>
            {LEVELS.map((l) => <option key={l} value={l}>{t('users.misc.levelFull', { level: l })}</option>)}
          </select>
          <select className="select" value={filters.status} onChange={(e) => setF('status', e.target.value)}>
            <option value="">{t('users.allStatuses')}</option>
            {USER_STATUS_KEYS.map((s) => <option key={s} value={s}>{t(`users.statuses.${s}`)}</option>)}
          </select>
          <select className="select" value={filters.period} onChange={(e) => setF('period', e.target.value)}>
            <option value="">{t('users.allPeriods')}</option>
            <option value="today">{t('common.today')}</option>
            <option value="7d">{t('users.misc.last7Days')}</option>
            <option value="30d">{t('users.misc.last30Days')}</option>
          </select>
        </div>
        <div className="u-quickpills">
          {QUICK_FILTERS.map((qf) => (
            <button key={qf} className={`u-pill ${filters.quick === qf ? 'on' : ''}`} onClick={() => setF('quick', qf)}>
              {t(`users.filters.${qf}`)}
            </button>
          ))}
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        onRowClick={openSelected}
        emptyMessage={t('common.noData')}
      />

      {/* Drawer fiche joueur */}
      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={t('users.columns.player')}
        width={600}
        footer={selected && (
          <div className="u-foot">
            <div className="u-foot-row">
              <button className="btn btn-ghost-soft" onClick={() => setMessageFor(selected)}><Mail size={14} /> {t('users.actions.message')}</button>
              <button className="btn btn-ghost-soft" onClick={() => setSuspendFor(selected)}><UserX size={14} /> {t('users.drawer.suspend')}</button>
              <button className="btn btn-ghost-soft" onClick={() => doResetPassword(selected)}><KeyRound size={14} /> {t('users.drawer.resetPassword')}</button>
            </div>
            <div className="u-foot-danger">
              <button className="btn btn-danger" onClick={() => doRemove(selected)}><Trash2 size={14} /> {t('users.drawer.delete')}</button>
              {isSuperAdmin && (
                <label className="u-foot-role">
                  <ShieldCheck size={15} /> {t('users.columns.role')}
                  <select className="select" value={selected.role} onChange={(e) => doChangeRole(selected, e.target.value)}>
                    {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{t(`users.roles.${r}`)}</option>)}
                  </select>
                </label>
              )}
            </div>
          </div>
        )}
      >
        {selected && (
          <DrawerBody
            user={selected}
            tab={tab}
            setTab={setTab}
            onMessage={setMessageFor}
            onSuspend={setSuspendFor}
            onReset={doResetPassword}
          />
        )}
      </Drawer>

      {/* Modal suspension */}
      <Modal
        open={!!suspendFor}
        onClose={() => setSuspendFor(null)}
        title={suspendFor ? `${t('users.actions.suspend')} ${suspendFor.name}` : t('users.actions.suspend')}
        footer={(
          <>
            <button className="btn" onClick={() => setSuspendFor(null)}>{t('common.cancel')}</button>
            <button className="btn btn-danger" onClick={submitSuspend}><UserX size={14} /> {t('users.drawer.confirmSuspend')}</button>
          </>
        )}
      >
        <div className="field">
          <label>{t('users.fields.duration')}</label>
          <div className="u-duration-pills">
            {SUSPEND_DURATIONS.map((d) => (
              <button key={d.value} className={`u-pill ${suspendDuration === d.value ? 'on' : ''}`} onClick={() => setSuspendDuration(d.value)}>
                {t(`users.drawer.suspendDuration.${d.tKey}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>{t('users.fields.reason')} <span className="muted" style={{ fontWeight: 400 }}>{t('users.misc.minChars')}</span></label>
          <textarea className="textarea" placeholder={t('users.placeholder.suspendReason')} value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)} />
        </div>
      </Modal>

      {/* Modal invitation */}
      <Modal
        open={showInvite}
        onClose={closeInvite}
        title={t('users.inviteAdmin')}
        footer={tempPassword ? (
          <button className="btn btn-primary" onClick={closeInvite}>{t('common.close')}</button>
        ) : (
          <>
            <button className="btn" onClick={closeInvite}>{t('common.cancel')}</button>
            <button className="btn btn-primary" type="submit" form="invite-form" disabled={inviting}><UserPlus size={15} /> {t('users.misc.createAccount')}</button>
          </>
        )}
      >
        {tempPassword ? (
          <div className="stack" style={{ gap: 14 }}>
            <p style={{ fontSize: 14 }}>{t('users.misc.accountCreatedPanel')}</p>
            <div className="card-pad" style={{ background: '#ecfdf3', borderRadius: 10, textAlign: 'center', fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: '#15803d' }}>{tempPassword}</div>
            <p className="muted" style={{ fontSize: 12.5 }}>{t('users.misc.mustChangePassword')}</p>
          </div>
        ) : <InviteForm onSubmit={submitInvite} />}
      </Modal>

      {/* Modal message */}
      <Modal
        open={!!messageFor}
        onClose={() => setMessageFor(null)}
        title={messageFor ? `${t('users.actions.message')} — ${messageFor.name}` : t('users.actions.message')}
        footer={(
          <>
            <button className="btn" onClick={() => setMessageFor(null)}>{t('common.cancel')}</button>
            <button className="btn btn-primary" type="submit" form="message-form" disabled={messaging}><Mail size={15} /> {t('users.drawer.send')}</button>
          </>
        )}
      >
        <MessageForm onSubmit={submitMessage} />
      </Modal>

      {/* Modal changement de rôle (depuis le menu contextuel) */}
      <Modal
        open={!!roleFor}
        onClose={() => setRoleFor(null)}
        title={roleFor ? `${t('users.columns.role')} — ${roleFor.name}` : t('users.actions.changeRole')}
        footer={<button className="btn" onClick={() => setRoleFor(null)}>{t('common.close')}</button>}
      >
        {roleFor && (
          <div className="field" style={{ marginBottom: 0 }}>
            <label>{t('users.actions.changeRole')}</label>
            <select className="select" defaultValue={roleFor.role} onChange={(e) => doChangeRole(roleFor, e.target.value)}>
              {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{t(`users.roles.${r}`)}</option>)}
            </select>
          </div>
        )}
      </Modal>
    </>
  );
}
