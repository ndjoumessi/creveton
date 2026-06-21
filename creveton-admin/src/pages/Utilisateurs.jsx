import { useState, useMemo } from 'react';
import {
  Search, UserX, Ban, KeyRound, Trash2, ShieldCheck,
} from 'lucide-react';
import usersService from '../services/users.service';
import { useApiData } from '../hooks/useApiData';
import { USER_STATUS_KEYS, ROLE_KEYS, roleLabels } from '../constants/enums';
import { userStatusColors } from '../constants/theme';
import { fcfa, num, dateFr } from '../utils/format';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';
import Drawer from '../components/Drawer';
import { notify } from '../components/Toast';

const EMPTY_FILTERS = { ville: '', role: '', status: '', level: '', q: '' };
const LEVELS = [1, 2, 3, 4, 5];
// Villes par défaut si aucune n'est dérivable des données chargées.
const FALLBACK_VILLES = ['Douala', 'Yaoundé', 'Bafoussam', 'Garoua', 'Kribi', 'Bertoua'];

/** KYC requis dès que les gains dépassent 10 000 FCFA (CDC §3.2). */
const needsKyc = (u) => u.kyc || u.wallet_balance > 10000;

/** Petit badge vert « KYC » affiché près du nom. */
const KycBadge = () => (
  <span className="badge" style={{ background: '#dcf3e4', color: '#1a7a3f' }}>KYC</span>
);

/** Génère un petit historique de parties fictives pour la fiche détail. */
function mockGames(user) {
  const themes = ['Culture', 'Géographie', 'Histoire', 'Sport', 'Science', 'Industrie'];
  return Array.from({ length: 6 }).map((_, i) => ({
    theme: themes[i % themes.length],
    score: Math.max(0, Math.round((user.level || 1) * 180 - i * 90)),
    date: `2026-06-${String(20 - i).padStart(2, '0')}T18:00:00Z`,
  }));
}

/** Génère un court relevé de transactions fictives pour la fiche détail. */
function mockTransactions(user) {
  return [
    { type: 'Dépôt', amount: 5000, status: 'success' },
    { type: 'Inscription tournoi', amount: 1000, status: 'success' },
    { type: 'Retrait', amount: Math.min(user.wallet_balance || 0, 8000), status: 'pending' },
  ];
}

export default function Utilisateurs() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selected, setSelected] = useState(null);

  const { data, loading, refetch } = useApiData(
    () => usersService.list(filters),
    [filters.ville, filters.role, filters.status, filters.level, filters.q],
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

  const doBan = async (u) => {
    const reason = window.prompt('Motif du bannissement (optionnel) :') || undefined;
    try {
      await usersService.ban(u.id, reason);
      notify.success(`${u.name} banni.`);
      setSelected(null);
      refetch();
    } catch { notify.error('Bannissement impossible.'); }
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
      accessorKey: 'name',
      header: 'Nom',
      cell: ({ row }) => {
        const u = row.original;
        return (
          <span className="row" style={{ gap: 6, alignItems: 'center' }}>
            <span style={{ fontWeight: 500 }}>{u.name}</span>
            {needsKyc(u) && <KycBadge />}
          </span>
        );
      },
    },
    { accessorKey: 'email', header: 'Email' },
    { accessorKey: 'phone', header: 'Téléphone' },
    { accessorKey: 'ville', header: 'Ville', cell: (c) => <span className="tag">{c.getValue()}</span> },
    { accessorKey: 'level', header: 'Niveau' },
    { accessorKey: 'total_xp', header: 'XP', cell: (c) => num(c.getValue()) },
    { accessorKey: 'wallet_balance', header: 'Wallet', cell: (c) => fcfa(c.getValue()) },
    { accessorKey: 'status', header: 'Statut', cell: (c) => <StatusBadge status={c.getValue()} kind="user" /> },
    { accessorKey: 'created_at', header: 'Inscrit le', cell: (c) => dateFr(c.getValue()) },
  ];

  return (
    <>
      <PageHeader
        title="Utilisateurs"
        description="Gestion des comptes joueurs : profils, modération et conformité KYC/RGPD."
      />

      {/* Stats */}
      <div className="grid grid-3" style={{ marginBottom: 18 }}>
        <div className="card kpi"><div className="kpi-label">Total chargés</div><div className="kpi-value">{rows.length}</div></div>
        <div className="card kpi"><div className="kpi-label">Comptes actifs</div><div className="kpi-value">{rows.filter((u) => u.status === 'active').length}</div></div>
        <div className="card kpi"><div className="kpi-label">KYC requis</div><div className="kpi-value">{rows.filter(needsKyc).length}</div></div>
      </div>

      {/* Filtres */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="filters">
          <div className="search"><Search size={16} /><input className="input" placeholder="Rechercher (nom, email, téléphone)…" value={filters.q} onChange={(e) => setF('q', e.target.value)} /></div>
          <select className="select" value={filters.ville} onChange={(e) => setF('ville', e.target.value)}><option value="">Toutes villes</option>{villes.map((v) => <option key={v} value={v}>{v}</option>)}</select>
          <select className="select" value={filters.role} onChange={(e) => setF('role', e.target.value)}><option value="">Tous rôles</option>{ROLE_KEYS.map((r) => <option key={r} value={r}>{roleLabels[r]}</option>)}</select>
          <select className="select" value={filters.status} onChange={(e) => setF('status', e.target.value)}><option value="">Tous statuts</option>{USER_STATUS_KEYS.map((s) => <option key={s} value={s}>{userStatusColors[s].label}</option>)}</select>
          <select className="select" value={filters.level} onChange={(e) => setF('level', e.target.value)}><option value="">Tous niveaux</option>{LEVELS.map((l) => <option key={l} value={l}>Niveau {l}</option>)}</select>
        </div>
      </div>

      <DataTable columns={columns} data={rows} loading={loading} onRowClick={setSelected} emptyMessage="Aucun utilisateur pour ces filtres." />

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Fiche utilisateur"
        footer={selected && (
          <>
            <button className="btn" onClick={() => doSuspend(selected)}><UserX size={14} /> Suspendre</button>
            <button className="btn btn-danger" onClick={() => doBan(selected)}><Ban size={14} /> Bannir</button>
            <button className="btn" onClick={() => doResetPassword(selected)}><KeyRound size={14} /> Reset mot de passe</button>
            <button className="btn btn-danger" onClick={() => doRemove(selected)}><Trash2 size={14} /> Supprimer (RGPD)</button>
          </>
        )}
      >
        {selected && (
          <>
            {/* Profil complet */}
            <dl className="kv">
              <dt>Nom</dt>
              <dd className="row" style={{ gap: 6, alignItems: 'center' }}>{selected.name}{needsKyc(selected) && <KycBadge />}</dd>
              <dt>Email</dt><dd>{selected.email}</dd>
              <dt>Téléphone</dt><dd>{selected.phone}</dd>
              <dt>Ville</dt><dd>{selected.ville}</dd>
              <dt>Rôle</dt><dd>{roleLabels[selected.role] || selected.role}</dd>
              <dt>Niveau</dt><dd>{selected.level}</dd>
              <dt>XP</dt><dd>{num(selected.total_xp)}</dd>
              <dt>Wallet</dt><dd>{fcfa(selected.wallet_balance)}</dd>
              <dt>Statut</dt><dd><StatusBadge status={selected.status} kind="user" /></dd>
              <dt>Inscrit le</dt><dd>{dateFr(selected.created_at)}</dd>
            </dl>

            {needsKyc(selected) && (
              <p className="muted row" style={{ gap: 6, alignItems: 'center', marginTop: 10 }}>
                <ShieldCheck size={15} /> KYC requis (gains &gt; 10 000 FCFA).
              </p>
            )}

            {/* Historique des parties */}
            <h4 className="card-title" style={{ fontSize: 14, marginTop: 22, marginBottom: 10 }}>Historique (10 dernières parties)</h4>
            <div className="stack" style={{ gap: 8 }}>
              {mockGames(selected).map((g, i) => (
                <div className="between row" key={i} style={{ fontSize: 14 }}>
                  <span className="row" style={{ gap: 8, alignItems: 'center' }}><span className="tag">{g.theme}</span><span className="muted">{dateFr(g.date)}</span></span>
                  <strong>{num(g.score)} pts</strong>
                </div>
              ))}
            </div>

            {/* Transactions */}
            <h4 className="card-title" style={{ fontSize: 14, marginTop: 22, marginBottom: 10 }}>Transactions</h4>
            <div className="stack" style={{ gap: 8 }}>
              {mockTransactions(selected).map((t, i) => (
                <div className="between row" key={i} style={{ fontSize: 14 }}>
                  <span>{t.type}</span>
                  <span className="row" style={{ gap: 10, alignItems: 'center' }}>
                    <strong>{fcfa(t.amount)}</strong>
                    <StatusBadge status={t.status} kind="transaction" />
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </Drawer>
    </>
  );
}
