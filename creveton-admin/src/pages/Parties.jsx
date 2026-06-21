import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Eye, Check, X, User } from 'lucide-react';
import sessionsService from '../services/sessions.service';
import { useApiData } from '../hooks/useApiData';
import { THEME_KEYS, LEVEL_KEYS } from '../constants/enums';
import { themeLabels, levelLabels } from '../constants/theme';
import { num, dateFr, dateTimeFr, initials, avatarColor, isToday, pct } from '../utils/format';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import ThemeBadge from '../components/ThemeBadge';
import Drawer from '../components/Drawer';
import LoadingSpinner from '../components/LoadingSpinner';

const EMPTY_FILTERS = { theme: '', level: '', q: '', period: '' };

const PERIODS = [
  { value: '', label: 'Tout' },
  { value: 'today', label: "Aujourd'hui" },
  { value: '7', label: '7 jours' },
  { value: '30', label: '30 jours' },
];

const Avatar = ({ name }) => (
  <div className="avatar-c" style={{ background: avatarColor(name) }}>{initials(name)}</div>
);

/** Vrai si la partie tombe dans la période sélectionnée. */
function inPeriod(playedAt, period) {
  if (!period) return true;
  if (period === 'today') return isToday(playedAt);
  const days = Number(period);
  const d = new Date(playedAt);
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  return d.getTime() >= since;
}

/** Durée lisible : secondes (< 60 s) ou minutes arrondies ; "—" si indisponible. */
const formatDuration = (s) => {
  const n = Number(s);
  if (s == null || Number.isNaN(n)) return '—';
  return n < 60 ? `${n}s` : `${Math.round(n / 60)} min`;
};

export default function Parties() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selected, setSelected] = useState(null);

  const { data, loading } = useApiData(
    () => sessionsService.list(filters),
    [filters.theme, filters.level, filters.q],
  );
  const rows = useMemo(() => data?.data || [], [data]);

  const filtered = useMemo(
    () => rows.filter((s) => inPeriod(s.played_at, filters.period)),
    [rows, filters.period],
  );

  const kpis = useMemo(() => {
    const total = filtered.length;
    const today = filtered.filter((s) => isToday(s.played_at)).length;
    const avgScore = total ? Math.round(filtered.reduce((a, s) => a + s.score, 0) / total) : 0;
    const sumCorrect = filtered.reduce((a, s) => a + s.correct_count, 0);
    const sumTotal = filtered.reduce((a, s) => a + s.question_count, 0);
    const successRate = sumTotal ? sumCorrect / sumTotal : null;
    return { total, today, avgScore, successRate };
  }, [filtered]);

  const setF = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

  const columns = [
    { id: 'idx', header: '#', enableSorting: false, cell: ({ row }) => <span className="muted">{row.index + 1}</span> },
    {
      id: 'player', header: 'Joueur', enableSorting: false,
      cell: ({ row }) => (
        <div className="row" style={{ gap: 10 }}>
          <Avatar name={row.original.user.name} />
          <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{row.original.user.name}</span>
        </div>
      ),
    },
    { accessorKey: 'theme', header: 'Thème', enableSorting: false, cell: (c) => <ThemeBadge theme={c.getValue()} /> },
    { accessorKey: 'level', header: 'Niveau', enableSorting: false, cell: (c) => levelLabels[c.getValue()] || c.getValue() },
    { accessorKey: 'score', header: 'Score', cell: (c) => `${num(c.getValue())} pts` },
    {
      id: 'ratio', header: 'Bonnes/Total', enableSorting: false,
      cell: ({ row }) => `${row.original.correct_count}/${row.original.question_count}`,
    },
    { accessorKey: 'xp_earned', header: 'XP gagné', cell: (c) => num(c.getValue()) },
    { accessorKey: 'duration_s', header: 'Durée', enableSorting: false, cell: (c) => formatDuration(c.getValue()) },
    { accessorKey: 'played_at', header: 'Date', cell: (c) => dateFr(c.getValue()) },
    {
      id: 'actions', header: 'Actions', enableSorting: false,
      cell: ({ row }) => (
        <div className="row nowrap" style={{ gap: 2 }}>
          <button
            className="icon-action" title="Voir le détail"
            onClick={(e) => { e.stopPropagation(); setSelected(row.original); }}
          >
            <Eye size={17} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Parties"
        description="Consultez l’historique des parties jouées et le détail de chaque session."
      />

      <div className="grid grid-kpi" style={{ marginBottom: 20 }}>
        <div className="card kpi"><div className="kpi-label">Total parties</div><div className="kpi-value">{kpis.total}</div></div>
        <div className="card kpi"><div className="kpi-label">Parties aujourd’hui</div><div className="kpi-value">{kpis.today}</div></div>
        <div className="card kpi"><div className="kpi-label">Score moyen</div><div className="kpi-value">{num(kpis.avgScore)}</div></div>
        <div className="card kpi"><div className="kpi-label">Taux de réussite global</div><div className="kpi-value">{pct(kpis.successRate)}</div></div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <div className="filters">
          <div className="search"><Search size={16} /><input className="input" placeholder="Rechercher un joueur…" value={filters.q} onChange={(e) => setF('q', e.target.value)} /></div>
          <select className="select" value={filters.theme} onChange={(e) => setF('theme', e.target.value)}><option value="">Tous thèmes</option>{THEME_KEYS.map((t) => <option key={t} value={t}>{themeLabels[t]}</option>)}</select>
          <select className="select" value={filters.level} onChange={(e) => setF('level', e.target.value)}><option value="">Tous niveaux</option>{LEVEL_KEYS.map((l) => <option key={l} value={l}>{levelLabels[l]}</option>)}</select>
          <select className="select" value={filters.period} onChange={(e) => setF('period', e.target.value)}>{PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select>
        </div>
      </div>

      {loading ? (
        <div className="card"><LoadingSpinner label="Chargement…" /></div>
      ) : (
        <DataTable columns={columns} data={filtered} onRowClick={setSelected} emptyMessage="Aucune partie ne correspond à ces filtres." />
      )}

      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Détail de la partie"
        footer={selected && (
          <button className="btn btn-creveton" onClick={() => navigate('/users')}>
            <User size={15} /> Voir le profil du joueur
          </button>
        )}
      >
        {selected && (
          <div className="stack" style={{ gap: 18 }}>
            <div className="row" style={{ gap: 12 }}>
              <Avatar name={selected.user.name} />
              <div>
                <div style={{ fontFamily: 'Outfit', fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>{selected.user.name}</div>
                <div className="row wrap" style={{ gap: 8, marginTop: 4 }}>
                  <ThemeBadge theme={selected.theme} />
                  <span className="badge" style={{ background: '#f3f4f6', color: '#4b5563' }}>{levelLabels[selected.level] || selected.level}</span>
                </div>
              </div>
            </div>

            <dl className="kv">
              <dt>Joueur</dt><dd>{selected.user.name}</dd>
              <dt>Thème</dt><dd>{themeLabels[selected.theme] || selected.theme}</dd>
              <dt>Niveau</dt><dd>{levelLabels[selected.level] || selected.level}</dd>
              <dt>Date</dt><dd>{dateTimeFr(selected.played_at)}</dd>
              <dt>Durée</dt><dd>{formatDuration(selected.duration_s)}</dd>
            </dl>

            <div className="grid grid-kpi" style={{ gap: 12 }}>
              <div className="card kpi"><div className="kpi-label">Score</div><div className="kpi-value">{num(selected.score)} pts</div></div>
              <div className="card kpi"><div className="kpi-label">XP</div><div className="kpi-value">{num(selected.xp_earned)}</div></div>
              <div className="card kpi"><div className="kpi-label">Bonus vitesse</div><div className="kpi-value">{num(selected.speed_bonus)}</div></div>
              <div className="card kpi"><div className="kpi-label">Streak max</div><div className="kpi-value">{num(selected.streak_max)}</div></div>
            </div>

            <div>
              <div className="muted" style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>RÉCAPITULATIF</div>
              {(selected.answers || []).map((a, i) => (
                <div className={`opt-review ${a.is_correct ? 'correct' : ''}`} key={i}>
                  {a.is_correct
                    ? <Check size={16} style={{ color: '#15803d', flex: 'none' }} />
                    : <X size={16} style={{ color: '#dc2626', flex: 'none' }} />}
                  <div className="grow" style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, color: 'var(--ink)' }}>{a.question_text}</div>
                    <div className="muted" style={{ fontSize: 13 }}>{a.options?.[a.your_index]?.text || '—'}</div>
                  </div>
                  <span className="muted" style={{ fontSize: 13, flex: 'none' }}>{Math.round(a.elapsed_ms / 1000)}s</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}
