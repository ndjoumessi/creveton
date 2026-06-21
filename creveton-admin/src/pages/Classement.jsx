import './Classement.css';
import { useState, useMemo } from 'react';
import { Crown, Trophy } from 'lucide-react';
import leaderboardService from '../services/leaderboard.service';
import { useApiData } from '../hooks/useApiData';
import { themeLabels } from '../constants/theme';
import { THEME_KEYS } from '../constants/enums';
import { num } from '../utils/format';
import PageHeader from '../components/PageHeader';
import Avatar from '../components/Avatar';
import EmptyState from '../components/EmptyState';
import { Skeleton, SkeletonTable } from '../components/Skeleton';

const SCOPES = [
  { key: 'global', label: 'Global' },
  { key: 'theme', label: 'Par thème' },
  { key: 'weekly', label: 'Hebdo' },
  { key: 'monthly', label: 'Mensuel' },
];

/* Une carte du podium (1er / 2e / 3e). */
function PodiumCard({ player, place }) {
  return (
    <div className={`podium-card p${place}`}>
      {place === 1 && (
        <div className="podium-crown" aria-hidden="true">
          <Crown size={32} fill="currentColor" strokeWidth={1.5} />
        </div>
      )}
      <div className="podium-rank">{place}<sup>{place === 1 ? 'er' : 'e'}</sup></div>
      <Avatar name={player.name} size="xl" />
      <div className="podium-name">{player.name}</div>
      <div className="podium-city">{player.ville}</div>
      <div className="podium-score">{num(player.score)}</div>
    </div>
  );
}

export default function Classement() {
  const [scope, setScope] = useState('global');
  const [theme, setTheme] = useState(THEME_KEYS[0]);

  const { data, loading } = useApiData(
    () => leaderboardService.get({ scope, theme: scope === 'theme' ? theme : undefined }),
    [scope, theme],
  );

  const rows = useMemo(() => data?.data || [], [data]);

  const top3 = rows.slice(0, 3);
  const podium = useMemo(() => {
    if (!top3.length) return [];
    const byRank = (r) => top3.find((p) => p.rank === r);
    // Ordre DOM = [2e, 1er, 3e] pour la disposition (CSS gère les hauteurs).
    return [byRank(2), byRank(1), byRank(3)].filter(Boolean);
  }, [top3]);

  const rest = rows.slice(3);
  const isEmpty = !loading && rows.length === 0;

  return (
    <>
      <PageHeader
        title="Classement"
        description="Les meilleurs joueurs Creveton selon la portée et le thème sélectionnés."
      />

      <div className="c-controls">
        <div className="scope-pills" role="tablist" aria-label="Portée du classement">
          {SCOPES.map((s) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={scope === s.key}
              className={`scope-pill${scope === s.key ? ' active' : ''}`}
              onClick={() => setScope(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>

        {scope === 'theme' && (
          <select
            className="select c-theme-select"
            aria-label="Thème du classement"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
          >
            {THEME_KEYS.map((t) => (
              <option key={t} value={t}>{themeLabels[t]}</option>
            ))}
          </select>
        )}
      </div>

      {data?.me && (
        <p className="muted" style={{ fontSize: 13, marginBottom: 18 }}>
          Votre position : <strong>#{data.me.rank}</strong> · {num(data.me.score)} pts
        </p>
      )}

      {loading ? (
        <>
          <div className="c-podium-skel">
            <Skeleton h={200} r={16} style={{ marginBottom: 14 }} />
            <Skeleton h={236} r={16} />
            <Skeleton h={200} r={16} style={{ marginBottom: 14 }} />
          </div>
          <SkeletonTable rows={8} cols={3} />
        </>
      ) : isEmpty ? (
        <EmptyState
          icon={Trophy}
          title="Aucun joueur classé"
          message="Le classement est encore vide pour cette portée. Revenez après les prochaines parties."
        />
      ) : (
        <>
          {podium.length > 0 && (
            <div className="podium">
              {podium.map((p) => (
                <PodiumCard key={p.user_id || p.rank} player={p} place={p.rank} />
              ))}
            </div>
          )}

          {rest.length > 0 && (
            <div className="card c-table-card">
              <table className="data">
                <thead>
                  <tr>
                    <th style={{ width: 80 }}>Rang</th>
                    <th>Joueur</th>
                    <th style={{ textAlign: 'right' }}>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {rest.map((p) => (
                    <tr key={p.user_id || p.rank}>
                      <td><span className="rank-cell">{p.rank}</span></td>
                      <td>
                        <div className="c-player">
                          <Avatar name={p.name} size="sm" />
                          <div>
                            <div className="cell-strong c-player-name">{p.name}</div>
                            <div className="c-player-city">{p.ville}</div>
                          </div>
                        </div>
                      </td>
                      <td><div className="c-score">{num(p.score)}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
