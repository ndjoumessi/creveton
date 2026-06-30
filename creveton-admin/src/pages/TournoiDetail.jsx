import './Tournois.css';
import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Play, X, Trophy, Users, Calendar, Crown, Medal, Award, Target,
} from 'lucide-react';
import { Icon } from '../components/Icon';
import tournamentsService from '../services/tournaments.service';
import { list as searchUsers } from '../services/users.service';
import { useApiData } from '../hooks/useApiData';
import { themeBadgeColors, themeLabels, tournamentStatusColors } from '../constants/theme';
import { num, fcfa, dateFr, pct } from '../utils/format';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import Avatar from '../components/Avatar';
import EmptyState from '../components/EmptyState';
import { Skeleton } from '../components/Skeleton';
import { notify } from '../components/Toast';

const MEDAL = ['#d4a017', '#9aa3ad', '#b27a44'];

function StatusBadge({ status }) {
  const { t } = useTranslation();
  const cfg = tournamentStatusColors[status] || { fg: '#6b7280', label: status };
  const label = t(`tournaments.statuses.${status}`, cfg.label);
  return (
    <span className={`tour-status ${status === 'running' ? 'is-live' : ''}`} style={{ color: cfg.fg, background: '#fff', border: '1px solid var(--border)' }}>
      <span className="tour-status-dot" style={{ background: cfg.fg }} />
      {status === 'running' ? t('tournaments.statuses.running') : label}
    </span>
  );
}

export default function TournoiDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, loading, refetch } = useApiData(() => tournamentsService.detail(id), [id], { pollMs: 10000 });

  const tour = data?.tournament || null;
  const participants = useMemo(() => data?.participants || [], [data]);
  const stats = data?.stats || null;
  const podium = useMemo(() => participants.slice(0, 3), [participants]);
  const isClosed = tour && ['closed', 'paid'].includes(tour.status);
  const canAdd = tour && !['cancelled', 'paid'].includes(tour.status);
  const canRemove = tour && ['open', 'scheduled'].includes(tour.status);

  // Confirmation explicite avant toute action sensible (démarrer / annuler / payout / retrait).
  const [confirm, setConfirm] = useState(null); // { fn, label, title, body, confirmLabel, danger }
  const [busy, setBusy] = useState(false);

  // Recherche + inscription manuelle de joueur.
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [adding, setAdding] = useState(false);
  const searchDebounce = useRef(null);

  useEffect(() => {
    if (!searchQ || searchQ.length < 2) { setSearchResults([]); return undefined; }
    let active = true;
    clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        const result = await searchUsers({ q: searchQ, limit: 8, status: 'active' });
        if (active) setSearchResults(result?.data || []);
      } catch { /* silent */ } finally {
        if (active) setSearching(false);
      }
    }, 300);
    return () => { active = false; clearTimeout(searchDebounce.current); };
  }, [searchQ]);

  const clearSearch = useCallback(() => {
    setSearchQ('');
    setSearchResults([]);
    setSelectedUser(null);
  }, []);

  const handleAddParticipant = useCallback(async () => {
    if (!selectedUser || adding) return;
    setAdding(true);
    try {
      await tournamentsService.addParticipant(id, selectedUser.id);
      notify.success(t('tournaments.detail.participantAdded'));
      clearSearch();
      refetch();
    } catch (e) {
      notify.error(e?.response?.data?.error?.message || t('tournaments.notify.actionFailed'));
    } finally {
      setAdding(false);
    }
  }, [selectedUser, adding, id, t, clearSearch, refetch]);

  const runConfirm = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      await confirm.fn(id);
      notify.success(confirm.label);
      refetch();
    } catch (e) {
      notify.error(e?.response?.data?.error?.message || t('tournaments.notify.actionFailed'));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  if (loading && !data) {
    return (<><PageHeader title={t('tournaments.detail.pageTitle')} /><Skeleton w="100%" h={320} r={14} /></>);
  }
  if (!tour) {
    return (<><PageHeader title={t('tournaments.detail.pageTitle')} /><div className="card"><EmptyState icon={Trophy} title={t('tournaments.detail.notFoundTitle')} message={t('tournaments.detail.notFoundMessage')} action={<button className="btn" onClick={() => navigate('/tournaments')}><ArrowLeft size={15} /> {t('tournaments.detail.back')}</button>} /></div></>);
  }

  const emoji = (themeBadgeColors[tour.theme] && themeBadgeColors[tour.theme].icon) || '🏆';
  const fillPct = tour.max_players ? Math.min(100, Math.round((tour.registered_players / tour.max_players) * 100)) : 0;

  return (
    <>
      <button className="tour-back" onClick={() => navigate('/tournaments')}><ArrowLeft size={16} /> {t('tournaments.detail.allTournaments')}</button>
      <PageHeader
        title={<span className="tour-detail-title"><span className="tour-detail-emoji">{emoji}</span> {tour.name}</span>}
        description={`${t(`questions.themes.${tour.theme}`, themeLabels[tour.theme] || tour.theme || t('tournaments.detail.mixedThemes'))} · ${Number(tour.entry_fee) > 0 ? t('tournaments.card.paid') : t('tournaments.card.free')}`}
        actions={(
          <>
            <StatusBadge status={tour.status} />
            {(tour.status === 'scheduled' || tour.status === 'open') && (
              <>
                <button className="btn btn-success" onClick={() => setConfirm({ fn: tournamentsService.start, label: t('tournaments.toast.startedSimple'), title: t('tournaments.confirm.startTitle'), body: t('tournaments.confirm.startBody'), confirmLabel: t('tournaments.actions.start') })}><Play size={15} /> {t('tournaments.actions.start')}</button>
                <button className="btn btn-danger-ghost" onClick={() => setConfirm({ fn: tournamentsService.cancel, label: t('tournaments.toast.cancelled'), title: t('tournaments.confirm.cancelTitle'), body: t('tournaments.confirm.cancelBody', { name: tour.name }), confirmLabel: t('tournaments.actions.cancel'), danger: true })}><X size={15} /> {t('tournaments.actions.cancel')}</button>
              </>
            )}
            {(tour.status === 'running' || tour.status === 'closed') && (
              <button className="btn btn-gold" onClick={() => setConfirm({ fn: tournamentsService.payout, label: t('tournaments.toast.resultsValidated'), title: t('tournaments.confirm.payoutTitle'), body: t('tournaments.confirm.payoutBody'), confirmLabel: t('tournaments.actions.validateResults'), danger: true })}><Trophy size={15} /> {t('tournaments.actions.validateResults')}</button>
            )}
          </>
        )}
      />

      {/* Stats du tournoi */}
      <div className="tour-detail-kpis">
        <div className="tour-dkpi"><Users size={18} /><div><span className="n">{num(stats?.registered ?? tour.registered_players ?? 0)}{tour.max_players ? ` / ${tour.max_players}` : ''}</span><span className="l">{t('tournaments.detail.registered')}</span></div></div>
        <div className="tour-dkpi"><Target size={18} /><div><span className="n">{stats ? pct(stats.completion_rate, 0) : '—'}</span><span className="l">{t('tournaments.detail.completion')}</span></div></div>
        <div className="tour-dkpi"><Award size={18} /><div><span className="n">{num(stats?.avg_score ?? 0)}</span><span className="l">{t('tournaments.detail.avgScore')}</span></div></div>
        <div className="tour-dkpi"><Trophy size={18} /><div><span className="n">{num(stats?.top_score ?? 0)}</span><span className="l">{t('tournaments.detail.topScore')}</span></div></div>
      </div>

      <div className="tour-detail-grid">
        {/* Infos */}
        <div className="card card-pad">
          <h3 className="card-title">{t('tournaments.detail.info')}</h3>
          <dl className="kv" style={{ marginTop: 12 }}>
            <dt>{t('tournaments.detail.type')}</dt><dd>{Number(tour.entry_fee) > 0 ? t('tournaments.card.paid') : t('tournaments.detail.freeType')}</dd>
            <dt>{t('tournaments.modal.theme')}</dt><dd>{t(`questions.themes.${tour.theme}`, themeLabels[tour.theme] || tour.theme || t('tournaments.detail.mixed'))}</dd>
            <dt>{t('tournaments.detail.rewards')}</dt><dd>{Number(tour.entry_fee) > 0 ? fcfa(tour.prize_pool) : <><Icon icon={Award} size={13} /> {t('tournaments.card.xpBadges')}</>}</dd>
            <dt>{t('tournaments.detail.players')}</dt>
            <dd>
              <div className="tour-detail-fill"><span style={{ width: `${fillPct}%` }} /></div>
              {num(tour.registered_players || 0)}{tour.max_players ? ` / ${tour.max_players}` : ''}
            </dd>
            <dt>{t('tournaments.modal.startLabel')}</dt><dd><Calendar size={13} /> {tour.starts_at ? dateFr(tour.starts_at, "dd MMM yyyy 'à' HH'h'mm") : '—'}</dd>
            {tour.ends_at && <><dt>{t('tournaments.detail.end')}</dt><dd>{dateFr(tour.ends_at, "dd MMM yyyy 'à' HH'h'mm")}</dd></>}
          </dl>
        </div>

        {/* Podium (si terminé) */}
        {isClosed && podium.length > 0 && (
          <div className="card card-pad">
            <h3 className="card-title">{t('tournaments.detail.podium')}</h3>
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
            <h3 className="card-title">{isClosed ? t('tournaments.detail.participantsFinal') : t('tournaments.detail.participants')}</h3>
            <p className="card-sub">{tour.status === 'running' ? t('tournaments.detail.autoRefresh') : t('tournaments.detail.registeredHere')}</p>
          </div>
        </div>

        {/* Inscription manuelle */}
        {canAdd && (
          <div className="tour-add-section" style={{ marginTop: 16 }}>
            <p className="tour-add-title">{t('tournaments.detail.addParticipant')}</p>
            {selectedUser ? (
              <div className="tour-selected-user">
                <Avatar name={selectedUser.name} size="sm" />
                <span className="tour-selected-name">{selectedUser.name}</span>
                <span className="tour-selected-level">Niv. {selectedUser.level}</span>
                <button className="tour-selected-clear" onClick={clearSearch}>✕</button>
                <button className="btn btn-primary btn-sm" onClick={handleAddParticipant} disabled={adding}>
                  {adding ? '…' : t('tournaments.detail.enroll')}
                </button>
              </div>
            ) : (
              <div className="tour-search-wrap">
                <input
                  className="tour-search-input"
                  type="text"
                  placeholder={t('tournaments.detail.searchPlaceholder')}
                  value={searchQ}
                  onChange={(e) => { setSearchQ(e.target.value); }}
                />
                {searchQ.length >= 2 && !searching && searchResults.length === 0 && (
                  <div className="tour-search-dropdown">
                    <div className="tour-search-empty">{t('tournaments.detail.noResults')}</div>
                  </div>
                )}
                {searchResults.length > 0 && (
                  <div className="tour-search-dropdown">
                    {searchResults.map((u) => (
                      <div
                        key={u.id}
                        className="tour-search-result"
                        onClick={() => { setSelectedUser(u); setSearchQ(''); setSearchResults([]); }}
                      >
                        <Avatar name={u.name} size="sm" />
                        <span className="tour-search-result-name">{u.name}</span>
                        <span className="tour-search-result-level">Niv. {u.level}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {participants.length === 0 ? (
          <EmptyState icon={Users} title={t('tournaments.detail.noParticipantsTitle')} message={t('tournaments.detail.noParticipantsMessage')} />
        ) : (
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>{t('tournaments.detail.rank')}</th>
                  <th>{t('tournaments.detail.player')}</th>
                  <th>{t('tournaments.detail.city')}</th>
                  <th>{t('tournaments.detail.score')}</th>
                  {isClosed && <th>{t('tournaments.detail.gain')}</th>}
                  <th>{t('tournaments.detail.registeredAt')}</th>
                  {canRemove && <th>{t('tournaments.detail.actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {participants.map((p) => (
                  <tr key={p.id}>
                    <td><span className="tour-rank" style={p.rank <= 3 ? { background: MEDAL[p.rank - 1], color: '#fff' } : undefined}>{p.rank}{p.rank <= 3 && <Medal size={11} />}</span></td>
                    <td><div className="row" style={{ gap: 9 }}><Avatar name={p.name} size="sm" /><span className="cell-strong">{p.name}</span></div></td>
                    <td className="muted">{p.ville || '—'}</td>
                    <td className="cell-strong">{num(p.score)}</td>
                    {isClosed && <td>{p.payout > 0 ? fcfa(p.payout) : '—'}</td>}
                    <td className="muted">{dateFr(p.joined_at)}</td>
                    {canRemove && (
                      <td>
                        <button
                          className="btn btn-sm btn-danger-ghost"
                          onClick={() => setConfirm({
                            fn: () => tournamentsService.removeParticipant(id, p.user_id),
                            label: t('tournaments.detail.participantRemoved'),
                            title: t('tournaments.detail.removeTitle'),
                            body: t('tournaments.detail.removeBody', { name: p.name }),
                            confirmLabel: t('tournaments.actions.remove'),
                            danger: true,
                          })}
                        >
                          {t('tournaments.actions.remove')}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirmation des actions sensibles */}
      <Modal
        open={!!confirm}
        onClose={() => (busy ? null : setConfirm(null))}
        title={confirm?.title}
        footer={confirm && (
          <>
            <button className="btn" onClick={() => setConfirm(null)} disabled={busy}>{t('common.cancel')}</button>
            <button className={`btn ${confirm.danger ? 'btn-danger' : 'btn-primary'}`} onClick={runConfirm} disabled={busy}>
              {confirm.confirmLabel}
            </button>
          </>
        )}
      >
        {confirm && <p style={{ margin: 0 }}>{confirm.body}</p>}
      </Modal>
    </>
  );
}
