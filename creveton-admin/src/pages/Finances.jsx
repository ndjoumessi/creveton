import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import Papa from 'papaparse';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import {
  Download, Wallet, ArrowDownLeft, ArrowUpRight, Clock, Eye, Check, X, Lock, Loader2, Search,
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
// On charge large (≤100) pour laisser la DataTable paginer côté client ; au-delà,
// le curseur `next_cursor` de l'API permettrait un « charger plus » (futur).
const PAGE_LIMIT = 100;

// Borne basse de période → `from` ISO envoyé à l'API (filtrage serveur).
// Hors rendu React (appelée dans le fetcher), donc Date.now() est admis.
function periodFromISO(period) {
  const days = PERIOD_DAYS[period];
  if (!days) return undefined;
  return new Date(Date.now() - days * 86400000).toISOString();
}

/** Déclenche le téléchargement d'un Blob via un <a download> éphémère. */
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function Finances() {
  const { t } = useTranslation();
  const role = useAuthStore((s) => s.role)();

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selectedTx, setSelectedTx] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null); // { tx, kind: 'approve' | 'reject' }
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState(''); // recherche par référence (filtre client)
  const setF = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

  const { data: summary, loading: summaryLoading, refetch: refetchSummary } = useApiData(() => financesService.summary(), []);
  const { data: dailyData } = useApiData(() => financesService.daily(30), []);
  const { data: txData, loading: txLoading, refetch: refetchTx } = useApiData(
    () => financesService.transactions({
      status: filters.status, type: filters.type, provider: filters.provider,
      from: periodFromISO(filters.period), limit: PAGE_LIMIT,
    }),
    [filters.status, filters.type, filters.provider, filters.period],
  );
  const { data: kycData, refetch: refetchKyc } = useApiData(
    () => financesService.transactions({ type: 'withdraw', status: 'pending', limit: PAGE_LIMIT }),
    [],
  );

  // Période + filtres sont appliqués côté serveur (status/type/provider/from).
  const rows = useMemo(() => txData?.data || [], [txData]);

  // Recherche par référence (+ utilisateur) appliquée côté client sur la vue chargée.
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((tx) =>
      (tx.reference || '').toLowerCase().includes(q)
      || (tx.user_email || '').toLowerCase().includes(q)
      || (tx.user_name || '').toLowerCase().includes(q));
  }, [rows, search]);

  const kycRows = useMemo(
    () => (kycData?.data || []).filter((tx) => tx.amount > KYC_THRESHOLD),
    [kycData],
  );

  const chartData = useMemo(
    () => (dailyData?.points || []).map((p) => ({ label: dateFr(p.date, 'd MMM'), deposits: p.deposits, withdrawals: p.withdrawals })),
    [dailyData],
  );

  const refetchAll = () => { refetchTx(); refetchKyc(); refetchSummary(); };

  const runConfirm = async () => {
    if (!confirmAction) return;
    const { tx, kind } = confirmAction;
    setBusy(true);
    try {
      if (kind === 'approve') {
        await financesService.validate(tx.id);
        notify.success(t('finances.notify.validated'));
      } else {
        await financesService.reject(tx.id, confirmAction.reason);
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

  const dlName = () => `creveton_transactions_${new Date().toISOString().slice(0, 10)}.csv`;

  const exportCsv = async () => {
    if (exporting) return;
    setExporting(true);
    const params = {
      status: filters.status, type: filters.type, provider: filters.provider,
      from: periodFromISO(filters.period),
    };
    try {
      // Export serveur (CSV, plafonné à 10 000 lignes côté backend).
      const blob = await financesService.exportCsv(params);
      triggerDownload(blob, dlName());
      notify.success(t('finances.notify.exported', { count: rows.length }));
    } catch {
      // Repli client (edge) : CSV depuis la vue chargée si l'endpoint échoue.
      if (!rows.length) { notify.error(t('finances.notify.nothingToExport')); setExporting(false); return; }
      const csv = Papa.unparse(rows.map((tx) => ({
        id: tx.id, date: tx.created_at, user_email: tx.user_email, type: tx.type,
        amount: tx.amount, currency: tx.currency || 'XAF', provider: tx.provider,
        status: tx.status, reference: tx.reference || '',
      })));
      // BOM en tête pour qu'Excel lise l'UTF-8.
      triggerDownload(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' }), dlName());
      notify.success(t('finances.notify.exported', { count: rows.length }));
    } finally {
      setExporting(false);
    }
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
          <button className="btn btn-ghost" onClick={exportCsv} disabled={exporting} title={t('common.export')}>
            {exporting ? <Loader2 size={16} className="spin" /> : <Download size={16} />} {t('finances.exportCsv')}
          </button>
        )}
      />

      {/* KYC en haut quand des retraits attendent une validation (attire l'attention). */}
      {kycRows.length > 0 && (
        <div className="card card-pad fin-kyc fin-section">
          <div className="fin-kyc-head">
            <Lock size={16} />
            <span>{t('finances.kyc.title')}</span>
            <span className="fin-kyc-count">{kycRows.length}</span>
          </div>
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
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-kpi fin-section">
        <KpiCard
          icon={<Wallet size={22} />} tone="green"
          label={t('finances.kpi.volume')}
          value={summaryLoading ? '—' : fcfa(s.volume_total?.amount)}
          delta={summaryLoading ? null : s.volume_total?.delta_pct}
          deltaLabel={t('finances.kpi.vsPrevMonth', 'vs mois précédent')}
          spark={(dailyData?.points || []).slice(-7).map((p) => p.volume)}
        />
        <KpiCard
          icon={<ArrowDownLeft size={22} />} tone="blue"
          label={t('finances.kpi.deposits')}
          value={summaryLoading ? '—' : fcfa(s.deposits?.amount)}
          delta={summaryLoading ? null : s.deposits?.delta_pct}
          deltaLabel={t('finances.kpi.vsPrevMonth', 'vs mois précédent')}
        />
        <KpiCard
          icon={<ArrowUpRight size={22} />} tone="gold"
          label={t('finances.kpi.withdrawals')}
          value={summaryLoading ? '—' : fcfa(s.withdrawals?.amount)}
          delta={summaryLoading ? null : s.withdrawals?.delta_pct}
          deltaLabel={t('finances.kpi.vsPrevMonth', 'vs mois précédent')}
        />
        <KpiCard
          icon={<Clock size={22} />} tone="violet"
          label={t('finances.kpi.pending', { amount: fcfa(s.pending?.amount) })}
          value={summaryLoading ? '—' : (s.pending?.count ?? 0)}
        />
      </div>

      {/* Graphique volume journalier (30 j) */}
      <div className="card card-pad fin-section">
        <div className="card-title" style={{ marginBottom: 12 }}>{t('finances.chart.title')}</div>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="finDep" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2a8a4f" stopOpacity={0.30} />
                <stop offset="100%" stopColor="#2a8a4f" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="finWd" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#d4a017" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#d4a017" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef0f2" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} minTickGap={28} />
            <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={56} tickFormatter={(v) => `${Math.round(v / 1000)}k F`} />
            <Tooltip
              contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 12 }}
              formatter={(v, name) => [fcfa(v), name]}
            />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 4 }} />
            <Area name={t('finances.kpi.deposits')} type="monotone" dataKey="deposits" stroke="#2a8a4f" strokeWidth={2.5} fill="url(#finDep)" />
            <Area name={t('finances.kpi.withdrawals')} type="monotone" dataKey="withdrawals" stroke="#d4a017" strokeWidth={2.5} fill="url(#finWd)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Filtres */}
      <div className="card card-pad fin-filters fin-section">
        <div className="fin-search">
          <Search size={15} />
          <input
            className="input"
            placeholder={t('finances.searchReference', 'Rechercher (référence, utilisateur…)')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
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
        pageFooter={(pageRows) => (
          <tr className="fin-total-row">
            <td colSpan={3}>{t('finances.table.pageTotal', 'Total (page)')}</td>
            <td className="fin-amount">{fcfa(pageRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0))}</td>
            <td colSpan={3} />
          </tr>
        )}
      />

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
