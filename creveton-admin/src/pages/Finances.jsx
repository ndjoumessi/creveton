import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import Papa from 'papaparse';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import {
  Download, Wallet, ArrowDownLeft, ArrowUpRight, Clock, Eye, Check, X, Lock,
} from 'lucide-react';
import financesService from '../services/finances.service';
import { useApiData } from '../hooks/useApiData';
import { useAuthStore } from '../store/authStore';
import {
  PROVIDER_KEYS, TRANSACTION_TYPE_KEYS, TRANSACTION_STATUS_KEYS,
} from '../constants/enums';
import { fcfa, dateFr, dateTimeFr } from '../utils/format';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import KpiCard from '../components/KpiCard';
import StatusBadge from '../components/StatusBadge';
import { notify } from '../components/Toast';
import './Finances.css';

// Accès Finances : aligné sur permissions.js (finances.read = admin + super_admin).
// Le CDC parle d'« operator » ; dans le modèle de rôles réel, cela correspond à
// admin et au-dessus (moderator n'a pas l'accès finances).
const FINANCE_ROLES = ['admin', 'super_admin'];
const PERIOD_DAYS = { 7: 7, 30: 30, 90: 90 };
// Montants de retrait sortants (vue plateforme) → rouge ; entrants → vert.
const OUTFLOW_TYPES = ['withdraw', 'payout', 'refund'];
// Seuil KYC (spec §11) : un retrait > 10 000 FCFA exige une validation manuelle.
const KYC_THRESHOLD = 10000;

const EMPTY_FILTERS = { status: '', type: '', provider: '', period: '30' };

// Filtre période (fonction pure module : l'horloge est lue hors du rendu React
// pour respecter react-hooks/purity — même approche que Utilisateurs).
function filterByPeriod(rows, period) {
  const days = PERIOD_DAYS[period];
  if (!days) return rows;
  const cutoff = Date.now() - days * 86400000;
  return rows.filter((tx) => new Date(tx.created_at).getTime() >= cutoff);
}

export default function Finances() {
  const { t } = useTranslation();
  const role = useAuthStore((s) => s.role)();

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selectedTx, setSelectedTx] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null); // { tx, kind: 'approve' | 'reject' }
  const [busy, setBusy] = useState(false);
  const setF = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

  const { data: summary, loading: summaryLoading } = useApiData(() => financesService.summary(), []);
  const { data: dailyData } = useApiData(() => financesService.daily(30), []);
  const { data: txData, loading: txLoading, refetch: refetchTx } = useApiData(
    () => financesService.transactions({ status: filters.status, type: filters.type, provider: filters.provider }),
    [filters.status, filters.type, filters.provider],
  );
  const { data: kycData, refetch: refetchKyc } = useApiData(
    () => financesService.transactions({ type: 'withdraw', status: 'pending' }),
    [],
  );

  const rows = useMemo(() => txData?.data || [], [txData]);

  // Filtre période appliqué côté client (l'API mock ne le gère pas encore).
  const filteredRows = useMemo(() => filterByPeriod(rows, filters.period), [rows, filters.period]);

  const kycRows = useMemo(
    () => (kycData?.data || []).filter((tx) => tx.amount > KYC_THRESHOLD),
    [kycData],
  );

  const chartData = useMemo(
    () => (dailyData?.points || []).map((p) => ({ label: dateFr(p.date, 'd MMM'), volume: p.volume })),
    [dailyData],
  );

  const refetchAll = () => { refetchTx(); refetchKyc(); };

  const runConfirm = async () => {
    if (!confirmAction) return;
    const { tx, kind } = confirmAction;
    setBusy(true);
    try {
      if (kind === 'approve') {
        await financesService.validate(tx.id);
        notify.success(t('finances.notify.validated'));
      } else {
        await financesService.reject(tx.id);
        notify.success(t('finances.notify.rejected'));
      }
      setConfirmAction(null);
      refetchAll();
    } catch {
      notify.error(t('finances.notify.actionFailed'));
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    // TODO: privilégier GET /admin/transactions/export?format=csv quand l'endpoint
    // existera. En attendant, génération côté client depuis la vue filtrée.
    if (!filteredRows.length) { notify.error(t('finances.notify.nothingToExport')); return; }
    const csv = Papa.unparse(filteredRows.map((tx) => ({
      id: tx.id,
      date: tx.created_at,
      user_email: tx.user_email,
      type: tx.type,
      amount: tx.amount,
      currency: tx.currency || 'XAF',
      provider: tx.provider,
      status: tx.status,
      reference: tx.reference || '',
    })));
    // BOM () en tête pour qu'Excel ouvre l'UTF-8 correctement.
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `creveton_transactions_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    notify.success(t('finances.notify.exported', { count: filteredRows.length }));
  };

  const columns = [
    {
      accessorKey: 'created_at',
      header: t('finances.columns.date'),
      cell: (c) => <span title={dateTimeFr(c.getValue())}>{dateFr(c.getValue())}</span>,
    },
    {
      id: 'user',
      header: t('finances.columns.user'),
      enableSorting: false,
      cell: ({ row }) => (
        <div className="fin-user">
          <span className="cell-strong">{row.original.user_name}</span>
          <span className="list-sub">{row.original.user_email}</span>
        </div>
      ),
    },
    {
      accessorKey: 'type',
      header: t('finances.columns.type'),
      cell: (c) => <span className="fin-type-pill">{t(`finances.types.${c.getValue()}`)}</span>,
    },
    {
      accessorKey: 'amount',
      header: t('finances.columns.amount'),
      cell: ({ row }) => (
        <span className={`fin-amount ${OUTFLOW_TYPES.includes(row.original.type) ? 'out' : 'in'}`}>
          {fcfa(row.original.amount)}
        </span>
      ),
    },
    {
      accessorKey: 'provider',
      header: t('finances.columns.provider'),
      cell: (c) => t(`finances.providers.${c.getValue()}`),
    },
    {
      accessorKey: 'status',
      header: t('finances.columns.status'),
      cell: (c) => <StatusBadge kind="transaction" status={c.getValue()} />,
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => {
        const tx = row.original;
        return (
          <div className="fin-row-actions">
            {tx.status === 'pending' && (
              <button
                className="btn btn-sm btn-primary"
                onClick={(e) => { e.stopPropagation(); setConfirmAction({ tx, kind: 'approve' }); }}
              >
                <Check size={14} /> {t('finances.actions.validate')}
              </button>
            )}
            <button
              className="icon-action"
              title={t('finances.actions.detail')}
              onClick={(e) => { e.stopPropagation(); setSelectedTx(tx); }}
            >
              <Eye size={17} />
            </button>
          </div>
        );
      },
    },
  ];

  // Garde de rôle (sécurité défensive — la sidebar masque déjà l'entrée).
  if (!FINANCE_ROLES.includes(role)) return <Navigate to="/dashboard" replace />;

  const s = summary || {};

  return (
    <>
      <PageHeader
        title={t('finances.title')}
        description={t('finances.subtitle')}
        actions={(
          <button className="btn btn-ghost" onClick={exportCsv} title={t('common.export')}>
            <Download size={16} /> {t('finances.exportCsv')}
          </button>
        )}
      />

      {/* Bannière honnêteté : données de démonstration (endpoints à brancher). */}
      <div className="fin-demo">ⓘ {t('finances.demoBanner')}</div>

      {/* KPIs */}
      <div className="grid grid-kpi fin-section">
        <KpiCard
          icon={<Wallet size={22} />} tone="green"
          label={t('finances.kpi.volume')}
          value={summaryLoading ? '—' : fcfa(s.volume_total)}
          spark={(dailyData?.points || []).slice(-7).map((p) => p.volume)}
        />
        <KpiCard
          icon={<ArrowDownLeft size={22} />} tone="blue"
          label={t('finances.kpi.deposits')}
          value={summaryLoading ? '—' : fcfa(s.deposits)}
        />
        <KpiCard
          icon={<ArrowUpRight size={22} />} tone="gold"
          label={t('finances.kpi.withdrawals')}
          value={summaryLoading ? '—' : fcfa(s.withdrawals)}
        />
        <KpiCard
          icon={<Clock size={22} />} tone="violet"
          label={t('finances.kpi.pending', { amount: fcfa(s.pending_amount) })}
          value={summaryLoading ? '—' : (s.pending_count ?? 0)}
        />
      </div>

      {/* Graphique volume journalier (30 j) */}
      <div className="card card-pad fin-section">
        <div className="card-title" style={{ marginBottom: 12 }}>{t('finances.chart.title')}</div>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="finVol" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2a8a4f" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#2a8a4f" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef0f2" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} minTickGap={28} />
            <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
            <Tooltip
              contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 12 }}
              formatter={(v) => [fcfa(v), t('finances.chart.volume')]}
            />
            <Area type="monotone" dataKey="volume" stroke="#2a8a4f" strokeWidth={2.5} fill="url(#finVol)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Filtres */}
      <div className="card card-pad fin-filters fin-section">
        <select className="select" value={filters.status} onChange={(e) => setF('status', e.target.value)}>
          <option value="">{t('finances.filters.allStatuses')}</option>
          {TRANSACTION_STATUS_KEYS.map((k) => <option key={k} value={k}>{t(`finances.types.${k}`, k)}</option>)}
        </select>
        <select className="select" value={filters.type} onChange={(e) => setF('type', e.target.value)}>
          <option value="">{t('finances.filters.allTypes')}</option>
          {TRANSACTION_TYPE_KEYS.map((k) => <option key={k} value={k}>{t(`finances.types.${k}`)}</option>)}
        </select>
        <select className="select" value={filters.provider} onChange={(e) => setF('provider', e.target.value)}>
          <option value="">{t('finances.filters.allProviders')}</option>
          {PROVIDER_KEYS.map((k) => <option key={k} value={k}>{t(`finances.providers.${k}`)}</option>)}
        </select>
        <select className="select" value={filters.period} onChange={(e) => setF('period', e.target.value)}>
          <option value="7">{t('finances.filters.period7')}</option>
          <option value="30">{t('finances.filters.period30')}</option>
          <option value="90">{t('finances.filters.period90')}</option>
        </select>
      </div>

      <DataTable
        columns={columns}
        data={filteredRows}
        loading={txLoading}
        onRowClick={setSelectedTx}
        emptyMessage={t('finances.empty.transactions')}
      />

      {/* Section KYC — retraits en attente de validation */}
      <div className="card card-pad fin-kyc fin-section">
        <div className="fin-kyc-head">
          <Lock size={16} />
          <span>{t('finances.kyc.title')}</span>
          <span className="fin-kyc-count">{kycRows.length}</span>
        </div>
        {kycRows.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>{t('finances.empty.kyc')}</p>
        ) : (
          <div className="fin-kyc-list">
            {kycRows.map((tx) => (
              <div className="fin-kyc-item" key={tx.id}>
                <div className="fin-kyc-info">
                  <div className="fin-kyc-line">
                    <span className="cell-strong">{tx.user_name}</span>
                    <span className="fin-amount out">{fcfa(tx.amount)}</span>
                    <span className="muted">· {t(`finances.providers.${tx.provider}`)}</span>
                  </div>
                  <div className="list-sub">{t('finances.kyc.requestedAt', { date: dateTimeFr(tx.created_at) })}</div>
                </div>
                <div className="fin-kyc-actions">
                  <button className="btn btn-sm btn-danger" onClick={() => setConfirmAction({ tx, kind: 'reject' })}>
                    <X size={14} /> {t('finances.actions.reject')}
                  </button>
                  <button className="btn btn-sm btn-primary" onClick={() => setConfirmAction({ tx, kind: 'approve' })}>
                    <Check size={14} /> {t('finances.actions.approve')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal détail transaction */}
      <Modal
        open={!!selectedTx}
        onClose={() => setSelectedTx(null)}
        title={t('finances.detail.title')}
        footer={<button className="btn" onClick={() => setSelectedTx(null)}>{t('common.close')}</button>}
      >
        {selectedTx && (
          <dl className="fin-detail">
            <div><dt>{t('finances.detail.id')}</dt><dd>{selectedTx.id}</dd></div>
            <div><dt>{t('finances.detail.reference')}</dt><dd>{selectedTx.reference || '—'}</dd></div>
            <div><dt>{t('finances.detail.user')}</dt><dd>{selectedTx.user_name}</dd></div>
            <div><dt>{t('finances.detail.email')}</dt><dd>{selectedTx.user_email}</dd></div>
            <div><dt>{t('finances.detail.amount')}</dt><dd>{fcfa(selectedTx.amount)}</dd></div>
            <div><dt>{t('finances.detail.type')}</dt><dd>{t(`finances.types.${selectedTx.type}`)}</dd></div>
            <div><dt>{t('finances.detail.provider')}</dt><dd>{t(`finances.providers.${selectedTx.provider}`)}</dd></div>
            <div><dt>{t('finances.detail.status')}</dt><dd><StatusBadge kind="transaction" status={selectedTx.status} /></dd></div>
            <div><dt>{t('finances.detail.date')}</dt><dd>{dateTimeFr(selectedTx.created_at)}</dd></div>
          </dl>
        )}
      </Modal>

      {/* Confirmation approuver / rejeter */}
      <Modal
        open={!!confirmAction}
        onClose={() => (busy ? null : setConfirmAction(null))}
        title={confirmAction ? t(`finances.confirm.${confirmAction.kind}Title`) : ''}
        footer={confirmAction && (
          <>
            <button className="btn" onClick={() => setConfirmAction(null)} disabled={busy}>{t('common.cancel')}</button>
            <button
              className={`btn ${confirmAction.kind === 'approve' ? 'btn-primary' : 'btn-danger'}`}
              onClick={runConfirm}
              disabled={busy}
            >
              {confirmAction.kind === 'approve' ? t('finances.actions.approve') : t('finances.actions.reject')}
            </button>
          </>
        )}
      >
        {confirmAction && (
          <p style={{ margin: 0 }}>
            {t(`finances.confirm.${confirmAction.kind}Body`, {
              amount: fcfa(confirmAction.tx.amount),
              name: confirmAction.tx.user_name,
            })}
          </p>
        )}
      </Modal>
    </>
  );
}
