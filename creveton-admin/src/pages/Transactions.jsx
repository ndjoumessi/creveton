import { useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import transactionsService from '../services/transactions.service';
import { useApiData } from '../hooks/useApiData';
import {
  TRANSACTION_TYPE_KEYS,
  transactionTypeLabels,
  TRANSACTION_STATUS_KEYS,
  PROVIDER_KEYS,
} from '../constants/enums';
import { providerLabels, transactionStatusColors } from '../constants/theme';
import { fcfa, dateTimeFr } from '../utils/format';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';

// Période = placeholder visuel uniquement (les données mock sont peu nombreuses,
// le filtrage côté serveur arrivera avec les vraies transactions). Cf. service.
const PERIOD_OPTIONS = [
  { value: '', label: 'Toute période' },
  { value: '7d', label: '7 derniers jours' },
  { value: '30d', label: '30 derniers jours' },
  { value: '90d', label: '90 derniers jours' },
];

const EMPTY_FILTERS = { type: '', status: '', provider: '', period: '' };

export default function Transactions() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  // Le service ne reçoit que type/status/provider ; `period` reste local (visuel).
  const { data, loading } = useApiData(
    () => transactionsService.list(filters),
    [filters.type, filters.status, filters.provider],
  );
  const rows = useMemo(() => data?.data || [], [data]);

  const setF = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

  // Stats : volume total (somme des montants) + nombre en attente.
  const volume = useMemo(() => rows.reduce((s, t) => s + (t.amount || 0), 0), [rows]);
  const pending = useMemo(() => rows.filter((t) => t.status === 'pending').length, [rows]);

  const columns = [
    { accessorKey: 'reference', header: 'Référence', cell: (c) => <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 500 }}>{c.getValue()}</span> },
    { accessorKey: 'user_name', header: 'Utilisateur' },
    { accessorKey: 'type', header: 'Type', cell: (c) => <span className="tag">{transactionTypeLabels[c.getValue()] || c.getValue()}</span> },
    { accessorKey: 'amount', header: 'Montant', cell: (c) => fcfa(c.getValue()) },
    { accessorKey: 'provider', header: 'Opérateur', cell: (c) => providerLabels[c.getValue()] || c.getValue() },
    { accessorKey: 'status', header: 'Statut', enableSorting: false, cell: (c) => <StatusBadge status={c.getValue()} kind="transaction" /> },
    { accessorKey: 'created_at', header: 'Date', cell: (c) => dateTimeFr(c.getValue()) },
  ];

  return (
    <>
      {/* Bannière : rappel que les transactions réelles ne sont pas encore actives (CDC §3.5). */}
      <div className="banner">
        <Info size={16} />
        <span>Données de démonstration — les transactions réelles seront disponibles après l’activation des tournois payants.</span>
      </div>

      <PageHeader
        title="Transactions"
        description="Suivi des paiements Mobile Money (dépôts, retraits, payouts)."
      />

      {/* Stats */}
      <div className="grid grid-3" style={{ marginBottom: 18 }}>
        <div className="card kpi"><div className="kpi-label">Total transactions</div><div className="kpi-value">{rows.length}</div></div>
        <div className="card kpi"><div className="kpi-label">Volume total</div><div className="kpi-value">{fcfa(volume)}</div></div>
        <div className="card kpi"><div className="kpi-label">En attente</div><div className="kpi-value">{pending}</div></div>
      </div>

      {/* Filtres */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="filters">
          <select className="select" value={filters.type} onChange={(e) => setF('type', e.target.value)}><option value="">Tous types</option>{TRANSACTION_TYPE_KEYS.map((t) => <option key={t} value={t}>{transactionTypeLabels[t]}</option>)}</select>
          <select className="select" value={filters.status} onChange={(e) => setF('status', e.target.value)}><option value="">Tous statuts</option>{TRANSACTION_STATUS_KEYS.map((s) => <option key={s} value={s}>{transactionStatusColors[s].label}</option>)}</select>
          <select className="select" value={filters.provider} onChange={(e) => setF('provider', e.target.value)}><option value="">Tous opérateurs</option>{PROVIDER_KEYS.map((p) => <option key={p} value={p}>{providerLabels[p]}</option>)}</select>
          <select className="select" value={filters.period} onChange={(e) => setF('period', e.target.value)}>{PERIOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        </div>
      </div>

      <DataTable columns={columns} data={rows} loading={loading} emptyMessage="Aucune transaction pour ces filtres." />
    </>
  );
}
