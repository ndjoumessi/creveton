import { useState, useMemo } from 'react';
import leaderboardService from '../services/leaderboard.service';
import { useApiData } from '../hooks/useApiData';
import { themeLabels } from '../constants/theme';
import { num, initials, avatarColor } from '../utils/format';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import LoadingSpinner from '../components/LoadingSpinner';

const SCOPES = [
  { key: 'global', label: 'Global' },
  { key: 'theme', label: 'Par thème' },
  { key: 'weekly', label: 'Hebdomadaire' },
  { key: 'monthly', label: 'Mensuel' },
];

const LB_THEMES = ['culture', 'geographie', 'histoire', 'industrie'];

/* ---------- Sous-composants (niveau module pour react-hooks/static-components) ---------- */
function Avatar({ name, large }) {
  return (
    <span
      className={`avatar-c${large ? ' avatar-lg' : ''}`}
      style={{ background: avatarColor(name) }}
    >
      {initials(name)}
    </span>
  );
}

function PodiumCard({ player, place }) {
  return (
    <div className={`podium-card podium-${place}`}>
      <div className={`podium-medal medal-${place}`}>{place}</div>
      <Avatar name={player.name} large />
      <div className="podium-name" style={{ marginTop: 8 }}>{player.name}</div>
      <div className="muted" style={{ fontSize: 13 }}>{player.ville}</div>
      <div className="podium-score">{num(player.score)} pts</div>
      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Niveau {player.level}</div>
    </div>
  );
}

/* ---------- Page ---------- */
export default function Classement() {
  const [scope, setScope] = useState('global');
  const [theme, setTheme] = useState('');

  const { data, loading } = useApiData(
    () => leaderboardService.get({ scope, theme: scope === 'theme' ? theme : undefined }),
    [scope, theme],
  );

  const rows = useMemo(() => data?.data || [], [data]);

  const columns = useMemo(() => [
    { accessorKey: 'rank', header: 'Rang', cell: (c) => <span className="muted" style={{ fontWeight: 600 }}>#{c.getValue()}</span> },
    {
      accessorKey: 'name',
      header: 'Joueur',
      cell: ({ row }) => (
        <div className="row" style={{ gap: 10 }}>
          <Avatar name={row.original.name} />
          <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{row.original.name}</span>
        </div>
      ),
    },
    { accessorKey: 'ville', header: 'Ville', cell: (c) => <span className="muted">{c.getValue()}</span> },
    { accessorKey: 'level', header: 'Niveau', cell: (c) => `Niv. ${c.getValue()}` },
    { accessorKey: 'score', header: 'Score total', cell: (c) => <strong>{num(c.getValue())} pts</strong> },
    { accessorKey: 'games', header: 'Parties', cell: (c) => num(c.getValue()) },
  ], []);

  const onScope = (key) => {
    setScope(key);
    if (key === 'theme' && !theme) setTheme(LB_THEMES[0]);
  };

  const top3 = rows.slice(0, 3);
  const podium = top3.length >= 3
    ? [top3.find((r) => r.rank === 2), top3.find((r) => r.rank === 1), top3.find((r) => r.rank === 3)]
    : null;

  return (
    <>
      <PageHeader
        title="Classement"
        description="Suivez les meilleurs joueurs Creveton selon la portée et le thème sélectionnés."
        actions={
          <div className="lang-toggle">
            {SCOPES.map((s) => (
              <button
                key={s.key}
                className={scope === s.key ? 'active' : ''}
                onClick={() => onScope(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
        }
      />

      {scope === 'theme' && (
        <div className="lang-toggle" style={{ marginBottom: 18 }}>
          {LB_THEMES.map((t) => (
            <button
              key={t}
              className={(theme || LB_THEMES[0]) === t ? 'active' : ''}
              onClick={() => setTheme(t)}
            >
              {themeLabels[t]}
            </button>
          ))}
        </div>
      )}

      {data?.me && (
        <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
          Votre position : #{data.me.rank} · {num(data.me.score)} pts
        </p>
      )}

      {loading && !data ? (
        <div className="card"><LoadingSpinner label="Chargement du classement…" /></div>
      ) : (
        <>
          {podium && (
            <div className="podium">
              <PodiumCard player={podium[0]} place={2} />
              <PodiumCard player={podium[1]} place={1} />
              <PodiumCard player={podium[2]} place={3} />
            </div>
          )}

          <DataTable
            columns={columns}
            data={rows.slice(3)}
            emptyMessage="Aucun autre joueur classé."
          />
        </>
      )}
    </>
  );
}
