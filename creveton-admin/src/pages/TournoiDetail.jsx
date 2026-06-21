import './Tournois.css';
import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Play, X, Trophy, Users, Calendar, Crown, Medal, Award, Target,
} from 'lucide-react';
import tournamentsService from '../services/tournaments.service';
import { useApiData } from '../hooks/useApiData';
import { themeBadgeColors, themeLabels, tournamentStatusColors } from '../constants/theme';
import { num, fcfa, dateFr, pct } from '../utils/format';
import PageHeader from '../components/PageHeader';
import Avatar from '../components/Avatar';
import EmptyState from '../components/EmptyState';
import { Skeleton } from '../components/Skeleton';
import { notify } from '../components/Toast';

const MEDAL = ['#d4a017', '#9aa3ad', '#b27a44'];

function StatusBadge({ status }) {
  const cfg = tournamentStatusColors[status] || { fg: '#6b7280', label: status };
  return (
    <span className={`tour-status ${status === 'running' ? 'is-live' : ''}`} style={{ color: cfg.fg, background: '#fff', border: '1px solid var(--border)' }}>
      <span className="tour-status-dot" style={{ background: cfg.fg }} />
      {status === 'running' ? 'EN COURS' : cfg.label}
    </span>
  );
}

export default function TournoiDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, loading, refetch } = useApiData(() => tournamentsService.detail(id), [id], { pollMs: 10000 });

  const t = data?.tournament || null;
  const participants = useMemo(() => data?.participants || [], [data]);
  const stats = data?.stats || null;
  const podium = useMemo(() => participants.slice(0, 3), [participants]);
  const isClosed = t && ['closed', 'paid'].includes(t.status);

  const act = async (fn, label) => {
    try { await fn(id); notify.success(label); refetch(); }
    catch (e) { notify.error(e?.response?.data?.error?.message || 'Action impossible.'); }
  };

  if (loading && !data) {
    return (<><PageHeader title="Tournoi" /><Skeleton w="100%" h={320} r={14} /></>);
  }
  if (!t) {
    return (<><PageHeader title="Tournoi" /><div className="card"><EmptyState icon={Trophy} title="Tournoi introuvable" message="Ce tournoi n’existe pas ou a été supprimé." action={<button className="btn" onClick={() => navigate('/tournaments')}><ArrowLeft size={15} /> Retour</button>} /></div></>);
  }

  const emoji = (themeBadgeColors[t.theme] && themeBadgeColors[t.theme].icon) || '🏆';
  const fillPct = t.max_players ? Math.min(100, Math.round((t.registered_players / t.max_players) * 100)) : 0;

  return (
    <>
      <button className="tour-back" onClick={() => navigate('/tournaments')}><ArrowLeft size={16} /> Tous les tournois</button>
      <PageHeader
        title={<span className="tour-detail-title"><span className="tour-detail-emoji">{emoji}</span> {t.name}</span>}
        description={`${themeLabels[t.theme] || t.theme || 'Thèmes mixtes'} · ${Number(t.entry_fee) > 0 ? 'Payant' : 'Gratuit'}`}
        actions={(
          <>
            <StatusBadge status={t.status} />
            {(t.status === 'scheduled' || t.status === 'open') && (
              <>
                <button className="btn btn-success" onClick={() => act(tournamentsService.start, 'Tournoi démarré')}><Play size={15} /> Démarrer</button>
                <button className="btn btn-danger-ghost" onClick={() => { if (window.confirm('Annuler ce tournoi ?')) act(tournamentsService.cancel, 'Tournoi annulé'); }}><X size={15} /> Annuler</button>
              </>
            )}
            {(t.status === 'running' || t.status === 'closed') && (
              <button className="btn btn-gold" onClick={() => act(tournamentsService.payout, 'Résultats validés')}><Trophy size={15} /> Valider les résultats</button>
            )}
          </>
        )}
      />

      {/* Stats du tournoi */}
      <div className="tour-detail-kpis">
        <div className="tour-dkpi"><Users size={18} /><div><span className="n">{num(stats?.registered ?? t.registered_players ?? 0)}{t.max_players ? ` / ${t.max_players}` : ''}</span><span className="l">Inscrits</span></div></div>
        <div className="tour-dkpi"><Target size={18} /><div><span className="n">{stats ? pct(stats.completion_rate, 0) : '—'}</span><span className="l">Complétion</span></div></div>
        <div className="tour-dkpi"><Award size={18} /><div><span className="n">{num(stats?.avg_score ?? 0)}</span><span className="l">Score moyen</span></div></div>
        <div className="tour-dkpi"><Trophy size={18} /><div><span className="n">{num(stats?.top_score ?? 0)}</span><span className="l">Meilleur score</span></div></div>
      </div>

      <div className="tour-detail-grid">
        {/* Infos */}
        <div className="card card-pad">
          <h3 className="card-title">Informations</h3>
          <dl className="kv" style={{ marginTop: 12 }}>
            <dt>Type</dt><dd>{Number(t.entry_fee) > 0 ? 'Payant' : 'Gratuit (XP & badges)'}</dd>
            <dt>Thème</dt><dd>{themeLabels[t.theme] || t.theme || 'Mixte'}</dd>
            <dt>Récompenses</dt><dd>{Number(t.entry_fee) > 0 ? fcfa(t.prize_pool) : '🏅 XP & badges'}</dd>
            <dt>Joueurs</dt>
            <dd>
              <div className="tour-detail-fill"><span style={{ width: `${fillPct}%` }} /></div>
              {num(t.registered_players || 0)}{t.max_players ? ` / ${t.max_players}` : ''}
            </dd>
            <dt>Début</dt><dd><Calendar size={13} /> {t.starts_at ? dateFr(t.starts_at, "dd MMM yyyy 'à' HH'h'mm") : '—'}</dd>
            {t.ends_at && <><dt>Fin</dt><dd>{dateFr(t.ends_at, "dd MMM yyyy 'à' HH'h'mm")}</dd></>}
          </dl>
        </div>

        {/* Podium (si terminé) */}
        {isClosed && podium.length > 0 && (
          <div className="card card-pad">
            <h3 className="card-title">Podium</h3>
            <div className="podium" style={{ marginTop: 16 }}>
              {[1, 0, 2].map((slot) => {
                const p = podium[slot];
                if (!p) return <div key={slot} />;
                const cls = slot === 0 ? 'p1' : slot === 1 ? 'p2' : 'p3';
                return (
                  <div className={`podium-card ${cls}`} key={p.id}>
                    {slot === 0 && <Crown className="podium-crown" size={22} />}
                    <div className="podium-rank">#{p.rank}</div>
                    <div style={{ display: 'flex', justifyContent: 'center', margin: '6px 0' }}><Avatar name={p.name} size="md" /></div>
                    <div className="podium-name">{p.name}</div>
                    {p.ville && <div className="podium-city">{p.ville}</div>}
                    <div className="podium-score">{num(p.score)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Participants */}
      <div className="card card-pad" style={{ marginTop: 20 }}>
        <div className="between">
          <div>
            <h3 className="card-title">Participants{isClosed ? ' · classement final' : ''}</h3>
            <p className="card-sub">{t.status === 'running' ? 'Rafraîchi automatiquement toutes les 10 s.' : 'Inscrits à ce tournoi.'}</p>
          </div>
        </div>
        {participants.length === 0 ? (
          <EmptyState icon={Users} title="Aucun participant" message="Personne ne s’est encore inscrit à ce tournoi." />
        ) : (
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table className="data">
              <thead><tr><th>Rang</th><th>Joueur</th><th>Ville</th><th>Score</th>{isClosed && <th>Gain</th>}<th>Inscrit le</th></tr></thead>
              <tbody>
                {participants.map((p) => (
                  <tr key={p.id}>
                    <td><span className="tour-rank" style={p.rank <= 3 ? { background: MEDAL[p.rank - 1], color: '#fff' } : undefined}>{p.rank}{p.rank <= 3 && <Medal size={11} />}</span></td>
                    <td><div className="row" style={{ gap: 9 }}><Avatar name={p.name} size="sm" /><span className="cell-strong">{p.name}</span></div></td>
                    <td className="muted">{p.ville || '—'}</td>
                    <td className="cell-strong">{num(p.score)}</td>
                    {isClosed && <td>{p.payout > 0 ? fcfa(p.payout) : '—'}</td>}
                    <td className="muted">{dateFr(p.joined_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
