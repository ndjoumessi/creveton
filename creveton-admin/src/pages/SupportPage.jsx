import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Reply, UserPlus, X, Check, Eye, Wrench, EyeOff, Settings2, Send, ExternalLink,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis,
  Tooltip, PieChart, Pie, Cell,
} from 'recharts';
import supportService from '../services/support.service';
import { useApiData } from '../hooks/useApiData';
import i18n from '../i18n';
import { num, dateFr, dateTimeFr } from '../utils/format';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import Avatar from '../components/Avatar';
import Drawer from '../components/Drawer';
import EmptyState from '../components/EmptyState';
import { Skeleton } from '../components/Skeleton';
import { notify } from '../components/Toast';
import './SupportPage.css';

const TABS = [
  { key: 'open', i18nKey: 'support.tabs.open', status: 'open' },
  { key: 'in_progress', i18nKey: 'support.tabs.inProgress', status: 'in_progress' },
  { key: 'resolved', i18nKey: 'support.tabs.resolved', status: 'resolved' },
  { key: 'reports', i18nKey: 'support.tabs.reports', status: null },
];

const PRIORITY_DOT = { urgent: '#dc2626', normal: '#d4a017', low: '#2a8a4f' };

// Palette des types (alignée sur la charte Dashboard : vert / or / vert clair / bleu).
const TYPE_COLORS = { account: '#2a8a4f', question: '#d4a017', bug: '#5eca84', other: '#3b82f6' };

const QUICK_REPLY_KEYS = ['thanks', 'resolved', 'investigating'];

// ── Helpers TEMPS — isolés hors du rendu (Date.now()/new Date() interdits dans le rendu). ──
/** « à l'instant » / « il y a X min » / « il y a X h » / « il y a X j » / date courte. */
function relativeFr(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff) || diff < 0) return dateFr(iso);
  const min = Math.floor(diff / 60000);
  if (min < 1) return i18n.t('common.justNow');
  if (min < 60) return i18n.t('common.agoMinutes', { n: min });
  const h = Math.floor(min / 60);
  if (h < 24) return i18n.t('common.agoHours', { n: h });
  const d = Math.floor(h / 24);
  if (d < 30) return i18n.t('common.agoDays', { n: d });
  return dateFr(iso);
}

/** Date ISO → libellé court « 21 juin » pour l'axe / tooltip. */
function dayLabel(iso) {
  if (!iso) return '';
  return dateFr(iso, 'dd MMM');
}

/** Tooltip custom du graphe « Tickets par jour » (fond vert sombre, comme le Dashboard). */
function TicketsTooltip({ active, payload, label, t }) {
  if (!active || !payload || !payload.length) return null;
  const tickets = payload.find((p) => p.dataKey === 'tickets');
  return (
    <div className="sup-tip">
      <div className="sup-tip-day">{label}</div>
      <div className="sup-tip-row">
        <span className="sup-tip-sw" style={{ background: '#2a8a4f' }} />
        {num(tickets ? tickets.value : 0)} {t('support.stats.ticketsPerDay')}
      </div>
    </div>
  );
}

// ── Fetchers (module-level → deps littérales côté useApiData). ──
const fetchKpi = () => supportService.kpi();
const fetchStats = () => supportService.stats();
const fetchReports = () => supportService.listReports();

export default function SupportPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [tab, setTab] = useState('open');
  const [tickets, setTickets] = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [reply, setReply] = useState('');

  const { data: kpi, loading: kpiLoading } = useApiData(fetchKpi, []);
  const { data: stats, loading: statsLoading } = useApiData(fetchStats, []);
  const { data: reportsData, loading: reportsLoading, refetch: refetchReports } = useApiData(fetchReports, []);

  const status = TABS.find((x) => x.key === tab)?.status ?? null;

  // Charge les tickets du statut actif (les onglets « reports » n'en chargent pas).
  const loadTickets = useCallback(() => {
    if (!status) { setTicketsLoading(false); return Promise.resolve(); }
    setTicketsLoading(true);
    return supportService.listTickets({ status })
      .then((r) => setTickets((r && r.data) || []))
      .catch(() => notify.error(t('common.error')))
      .finally(() => setTicketsLoading(false));
  }, [status, t]);

  // Le détail (messages) d'un ticket ne vient que de GET /tickets/:id. On le
  // fusionne dans la liste pour que le drawer (qui lit `selected` depuis la
  // liste) affiche le fil sans changer sa structure.
  const mergeDetail = useCallback(async (id) => {
    try {
      const detail = await supportService.getTicket(id);
      setTickets((prev) => prev.map((tk) => (tk.id === id ? { ...tk, ...detail } : tk)));
    } catch {
      notify.error(t('common.error'));
    }
  }, [t]);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  const selected = useMemo(
    () => tickets.find((x) => x.id === selectedId) || null,
    [tickets, selectedId],
  );

  const reports = useMemo(() => (reportsData && reportsData.data) || [], [reportsData]);

  // Graphes (réels, dérivés de stats()).
  const daily = useMemo(
    () => ((stats && stats.daily) || []).map((d) => ({ label: dayLabel(d.date), tickets: Number(d.tickets) || 0 })),
    [stats],
  );
  const hasDaily = daily.some((d) => d.tickets > 0);

  const byType = useMemo(() => {
    const list = (stats && stats.by_type) || [];
    const total = list.reduce((a, x) => a + (Number(x.n) || 0), 0) || 1;
    return list.map((x) => ({
      type: x.type,
      name: t(`support.types.${x.type}`),
      value: Number(x.n) || 0,
      color: TYPE_COLORS[x.type] || '#6b7280',
      share: (Number(x.n) || 0) / total,
    }));
  }, [stats, t]);
  const hasByType = byType.some((d) => d.value > 0);

  const closeDrawer = useCallback(() => { setSelectedId(null); setReply(''); }, []);

  // ── Actions ticket ──
  const sendReply = useCallback(async (resolve) => {
    if (!selected) return;
    const body = reply.trim();
    if (!body) return;
    const id = selected.id;
    try {
      await supportService.reply(id, body, { resolve });
      notify.success(resolve ? t('support.notify.resolved') : t('support.notify.replied'));
      setReply('');
      if (resolve) {
        closeDrawer();
        loadTickets();
      } else {
        // Le ticket peut quitter l'onglet (open → in_progress) ; sinon on restaure
        // le fil de messages que la liste ne porte pas.
        await loadTickets();
        await mergeDetail(id);
      }
    } catch {
      notify.error(t('common.error'));
    }
  }, [selected, reply, t, loadTickets, mergeDetail, closeDrawer]);

  const changeStatus = useCallback(async (id, next, msgKey) => {
    try {
      await supportService.setStatus(id, next);
      notify.success(t(msgKey));
      loadTickets();
      if (next === 'resolved') closeDrawer();
    } catch {
      notify.error(t('common.error'));
    }
  }, [t, loadTickets, closeDrawer]);

  // ── Actions signalements ──
  // Ignore un signalement (PATCH status='ignored') puis rafraîchit la liste.
  const ignoreReport = useCallback(async (id) => {
    try {
      await supportService.updateReportStatus(id, 'ignored');
      notify.success(t('support.notify.statusChanged'));
      refetchReports();
    } catch {
      notify.error(t('common.error'));
    }
  }, [t, refetchReports]);

  // Export CSV RÉEL des signalements déjà chargés côté client (pas d'endpoint
  // backend Support). Blob + lien <a download> éphémère → succès réel.
  const exportReportsCsv = useCallback(() => {
    const headers = ['id', 'question', 'reported_by', 'reason', 'count', 'created_at'];
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      headers.join(','),
      ...reports.map((r) => [r.id, r.question_text, r.reported_by, r.reason, r.count, r.created_at].map(cell).join(',')),
    ].join('\r\n');
    const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `creveton_signalements_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    // Littéral : pas de clé i18n dédiée et les fichiers i18n sont hors scope ici.
    notify.success('Export CSV téléchargé');
  }, [reports]);

  // Colonnes de la table des signalements.
  const reportColumns = useMemo(() => [
    {
      accessorKey: 'question_text', header: t('support.reports.columns.question'), enableSorting: false,
      cell: (c) => <span className="sup-q-cell">{c.getValue()}</span>,
    },
    {
      accessorKey: 'reported_by', header: t('support.reports.columns.reportedBy'), enableSorting: false,
      cell: (c) => (
        <div className="row" style={{ gap: 9 }}>
          <Avatar name={c.getValue()} size="sm" />
          <span className="cell-strong">{c.getValue() || '—'}</span>
        </div>
      ),
    },
    {
      accessorKey: 'reason', header: t('support.reports.columns.reason'), enableSorting: false,
      cell: (c) => <span className="sup-reason">{c.getValue()}</span>,
    },
    {
      accessorKey: 'count', header: t('support.reports.columns.count'),
      cell: (c) => {
        const n = Number(c.getValue()) || 0;
        return (
          <span className={`sup-count-badge ${n > 3 ? 'sup-count-badge--hot' : ''}`}>
            {t('support.reports.reportsBadge', { count: n })}
          </span>
        );
      },
    },
    {
      accessorKey: 'created_at', header: t('support.reports.columns.date'),
      cell: (c) => <span title={dateTimeFr(c.getValue())}>{relativeFr(c.getValue())}</span>,
    },
    {
      id: 'actions', header: t('support.reports.columns.actions'), enableSorting: false,
      cell: (c) => (
        <div className="sup-row-actions">
          <button type="button" className="icon-action" title={t('support.reports.view')} onClick={() => navigate('/questions')}>
            <Eye size={16} />
          </button>
          <button type="button" className="icon-action" title={t('support.reports.fix')} onClick={() => navigate('/questions')}>
            <Wrench size={16} />
          </button>
          <button type="button" className="icon-action" title="Ignorer le signalement" onClick={() => ignoreReport(c.row.original.id)}>
            <EyeOff size={16} />
          </button>
        </div>
      ),
    },
  ], [t, navigate, ignoreReport]);

  const kpiItems = [
    { value: kpi?.open, label: t('support.kpi.open') },
    { value: kpi?.pending, label: t('support.kpi.pending') },
    { value: kpi?.resolved_today, label: t('support.kpi.resolvedToday') },
    { value: kpi?.avg_resolution_min, label: t('support.kpi.avgTime'), suffix: ' min' },
  ];

  // Console = même origine que la page courante (évite d'exposer/coder en dur
  // une URL d'environnement : staging pointait vers staging, prod vers prod).
  const consoleUrl = `${window.location.origin}/dashboard`;

  return (
    <>
      <PageHeader
        title={t('support.title')}
        description={t('support.subtitle')}
        actions={(
          <>
            <button type="button" className="btn btn-ghost-soft" onClick={exportReportsCsv}>
              {t('support.export')}
            </button>
            <button type="button" className="btn btn-ghost-soft" disabled title="À venir">
              {t('support.markAllRead')}
            </button>
          </>
        )}
      />

      {/* Accès rapide — lien Console, visible pour TOUS les rôles (aucune garde). */}
      <div className="sup-quickaccess">
        <span className="sup-quickaccess-label">{t('support.console.title')}</span>
        <a
          className="sup-console-link"
          href={consoleUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink size={16} />
          {t('support.console.open')}
        </a>
      </div>

      {/* Bande KPI sombre. */}
      <div className="dark-banner">
        {kpiItems.map((k) => (
          <div className="item" key={k.label}>
            {kpiLoading ? (
              <Skeleton w={80} h={32} style={{ background: 'rgba(255,255,255,0.12)' }} />
            ) : (
              <div className="v">{k.value != null ? `${num(k.value)}${k.suffix || ''}` : '—'}</div>
            )}
            <div className="l">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Onglets. */}
      <div className="sup-tabs" role="tablist" aria-label={t('support.title')}>
        {TABS.map((tb) => (
          <button
            key={tb.key}
            type="button"
            role="tab"
            aria-selected={tab === tb.key}
            className={`sup-tab ${tab === tb.key ? 'active' : ''}`}
            onClick={() => setTab(tb.key)}
          >
            {t(tb.i18nKey)}
            {tb.key === 'reports' && reports.length > 0 && <span className="sup-tab-n">{reports.length}</span>}
            {tb.status && !ticketsLoading && tab === tb.key && tickets.length > 0 && (
              <span className="sup-tab-n">{tickets.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Contenu de l'onglet. */}
      {tab === 'reports' ? (
        reportsLoading ? (
          <DataTable columns={reportColumns} data={[]} loading emptyMessage={t('support.empty.message')} />
        ) : reports.length === 0 ? (
          <div className="card card-pad">
            <EmptyState title={t('support.reports.title')} message={t('support.empty.message')} />
          </div>
        ) : (
          <DataTable columns={reportColumns} data={reports} emptyMessage={t('support.empty.message')} />
        )
      ) : ticketsLoading ? (
        <div className="sup-cards">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} w="100%" h={180} r={16} />)}
        </div>
      ) : tickets.length === 0 ? (
        <EmptyState title={t('support.empty.title')} message={t('support.empty.message')} />
      ) : (
        <div className="sup-cards">
          {tickets.map((tk) => (
            <button
              type="button"
              className="sup-card"
              key={tk.id}
              onClick={() => { setSelectedId(tk.id); setReply(''); mergeDetail(tk.id); }}
            >
              <div className="sup-card-head">
                <span className={`sup-prio sup-prio--${tk.priority}`}>
                  <span className="sup-prio-dot" style={{ background: PRIORITY_DOT[tk.priority] }} />
                  {t(`support.priorities.${tk.priority}`)}
                </span>
                <span className="sup-id">{tk.id}</span>
              </div>
              <div className="sup-card-player">
                <Avatar name={tk.player?.name} size="sm" />
                <div>
                  <div className="sup-card-pname">{tk.player?.name || '—'}</div>
                  {tk.player?.ville && <div className="sup-card-pcity">{tk.player.ville}</div>}
                </div>
                <span className="sup-type">{t(`support.types.${tk.type}`)}</span>
              </div>
              <div className="sup-subject">{tk.subject}</div>
              <p className="sup-excerpt">{tk.excerpt}</p>
              <div className="sup-card-foot">
                <span className="sup-card-date" style={{ marginRight: 'auto' }} title={dateTimeFr(tk.created_at)}>
                  {relativeFr(tk.created_at)}
                </span>
                <span className="btn btn-gold btn-sm"><Reply size={13} /> {t('support.actions.reply')}</span>
                <span className="btn btn-sm"><UserPlus size={13} /> {t('support.actions.assign')}</span>
                <span className="btn btn-danger-ghost btn-sm"><X size={13} /> {t('support.actions.close')}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Section stats : tickets par jour (aire) + types de problèmes (donut). */}
      <div className="sup-charts">
        <div className="card card-pad sup-chart-card">
          <div className="sup-chart-title">{t('support.stats.ticketsPerDay')}</div>
          {statsLoading ? (
            <Skeleton w="100%" h={200} r={12} />
          ) : !hasDaily ? (
            <div className="sup-chart-empty">{t('support.empty.message')}</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={daily} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="supGradTickets" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2a8a4f" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#2a8a4f" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef1ee" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#6b7280', fontFamily: 'Space Grotesk' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} minTickGap={16} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#6b7280', fontFamily: 'Space Grotesk' }} tickLine={false} axisLine={false} width={34} />
                <Tooltip content={<TicketsTooltip t={t} />} cursor={{ stroke: 'rgba(42,138,79,0.25)', strokeWidth: 1 }} />
                <Area type="monotone" dataKey="tickets" stroke="#2a8a4f" strokeWidth={2} fill="url(#supGradTickets)" dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card card-pad sup-chart-card">
          <div className="sup-chart-title">{t('support.stats.topTypes')}</div>
          {statsLoading ? (
            <Skeleton w="100%" h={200} r={12} />
          ) : !hasByType ? (
            <div className="sup-chart-empty">{t('support.empty.message')}</div>
          ) : (
            <div className="sup-pie-wrap">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={byType} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={78} paddingAngle={2} stroke="none">
                    {byType.map((d) => <Cell key={d.type} fill={d.color} />)}
                  </Pie>
                  <Tooltip
                    formatter={(value, name) => [num(value), name]}
                    contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', fontFamily: 'Space Grotesk', fontSize: 13 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <ul className="sup-pie-legend">
                {byType.map((d) => (
                  <li key={d.type}>
                    <span className="sup-legend-dot" style={{ background: d.color }} />
                    <span className="sup-legend-name">{d.name}</span>
                    <span className="sup-legend-val">{num(d.value)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Drawer ticket. */}
      <Drawer
        open={Boolean(selected)}
        onClose={closeDrawer}
        title={selected ? selected.id : t('support.title')}
        width={560}
      >
        {selected && (
          <div className="sup-detail">
            {/* En-tête sombre. */}
            <div className="sup-dhead">
              <div className="sup-dhead-top">
                <span className="sup-dhead-id">{selected.id}</span>
                <span className="sup-dstatus">{t(`support.statuses.${selected.status}`)}</span>
                <span className={`sup-dprio sup-dprio--${selected.priority}`}>{t(`support.priorities.${selected.priority}`)}</span>
                <span className="sup-dassign">
                  {t('support.ticket.assignedTo')}{': '}
                  <strong>{selected.assigned_to || t('support.ticket.unassigned')}</strong>
                </span>
              </div>
              <div className="sup-dplayer">
                <Avatar name={selected.player?.name} size="lg" />
                <div>
                  <div className="sup-dpname">{selected.player?.name || '—'}</div>
                  {/* ville/level/parties non renvoyés par le backend → omis (cf. service). */}
                  {selected.player?.ville && <div className="sup-dpmeta">{selected.player.ville}</div>}
                </div>
              </div>
            </div>

            <div className="sup-dsubject">{selected.subject}</div>

            {/* Fil de conversation. */}
            <div>
              <div className="sup-thread-title">{t('support.ticket.conversation')}</div>
              <div className="sup-thread">
                {(selected.messages || []).map((m) => {
                  if (m.from === 'system') {
                    return (
                      <div className="sup-msg sup-msg--system" key={m.id}>
                        <span className="sup-sysline">
                          <Settings2 size={13} /> {m.body}
                        </span>
                      </div>
                    );
                  }
                  return (
                    <div className={`sup-msg sup-msg--${m.from}`} key={m.id}>
                      <div className="sup-bubble">
                        {m.from === 'admin' && m.author && <span className="sup-bubble-author">{m.author}</span>}
                        {m.body}
                      </div>
                      <span className="sup-msg-time" title={dateTimeFr(m.at)}>{relativeFr(m.at)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Formulaire de réponse (sauf si déjà résolu). */}
            {selected.status !== 'resolved' && (
              <div className="sup-reply">
                <textarea
                  className="textarea"
                  placeholder={t('support.ticket.replyPlaceholder')}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                />
                <div>
                  <div className="sup-thread-title">{t('support.ticket.quickReplies')}</div>
                  <div className="sup-chips">
                    {QUICK_REPLY_KEYS.map((q) => (
                      <button key={q} type="button" className="sup-chip" onClick={() => setReply(t(`support.quickReplies.${q}`))}>
                        {t(`support.quickReplies.${q}`)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="sup-reply-actions">
                  <button type="button" className="btn btn-ghost-soft" disabled={!reply.trim()} onClick={() => sendReply(false)}>
                    <Send size={14} /> {t('support.actions.send')}
                  </button>
                  <button type="button" className="btn btn-gold" disabled={!reply.trim()} onClick={() => sendReply(true)}>
                    <Check size={14} /> {t('support.actions.sendResolve')}
                  </button>
                  <button type="button" className="btn btn-danger-ghost" onClick={() => changeStatus(selected.id, 'resolved', 'support.notify.statusChanged')}>
                    <X size={14} /> {t('support.actions.close')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </>
  );
}
