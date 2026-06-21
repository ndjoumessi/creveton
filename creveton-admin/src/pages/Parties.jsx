import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Eye, Check, X, User, Zap } from 'lucide-react';
import sessionsService from '../services/sessions.service';
import { useApiData } from '../hooks/useApiData';
import { THEME_KEYS, LEVEL_KEYS } from '../constants/enums';
import { themeLabels, levelLabels } from '../constants/theme';
import { num, pct, dateFr, dateTimeFr, isToday } from '../utils/format';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import ThemeBadge from '../components/ThemeBadge';
import Drawer from '../components/Drawer';
import Avatar from '../components/Avatar';
import { Skeleton } from '../components/Skeleton';
import './Parties.css';

const EMPTY_FILTERS = { theme: '', level: '', q: '', period: '' };

const PERIODS = [
  { value: '', label: 'Tout' },
  { value: 'today', label: "Aujourd'hui" },
  { value: '7', label: '7 jours' },
  { value: '30', label: '30 jours' },
];

/** Vrai si la partie tombe dans la période sélectionnée. */
function inPeriod(playedAt, period) {
  if (!period) return true;
  if (period === 'today') return isToday(playedAt);
  const days = Number(period);
  const d = new Date(playedAt);
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  return d.getTime() >= since;
}

/** Durée mm:ss ; "—" si indisponible (duration_s peut être null pour données réelles). */
function formatDuration(s) {
  const n = Number(s);
  if (s == null || Number.isNaN(n)) return '—';
  const m = Math.floor(n / 60);
  return `${m}:${String(Math.round(n) % 60).padStart(2, '0')}`;
}

/** Couleur du score selon la performance (or > 800, vert 400-800, gris < 400). */
function scoreColor(score) {
  if (score > 800) return 'var(--gold)';
  if (score >= 400) return 'var(--green500)';
  return 'var(--muted)';
}

/** Ratio de bonnes réponses, sécurisé. */
const ratioOf = (correct, total) => (total ? Math.min(1, correct / total) : 0);

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
    {
      id: 'player', header: 'Joueur', enableSorting: false,
      cell: ({ row }) => {
        const u = row.original.user;
        return (
          <div className="row" style={{ gap: 11 }}>
            <Avatar name={u.name} />
            <div className="stack" style={{ gap: 1 }}>
              <span className="cell-strong">{u.name}</span>
              {u.ville && <span className="list-sub">{u.ville}</span>}
            </div>
          </div>
        );
      },
    },
    { accessorKey: 'theme', header: 'Thème', enableSorting: false, cell: (c) => <ThemeBadge theme={c.getValue()} /> },
    {
      accessorKey: 'level', header: 'Niveau', enableSorting: false,
      cell: (c) => <span className="badge badge-level">{levelLabels[c.getValue()] || c.getValue()}</span>,
    },
    {
      accessorKey: 'score', header: 'Score',
      cell: (c) => (
        <span className="p-score" style={{ color: scoreColor(c.getValue()) }}>{num(c.getValue())}</span>
      ),
    },
    {
      id: 'ratio', header: 'Bonnes/Total', enableSorting: false,
      cell: ({ row }) => {
        const { correct_count: correct, question_count: tot } = row.original;
        return (
          <div className="row" style={{ gap: 9 }}>
            <span className="p-fraction">{correct}/{tot}</span>
            <span className="progress progress-mini" aria-hidden="true">
              <span style={{ width: `${ratioOf(correct, tot) * 100}%` }} />
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: 'xp_earned', header: 'XP',
      cell: (c) => (
        <span className="p-xp"><Zap size={13} className="p-xp-icon" />{num(c.getValue())}</span>
      ),
    },
    { accessorKey: 'duration_s', header: 'Durée', enableSorting: false, cell: (c) => formatDuration(c.getValue()) },
    {
      accessorKey: 'played_at', header: 'Date',
      cell: (c) => <span title={dateTimeFr(c.getValue())}>{dateFr(c.getValue())}</span>,
    },
    {
      id: 'actions', header: '', enableSorting: false,
      cell: ({ row }) => (
        <button
          className="icon-action" title="Voir le détail"
          onClick={(e) => { e.stopPropagation(); setSelected(row.original); }}
        >
          <Eye size={17} />
        </button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Parties"
        description="Consultez l’historique des parties jouées et le détail de chaque session."
      />

      {loading ? (
        <div className="dark-banner">
          {Array.from({ length: 4 }).map((_, i) => (
            <div className="item" key={i}>
              <Skeleton w={70} h={30} style={{ background: 'rgba(255,255,255,0.12)' }} />
              <Skeleton w={100} h={12} style={{ background: 'rgba(255,255,255,0.08)', marginTop: 8 }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="dark-banner">
          <div className="item"><div className="v">{num(kpis.total)}</div><div className="l">Total parties</div></div>
          <div className="item"><div className="v">{num(kpis.today)}</div><div className="l">Aujourd’hui</div></div>
          <div className="item"><div className="v">{num(kpis.avgScore)}</div><div className="l">Score moyen</div></div>
          <div className="item"><div className="v">{pct(kpis.successRate)}</div><div className="l">Taux de réussite global</div></div>
        </div>
      )}

      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <div className="filters">
          <div className="search"><Search size={16} /><input className="input" placeholder="Rechercher un joueur…" value={filters.q} onChange={(e) => setF('q', e.target.value)} /></div>
          <select className="select" value={filters.theme} onChange={(e) => setF('theme', e.target.value)}><option value="">Tous thèmes</option>{THEME_KEYS.map((t) => <option key={t} value={t}>{themeLabels[t]}</option>)}</select>
          <select className="select" value={filters.level} onChange={(e) => setF('level', e.target.value)}><option value="">Tous niveaux</option>{LEVEL_KEYS.map((l) => <option key={l} value={l}>{levelLabels[l]}</option>)}</select>
          <select className="select" value={filters.period} onChange={(e) => setF('period', e.target.value)}>{PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        onRowClick={setSelected}
        emptyMessage="Aucune partie ne correspond à ces filtres."
      />

      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Détail de la partie"
        width={520}
        footer={selected && (
          <button className="btn btn-creveton" onClick={() => navigate('/users')}>
            <User size={15} /> Voir le profil du joueur
          </button>
        )}
      >
        {selected && (
          <div className="stack" style={{ gap: 20 }}>
            <div className="row" style={{ gap: 12 }}>
              <Avatar name={selected.user.name} size="md" />
              <div className="stack" style={{ gap: 5 }}>
                <div className="p-drawer-name">{selected.user.name}</div>
                <div className="row wrap" style={{ gap: 7 }}>
                  <ThemeBadge theme={selected.theme} />
                  <span className="badge badge-level">{levelLabels[selected.level] || selected.level}</span>
                </div>
                <div className="list-sub" title={dateTimeFr(selected.played_at)}>{dateFr(selected.played_at)}</div>
              </div>
            </div>

            <div className="card card-dark p-score-card">
              <div className="p-score-card-label">Score de la partie</div>
              <div className="p-score-card-value">{num(selected.score)}</div>
              <div className="p-score-card-unit">points</div>
            </div>

            <div className="p-stats">
              <div className="p-stat">
                <div className="p-stat-v"><Zap size={14} className="p-xp-icon" />{num(selected.xp_earned)}</div>
                <div className="p-stat-l">XP</div>
              </div>
              <div className="p-stat">
                <div className="p-stat-v">{num(selected.speed_bonus)}</div>
                <div className="p-stat-l">Bonus vitesse</div>
              </div>
              <div className="p-stat">
                <div className="p-stat-v">{num(selected.streak_max)}</div>
                <div className="p-stat-l">Streak max</div>
              </div>
              <div className="p-stat">
                <div className="p-stat-v">{formatDuration(selected.duration_s)}</div>
                <div className="p-stat-l">Durée</div>
              </div>
            </div>

            <div>
              <div className="p-recap-title">Récapitulatif</div>
              {selected.answers && selected.answers.length > 0 ? (
                selected.answers.map((a, i) => (
                  <div className={`opt-review ${a.is_correct ? 'correct' : 'wrong'}`} key={a.question_id || i}>
                    <span className="p-recap-num">{i + 1}</span>
                    {a.is_correct
                      ? <Check size={16} className="p-recap-ico" />
                      : <X size={16} className="p-recap-ico" />}
                    <div className="grow" style={{ flex: 1, minWidth: 0 }}>
                      <div className="p-recap-q">{a.question_text}</div>
                      <div className="p-recap-a">{a.options?.[a.your_index]?.text || '—'}</div>
                    </div>
                    <span className="p-recap-time">{Math.round(a.elapsed_ms / 1000)}s</span>
                  </div>
                ))
              ) : (
                <div className="p-recap-empty">Récapitulatif indisponible pour cette partie.</div>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}
