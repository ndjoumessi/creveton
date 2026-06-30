import './Classement.css';
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Trophy, Globe, Target, CalendarDays, CalendarRange, AlertTriangle } from 'lucide-react';
import { Icon } from '../components/Icon';
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
  { key: 'global', labelKey: 'leaderboard.scopes.global', icon: Globe },
  { key: 'theme', labelKey: 'leaderboard.scopes.theme', icon: Target },
  { key: 'weekly', labelKey: 'leaderboard.scopes.weekly', icon: CalendarDays },
  { key: 'monthly', labelKey: 'leaderboard.scopes.monthly', icon: CalendarRange },
];

// Niveaux joueur 1..5 — couleur + libellé (sens doublé : jamais la teinte seule).

/* Couronne du champion (sway animé en CSS). */
function CrownSvg() {
  return (
    <svg className="lb-crown-svg" viewBox="0 0 48 36" width="48" height="36" aria-hidden="true">
      <path
        d="M4 30 L8 10 L17 20 L24 6 L31 20 L40 10 L44 30 Z"
        fill="#ffffff"
        stroke="#0b2e1a"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <rect x="4" y="30" width="40" height="4" rx="2" fill="#ffffff" stroke="#0b2e1a" strokeWidth="1.5" />
      <circle cx="8" cy="9" r="2.4" fill="#ffffff" stroke="#0b2e1a" strokeWidth="1.5" />
      <circle cx="24" cy="5" r="2.4" fill="#ffffff" stroke="#0b2e1a" strokeWidth="1.5" />
      <circle cx="40" cy="9" r="2.4" fill="#ffffff" stroke="#0b2e1a" strokeWidth="1.5" />
    </svg>
  );
}

/* Médaille argent / bronze (inline SVG, sens doublé par le rang affiché). */
function MedalSvg({ tone }) {
  const { t } = useTranslation();
  const palette = tone === 'silver'
    ? { ring: '#9ca3af', face: '#e5e7eb', ink: '#374151', label: t('leaderboard.misc.silver') }
    : { ring: '#b45309', face: '#fbcf9c', ink: '#7c2d12', label: t('leaderboard.misc.bronze') };
  return (
    <svg className="lb-medal-svg" viewBox="0 0 36 36" width="36" height="36" role="img" aria-label={t('leaderboard.a11y.medal', { tone: palette.label })}>
      <path d="M11 2 L18 14 L7 14 Z" fill={palette.ring} opacity="0.55" />
      <path d="M25 2 L29 14 L18 14 Z" fill={palette.ring} opacity="0.55" />
      <circle cx="18" cy="24" r="11" fill={palette.face} stroke={palette.ring} strokeWidth="2.5" />
      <text x="18" y="28" textAnchor="middle" fontFamily="Outfit, sans-serif" fontWeight="800" fontSize="13" fill={palette.ink}>
        {tone === 'silver' ? '2' : '3'}
      </text>
    </svg>
  );
}

/* Carte podium pour la 1ʳᵉ place (centre, signature dorée). */
function PodiumFirst({ player }) {
  const { t } = useTranslation();
  return (
    <div className="lb-podium-card lb-p1">
      <div className="lb-crown" aria-hidden="true"><CrownSvg /></div>
      <div className="lb-avatar-ring lb-ring-gold">
        <Avatar name={player.name} size="xl" />
      </div>
      <div className="lb-podium-name lb-name-light">{player.name}</div>
      <div className="lb-podium-city lb-city-light">{player.ville || '—'}</div>
      <div className="lb-podium-score lb-score-light">{num(player.score)}</div>
      <div className="lb-podium-pts lb-pts-light">{t('leaderboard.pts')}</div>
      <span className="lb-champ-badge"><Icon icon={Trophy} size={16} /> {t('leaderboard.champion')}</span>
    </div>
  );
}

/* Carte podium pour 2e (argent) / 3e (bronze). */
function PodiumSide({ player, place }) {
  const { t } = useTranslation();
  const tone = place === 2 ? 'silver' : 'bronze';
  return (
    <div className={`lb-podium-card lb-p${place}`}>
      <div className="lb-medal" aria-hidden="true"><MedalSvg tone={tone} /></div>
      <div className={`lb-avatar-ring lb-ring-${tone}`}>
        <Avatar name={player.name} size="lg" />
      </div>
      <div className="lb-podium-name">{player.name}</div>
      <div className="lb-podium-city">{player.ville || '—'}</div>
      <div className="lb-podium-score">{num(player.score)}</div>
      <div className="lb-podium-pts">{t('leaderboard.pts')}</div>
    </div>
  );
}

export default function Classement() {
  const { t } = useTranslation();
  const [scope, setScope] = useState('global');
  const [theme, setTheme] = useState(THEME_KEYS[0]);

  const { data, loading, error, refetch } = useApiData(
    () => leaderboardService.get({ scope, theme: scope === 'theme' ? theme : undefined }),
    [scope, theme],
  );

  const rows = useMemo(() => data?.data || [], [data]);
  const me = data?.me || null;

  const byRank = useMemo(() => {
    const map = {};
    rows.forEach((p) => { map[p.rank] = p; });
    return map;
  }, [rows]);

  const first = byRank[1];
  const second = byRank[2];
  const third = byRank[3];
  const rest = useMemo(() => rows.filter((p) => p.rank > 3), [rows]);
  const isEmpty = !loading && rows.length === 0;

  return (
    <>
      <PageHeader
        title={t('leaderboard.title')}
        description={t('leaderboard.subtitle')}
      />

      <div className="lb-controls">
        <div className="lb-pills" role="tablist" aria-label={t('leaderboard.title')}>
          {SCOPES.map((s) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={scope === s.key}
              className={`lb-pill${scope === s.key ? ' active' : ''}`}
              onClick={() => setScope(s.key)}
            >
              <span className="lb-pill-icon"><Icon icon={s.icon} size={16} /></span>
              {t(s.labelKey)}
            </button>
          ))}
        </div>

        {scope === 'theme' && (
          <div className="lb-theme-slide">
            <select
              className="select lb-theme-select"
              aria-label={t('leaderboard.scopes.theme')}
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
            >
              {THEME_KEYS.map((t) => (
                <option key={t} value={t}>{themeLabels[t]}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {me && (
        <div className="lb-me-card">
          <span className="lb-me-label">{t('leaderboard.myPosition')}</span>
          <span className="lb-me-value">
            #{me.rank} · {num(me.score)} {t('leaderboard.pts')}
          </span>
        </div>
      )}

      {error ? (
        <EmptyState
          icon={AlertTriangle}
          title={t('common.error')}
          action={<button type="button" className="btn" onClick={refetch}>{t('common.retry')}</button>}
        />
      ) : loading ? (
        <>
          <div className="lb-podium-skel">
            <Skeleton h={208} r={20} />
            <Skeleton h={256} r={20} />
            <Skeleton h={208} r={20} />
          </div>
          <div className="lb-table-card card">
            <SkeletonTable rows={8} cols={4} />
          </div>
        </>
      ) : isEmpty ? (
        <EmptyState
          icon={Trophy}
          title={t('leaderboard.empty.title')}
          message={t('leaderboard.empty.message')}
        />
      ) : (
        <>
          {(first || second || third) && (
            <div className="lb-podium">
              <div className="lb-podium-slot lb-slot-2">
                {second ? <PodiumSide player={second} place={2} /> : <div className="lb-podium-ghost" />}
              </div>
              <div className="lb-podium-slot lb-slot-1">
                {first ? <PodiumFirst player={first} /> : <div className="lb-podium-ghost" />}
              </div>
              <div className="lb-podium-slot lb-slot-3">
                {third ? <PodiumSide player={third} place={3} /> : <div className="lb-podium-ghost" />}
              </div>
            </div>
          )}

          {rest.length > 0 && (
            <div className="lb-table-card card">
              <table className="data lb-table">
                <thead>
                  <tr>
                    <th className="lb-th-rank">{t('leaderboard.columns.rank')}</th>
                    <th>{t('leaderboard.columns.player')}</th>
                    <th className="lb-th-city">{t('leaderboard.columns.city')}</th>
                    <th className="lb-th-level">{t('leaderboard.columns.level')}</th>
                    <th className="lb-th-score">{t('leaderboard.columns.score')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rest.map((p) => {
                    const isMe = me && p.rank === me.rank;
                    return (
                      <tr key={p.user_id || p.rank} className={isMe ? 'lb-row-me' : ''}>
                        <td>
                          <span className="lb-rank">{p.rank}</span>
                        </td>
                        <td>
                          <div className="lb-player">
                            <Avatar name={p.name} size="sm" />
                            <div className="lb-player-meta">
                              <div className="lb-player-name">
                                {p.name}
                                {isMe && <span className="lb-you-badge">{t('leaderboard.you')}</span>}
                              </div>
                              <div className="lb-player-sub">{p.ville || '—'}</div>
                            </div>
                          </div>
                        </td>
                        <td className="lb-td-city">{p.ville || '—'}</td>
                        <td className="lb-td-level">
                          {p.level != null ? (
                            <span className={`lb-level-badge lb-level--${p.level}`}>
                              {t('common.level')} {p.level}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="lb-td-score">
                          <span className="lb-score">{num(p.score)}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
