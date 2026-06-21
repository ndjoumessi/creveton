import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
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
import { useAuthStore } from '../store/authStore';
import { USER_STATUS_KEYS, roleLabels } from '../constants/enums';
import { userStatusColors, themeBadgeColors, levelLabels } from '../constants/theme';
import {
  num, dateFr, dateTimeFr, isToday,
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
const SUSPEND_DURATIONS = [
  { value: '1j', label: '1 jour' },
  { value: '7j', label: '7 jours' },
  { value: '30j', label: '30 jours' },
  { value: 'indef', label: 'Indéfini' },
];
const QUICK_FILTERS = [
  { value: 'all', label: 'Tous' },
  { value: 'active', label: 'Actifs' },
  { value: 'inactive', label: 'Inactifs +30j' },
  { value: 'suspended', label: 'Suspendus' },
  { value: 'admins', label: 'Admins' },
];

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
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `il y a ${d} j`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `il y a ${mo} mois`;
  return `il y a ${Math.round(mo / 12)} an(s)`;
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

/** Construit la heatmap des 30 derniers jours (réelle, depuis played_at). */
function buildHeatmap(sessions) {
  const counts = {};
  sessions.forEach((s) => {
    const d = new Date(s.played_at);
    if (Number.isNaN(d.getTime())) return;
    const key = d.toISOString().slice(0, 10);
    counts[key] = (counts[key] || 0) + 1;
  });
  const days = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 29; i >= 0; i -= 1) {
    const d = new Date(today.getTime() - i * DAY);
    const key = d.toISOString().slice(0, 10);
    days.push({
      key,
      count: counts[key] || 0,
      label: d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }),
    });
  }
  return days;
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
  if (role === 'super_admin') return <span className="u-role-badge u-role-super">👑 Super Admin</span>;
  if (role === 'admin') return <span className="u-role-badge u-role-admin">🛡 Admin</span>;
  if (role === 'moderator') return <span className="u-role-badge u-role-mod">🛡 Modérateur</span>;
  return <span className="u-role-badge u-role-player">🎮 Joueur</span>;
}

function StatusDot({ status }) {
  const map = {
    active: ['Actif', 'u-st-active'],
    suspended: ['Suspendu', 'u-st-susp'],
    banned: ['Banni', 'u-st-ban'],
  };
  const [label, cls] = map[status] || ['Inactif', 'u-st-inactive'];
  return <span className={`u-status ${cls}`}><span className="u-status-dot" />{label}</span>;
}

function LevelPill({ level }) {
  const m = levelMeta(level);
  return (
    <span className="u-level-pill" style={{ background: m.bg, color: m.color }}>
      Niv.{level} {m.name}
    </span>
  );
}

/* ---------- Onglet Profil ---------- */
function ProfilTab({ user, detail, copyCode, copied }) {
  const d = detail || user;
  const suspended = user.status === 'suspended' || user.status === 'banned';
  const verified = d.phone_verified;
  return (
    <div className="stack" style={{ gap: 22 }}>
      <section>
        <div className="u-section-title">Informations</div>
        <dl className="u-kv">
          <div><dt>Email</dt><dd>{d.email || '—'}</dd></div>
          <div><dt>Téléphone</dt><dd>{d.phone ? <span className="u-phone"><span className="u-flag">🇨🇲</span>{d.phone}</span> : '—'}</dd></div>
          <div><dt>Ville</dt><dd>{d.ville || '—'}</dd></div>
          <div><dt>Âge</dt><dd>{d.age ?? '—'}</dd></div>
          <div><dt>Sexe</dt><dd>{d.sexe ?? '—'}</dd></div>
          <div><dt>Langue</dt><dd>{(d.lang || 'fr').toUpperCase()}</dd></div>
          <div><dt>Inscrit le</dt><dd>{dateFr(d.created_at)}</dd></div>
          <div><dt>Dernière activité</dt><dd title={d.last_active_at ? dateTimeFr(d.last_active_at) : undefined}>{relativeFr(d.last_active_at)}</dd></div>
        </dl>
      </section>

      <section>
        <div className="u-section-title">Compte</div>
        <div className="u-account">
          <div className="u-account-row">
            <span className="u-account-k">Statut</span>
            <StatusDot status={user.status} />
          </div>
          {d.referral_code && (
            <div className="u-account-row">
              <span className="u-account-k">Code parrainage</span>
              <button className="u-copy-pill" onClick={() => copyCode(d.referral_code)} title="Copier le code">
                {copied ? <Check size={13} /> : <Copy size={13} />} {d.referral_code}
              </button>
            </div>
          )}
          {suspended && (
            <div className="u-suspension">
              {user.status === 'banned' ? 'Compte banni' : 'Compte suspendu'} — motif non journalisé en v1.
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="u-section-title">Accès &amp; sécurité</div>
        <div className="u-account">
          <div className="u-account-row">
            <span className="u-account-k">Rôle</span>
            <RoleBadge role={d.role} />
          </div>
          <div className="u-account-row">
            <span className="u-account-k">Téléphone</span>
            <span className={verified ? 'u-verified' : 'u-unverified'}>
              {verified ? 'Vérifié ✓' : 'Non vérifié ⚠️'}
            </span>
          </div>
          <div className="u-account-row">
            <span className="u-account-k">Dernière connexion</span>
            <span>{d.last_active_at ? dateTimeFr(d.last_active_at) : '—'}</span>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ---------- Onglet Progression ---------- */
function ProgressionTab({ user, sessions, loading }) {
  const prog = levelProgress(user.level, user.total_xp);
  const m = levelMeta(user.level);
  const stats = useMemo(() => deriveStats(sessions), [sessions]);
  const nextName = user.level < 5 ? LEVEL_META[user.level]?.name : null;
  const lineData = useMemo(
    () => stats.chrono.slice(-8).map((s, i) => ({ i: i + 1, score: Number(s.score) || 0 })),
    [stats.chrono],
  );

  if (loading) return <div className="stack" style={{ gap: 16 }}>{[0, 1, 2].map((i) => <Skeleton key={i} w="100%" h={i === 0 ? 120 : 80} r={12} />)}</div>;

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="u-level-hero">
        <div className="u-level-medal" style={{ background: m.bg, color: m.color }}>{m.icon}</div>
        <div className="u-level-hero-title">Niveau {user.level} — {m.name}</div>
      </div>

      <div>
        <div className="u-xp-row">
          <span className="u-xp-current">{num(user.total_xp)} XP</span>
          <span className="u-xp-max">{prog.max ? 'MAX' : `${num(prog.end)} XP`}</span>
        </div>
        <div className="u-xp-bar"><span style={{ width: `${prog.pct}%` }} /></div>
        <div className="u-xp-hint">
          {prog.max ? '🏆 Niveau maximum atteint !' : `Encore ${num(prog.remaining)} XP pour ${nextName}`}
        </div>
      </div>

      {!prog.max && (
        <div className="u-next-reward">
          Au niveau {nextName} : Tournois Premium + Badge {nextName === 'Champion' ? 'or' : 'supérieur'}
        </div>
      )}

      <div className="u-stat-grid">
        <div className="u-stat"><div className="u-stat-k">🎯 Parties</div><div className="u-stat-v">{num(stats.games)}</div></div>
        <div className="u-stat"><div className="u-stat-k">⭐ Score moyen</div><div className="u-stat-v">{num(stats.avgScore)}</div></div>
        <div className="u-stat"><div className="u-stat-k">📈 Réussite</div><div className="u-stat-v">{stats.successRate} %</div></div>
        <div className="u-stat"><div className="u-stat-k">🔥 Streak max</div><div className="u-stat-v">{num(stats.maxStreak)}</div></div>
      </div>

      <div>
        <div className="u-section-title">Évolution du score</div>
        {lineData.length >= 2 ? (
          <div className="u-chart">
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={lineData} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
                <XAxis dataKey="i" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={42} />
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 12 }}
                  labelFormatter={(l) => `Partie ${l}`}
                  formatter={(v) => [`${v} pts`, 'Score']}
                />
                <Line type="monotone" dataKey="score" stroke="#2a8a4f" strokeWidth={2.5} dot={{ r: 3, fill: '#2a8a4f' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : <p className="muted u-empty-note">Pas assez de parties pour tracer une courbe.</p>}
      </div>

      <div>
        <div className="u-section-title">Performance par thème</div>
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
        ) : <p className="muted u-empty-note">Aucune donnée de thème.</p>}
      </div>
    </div>
  );
}

/* ---------- Onglet Historique ---------- */
function HistoriqueTab({ sessions, loading }) {
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
    return <EmptyState title="Aucune partie" subtitle="Ce joueur n'a pas encore joué." />;
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div>
        <div className="u-section-title">{Math.min(sessions.length, 10)} dernières parties</div>
        <div className="u-hist-pills">
          <button className={`u-pill ${!theme ? 'on' : ''}`} onClick={() => setTheme('')}>Tous</button>
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
            <div className="u-hist-mid">Score : {num(g.score)} pts · XP : +{num(g.xp_earned)}</div>
            <div className="u-hist-bot">{relativeFr(g.played_at)}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Onglet Activité ---------- */
function ActiviteTab({ sessions, loading }) {
  const heat = useMemo(() => buildHeatmap(sessions), [sessions]);
  const recent = useMemo(
    () => [...sessions].sort((a, b) => new Date(b.played_at) - new Date(a.played_at)).slice(0, 8),
    [sessions],
  );

  if (loading) return <div className="stack" style={{ gap: 16 }}>{[0, 1].map((i) => <Skeleton key={i} w="100%" h={120} r={12} />)}</div>;

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div>
        <div className="u-section-title">Activité des 30 derniers jours</div>
        <div className="u-heatmap">
          {heat.map((d) => (
            <span
              key={d.key}
              className={`u-heat-cell u-heat-${heatLevel(d.count)}`}
              title={`${d.count} partie(s) le ${d.label}`}
            />
          ))}
        </div>
        <div className="u-heat-legend">
          <span>Moins</span>
          <span className="u-heat-cell u-heat-0" />
          <span className="u-heat-cell u-heat-1" />
          <span className="u-heat-cell u-heat-2" />
          <span className="u-heat-cell u-heat-3" />
          <span>Plus</span>
        </div>
      </div>

      <div>
        <div className="u-section-title">Parties récentes</div>
        {recent.length ? (
          <div className="u-sessions-list">
            {recent.map((s) => {
              const cfg = themeCfgByKey(s.theme);
              return (
                <div className="u-session-row" key={s.id}>
                  <span className="u-session-when" title={dateTimeFr(s.played_at)}>{dateFr(s.played_at)}</span>
                  <span className="u-session-theme">{cfg.icon} {cfg.label}</span>
                  <span className="u-session-score">{num(s.score)} pts</span>
                </div>
              );
            })}
          </div>
        ) : <p className="muted u-empty-note">Aucune session récente.</p>}
      </div>

      <div>
        <div className="u-section-title">Signalements reçus</div>
        <p className="muted u-empty-note">Aucun signalement 🎉</p>
      </div>
    </div>
  );
}

/* ---------- Menu contextuel d'une ligne ---------- */
function RowMenu({ user, onView, onMessage, onSuspend, onRole, onDelete }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="u-rowmenu">
      <button className="icon-action" title="Plus d'actions" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>
        <MoreVertical size={17} />
      </button>
      {open && (
        <>
          <button className="u-menu-backdrop" aria-label="Fermer" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
          <div className="u-menu" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => { setOpen(false); onView(user); }}><Eye size={14} /> Voir le profil</button>
            <button onClick={() => { setOpen(false); onMessage(user); }}><Mail size={14} /> Envoyer un message</button>
            <button onClick={() => { setOpen(false); onSuspend(user); }}><UserX size={14} /> Suspendre</button>
            {onRole && <button onClick={() => { setOpen(false); onRole(user); }}><ShieldCheck size={14} /> Changer le rôle</button>}
            <button className="danger" onClick={() => { setOpen(false); onDelete(user); }}><Trash2 size={14} /> Supprimer (RGPD)</button>
          </div>
        </>
      )}
    </span>
  );
}

/* ---------- Formulaires (message / invitation) ---------- */
function MessageForm({ onSubmit }) {
  const { register, handleSubmit } = useForm({ defaultValues: { subject: '', body: '' } });
  return (
    <form id="message-form" onSubmit={handleSubmit(onSubmit)}>
      <div className="field">
        <label>Sujet <span className="muted" style={{ fontWeight: 400 }}>(optionnel)</span></label>
        <input className="input" placeholder="Objet du message…" {...register('subject')} />
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Message</label>
        <textarea className="textarea" placeholder="Votre message au joueur…" {...register('body', { required: true })} />
      </div>
    </form>
  );
}

function InviteForm({ onSubmit }) {
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: { email: '', name: '', role: 'moderator' },
  });
  return (
    <form id="invite-form" onSubmit={handleSubmit(onSubmit)}>
      <div className="field">
        <label>Nom complet</label>
        <input className="input" placeholder="Prénom Nom" {...register('name', { required: 'Nom requis', minLength: { value: 2, message: '2 caractères min' } })} />
        {errors.name && <span className="field-error">{errors.name.message}</span>}
      </div>
      <div className="field">
        <label>Email</label>
        <input className="input" type="email" placeholder="admin@creveton.cm" {...register('email', { required: 'Email requis', pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Email invalide' } })} />
        {errors.email && <span className="field-error">{errors.email.message}</span>}
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Rôle</label>
        <select className="select" {...register('role')}>
          {INVITE_ROLES.map((r) => <option key={r} value={r}>{roleLabels[r]}</option>)}
        </select>
      </div>
    </form>
  );
}

/* ---------- Contenu du Drawer (header sombre + onglets) ---------- */
function DrawerBody({ user, tab, setTab, onMessage, onSuspend, onReset }) {
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
      notify.success('Code copié !');
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => notify.error('Copie impossible.'));
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
          <div><span className="u-dh-mv">{sessLoading ? '—' : num(stats.games)}</span><span className="u-dh-ml">parties</span></div>
          <div><span className="u-dh-mv">{sessLoading ? '—' : num(stats.avgScore)}</span><span className="u-dh-ml">score moy.</span></div>
          <div><span className="u-dh-mv">Niv. {user.level}</span><span className="u-dh-ml">{levelMeta(user.level).name}</span></div>
        </div>
        <div className="u-dh-quick">
          <button className="btn btn-ghost-soft" onClick={() => onMessage(user)}><Mail size={14} /> Message</button>
          <button className="btn btn-ghost-soft" onClick={() => onSuspend(user)}><UserX size={14} /> Suspendre</button>
          <button className="btn btn-ghost-soft" onClick={() => onReset(user)}><KeyRound size={14} /> Reset MDP</button>
        </div>
      </div>

      <div className="u-tabs">
        {['profil', 'progression', 'historique', 'activite'].map((tk) => (
          <button key={tk} className={`u-tab ${tab === tk ? 'active' : ''}`} onClick={() => setTab(tk)}>
            {tk === 'profil' ? 'Profil' : tk === 'progression' ? 'Progression' : tk === 'historique' ? 'Historique' : 'Activité'}
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
    if (suspendReason.trim().length < 10) { notify.error('Motif requis (10 caractères min).'); return; }
    const durationLabel = SUSPEND_DURATIONS.find((d) => d.value === suspendDuration)?.label || '';
    const reason = [suspendReason.trim(), durationLabel && `Durée : ${durationLabel}`].filter(Boolean).join(' — ');
    try {
      await usersService.suspend(suspendFor.id, reason);
      notify.success(`${suspendFor.name} suspendu.`);
      setSuspendFor(null); setSuspendReason(''); setSelected(null);
      refetch(); refetchStats();
    } catch { notify.error('Suspension impossible.'); }
  };

  const doResetPassword = async (u) => {
    if (!window.confirm(`Réinitialiser le mot de passe de ${u.name} ?`)) return;
    try {
      await usersService.resetPassword(u.id);
      notify.success('Réinitialisation envoyée.');
    } catch { notify.error('Réinitialisation impossible.'); }
  };

  const doChangeRole = async (u, role) => {
    if (!role || role === u.role) { setRoleFor(null); return; }
    try {
      await usersService.changeRole(u.id, role);
      notify.success(`Rôle de ${u.name} : ${roleLabels[role] || role}.`);
      setSelected((s) => (s ? { ...s, role } : s));
      setRoleFor(null);
      refetch();
    } catch { notify.error('Changement de rôle impossible.'); }
  };

  const doRemove = async (u) => {
    if (!window.confirm(`Supprimer définitivement ${u.name} (RGPD) ? Action irréversible.`)) return;
    const typed = window.prompt('Pour confirmer, saisissez SUPPRIMER :');
    if (typed !== 'SUPPRIMER') { notify.error('Suppression annulée.'); return; }
    try {
      await usersService.remove(u.id);
      notify.success('Compte supprimé (RGPD).');
      setSelected(null); refetch(); refetchStats();
    } catch { notify.error('Suppression impossible.'); }
  };

  const submitInvite = async (payload) => {
    setInviting(true);
    try {
      const res = await usersService.invite(payload);
      setTempPassword(res.temporary_password || '');
      notify.success(`Compte créé · mot de passe : ${res.temporary_password}`);
      refetch(); refetchStats();
    } catch { notify.error('Invitation impossible.'); } finally { setInviting(false); }
  };
  const closeInvite = () => { setShowInvite(false); setTempPassword(''); };

  const submitMessage = async ({ subject, body }) => {
    if (!messageFor) return;
    setMessaging(true);
    try {
      await usersService.message(messageFor.id, { subject: subject?.trim(), body: body.trim() });
      notify.success(`Message envoyé à ${messageFor.name}.`);
      setMessageFor(null);
    } catch {
      const params = [subject ? `subject=${encodeURIComponent(subject)}` : '', body ? `body=${encodeURIComponent(body)}` : ''].filter(Boolean).join('&');
      notify.error('Envoi indisponible — ouverture du client mail.');
      window.location.href = `mailto:${messageFor.email}${params ? `?${params}` : ''}`;
      setMessageFor(null);
    } finally { setMessaging(false); }
  };

  const exportCsv = () => {
    if (!filtered.length) { notify.error('Aucun utilisateur à exporter.'); return; }
    const csv = Papa.unparse(filtered.map((u) => ({
      Nom: u.name, Email: u.email, 'Téléphone': u.phone || '', Ville: u.ville || '',
      Niveau: u.level, XP: u.total_xp, Parties: u.sessions_played ?? 0,
      'Score moyen': u.avg_score ?? 0, 'Inscrit le': dateFr(u.created_at),
    })));
    // BOM (\uFEFF) en tête pour qu'Excel ouvre l'UTF-8 correctement.
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `utilisateurs-creveton-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    notify.success(`${filtered.length} utilisateur(s) exporté(s).`);
  };

  const columns = [
    {
      accessorKey: 'name',
      header: 'Joueur',
      cell: ({ row }) => {
        const u = row.original;
        return (
          <div className="u-cell-player">
            <Avatar name={u.name} size="sm" />
            <div className="u-id">
              <span className="u-id-line">
                <span className="cell-strong u-id-name">{u.name}</span>
                {isAdminRole(u.role) && <span className="badge badge-admin" title={roleLabels[u.role]}><ShieldCheck size={11} /> Admin</span>}
              </span>
              <span className="list-sub u-id-mail">{u.email}</span>
            </div>
          </div>
        );
      },
    },
    {
      id: 'contact',
      header: 'Contact',
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
      header: 'Niveau & XP',
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
      header: 'Activité',
      enableSorting: false,
      cell: ({ row }) => {
        const u = row.original;
        return (
          <div className="u-activity">
            <span className="u-act-main">{num(u.sessions_played ?? 0)} parties</span>
            <span className="u-act-sub">{num(u.avg_score ?? 0)} pts moy.</span>
            <span className="u-act-last">{u.last_played_at ? relativeFr(u.last_played_at) : 'jamais'}</span>
          </div>
        );
      },
    },
    { accessorKey: 'status', header: 'Statut', cell: (c) => <StatusDot status={c.getValue()} /> },
    { accessorKey: 'role', header: 'Rôle', cell: (c) => <RoleBadge role={c.getValue()} /> },
    {
      accessorKey: 'created_at',
      header: 'Inscrit le',
      cell: (c) => <span title={relativeFr(c.getValue())}>{dateFr(c.getValue())}</span>,
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="u-actions">
          <button className="icon-action" title="Voir la fiche" onClick={(e) => { e.stopPropagation(); openSelected(row.original); }}>
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
        title="Joueurs"
        description="Gérez les comptes, progressions et modérations."
        actions={(
          <>
            <button className="btn btn-ghost" onClick={exportCsv} title="Exporter la liste filtrée">
              <Download size={16} /> Exporter CSV
            </button>
            <button className="btn btn-primary" onClick={() => setShowInvite(true)}>
              <UserPlus size={16} /> Inviter un admin
            </button>
          </>
        )}
      />

      {/* Bandeau KPI (sombre) */}
      <div className="u-banner">
        <div className="u-banner-item">
          <div className="u-banner-v">{statsLoading ? '—' : num(stats.total)}</div>
          <div className="u-banner-l">Total joueurs</div>
          <div className="u-banner-sub">parc complet</div>
        </div>
        <div className="u-banner-item">
          <div className="u-banner-v" style={{ color: '#5eca84' }}>{statsLoading ? '—' : num(stats.active_7d)}</div>
          <div className="u-banner-l">Actifs 7j</div>
          <div className="u-banner-sub">sur 7 jours glissants</div>
        </div>
        <div className="u-banner-item">
          <div className="u-banner-v" style={{ color: 'var(--gold)' }}>{statsLoading ? '—' : num(stats.new_today)}</div>
          <div className="u-banner-l">Nouveaux aujourd&apos;hui</div>
          <div className="u-banner-sub">inscrits ce jour</div>
        </div>
        <div className="u-banner-item">
          <div className="u-banner-v" style={{ color: '#e74c3c' }}>{statsLoading ? '—' : num(stats.blocked)}</div>
          <div className="u-banner-l">Suspendus</div>
          <div className="u-banner-sub">comptes bloqués</div>
        </div>
      </div>

      {/* Filtres */}
      <div className="card card-pad u-filters-card">
        <div className="search u-search-row">
          <Search size={16} />
          <input className="input" placeholder="Nom, email, téléphone…" value={filters.q} onChange={(e) => setF('q', e.target.value)} />
        </div>
        <div className="u-filters-selects">
          <select className="select" value={filters.ville} onChange={(e) => setF('ville', e.target.value)}>
            <option value="">Toutes les villes</option>
            {villes.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select className="select" value={filters.level} onChange={(e) => setF('level', e.target.value)}>
            <option value="">Tous niveaux</option>
            {LEVELS.map((l) => <option key={l} value={l}>Niveau {l}</option>)}
          </select>
          <select className="select" value={filters.status} onChange={(e) => setF('status', e.target.value)}>
            <option value="">Tous statuts</option>
            {USER_STATUS_KEYS.map((s) => <option key={s} value={s}>{userStatusColors[s].label}</option>)}
          </select>
          <select className="select" value={filters.period} onChange={(e) => setF('period', e.target.value)}>
            <option value="">Toute période</option>
            <option value="today">Aujourd&apos;hui</option>
            <option value="7d">7 derniers jours</option>
            <option value="30d">30 derniers jours</option>
          </select>
        </div>
        <div className="u-quickpills">
          {QUICK_FILTERS.map((qf) => (
            <button key={qf.value} className={`u-pill ${filters.quick === qf.value ? 'on' : ''}`} onClick={() => setF('quick', qf.value)}>
              {qf.label}
            </button>
          ))}
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        onRowClick={openSelected}
        emptyMessage="Aucun utilisateur pour ces filtres."
      />

      {/* Drawer fiche joueur */}
      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Fiche joueur"
        width={600}
        footer={selected && (
          <div className="u-foot">
            <div className="u-foot-row">
              <button className="btn btn-ghost-soft" onClick={() => setMessageFor(selected)}><Mail size={14} /> Message</button>
              <button className="btn btn-ghost-soft" onClick={() => setSuspendFor(selected)}><UserX size={14} /> Suspendre</button>
              <button className="btn btn-ghost-soft" onClick={() => doResetPassword(selected)}><KeyRound size={14} /> Reset MDP</button>
            </div>
            <div className="u-foot-danger">
              <button className="btn btn-danger" onClick={() => doRemove(selected)}><Trash2 size={14} /> Supprimer (RGPD)</button>
              {isSuperAdmin && (
                <label className="u-foot-role">
                  <ShieldCheck size={15} /> Rôle
                  <select className="select" value={selected.role} onChange={(e) => doChangeRole(selected, e.target.value)}>
                    {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{roleLabels[r]}</option>)}
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
        title={suspendFor ? `Suspendre ${suspendFor.name}` : 'Suspendre'}
        footer={(
          <>
            <button className="btn" onClick={() => setSuspendFor(null)}>Annuler</button>
            <button className="btn btn-danger" onClick={submitSuspend}><UserX size={14} /> Confirmer la suspension</button>
          </>
        )}
      >
        <div className="field">
          <label>Durée</label>
          <div className="u-duration-pills">
            {SUSPEND_DURATIONS.map((d) => (
              <button key={d.value} className={`u-pill ${suspendDuration === d.value ? 'on' : ''}`} onClick={() => setSuspendDuration(d.value)}>
                {d.label}
              </button>
            ))}
          </div>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Motif <span className="muted" style={{ fontWeight: 400 }}>(10 caractères min)</span></label>
          <textarea className="textarea" placeholder="Motif de la suspension…" value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)} />
        </div>
      </Modal>

      {/* Modal invitation */}
      <Modal
        open={showInvite}
        onClose={closeInvite}
        title="Inviter un admin"
        footer={tempPassword ? (
          <button className="btn btn-primary" onClick={closeInvite}>Fermer</button>
        ) : (
          <>
            <button className="btn" onClick={closeInvite}>Annuler</button>
            <button className="btn btn-primary" type="submit" form="invite-form" disabled={inviting}><UserPlus size={15} /> Créer le compte</button>
          </>
        )}
      >
        {tempPassword ? (
          <div className="stack" style={{ gap: 14 }}>
            <p style={{ fontSize: 14 }}>Compte créé. Communiquez ce mot de passe temporaire :</p>
            <div className="card-pad" style={{ background: '#ecfdf3', borderRadius: 10, textAlign: 'center', fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: '#15803d' }}>{tempPassword}</div>
            <p className="muted" style={{ fontSize: 12.5 }}>Il devra le changer à la première connexion.</p>
          </div>
        ) : <InviteForm onSubmit={submitInvite} />}
      </Modal>

      {/* Modal message */}
      <Modal
        open={!!messageFor}
        onClose={() => setMessageFor(null)}
        title={messageFor ? `Message à ${messageFor.name}` : 'Message'}
        footer={(
          <>
            <button className="btn" onClick={() => setMessageFor(null)}>Annuler</button>
            <button className="btn btn-primary" type="submit" form="message-form" disabled={messaging}><Mail size={15} /> Envoyer</button>
          </>
        )}
      >
        <MessageForm onSubmit={submitMessage} />
      </Modal>

      {/* Modal changement de rôle (depuis le menu contextuel) */}
      <Modal
        open={!!roleFor}
        onClose={() => setRoleFor(null)}
        title={roleFor ? `Rôle de ${roleFor.name}` : 'Changer le rôle'}
        footer={<button className="btn" onClick={() => setRoleFor(null)}>Fermer</button>}
      >
        {roleFor && (
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Nouveau rôle</label>
            <select className="select" defaultValue={roleFor.role} onChange={(e) => doChangeRole(roleFor, e.target.value)}>
              {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{roleLabels[r]}</option>)}
            </select>
          </div>
        )}
      </Modal>
    </>
  );
}
