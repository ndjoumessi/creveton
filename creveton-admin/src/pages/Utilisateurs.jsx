import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import {
  Search, Eye, UserX, KeyRound, Trash2, UserPlus, ShieldCheck,
} from 'lucide-react';
import usersService from '../services/users.service';
import { useApiData } from '../hooks/useApiData';
import { useAuthStore } from '../store/authStore';
import { USER_STATUS_KEYS, roleLabels, THEME_KEYS } from '../constants/enums';
import { userStatusColors, themeLabels } from '../constants/theme';
import {
  num, dateFr, initials, avatarColor, isToday,
} from '../utils/format';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';
import Drawer from '../components/Drawer';
import Modal from '../components/Modal';
import { notify } from '../components/Toast';

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

/** Statistiques fictives mais déterministes par utilisateur (fiche détail). */
function mockUserStats(user) {
  const seed = seedFrom(user.id);
  return {
    games: mockGamesPlayed(user.id),
    avgScore: mockAvgScore(user.id),
    successRate: 45 + (seed % 51), // 45..95 %
    favTheme: themeLabels[THEME_KEYS[seed % THEME_KEYS.length]],
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
    return {
      theme: themeLabels[THEME_KEYS[(s >> 2) % THEME_KEYS.length]],
      level: 1 + (s % 5),
      score: 100 + (s % 301),
      correct,
      total,
      xp: 20 + (s % 180),
      date: `2026-06-${String(20 - i).padStart(2, '0')}T18:00:00Z`,
    };
  });
}

/** Filtre période d'inscription (côté client, sur created_at). */
function inPeriod(user, period) {
  if (!period) return true;
  if (period === 'today') return isToday(user.created_at);
  const t = new Date(user.created_at).getTime();
  if (Number.isNaN(t)) return false;
  const DAY = 86400000;
  const now = Date.now();
  if (period === '7d') return now - t <= 7 * DAY;
  if (period === '30d') return now - t <= 30 * DAY;
  return true;
}

/** Largeur (%) de la barre d'XP dans la bande du niveau courant. */
function levelProgress(level, xp) {
  if (level >= 5) return { pct: 100, remaining: 0, max: true };
  const start = LEVEL_XP[level - 1] ?? 0;
  const end = LEVEL_XP[level] ?? start + 1;
  const ratio = ((xp - start) / (end - start)) * 100;
  const clamped = Math.max(0, Math.min(100, ratio));
  return { pct: Math.round(clamped), remaining: Math.max(0, end - xp), max: false };
}

/** Avatar coloré déterministe (initiales + couleur dérivée du nom). */
function Avatar({ name, large }) {
  return (
    <div className={`avatar-c${large ? ' avatar-lg' : ''}`} style={{ background: avatarColor(name) }}>
      {initials(name)}
    </div>
  );
}

/** Sparkline SVG des scores (polyline mise à l'échelle, sans librairie). */
function Sparkline({ values, height = 60 }) {
  if (!values || values.length < 2) return null;
  const w = 100; // viewBox en %, le SVG s'étire à 100% de largeur
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = w / (values.length - 1);
  const pts = values
    .map((v, i) => {
      const x = i * step;
      const y = height - 6 - ((v - min) / span) * (height - 12);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${w} ${height}`}
      preserveAspectRatio="none"
      style={{ display: 'block' }}
    >
      <polyline
        points={pts}
        fill="none"
        stroke="#2a8a4f"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/* ---------- Onglet Profil ---------- */
function ProfilTab({ user }) {
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="row" style={{ gap: 14, alignItems: 'center' }}>
        <Avatar name={user.name} large />
        <div className="stack" style={{ gap: 6 }}>
          <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--ink)' }}>{user.name}</div>
          <span className="badge" style={{ background: '#f3f4f6', color: '#4b5563' }}>{roleLabels[user.role] || user.role}</span>
        </div>
      </div>

      <dl className="kv">
        <dt>Email</dt><dd>{user.email}</dd>
        <dt>Téléphone</dt><dd>{user.phone || '—'}</dd>
        <dt>Ville</dt><dd>{user.ville || '—'}</dd>
        <dt>Âge</dt><dd>{user.age ?? '—'}</dd>
        <dt>Sexe</dt><dd>{user.sexe ?? '—'}</dd>
        <dt>Langue</dt><dd>{user.lang ?? 'fr'}</dd>
        <dt>Inscrit le</dt><dd>{dateFr(user.created_at)}</dd>
        <dt>Dernière activité</dt><dd>{user.last_active_at ? dateFr(user.last_active_at) : '—'}</dd>
        <dt>Statut</dt><dd><StatusBadge status={user.status} kind="user" /></dd>
      </dl>

      <div>
        <h4 className="card-title" style={{ fontSize: 14, marginBottom: 8 }}>Historique des suspensions</h4>
        {user.status === 'suspended' || user.status === 'banned' ? (
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
  return (
    <div className="stack" style={{ gap: 22 }}>
      <div>
        <div className="between row" style={{ marginBottom: 8 }}>
          <strong style={{ fontFamily: 'Outfit' }}>
            Niveau {user.level} — {LEVEL_NAMES[user.level - 1] || '—'}
          </strong>
          <span className="muted">{num(user.total_xp)} XP</span>
        </div>
        <div className="progress"><span style={{ width: `${prog.pct}%` }} /></div>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
          {prog.max
            ? 'Niveau max atteint'
            : `${num(prog.remaining)} XP avant le niveau suivant`}
        </div>
      </div>

      <div>
        <h4 className="card-title" style={{ fontSize: 14, marginBottom: 10 }}>
          Statistiques <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>(démo)</span>
        </h4>
        <dl className="kv">
          <dt>Parties jouées</dt><dd>{num(stats.games)}</dd>
          <dt>Taux de réussite</dt><dd>{stats.successRate} %</dd>
          <dt>Score moyen</dt><dd>{num(stats.avgScore)} pts</dd>
          <dt>Thème favori</dt><dd>{stats.favTheme}</dd>
          <dt>Streak maximum</dt><dd>{stats.streak} parties</dd>
        </dl>
      </div>
    </div>
  );
}

/* ---------- Onglet Historique ---------- */
function HistoriqueTab({ user }) {
  const games = mockGames(user);
  const scores = games.map((g) => g.score);
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div>
        <h4 className="card-title" style={{ fontSize: 14, marginBottom: 8 }}>
          Évolution des scores <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>(démo)</span>
        </h4>
        <Sparkline values={scores} />
      </div>
      <div>
        <h4 className="card-title" style={{ fontSize: 14, marginBottom: 6 }}>10 dernières parties</h4>
        {games.map((g, i) => (
          <div className="list-row" key={i}>
            <div className="grow">
              <div className="list-name">{g.theme}</div>
              <div className="list-sub">
                Niveau {g.level} · {g.correct}/{g.total} bonnes · +{g.xp} XP · {dateFr(g.date)}
              </div>
            </div>
            <strong>{num(g.score)} pts</strong>
          </div>
        ))}
      </div>
    </div>
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

  const isSuperAdmin = useAuthStore((s) => s.role)() === 'super_admin';

  const { data, loading, refetch } = useApiData(
    () => usersService.list(filters),
    [filters.ville, filters.level, filters.status, filters.q],
  );
  const rows = useMemo(() => data?.data || [], [data]);

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

  // Statistiques du bandeau.
  const totalJoueurs = rows.length;
  const actifs7j = rows.filter((u) => u.status === 'active').length;
  const nouveaux = rows.filter((u) => isToday(u.created_at)).length;
  const bloques = rows.filter((u) => u.status === 'suspended' || u.status === 'banned').length;

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
    } catch { notify.error('Suppression impossible.'); }
  };

  const submitInvite = async (payload) => {
    setInviting(true);
    try {
      const res = await usersService.invite(payload);
      setTempPassword(res.temporary_password || '');
      notify.success(`Compte créé · mot de passe temporaire : ${res.temporary_password}`);
      refetch();
    } catch { notify.error('Invitation impossible.'); } finally { setInviting(false); }
  };

  const closeInvite = () => { setShowInvite(false); setTempPassword(''); };

  const columns = [
    {
      id: 'avatar',
      header: '',
      enableSorting: false,
      cell: ({ row }) => <Avatar name={row.original.name} />,
    },
    { accessorKey: 'name', header: 'Nom', cell: (c) => <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{c.getValue()}</span> },
    { accessorKey: 'email', header: 'Email' },
    { accessorKey: 'phone', header: 'Téléphone', cell: (c) => c.getValue() || '—' },
    { accessorKey: 'ville', header: 'Ville', cell: (c) => c.getValue() || '—' },
    { id: 'age', header: 'Âge', enableSorting: false, cell: ({ row }) => row.original.age ?? '—' },
    {
      accessorKey: 'level',
      header: 'Niveau',
      cell: ({ row }) => {
        const u = row.original;
        return (
          <span className="badge" style={{ background: '#ecfdf3', color: '#15803d' }}>
            Niv. {u.level} · {num(u.total_xp)} XP
          </span>
        );
      },
    },
    { id: 'games', header: 'Parties jouées', enableSorting: false, cell: ({ row }) => num(mockGamesPlayed(row.original.id)) },
    { id: 'avg', header: 'Score moyen', enableSorting: false, cell: ({ row }) => `${num(mockAvgScore(row.original.id))} pts` },
    { accessorKey: 'status', header: 'Statut', cell: (c) => <StatusBadge status={c.getValue()} kind="user" /> },
    { accessorKey: 'created_at', header: 'Inscrit le', cell: (c) => dateFr(c.getValue()) },
    {
      id: 'actions',
      header: 'Actions',
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
          <button className="btn btn-primary" onClick={() => setShowInvite(true)}>
            <UserPlus size={16} /> Inviter un admin
          </button>
        )}
      />

      {/* Bandeau de statistiques */}
      <div className="stat-banner">
        <div className="stat"><div className="v">{num(totalJoueurs)}</div><div className="l">Total joueurs</div></div>
        <div className="stat"><div className="v">{num(actifs7j)}</div><div className="l">Actifs 7j</div></div>
        <div className="stat"><div className="v">{num(nouveaux)}</div><div className="l">Nouveaux aujourd&apos;hui</div></div>
        <div className="stat"><div className="v">{num(bloques)}</div><div className="l">Suspendus</div></div>
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
        title="Fiche utilisateur"
        footer={selected && (
          <div className="row wrap" style={{ gap: 8 }}>
            <button className="btn" onClick={() => setSuspendFor(selected)}><UserX size={14} /> Suspendre</button>
            <button className="btn" onClick={() => doResetPassword(selected)}><KeyRound size={14} /> Réinitialiser le mot de passe</button>
            {isSuperAdmin && (
              <label className="row" style={{ gap: 6, fontSize: 13 }}>
                <ShieldCheck size={14} />
                <select
                  className="select"
                  value={selected.role}
                  onChange={(e) => doChangeRole(selected, e.target.value)}
                  style={{ minWidth: 130 }}
                >
                  {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{roleLabels[r]}</option>)}
                </select>
              </label>
            )}
            <button className="btn btn-danger" onClick={() => doRemove(selected)}><Trash2 size={14} /> Supprimer (RGPD)</button>
          </div>
        )}
      >
        {selected && (
          <>
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
    </>
  );
}
