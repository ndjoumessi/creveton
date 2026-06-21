import { useState, useMemo } from 'react';
import {
  Search, Eye, UserX, KeyRound, Trash2,
} from 'lucide-react';
import usersService from '../services/users.service';
import { useApiData } from '../hooks/useApiData';
import { USER_STATUS_KEYS } from '../constants/enums';
import { userStatusColors, themeLabels } from '../constants/theme';
import { num, dateFr } from '../utils/format';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';
import Drawer from '../components/Drawer';
import { notify } from '../components/Toast';

const EMPTY_FILTERS = { ville: '', level: '', status: '' };
const LEVELS = [1, 2, 3, 4, 5];
// Villes par défaut si aucune n'est dérivable des données chargées.
const FALLBACK_VILLES = ['Douala', 'Yaoundé', 'Bafoussam', 'Garoua', 'Kribi', 'Bertoua'];
// Seuils d'XP cumulés par niveau (1 → 5).
const LEVEL_XP = [0, 500, 2000, 5000, 12000];
const THEME_KEYS = Object.keys(themeLabels);

/** Initiales (2 max) à partir du nom. */
function initials(name) {
  return (name || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

/** Hash déterministe simple à partir de l'id, pour des valeurs mock stables. */
function seedFrom(id) {
  let h = 0;
  const s = String(id || '');
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Statistiques fictives mais déterministes par utilisateur. */
function mockStats(user) {
  const seed = seedFrom(user.id);
  return {
    games: 40 + (seed % 160), // 40..199 parties
    avgScore: 320 + (seed % 480), // 320..799 pts
    favTheme: themeLabels[THEME_KEYS[seed % THEME_KEYS.length]],
  };
}

/** 5 dernières parties fictives (déterministes) pour la fiche détail. */
function mockGames(user) {
  const seed = seedFrom(user.id);
  return Array.from({ length: 5 }).map((_, i) => {
    const s = seed + i * 97;
    return {
      theme: themeLabels[THEME_KEYS[(s >> 2) % THEME_KEYS.length]],
      level: 1 + (s % 5),
      score: 200 + (s % 700),
      date: `2026-06-${String(20 - i).padStart(2, '0')}T18:00:00Z`,
    };
  });
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

export default function Utilisateurs() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selected, setSelected] = useState(null);

  const { data, loading, refetch } = useApiData(
    () => usersService.list(filters),
    [filters.ville, filters.level, filters.status],
  );
  const rows = useMemo(() => data?.data || [], [data]);

  const setF = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

  // Villes dérivées des données chargées, sinon liste de repli.
  const villes = useMemo(() => {
    const found = [...new Set(rows.map((u) => u.ville).filter(Boolean))].sort();
    return found.length ? found : FALLBACK_VILLES;
  }, [rows]);

  // Actions de modération : appellent le service puis rafraîchissent et ferment la fiche.
  const doSuspend = async (u) => {
    const reason = window.prompt('Motif de la suspension (optionnel) :') || undefined;
    try {
      await usersService.suspend(u.id, reason);
      notify.success(`${u.name} suspendu.`);
      setSelected(null);
      refetch();
    } catch { notify.error('Suspension impossible.'); }
  };

  const doResetPassword = async (u) => {
    try {
      await usersService.resetPassword(u.id);
      notify.success('Réinitialisation du mot de passe envoyée.');
      setSelected(null);
      refetch();
    } catch { notify.error('Réinitialisation impossible.'); }
  };

  const doRemove = async (u) => {
    if (!window.confirm(`Supprimer définitivement ${u.name} (RGPD) ? Cette action est irréversible.`)) return;
    try {
      await usersService.remove(u.id);
      notify.success('Compte supprimé (RGPD).');
      setSelected(null);
      refetch();
    } catch { notify.error('Suppression impossible.'); }
  };

  const columns = [
    {
      id: 'avatar',
      header: '',
      enableSorting: false,
      cell: ({ row }) => <div className="avatar-sm">{initials(row.original.name)}</div>,
    },
    { accessorKey: 'name', header: 'Nom', cell: (c) => <span style={{ fontWeight: 500 }}>{c.getValue()}</span> },
    { accessorKey: 'email', header: 'Email' },
    { accessorKey: 'ville', header: 'Ville' },
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
    { accessorKey: 'status', header: 'Statut', cell: (c) => <StatusBadge status={c.getValue()} kind="user" /> },
    { accessorKey: 'created_at', header: 'Date inscription', cell: (c) => dateFr(c.getValue()) },
    {
      id: 'actions',
      header: 'Actions',
      enableSorting: false,
      cell: ({ row }) => (
        <button
          className="icon-action"
          title="Voir la fiche"
          onClick={(e) => { e.stopPropagation(); setSelected(row.original); }}
        >
          <Eye size={17} />
        </button>
      ),
    },
  ];

  const actifs = rows.filter((u) => u.status === 'active').length;
  const bloques = rows.filter((u) => u.status === 'suspended' || u.status === 'banned').length;

  return (
    <>
      <PageHeader
        title="Utilisateurs"
        description="Gestion des comptes joueurs : profils, progression et modération."
      />

      {/* Stats */}
      <div className="grid grid-3" style={{ marginBottom: 18 }}>
        <div className="card kpi"><div className="kpi-label">Total</div><div className="kpi-value">{rows.length}</div></div>
        <div className="card kpi"><div className="kpi-label">Actifs</div><div className="kpi-value">{actifs}</div></div>
        <div className="card kpi"><div className="kpi-label">Suspendus / Bannis</div><div className="kpi-value">{bloques}</div></div>
      </div>

      {/* Filtres */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="filters">
          <div className="search"><Search size={16} /><span className="muted" style={{ fontSize: 13 }}>Filtrer les comptes</span></div>
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
        </div>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        loading={loading}
        onRowClick={setSelected}
        emptyMessage="Aucun utilisateur pour ces filtres."
      />

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Fiche utilisateur"
        footer={selected && (
          <>
            <button className="btn" onClick={() => doSuspend(selected)}><UserX size={14} /> Suspendre</button>
            <button className="btn" onClick={() => doResetPassword(selected)}><KeyRound size={14} /> Réinitialiser mot de passe</button>
            <button className="btn btn-danger" onClick={() => doRemove(selected)}><Trash2 size={14} /> Supprimer (RGPD)</button>
          </>
        )}
      >
        {selected && (() => {
          const prog = levelProgress(selected.level, selected.total_xp);
          const stats = mockStats(selected);
          const games = mockGames(selected);
          return (
            <div className="stack" style={{ gap: 20 }}>
              {/* En-tête */}
              <div className="row" style={{ gap: 14, alignItems: 'center' }}>
                <div className="avatar-sm" style={{ width: 52, height: 52, fontSize: 18 }}>{initials(selected.name)}</div>
                <div className="stack" style={{ gap: 6 }}>
                  <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 18, color: 'var(--ink)' }}>{selected.name}</div>
                  <StatusBadge status={selected.status} kind="user" />
                </div>
              </div>

              {/* Infos */}
              <dl className="kv">
                <dt>Nom</dt><dd>{selected.name}</dd>
                <dt>Email</dt><dd>{selected.email}</dd>
                <dt>Téléphone</dt><dd>{selected.phone}</dd>
                <dt>Ville</dt><dd>{selected.ville}</dd>
                <dt>Âge</dt><dd>{selected.age ?? '—'}</dd>
                <dt>Langue</dt><dd>{selected.lang ?? 'fr'}</dd>
              </dl>

              {/* Niveau & XP */}
              <div>
                <h4 className="card-title" style={{ fontSize: 14, marginBottom: 10 }}>Niveau &amp; XP</h4>
                <div className="between row" style={{ marginBottom: 8 }}>
                  <strong>Niveau {selected.level}</strong>
                  <span className="muted">{num(selected.total_xp)} XP</span>
                </div>
                <div className="progress"><span style={{ width: `${prog.pct}%` }} /></div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
                  {prog.max
                    ? 'Niveau max atteint'
                    : `${num(prog.remaining)} XP avant le niveau ${selected.level + 1}`}
                </div>
              </div>

              {/* Statistiques (mock) */}
              <div>
                <h4 className="card-title" style={{ fontSize: 14, marginBottom: 10 }}>Statistiques <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>(démo)</span></h4>
                <dl className="kv">
                  <dt>Parties jouées</dt><dd>{num(stats.games)}</dd>
                  <dt>Score moyen</dt><dd>{num(stats.avgScore)} pts</dd>
                  <dt>Thème favori</dt><dd>{stats.favTheme}</dd>
                </dl>
              </div>

              {/* 5 dernières parties (mock) */}
              <div>
                <h4 className="card-title" style={{ fontSize: 14, marginBottom: 6 }}>5 dernières parties <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>(démo)</span></h4>
                {games.map((g, i) => (
                  <div className="list-row" key={i}>
                    <div className="grow">
                      <div className="list-name">{g.theme}</div>
                      <div className="list-sub">Niveau {g.level} · {dateFr(g.date)}</div>
                    </div>
                    <strong>{num(g.score)} pts</strong>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </Drawer>
    </>
  );
}
