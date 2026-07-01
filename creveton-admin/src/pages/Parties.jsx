import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Search, Eye, Check, X, ChevronRight, AlertTriangle, Zap,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  Tooltip as RTooltip, ResponsiveContainer,
} from 'recharts';
import sessionsService from '../services/sessions.service';
import dashboardService from '../services/dashboard.service';
import { useApiData } from '../hooks/useApiData';
import i18n from '../i18n';
import { chartTheme } from '../utils/chartTheme';
import useThemeStore from '../store/themeStore';
import { THEME_KEYS, LEVEL_KEYS } from '../constants/enums';
import { themeLabels, levelLabels, themeBadgeColors } from '../constants/theme';
import { num, pct, dateFr, dateTimeFr } from '../utils/format';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import ThemeBadge from '../components/ThemeBadge';
import Drawer from '../components/Drawer';
import Avatar from '../components/Avatar';
import { Skeleton } from '../components/Skeleton';
import EmptyState from '../components/EmptyState';
import { notify } from '../components/Toast';
import './Parties.css';

const EMPTY_FILTERS = { theme: '', level: '', q: '' };

const PERIODS = [
  { value: 'today', labelKey: 'sessions.periods.today' },
  { value: '7', labelKey: 'sessions.periods.7d' },
  { value: '30', labelKey: 'sessions.periods.30d' },
  { value: '', labelKey: 'sessions.periods.all' },
];

// Couleurs « douces » des barres par niveau (vert / or / rouge doux) + libellés.
const LEVEL_BARS = [
  { key: 'beginner', labelKey: 'questions.levels.beginner', color: '#2a8a4f' },
  { key: 'intermediate', labelKey: 'questions.levels.intermediate', color: '#d4a017' },
  { key: 'expert', labelKey: 'questions.levels.expert', color: '#e07a5f' },
];

const MS_DAY = 24 * 60 * 60 * 1000;

/** Bornes [début de journée locale, maintenant] — fonction module pure (pas dans le rendu). */
function todayBounds() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return { start, now: now.getTime() };
}

/** Vrai si la partie tombe dans la période sélectionnée (filtre client sur played_at). */
function inPeriod(playedAt, period) {
  if (!period) return true;
  if (!playedAt) return false;
  const t = new Date(playedAt).getTime();
  if (Number.isNaN(t)) return false;
  const { start, now } = todayBounds();
  if (period === 'today') return t >= start && t <= now;
  const days = Number(period);
  return t >= now - days * MS_DAY;
}

/** « il y a 6 min » / « il y a 3 h » / « il y a 2 j » — relatif FR, sinon date courte. */
function relativeFr(iso) {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const diff = todayBounds().now - t;
  if (diff < 0) return dateFr(iso);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return i18n.t('common.justNow');
  if (mins < 60) return i18n.t('common.agoMinutes', { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return i18n.t('common.agoHours', { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 30) return i18n.t('common.agoDays', { n: days });
  return dateFr(iso);
}

/** Durée « m:ss » ; « — » si null/NaN (duration_s peut manquer en données réelles). */
function formatDuration(seconds) {
  const n = Number(seconds);
  if (seconds == null || Number.isNaN(n)) return '—';
  const m = Math.floor(n / 60);
  return `${m}:${String(Math.round(n) % 60).padStart(2, '0')}`;
}

/** Couleur du score selon la performance (or > 800, vert 400–800, gris < 400). */
function scoreColor(score) {
  if (score > 800) return 'var(--gold)';
  if (score >= 400) return 'var(--green500)';
  return 'var(--muted)';
}

/** Couleur de la mini-barre de réussite : < 50 % rouge, 50–70 % or, > 70 % vert. */
function ratioColor(ratio) {
  if (ratio > 0.7) return 'var(--green500)';
  if (ratio >= 0.5) return 'var(--gold)';
  return 'var(--red)';
}

const ratioOf = (correct, total) => (total ? Math.min(1, correct / total) : 0);

/** Suspicion de triche : ≥ 2 réponses sous 1 s (dérivé du détail, pas d'un flag serveur). */
function isSuspicious(answers) {
  if (!Array.isArray(answers)) return false;
  return answers.filter((a) => Number(a.elapsed_ms) < 1000).length >= 2;
}

export default function Parties() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const ct = chartTheme(useThemeStore((s) => s.isDark));
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [period, setPeriod] = useState('');
  const [selected, setSelected] = useState(null);

  // Détail complet (récap question-par-question) via GET /admin/sessions/:id.
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const { data, loading, error, refetch } = useApiData(
    () => sessionsService.list(filters),
    [filters.theme, filters.level, filters.q],
  );
  const { data: dash, loading: dashLoading } = useApiData(
    () => dashboardService.overview(),
    [],
  );

  const rows = useMemo(() => data?.data || [], [data]);
  const filtered = useMemo(
    () => rows.filter((s) => inPeriod(s.played_at, period)),
    [rows, period],
  );

  // KPIs : « Aujourd'hui » et « Taux réussite global » sont RÉELS (dashboard) ;
  // « Total parties » et « Score moyen » sont calculés depuis la liste chargée.
  const kpis = useMemo(() => {
    const total = filtered.length;
    const avgScore = total
      ? Math.round(filtered.reduce((a, s) => a + (Number(s.score) || 0), 0) / total)
      : 0;
    return { total, avgScore };
  }, [filtered]);

  const gamesToday = dash?.kpis?.games_today;
  const successRate = dash?.kpis?.success_rate;

  // Répartition des parties par thème (donut), dérivée de la liste.
  const themeData = useMemo(() => {
    const counts = new Map();
    filtered.forEach((s) => counts.set(s.theme, (counts.get(s.theme) || 0) + 1));
    const total = filtered.length || 1;
    return [...counts.entries()]
      .map(([theme, value]) => ({
        theme,
        name: themeBadgeColors[theme]?.label || themeLabels[theme] || theme,
        value,
        share: value / total,
        color: themeBadgeColors[theme]?.fg || 'var(--muted)',
      }))
      .sort((a, b) => b.value - a.value);
  }, [filtered]);

  // Score moyen par niveau (barres), dérivé de la liste.
  const levelData = useMemo(() => {
    const acc = new Map();
    filtered.forEach((s) => {
      const cur = acc.get(s.level) || { sum: 0, n: 0 };
      cur.sum += Number(s.score) || 0;
      cur.n += 1;
      acc.set(s.level, cur);
    });
    return LEVEL_BARS.map((b) => {
      const cur = acc.get(b.key);
      return {
        label: t(b.labelKey),
        color: b.color,
        avg: cur && cur.n ? Math.round(cur.sum / cur.n) : 0,
      };
    });
  }, [filtered, t]);

  const hasLevelData = useMemo(() => levelData.some((d) => d.avg > 0), [levelData]);

  // À l'ouverture du drawer : charge le détail complet (answers fiables) via get(id).
  useEffect(() => {
    if (!selected) { setDetail(null); return undefined; }
    let alive = true;
    setDetail(null);
    setDetailLoading(true);
    sessionsService.get(selected.id)
      .then((d) => { if (alive) setDetail(d); })
      .catch(() => { if (alive) notify.error(t('common.error')); })
      .finally(() => { if (alive) setDetailLoading(false); });
    return () => { alive = false; };
  }, [selected, t]);

  const setF = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

  const goToProfile = (userId) => navigate(userId ? `/users?user=${userId}` : '/users');

  const columns = [
    {
      id: 'idx', header: '#', enableSorting: false,
      cell: ({ row }) => <span className="ses-idx">{row.index + 1}</span>,
    },
    {
      id: 'player', header: t('sessions.columns.player'), enableSorting: false,
      cell: ({ row }) => {
        const u = row.original.user || {};
        return (
          <div className="row" style={{ gap: 11 }}>
            <Avatar name={u.name} size="sm" />
            <div className="stack" style={{ gap: 1 }}>
              <span className="cell-strong">{u.name || '—'}</span>
              {u.ville && <span className="ses-ville">{u.ville}</span>}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'theme', header: t('sessions.columns.theme'), enableSorting: false,
      cell: (c) => <ThemeBadge theme={c.getValue()} />,
    },
    {
      accessorKey: 'level', header: t('sessions.columns.level'), enableSorting: false,
      cell: (c) => <span className="badge badge-level">{levelLabels[c.getValue()] || c.getValue() || '—'}</span>,
    },
    {
      accessorKey: 'score', header: t('sessions.columns.score'),
      cell: (c) => (
        <span className="ses-score" style={{ color: scoreColor(c.getValue()) }}>{num(c.getValue())}</span>
      ),
    },
    {
      id: 'ratio', header: t('sessions.columns.correct'), enableSorting: false,
      cell: ({ row }) => {
        const { correct_count: correct, question_count: tot } = row.original;
        const r = ratioOf(correct, tot);
        return (
          <div className="stack" style={{ gap: 5 }}>
            <span className="ses-fraction">{num(correct)}/{num(tot)}</span>
            <span className="ses-bar" aria-hidden="true">
              <span style={{ width: `${r * 100}%`, background: ratioColor(r) }} />
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: 'xp_earned', header: t('sessions.columns.xp'),
      cell: (c) => (
        <span className="ses-xp"><Zap size={13} className="ses-xp-ico" />{num(c.getValue())}</span>
      ),
    },
    {
      accessorKey: 'duration_s', header: t('sessions.columns.duration'), enableSorting: false,
      cell: (c) => <span className="ses-dur">{formatDuration(c.getValue())}</span>,
    },
    {
      accessorKey: 'played_at', header: t('sessions.columns.date'),
      cell: (c) => <span className="ses-date" title={dateTimeFr(c.getValue())}>{relativeFr(c.getValue())}</span>,
    },
    {
      id: 'actions', header: '', enableSorting: false,
      cell: ({ row }) => (
        <button
          className="icon-action" title={t('common.view')}
          onClick={(e) => { e.stopPropagation(); setSelected(row.original); }}
        >
          <Eye size={17} />
        </button>
      ),
    },
  ];

  const detailUser = detail?.user || selected?.user || {};
  const suspicious = isSuspicious(detail?.answers);

  return (
    <>
      <PageHeader
        title={t('sessions.title')}
        description={t('sessions.subtitle')}
      />

      {/* Bande KPI sombre — chiffres réels (dashboard) + dérivés de la liste, libellés honnêtes. */}
      <div className="ses-kpi-band">
        {[
          {
            value: loading ? null : num(kpis.total),
            label: t('sessions.kpi.total'),
            sub: t('sessions.misc.kpiLastGames'),
            ready: !loading,
          },
          {
            value: dashLoading ? null : (gamesToday != null ? num(gamesToday) : '—'),
            label: t('sessions.kpi.today'),
            sub: t('sessions.misc.kpiGamesPlayed'),
            ready: !dashLoading,
          },
          {
            value: loading ? null : num(kpis.avgScore),
            label: t('sessions.kpi.avgScore'),
            sub: t('sessions.misc.kpiLoadedGames'),
            ready: !loading,
          },
          {
            value: dashLoading ? null : (successRate != null ? `${num(successRate)} %` : '—'),
            label: t('sessions.kpi.globalSuccess'),
            sub: t('sessions.misc.kpiAllGames'),
            ready: !dashLoading,
          },
        ].map((k, i) => (
          <div className="ses-kpi" key={i}>
            {k.ready ? (
              <div className="ses-kpi-v">{k.value}</div>
            ) : (
              <Skeleton w={90} h={34} style={{ background: 'rgba(255,255,255,0.12)' }} />
            )}
            <div className="ses-kpi-l">{k.label}</div>
            <div className="ses-kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Graphiques : répartition par thème (donut) + score moyen par niveau (barres). */}
      <div className="ses-charts">
        <div className="card card-pad ses-chart-card">
          <div className="ses-chart-title">{t('sessions.themeDistribution')}</div>
          {loading ? (
            <Skeleton w="100%" h={180} r={12} />
          ) : themeData.length === 0 ? (
            <div className="ses-chart-empty">{t('common.noData')}</div>
          ) : (
            <div className="ses-donut">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={themeData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={78}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {themeData.map((d) => <Cell key={d.theme} fill={d.color} />)}
                  </Pie>
                  <RTooltip
                    {...ct.tooltip}
                    formatter={(value, name) => [t('sessions.misc.gamesCount', { count: value, value: num(value) }), name]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <ul className="ses-legend">
                {themeData.map((d) => (
                  <li key={d.theme}>
                    <span className="ses-legend-dot" style={{ background: d.color }} />
                    <span className="ses-legend-name">{d.name}</span>
                    <span className="ses-legend-val">{num(d.value)} · {pct(d.share, 0)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="card card-pad ses-chart-card">
          <div className="ses-chart-title">{t('sessions.scoreByLevel')}</div>
          {loading ? (
            <Skeleton w="100%" h={180} r={12} />
          ) : !hasLevelData ? (
            <div className="ses-chart-empty">{t('common.noData')}</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={levelData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <XAxis
                  dataKey="label" tickLine={false} axisLine={false}
                  tick={{ fontSize: 12, fill: ct.axisText }}
                />
                <YAxis
                  tickLine={false} axisLine={false}
                  tick={{ fontSize: 11, fill: ct.axisText }} width={42}
                />
                <RTooltip
                  {...ct.tooltip}
                  cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                  formatter={(value) => [`${num(value)} ${t('common.pts')}`, t('sessions.kpi.avgScore')]}
                />
                <Bar dataKey="avg" radius={[6, 6, 0, 0]} maxBarSize={64}>
                  {levelData.map((d) => <Cell key={d.label} fill={d.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Filtres : recherche + thème + niveau, puis pills de période. */}
      <div className="card card-pad ses-filters-card">
        <div className="filters">
          <div className="search">
            <Search size={16} />
            <input
              className="input" placeholder={t('sessions.search')}
              value={filters.q} onChange={(e) => setF('q', e.target.value)}
            />
          </div>
          <select className="select" value={filters.theme} onChange={(e) => setF('theme', e.target.value)}>
            <option value="">{t('sessions.allThemes')}</option>
            {THEME_KEYS.map((t) => <option key={t} value={t}>{themeLabels[t]}</option>)}
          </select>
          <select className="select" value={filters.level} onChange={(e) => setF('level', e.target.value)}>
            <option value="">{t('sessions.allLevels')}</option>
            {LEVEL_KEYS.map((l) => <option key={l} value={l}>{levelLabels[l]}</option>)}
          </select>
        </div>
        <div className="ses-pills">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              className={`ses-pill ${period === p.value ? 'active' : ''}`}
              onClick={() => setPeriod(p.value)}
            >
              {t(p.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <EmptyState
          icon={AlertTriangle}
          title={t('common.error')}
          action={<button type="button" className="btn" onClick={refetch}>{t('common.retry')}</button>}
        />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          loading={loading}
          onRowClick={setSelected}
          emptyMessage={t('common.noData')}
        />
      )}

      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={t('sessions.drawer.title')}
        width={520}
        footer={selected && (
          <button
            className="ses-profile-link"
            onClick={() => goToProfile(detailUser.id)}
          >
            {t('sessions.drawer.viewProfile')} <ChevronRight size={15} />
          </button>
        )}
      >
        {selected && (
          <div className="ses-detail">
            {/* En-tête sombre du drawer. */}
            <div className="ses-dhead">
              <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
                <Avatar name={detailUser.name} size="lg" />
                <div className="stack" style={{ gap: 6, minWidth: 0 }}>
                  <div className="ses-dname">{detailUser.name || '—'}</div>
                  <button
                    className="ses-dhead-link"
                    onClick={() => goToProfile(detailUser.id)}
                  >
                    {t('users.drawer.profile')} <ChevronRight size={13} />
                  </button>
                  <div className="row wrap" style={{ gap: 7, marginTop: 2 }}>
                    <ThemeBadge theme={selected.theme} />
                    <span className="badge badge-level">{levelLabels[selected.level] || selected.level}</span>
                  </div>
                  <div className="ses-ddate" title={dateTimeFr(selected.played_at)}>
                    {dateFr(selected.played_at)}
                  </div>
                </div>
              </div>
            </div>

            {/* Bannière de triche (uniquement si suspicion réelle dérivée du détail). */}
            {!detailLoading && suspicious && (
              <div className="ses-cheat" role="alert">
                <AlertTriangle size={17} />
                <span>{t('sessions.drawer.cheatDetected')}</span>
              </div>
            )}

            {/* Carte score blanche. */}
            <div className="ses-score-card">
              <div className="ses-score-big" style={{ color: 'var(--gold)' }}>{num(selected.score)}</div>
              <div className="ses-score-unit">{t('sessions.drawer.maxPts')}</div>
              <div className="ses-score-stats">
                <div className="ses-sstat">
                  <div className="ses-sstat-v ok"><Check size={14} />{num(selected.correct_count)}</div>
                  <div className="ses-sstat-l">{t('sessions.drawer.correct')}</div>
                </div>
                <div className="ses-sstat">
                  <div className="ses-sstat-v ko">
                    <X size={14} />
                    {num(Math.max(0, (selected.question_count || 0) - (selected.correct_count || 0)))}
                  </div>
                  <div className="ses-sstat-l">{t('sessions.drawer.wrong')}</div>
                </div>
                <div className="ses-sstat">
                  <div className="ses-sstat-v xp"><Zap size={14} />{num(selected.xp_earned)}</div>
                  <div className="ses-sstat-l">{t('sessions.drawer.xp')}</div>
                </div>
                <div className="ses-sstat">
                  <div className="ses-sstat-v">{formatDuration(selected.duration_s)}</div>
                  <div className="ses-sstat-l">{t('sessions.drawer.duration')}</div>
                </div>
              </div>
            </div>

            {/* Récapitulatif question par question. */}
            <div>
              <div className="ses-recap-title">{t('sessions.drawer.answerDetail')}</div>
              {detailLoading ? (
                <div className="stack" style={{ gap: 8 }}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} w="100%" h={62} r={12} />
                  ))}
                </div>
              ) : detail?.answers && detail.answers.length > 0 ? (
                <div className="stack" style={{ gap: 8 }}>
                  {detail.answers.map((a, i) => {
                    const skipped = a.your_index == null;
                    const state = a.is_correct ? 'ok' : skipped ? 'skip' : 'ko';
                    const yourText = skipped ? null : a.options?.[a.your_index]?.text;
                    const goodText = a.options?.[a.correct_index]?.text;
                    const bonus = a.is_correct && Number(a.elapsed_ms) < 5000;
                    const secs = Number(a.elapsed_ms);
                    return (
                      <div className={`ses-ans ses-ans--${state}`} key={a.question_id || i}>
                        <div className="ses-ans-head">
                          <span className="ses-ans-num">{i + 1}</span>
                          <span className={`ses-ans-badge ses-ans-badge--${state}`}>
                            {a.is_correct ? <Check size={13} /> : skipped ? '—' : <X size={13} />}
                          </span>
                          <div className="ses-ans-q">{a.question_text}</div>
                          <span className="ses-ans-time">
                            {Number.isNaN(secs) ? '—' : `${(secs / 1000).toFixed(1)}s`}
                          </span>
                        </div>
                        <div className="ses-ans-body">
                          {skipped ? (
                            <div className="ses-ans-line ses-ans-line--skip">{t('sessions.misc.questionSkipped')}</div>
                          ) : a.is_correct ? (
                            <div className="ses-ans-line ses-ans-line--ok">
                              <Check size={12} /> {yourText || '—'}
                            </div>
                          ) : (
                            <>
                              <div className="ses-ans-line ses-ans-line--ko">
                                <X size={12} /> {t('sessions.misc.yourAnswer')} {yourText || '—'}
                              </div>
                              <div className="ses-ans-line ses-ans-line--good">
                                <Check size={12} /> {t('sessions.misc.correctAnswer')} {goodText || '—'}
                              </div>
                            </>
                          )}
                          {bonus && <span className="ses-ans-bonus"><Zap size={11} /> {t('sessions.drawer.speedBonus')}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  title={t('sessions.empty.recapTitle')}
                  message={t('sessions.empty.recapMessage')}
                />
              )}
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}
