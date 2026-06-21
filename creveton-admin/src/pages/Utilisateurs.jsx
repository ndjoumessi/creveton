import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import Papa from 'papaparse';
import {
  Search, Eye, UserX, KeyRound, Trash2, UserPlus, ShieldCheck, Trophy, Mail, Download,
} from 'lucide-react';
import usersService from '../services/users.service';
import sessionsService from '../services/sessions.service';
import { useApiData } from '../hooks/useApiData';
import { useAuthStore } from '../store/authStore';
import { USER_STATUS_KEYS, roleLabels, THEME_KEYS } from '../constants/enums';
import { userStatusColors, themeBadgeColors, levelLabels } from '../constants/theme';
import {
  num, dateFr, dateTimeFr, isToday,
} from '../utils/format';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';
import Drawer from '../components/Drawer';
import Modal from '../components/Modal';
import Avatar from '../components/Avatar';
import Sparkline from '../components/Sparkline';
import { Skeleton } from '../components/Skeleton';
import { notify } from '../components/Toast';
import './Utilisateurs.css';

const EMPTY_FILTERS = { ville: '', level: '', status: '', q: '', period: '' };
const LEVELS = [1, 2, 3, 4, 5];
// Villes par défaut si aucune n'est dérivable des données chargées.
const FALLBACK_VILLES = ['Douala', 'Yaoundé', 'Bafoussam', 'Garoua', 'Kribi', 'Bertoua'];

// Bandes d'XP cumulées et libellés par niveau (1 → 5).
const LEVEL_XP = [0, 200, 500, 1200, 3000];
const LEVEL_NAMES = ['Novice', 'Apprenti', 'Joueur', 'Expert', 'Champion'];

// Rôles assignables via l'invitation d'admin (pas de player ici).
const INVITE_ROLES = ['moderator', 'admin'];
// Rôles assignables via le changement de rôle (super_admin only).
const ASSIGNABLE_ROLES = ['player', 'moderator', 'admin'];
// Durées de suspension proposées.
const SUSPEND_DURATIONS = [
  { value: '1j', label: '1 jour' },
  { value: '7j', label: '7 jours' },
  { value: '30j', label: '30 jours' },
  { value: 'indef', label: 'Indéfini' },
];

/** Hash déterministe simple à partir de l'id, pour des valeurs mock stables. */
function seedFrom(id) {
  let h = 0;
  const s = String(id || '');
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Nombre de parties jouées (mock déterministe 0..120). */
function mockGamesPlayed(id) {
  return seedFrom(id) % 121;
}

/** Score moyen (mock déterministe 100..400). */
function mockAvgScore(id) {
  return 100 + (seedFrom(id) % 301);
}

/** Config de thème sûre : index borné (>>> non signé) + repli, jamais undefined. */
function themeCfgAt(n) {
  const key = THEME_KEYS[(n >>> 0) % THEME_KEYS.length];
  return themeBadgeColors[key] || { label: key, icon: '' };
}

/** Config de thème depuis une clé réelle (parties), avec repli gracieux. */
function themeCfgByKey(key) {
  return themeBadgeColors[key] || { label: key || 'Thème', icon: '🎯', bg: '#f3f4f6' };
}

/** Vrai si un compte est administrateur (badge doré). */
function isAdminRole(role) {
  return role === 'admin' || role === 'super_admin';
}

/** Statistiques fictives mais déterministes par utilisateur (fiche détail). */
function mockUserStats(user) {
  const seed = seedFrom(user.id);
  const cfg = themeCfgAt(seed);
  return {
    games: mockGamesPlayed(user.id),
    avgScore: mockAvgScore(user.id),
    successRate: 45 + (seed % 51), // 45..95 %
    favTheme: cfg.label,
    favThemeIcon: cfg.icon,
    streak: 2 + (seed % 18), // 2..19
  };
}

/** 10 dernières parties fictives (déterministes) pour la fiche détail. */
function mockGames(user) {
  const seed = seedFrom(user.id);
  return Array.from({ length: 10 }).map((_, i) => {
    const s = seed + i * 97;
    const total = 8 + (s % 5); // 8..12 questions
    const correct = s % (total + 1);
    const cfg = themeCfgAt(s >>> 2);
    return {
      theme: cfg.label,
      icon: cfg.icon,
      bg: cfg.bg || '#f3f4f6',
      level: 1 + (s % 5),
      score: 100 + (s % 301),
      correct,
      total,
      xp: 20 + (s % 180),
      date: `2026-06-${String(20 - i).padStart(2, '0')}T18:00:00Z`,
    };
  });
}

/** Filtre période (côté client : created_at, ou inactivité via last_active_at). */
function inPeriod(user, period) {
  if (!period) return true;
  const DAY = 86400000;
  const now = Date.now();
  // Inactifs > 30j : aucune activité depuis 30 jours, ou dernière activité absente.
  if (period === 'inactive30') {
    if (!user.last_active_at) return true;
    const la = new Date(user.last_active_at).getTime();
    if (Number.isNaN(la)) return true;
    return now - la > 30 * DAY;
  }
  if (period === 'today') return isToday(user.created_at);
  const t = new Date(user.created_at).getTime();
  if (Number.isNaN(t)) return false;
  if (period === '7d') return now - t <= 7 * DAY;
  if (period === '30d') return now - t <= 30 * DAY;
  return true;
}

/** Largeur (%) de la barre d'XP dans la bande du niveau courant. */
function levelProgress(level, xp) {
  if (level >= 5) return { pct: 100, remaining: 0, start: LEVEL_XP[4], end: LEVEL_XP[4], max: true };
  const start = LEVEL_XP[level - 1] ?? 0;
  const end = LEVEL_XP[level] ?? start + 1;
  const ratio = ((xp - start) / (end - start)) * 100;
  const clamped = Math.max(0, Math.min(100, ratio));
  return {
    pct: Math.round(clamped), remaining: Math.max(0, end - xp), start, end, max: false,
  };
}

/** Temps relatif FR ("il y a 3 jours"). Renvoie '—' si date absente. */
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

/* ---------- Onglet Profil ---------- */
function ProfilTab({ user }) {
  const suspended = user.status === 'suspended' || user.status === 'banned';
  return (
    <div className="stack" style={{ gap: 22 }}>
      <dl className="kv-2">
        <div className="kv-field"><div className="k">Email</div><div className="v">{user.email}</div></div>
        <div className="kv-field">
          <div className="k">Téléphone</div>
          <div className="v">
            {user.phone ? <span className="u-phone"><span className="u-flag">🇨🇲</span>{user.phone}</span> : '—'}
          </div>
        </div>
        <div className="kv-field"><div className="k">Ville</div><div className="v">{user.ville || '—'}</div></div>
        <div className="kv-field"><div className="k">Âge</div><div className="v">{user.age ?? '—'}</div></div>
        <div className="kv-field"><div className="k">Sexe</div><div className="v">{user.sexe ?? '—'}</div></div>
        <div className="kv-field"><div className="k">Langue</div><div className="v">{user.lang ?? 'fr'}</div></div>
        <div className="kv-field"><div className="k">Inscrit le</div><div className="v">{dateFr(user.created_at)}</div></div>
        <div className="kv-field">
          <div className="k">Dernière activité</div>
          <div className="v" title={user.last_active_at ? dateTimeFr(user.last_active_at) : undefined}>
            {relativeFr(user.last_active_at)}
          </div>
        </div>
      </dl>

      <div>
        <div className="u-section-title">Historique des suspensions</div>
        {suspended ? (
          <div className="list-row">
            <div className="grow">
              <div className="list-name">{user.status === 'banned' ? 'Bannissement' : 'Suspension'}</div>
              <div className="list-sub">Motif : non spécifié · {dateFr(user.created_at)}</div>
            </div>
            <StatusBadge status={user.status} kind="user" />
          </div>
        ) : (
          <p className="muted" style={{ fontSize: 13 }}>Aucune suspension.</p>
        )}
      </div>
    </div>
  );
}

/* ---------- Onglet Progression ---------- */
function ProgressionTab({ user }) {
  const prog = levelProgress(user.level, user.total_xp);
  const stats = mockUserStats(user);
  const games = mockGames(user);
  const scores = games.map((g) => g.score);
  return (
    <div className="stack" style={{ gap: 24 }}>
      <div>
        <div className="u-prog-title" style={{ marginBottom: 12 }}>
          Niveau {user.level} — {LEVEL_NAMES[user.level - 1] || '—'}
        </div>
        <div className="u-prog-xp">
          <span className="muted" style={{ fontSize: 12.5 }}>Progression XP</span>
          <span className="u-prog-xp-val">
            {num(user.total_xp)} / {prog.max ? num(prog.end) : num(prog.end)} XP
          </span>
        </div>
        <div className="progress xp"><span style={{ width: `${prog.pct}%` }} /></div>
        <div className="u-reward">
          <Trophy size={15} />
          {prog.max
            ? 'Niveau max atteint — toutes les récompenses débloquées.'
            : `Prochaine récompense : Tournois Premium à ${num(prog.end)} XP`}
        </div>
      </div>

      <div>
        <div className="u-section-title">
          Statistiques <span className="u-demo">(démo)</span>
        </div>
        <div className="u-stat-grid">
          <div className="u-stat"><div className="u-stat-k">Parties</div><div className="u-stat-v">{num(stats.games)}</div></div>
          <div className="u-stat"><div className="u-stat-k">Taux de réussite</div><div className="u-stat-v">{stats.successRate} %</div></div>
          <div className="u-stat"><div className="u-stat-k">Thème favori</div><div className="u-stat-v" style={{ fontSize: 15 }}>{stats.favThemeIcon} {stats.favTheme}</div></div>
          <div className="u-stat"><div className="u-stat-k">Streak max</div><div className="u-stat-v">{stats.streak}</div></div>
        </div>
      </div>

      <div>
        <div className="u-section-title">
          Évolution des scores <span className="u-demo">(démo)</span>
        </div>
        <div className="u-spark">
          <Sparkline values={scores} width={200} height={60} fill />
        </div>
      </div>
    </div>
  );
}

/* ---------- Onglet Historique ---------- */
function HistoriqueTab({ user }) {
  // Vraies parties du joueur. fetcher lu via ref dans useApiData → deps littérales.
  const { data, loading } = useApiData(
    () => sessionsService.list({ user_id: user.id }),
    [user.id],
  );
  const games = useMemo(() => data?.data || [], [data]);

  // Ordre chronologique (du plus ancien au plus récent) pour la Sparkline ;
  // affichage de la timeline du plus récent au plus ancien.
  const chrono = useMemo(
    () => [...games].sort(
      (a, b) => new Date(a.played_at).getTime() - new Date(b.played_at).getTime(),
    ),
    [games],
  );
  const scores = useMemo(() => chrono.map((g) => g.score), [chrono]);
  const timeline = useMemo(() => [...chrono].reverse(), [chrono]);

  if (loading) {
    return (
      <div className="stack" style={{ gap: 16 }}>
        <Skeleton w="100%" h={64} r={12} />
        {Array.from({ length: 5 }).map((_, i) => (
          <div className="u-game-row" key={i}>
            <Skeleton w={36} h={36} r={10} />
            <div className="u-game-main">
              <Skeleton w="60%" h={13} />
              <Skeleton w="40%" h={11} style={{ marginTop: 6 }} />
            </div>
            <Skeleton w={48} h={28} r={8} />
          </div>
        ))}
      </div>
    );
  }

  if (!games.length) {
    return <p className="muted" style={{ fontSize: 13 }}>Aucune partie enregistrée pour ce joueur.</p>;
  }

  return (
    <div className="stack" style={{ gap: 18 }}>
      {scores.length >= 2 && (
        <div>
          <div className="u-section-title" style={{ marginBottom: 8 }}>Évolution des scores</div>
          <div className="u-spark" title="Évolution des scores (ordre chronologique)">
            <Sparkline values={scores} width={200} height={60} fill />
          </div>
        </div>
      )}

      <div>
        <div className="u-section-title" style={{ marginBottom: 6 }}>
          {games.length} {games.length > 1 ? 'parties' : 'partie'}
        </div>
        {timeline.map((g) => {
          const cfg = themeCfgByKey(g.theme);
          return (
            <div className="u-game-row" key={g.id}>
              <div className="u-game-icon" style={{ background: cfg.bg || '#f3f4f6' }} aria-hidden="true">
                {cfg.icon}
              </div>
              <div className="u-game-main">
                <div className="list-name">
                  {cfg.label} · {levelLabels[g.level] || g.level}
                </div>
                <div className="list-sub" title={dateTimeFr(g.played_at)}>
                  {num(g.correct_count)}/{num(g.question_count)} bonnes · {relativeFr(g.played_at)}
                </div>
              </div>
              <div className="u-game-end">
                <div className="u-game-score">{num(g.score)} pts</div>
                <div className="u-game-xp">+{num(g.xp_earned)} XP</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Modal : envoyer un message ---------- */
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
        <textarea
          className="textarea"
          placeholder="Votre message au joueur…"
          {...register('body', { required: true })}
        />
      </div>
    </form>
  );
}

/* ---------- Formulaire d'invitation d'admin ---------- */
function InviteForm({ onSubmit }) {
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: { email: '', name: '', role: 'moderator' },
  });
  return (
    <form id="invite-form" onSubmit={handleSubmit(onSubmit)}>
      <div className="field">
        <label>Nom complet</label>
        <input
          className="input"
          placeholder="Prénom Nom"
          {...register('name', { required: 'Nom requis', minLength: { value: 2, message: '2 caractères min' } })}
        />
        {errors.name && <span className="field-error">{errors.name.message}</span>}
      </div>
      <div className="field">
        <label>Email</label>
        <input
          className="input"
          type="email"
          placeholder="admin@creveton.cm"
          {...register('email', {
            required: 'Email requis',
            pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Email invalide' },
          })}
        />
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

  const isSuperAdmin = useAuthStore((s) => s.role)() === 'super_admin';

  const { data, loading, refetch } = useApiData(
    () => usersService.list(filters),
    [filters.ville, filters.level, filters.status, filters.q],
  );
  const rows = useMemo(() => data?.data || [], [data]);

  // KPI globaux du parc — calculés côté backend sur TOUTE la base (pas la page
  // courante, qui est paginée). Rechargés après les mutations qui les affectent.
  const { data: statsData, loading: statsLoading, refetch: refetchStats } = useApiData(
    () => usersService.stats(),
    [],
  );
  const stats = statsData || {};

  // Filtre période d'inscription appliqué côté client sur created_at.
  const filtered = useMemo(
    () => (filters.period ? rows.filter((u) => inPeriod(u, filters.period)) : rows),
    [rows, filters.period],
  );

  const setF = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

  // Villes dérivées des données chargées, sinon liste de repli.
  const villes = useMemo(() => {
    const found = [...new Set(rows.map((u) => u.ville).filter(Boolean))].sort();
    return found.length ? found : FALLBACK_VILLES;
  }, [rows]);

  const openSelected = (u) => { setSelected(u); setTab('profil'); };

  // Actions de modération.
  const submitSuspend = async () => {
    if (!suspendFor) return;
    const durationLabel = SUSPEND_DURATIONS.find((d) => d.value === suspendDuration)?.label || '';
    const reason = [suspendReason.trim(), durationLabel && `Durée : ${durationLabel}`].filter(Boolean).join(' — ') || undefined;
    try {
      await usersService.suspend(suspendFor.id, reason);
      notify.success(`${suspendFor.name} suspendu.`);
      setSuspendFor(null);
      setSuspendReason('');
      setSelected(null);
      refetch();
      refetchStats();
    } catch { notify.error('Suspension impossible.'); }
  };

  const doResetPassword = async (u) => {
    if (!window.confirm(`Réinitialiser le mot de passe de ${u.name} ?`)) return;
    try {
      await usersService.resetPassword(u.id);
      notify.success('Réinitialisation du mot de passe envoyée.');
    } catch { notify.error('Réinitialisation impossible.'); }
  };

  const doChangeRole = async (u, role) => {
    if (!role || role === u.role) return;
    try {
      await usersService.changeRole(u.id, role);
      notify.success(`Rôle de ${u.name} : ${roleLabels[role] || role}.`);
      setSelected((s) => (s ? { ...s, role } : s));
      refetch();
    } catch { notify.error('Changement de rôle impossible.'); }
  };

  const doRemove = async (u) => {
    if (!window.confirm(`Supprimer définitivement ${u.name} (RGPD) ? Cette action est irréversible.`)) return;
    const typed = window.prompt('Pour confirmer, saisissez SUPPRIMER :');
    if (typed !== 'SUPPRIMER') { notify.error('Suppression annulée.'); return; }
    try {
      await usersService.remove(u.id);
      notify.success('Compte supprimé (RGPD).');
      setSelected(null);
      refetch();
      refetchStats();
    } catch { notify.error('Suppression impossible.'); }
  };

  const submitInvite = async (payload) => {
    setInviting(true);
    try {
      const res = await usersService.invite(payload);
      setTempPassword(res.temporary_password || '');
      notify.success(`Compte créé · mot de passe temporaire : ${res.temporary_password}`);
      refetch();
      refetchStats();
    } catch { notify.error('Invitation impossible.'); } finally { setInviting(false); }
  };

  const closeInvite = () => { setShowInvite(false); setTempPassword(''); };

  // Envoi d'un message au joueur ; repli mailto en cas d'échec réseau.
  const submitMessage = async ({ subject, body }) => {
    if (!messageFor) return;
    setMessaging(true);
    try {
      await usersService.message(messageFor.id, { subject: subject?.trim(), body: body.trim() });
      notify.success(`Message envoyé à ${messageFor.name}.`);
      setMessageFor(null);
    } catch {
      // Fallback : ouvre le client mail de l'admin avec sujet/corps pré-remplis.
      const params = [
        subject ? `subject=${encodeURIComponent(subject)}` : '',
        body ? `body=${encodeURIComponent(body)}` : '',
      ].filter(Boolean).join('&');
      notify.error('Envoi indisponible — ouverture du client mail.');
      window.location.href = `mailto:${messageFor.email}${params ? `?${params}` : ''}`;
      setMessageFor(null);
    } finally {
      setMessaging(false);
    }
  };

  // Export CSV de la liste FILTRÉE affichée.
  const exportCsv = () => {
    if (!filtered.length) { notify.error('Aucun utilisateur à exporter.'); return; }
    const csv = Papa.unparse(filtered.map((u) => ({
      Nom: u.name,
      Email: u.email,
      'Téléphone': u.phone || '',
      Ville: u.ville || '',
      Niveau: u.level,
      XP: u.total_xp,
      Parties: mockGamesPlayed(u.id),
      'Inscrit le': dateFr(u.created_at),
    })));
    // BOM en tête pour qu'Excel ouvre l'UTF-8 correctement.
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `utilisateurs-creveton-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    notify.success(`${filtered.length} utilisateur(s) exporté(s).`);
  };

  const columns = [
    {
      id: 'avatar',
      header: '',
      enableSorting: false,
      cell: ({ row }) => <Avatar name={row.original.name} size="sm" />,
    },
    {
      accessorKey: 'name',
      header: 'Joueur',
      cell: ({ row }) => {
        const u = row.original;
        return (
          <div className="u-id">
            <span className="u-id-line">
              <span className="cell-strong u-id-name">{u.name}</span>
              {isAdminRole(u.role) && (
                <span className="badge badge-admin" title={roleLabels[u.role] || 'Admin'}>
                  <ShieldCheck size={11} /> Admin
                </span>
              )}
            </span>
            <span className="list-sub u-id-mail">{u.email}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'phone',
      header: 'Téléphone',
      enableSorting: false,
      cell: (c) => (c.getValue()
        ? <span className="u-phone"><span className="u-flag">🇨🇲</span>{c.getValue()}</span>
        : '—'),
    },
    { accessorKey: 'ville', header: 'Ville', cell: (c) => c.getValue() || '—' },
    {
      accessorKey: 'level',
      header: 'Niveau',
      cell: ({ row }) => {
        const u = row.original;
        const prog = levelProgress(u.level, u.total_xp);
        return (
          <div className="u-level">
            <span className="badge badge-level">Niv. {u.level} · {num(u.total_xp)} XP</span>
            <span className="progress progress-mini" title={`${prog.pct}%`}>
              <span style={{ width: `${prog.pct}%` }} />
            </span>
          </div>
        );
      },
    },
    {
      id: 'games',
      header: 'Parties',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="u-games">
          <span className="u-games-main">{num(mockGamesPlayed(row.original.id))} parties</span>
          <span className="u-games-sub">{num(mockAvgScore(row.original.id))} pts en moyenne</span>
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Statut',
      cell: (c) => <StatusBadge status={c.getValue()} kind="user" />,
    },
    { accessorKey: 'created_at', header: 'Inscrit le', cell: (c) => dateFr(c.getValue()) },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <button
          className="icon-action"
          title="Voir la fiche"
          onClick={(e) => { e.stopPropagation(); openSelected(row.original); }}
        >
          <Eye size={17} />
        </button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Utilisateurs"
        description="Gestion des comptes joueurs : profils, progression et modération."
        actions={(
          <>
            <button
              className="btn btn-ghost"
              onClick={exportCsv}
              title="Exporter la liste filtrée au format CSV"
            >
              <Download size={16} /> Exporter
            </button>
            <button className="btn btn-primary" onClick={() => setShowInvite(true)}>
              <UserPlus size={16} /> Inviter un admin
            </button>
          </>
        )}
      />

      {/* Bandeau de statistiques (sombre) — KPI globaux du parc */}
      <div className="dark-banner">
        <div className="item">
          <div className="v">{statsLoading ? <Skeleton w={64} h={32} r={8} style={{ background: 'rgba(255,255,255,0.18)' }} /> : num(stats.total)}</div>
          <div className="l">Total joueurs</div>
        </div>
        <div className="item">
          <div className="v">{statsLoading ? <Skeleton w={56} h={32} r={8} style={{ background: 'rgba(255,255,255,0.18)' }} /> : num(stats.active_7d)}</div>
          <div className="l">Actifs 7j</div>
        </div>
        <div className="item">
          <div className="v">{statsLoading ? <Skeleton w={48} h={32} r={8} style={{ background: 'rgba(255,255,255,0.18)' }} /> : num(stats.new_today)}</div>
          <div className="l">Nouveaux aujourd&apos;hui</div>
        </div>
        <div className="item">
          <div className="v">{statsLoading ? <Skeleton w={48} h={32} r={8} style={{ background: 'rgba(255,255,255,0.18)' }} /> : num(stats.blocked)}</div>
          <div className="l">Suspendus</div>
        </div>
      </div>

      {/* Filtres */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="filters">
          <div className="search">
            <Search size={16} />
            <input className="input" placeholder="Rechercher (nom, email, téléphone)…" value={filters.q} onChange={(e) => setF('q', e.target.value)} />
          </div>
          <select className="select" value={filters.ville} onChange={(e) => setF('ville', e.target.value)}>
            <option value="">Toutes villes</option>
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
            <option value="inactive30">Inactifs &gt; 30j</option>
          </select>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        onRowClick={openSelected}
        emptyMessage="Aucun utilisateur pour ces filtres."
      />

      {/* Drawer fiche utilisateur (onglets) */}
      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Fiche joueur"
        width={560}
        footer={selected && (
          <div className="u-foot">
            <div className="danger-zone">
              <div className="dz-title">Zone sensible</div>
              <div className="u-dz-actions">
                <button className="btn btn-danger-ghost" onClick={() => setSuspendFor(selected)}>
                  <UserX size={14} /> Suspendre
                </button>
                <button className="btn btn-danger" onClick={() => doRemove(selected)}>
                  <Trash2 size={14} /> Supprimer (RGPD)
                </button>
              </div>
            </div>
            {isSuperAdmin && (
              <label className="u-foot-role">
                <ShieldCheck size={15} /> Rôle
                <select
                  className="select"
                  value={selected.role}
                  onChange={(e) => doChangeRole(selected, e.target.value)}
                >
                  {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{roleLabels[r]}</option>)}
                </select>
              </label>
            )}
          </div>
        )}
      >
        {selected && (
          <>
            <div className="u-fiche-head">
              <Avatar name={selected.name} size="lg" />
              <div className="u-fiche-id">
                <div className="u-fiche-name">{selected.name}</div>
                <div className="u-fiche-meta">
                  <span className="badge" style={{ background: '#f3f4f6', color: '#4b5563' }}>
                    {roleLabels[selected.role] || selected.role}
                  </span>
                  <StatusBadge status={selected.status} kind="user" />
                </div>
                <div className="u-fiche-quick">
                  <button
                    className="btn btn-ghost-soft"
                    title="Envoyer un message au joueur"
                    onClick={() => setMessageFor(selected)}
                  >
                    <Mail size={14} /> Message
                  </button>
                  <button className="btn btn-ghost-soft" title="Suspendre le compte" onClick={() => setSuspendFor(selected)}>
                    <UserX size={14} /> Suspendre
                  </button>
                  <button className="btn btn-ghost-soft" title="Réinitialiser le mot de passe" onClick={() => doResetPassword(selected)}>
                    <KeyRound size={14} /> Reset MDP
                  </button>
                </div>
              </div>
            </div>

            <div className="tabs">
              <button className={`tab${tab === 'profil' ? ' active' : ''}`} onClick={() => setTab('profil')}>Profil</button>
              <button className={`tab${tab === 'progression' ? ' active' : ''}`} onClick={() => setTab('progression')}>Progression</button>
              <button className={`tab${tab === 'historique' ? ' active' : ''}`} onClick={() => setTab('historique')}>Historique</button>
            </div>
            {tab === 'profil' && <ProfilTab user={selected} />}
            {tab === 'progression' && <ProgressionTab user={selected} />}
            {tab === 'historique' && <HistoriqueTab user={selected} />}
          </>
        )}
      </Drawer>

      {/* Modal de suspension */}
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
          <select className="select" value={suspendDuration} onChange={(e) => setSuspendDuration(e.target.value)}>
            {SUSPEND_DURATIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Motif</label>
          <textarea
            className="textarea"
            placeholder="Motif de la suspension…"
            value={suspendReason}
            onChange={(e) => setSuspendReason(e.target.value)}
          />
        </div>
      </Modal>

      {/* Modal d'invitation d'un admin */}
      <Modal
        open={showInvite}
        onClose={closeInvite}
        title="Inviter un admin"
        footer={tempPassword ? (
          <button className="btn btn-primary" onClick={closeInvite}>Fermer</button>
        ) : (
          <>
            <button className="btn" onClick={closeInvite}>Annuler</button>
            <button className="btn btn-primary" type="submit" form="invite-form" disabled={inviting}>
              <UserPlus size={15} /> Créer le compte
            </button>
          </>
        )}
      >
        {tempPassword ? (
          <div className="stack" style={{ gap: 14 }}>
            <p style={{ fontSize: 14 }}>Compte créé. Communiquez ce mot de passe temporaire au nouvel admin :</p>
            <div className="card-pad" style={{ background: '#ecfdf3', borderRadius: 10, textAlign: 'center', fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: '#15803d' }}>
              {tempPassword}
            </div>
            <p className="muted" style={{ fontSize: 12.5 }}>Il devra le changer à la première connexion.</p>
          </div>
        ) : (
          <InviteForm onSubmit={submitInvite} />
        )}
      </Modal>

      {/* Modal : envoyer un message au joueur */}
      <Modal
        open={!!messageFor}
        onClose={() => setMessageFor(null)}
        title={messageFor ? `Message à ${messageFor.name}` : 'Message'}
        footer={(
          <>
            <button className="btn" onClick={() => setMessageFor(null)}>Annuler</button>
            <button className="btn btn-primary" type="submit" form="message-form" disabled={messaging}>
              <Mail size={15} /> Envoyer
            </button>
          </>
        )}
      >
        <MessageForm onSubmit={submitMessage} />
      </Modal>
    </>
  );
}
