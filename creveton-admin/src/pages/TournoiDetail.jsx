import './Tournois.css';
import './TournoiDetail.css';
import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Play, X, Trophy, Users, Calendar, Crown, Medal, Award, Target, UserPlus,
} from 'lucide-react';
import { Icon } from '../components/Icon';
import tournamentsService from '../services/tournaments.service';
import { list as searchUsers } from '../services/users.service';
import { useApiData } from '../hooks/useApiData';
import { themeBadgeColors, themeLabels, tournamentStatusColors } from '../constants/theme';
import { num, fcfa, dateFr, pct } from '../utils/format';
import Modal from '../components/Modal';
import Avatar from '../components/Avatar';
import EmptyState from '../components/EmptyState';
import { Skeleton } from '../components/Skeleton';
import { notify } from '../components/Toast';

const MEDAL_COLORS = ['#d4a017', '#9aa3ad', '#b27a44'];

function HeroStatusBadge({ status }) {
  const { t } = useTranslation();
  const cfg = tournamentStatusColors[status] || {};
  const label = t(`tournaments.statuses.${status}`, cfg.label || status);
  return (
    <span className={`td-hero-status td-hero-status--${status}${status === 'running' ? ' is-live' : ''}`}>
      <span className="tour-status-dot" />
      {label}
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

  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
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

  const closeEnroll = useCallback(() => {
    setSearchQ('');
    setSearchResults([]);
    setSelectedUser(null);
    setEnrollOpen(false);
  }, []);

  const handleAddParticipant = useCallback(async () => {
    if (!selectedUser || adding) return;
    setAdding(true);
    try {
      await tournamentsService.addParticipant(id, selectedUser.id);
      notify.success(t('tournaments.detail.participantAdded'));
      closeEnroll();
      refetch();
    } catch (e) {
      notify.error(e?.response?.data?.error?.message || t('tournaments.notify.actionFailed'));
    } finally {
      setAdding(false);
    }
  }, [selectedUser, adding, id, t, closeEnroll, refetch]);

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
    return (
      <>
        <button className="tour-back" onClick={() => navigate('/tournaments')}>
          <ArrowLeft size={16} /> {t('tournaments.detail.allTournaments')}
        </button>
        <Skeleton w="100%" h={188} r={16} />
        <div className="td-kpis" style={{ marginTop: 22 }}>
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} h={88} r={12} />)}
        </div>
      </>
    );
  }

  if (!tour) {
    return (
      <>
        <button className="tour-back" onClick={() => navigate('/tournaments')}>
          <ArrowLeft size={16} /> {t('tournaments.detail.allTournaments')}
        </button>
        <div className="card">
          <EmptyState
            icon={Trophy}
            title={t('tournaments.detail.notFoundTitle')}
            message={t('tournaments.detail.notFoundMessage')}
            action={<button className="btn" onClick={() => navigate('/tournaments')}><ArrowLeft size={15} /> {t('tournaments.detail.back')}</button>}
          />
        </div>
      </>
    );
  }

  const cfg = themeBadgeColors[tour.theme];
  const emoji = cfg?.icon || '🏆';
  const fillPct = tour.max_players ? Math.min(100, Math.round((tour.registered_players / tour.max_players) * 100)) : 0;
  const themeLabel = t(`questions.themes.${tour.theme}`, themeLabels[tour.theme] || tour.theme || t('tournaments.detail.mixedThemes'));

  return (
    <>
      {/* Back */}
      <button className="tour-back" onClick={() => navigate('/tournaments')}>
        <ArrowLeft size={16} /> {t('tournaments.detail.allTournaments')}
      </button>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <div className="td-hero" style={{ '--theme-accent': cfg?.fg || '#2a8a4f' }}>
        <div className="td-hero-glow" />
        <div className="td-hero-inner">
          <div className="td-hero-main">
            <div className="td-hero-badges">
              <HeroStatusBadge status={tour.status} />
              <span className="td-hero-badge">
                {Number(tour.entry_fee) > 0 ? t('tournaments.card.paid') : t('tournaments.card.free')}
              </span>
              {cfg && (
                <span className="td-hero-badge">{emoji} {themeLabel}</span>
              )}
            </div>
            <h1 className="td-hero-title">{tour.name}</h1>
            {tour.starts_at && (
              <p className="td-hero-sub">
                <Calendar size={13} />
                {dateFr(tour.starts_at, "dd MMM yyyy 'à' HH'h'mm")}
                {tour.ends_at && ` · fin ${dateFr(tour.ends_at, 'dd MMM yyyy')}`}
              </p>
            )}
          </div>
          <div className="td-hero-actions">
            {(tour.status === 'scheduled' || tour.status === 'open') && (
              <>
                <button
                  className="btn btn-success"
                  onClick={() => setConfirm({
                    fn: tournamentsService.start,
                    label: t('tournaments.toast.startedSimple'),
                    title: t('tournaments.confirm.startTitle'),
                    body: t('tournaments.confirm.startBody'),
                    confirmLabel: t('tournaments.actions.start'),
                  })}
                >
                  <Play size={15} /> {t('tournaments.actions.start')}
                </button>
                <button
                  className="btn btn-danger-ghost td-hero-danger"
                  onClick={() => setConfirm({
                    fn: tournamentsService.cancel,
                    label: t('tournaments.toast.cancelled'),
                    title: t('tournaments.confirm.cancelTitle'),
                    body: t('tournaments.confirm.cancelBody', { name: tour.name }),
                    confirmLabel: t('tournaments.actions.cancel'),
                    danger: true,
                  })}
                >
                  <X size={15} /> {t('tournaments.actions.cancel')}
                </button>
              </>
            )}
            {(tour.status === 'running' || tour.status === 'closed') && (
              <button
                className="btn btn-gold"
                onClick={() => setConfirm({
                  fn: tournamentsService.payout,
                  label: t('tournaments.toast.resultsValidated'),
                  title: t('tournaments.confirm.payoutTitle'),
                  body: t('tournaments.confirm.payoutBody'),
                  confirmLabel: t('tournaments.actions.validateResults'),
                  danger: true,
                })}
              >
                <Trophy size={15} /> {t('tournaments.actions.validateResults')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── KPI row ──────────────────────────────────────────── */}
      <div className="td-kpis">
        <div className="td-kpi">
          <div className="td-kpi-icon"><Users size={20} /></div>
          <div>
            <span className="td-kpi-n">
              {num(stats?.registered ?? tour.registered_players ?? 0)}
              {tour.max_players ? <span className="td-kpi-cap"> / {tour.max_players}</span> : ''}
            </span>
            <span className="td-kpi-l">{t('tournaments.detail.registered')}</span>
          </div>
        </div>
        <div className="td-kpi">
          <div className="td-kpi-icon"><Award size={20} /></div>
          <div>
            <span className="td-kpi-n">{num(stats?.avg_score ?? 0)}</span>
            <span className="td-kpi-l">{t('tournaments.detail.avgScore')}</span>
          </div>
        </div>
        <div className="td-kpi">
          <div className="td-kpi-icon"><Target size={20} /></div>
          <div>
            <span className="td-kpi-n">{stats ? pct(stats.completion_rate, 0) : '—'}</span>
            <span className="td-kpi-l">{t('tournaments.detail.completion')}</span>
          </div>
        </div>
        <div className="td-kpi">
          <div className="td-kpi-icon"><Trophy size={20} /></div>
          <div>
            <span className="td-kpi-n">{num(stats?.top_score ?? 0)}</span>
            <span className="td-kpi-l">{t('tournaments.detail.topScore')}</span>
          </div>
        </div>
      </div>

      {/* ── Info + Podium ─────────────────────────────────────── */}
      <div className="td-grid">
        <div className="card card-pad">
          <h3 className="card-title">{t('tournaments.detail.info')}</h3>
          <div className="td-info-grid">
            <div className="td-field">
              <span className="td-field-label">{t('tournaments.detail.type')}</span>
              <span className="td-field-value">
                {Number(tour.entry_fee) > 0 ? t('tournaments.card.paid') : t('tournaments.detail.freeType')}
              </span>
            </div>
            <div className="td-field">
              <span className="td-field-label">{t('tournaments.modal.startLabel')}</span>
              <span className="td-field-value">
                <Calendar size={13} />
                {' '}{tour.starts_at ? dateFr(tour.starts_at, "dd MMM yyyy 'à' HH'h'mm") : '—'}
              </span>
            </div>

            <div className="td-field">
              <span className="td-field-label">{t('tournaments.modal.theme')}</span>
              <span className="td-field-value">{emoji} {themeLabel}</span>
            </div>
            <div className="td-field">
              <span className="td-field-label">{t('tournaments.detail.end')}</span>
              <span className="td-field-value">
                {tour.ends_at ? dateFr(tour.ends_at, "dd MMM yyyy 'à' HH'h'mm") : '—'}
              </span>
            </div>

            <div className="td-field">
              <span className="td-field-label">{t('tournaments.detail.rewards')}</span>
              <span className="td-field-value">
                {Number(tour.entry_fee) > 0
                  ? fcfa(tour.prize_pool)
                  : <><Icon icon={Award} size={13} /> {t('tournaments.card.xpBadges')}</>}
              </span>
            </div>
            <div className="td-field">
              <span className="td-field-label">{t('tournaments.detail.players')}</span>
              <span className="td-field-value">
                <span className="td-cap-text">
                  {num(tour.registered_players || 0)}{tour.max_players ? ` / ${tour.max_players}` : ''}
                  {tour.max_players ? <span className="td-cap-pct"> ({fillPct} %)</span> : ''}
                </span>
                {tour.max_players != null && (
                  <div className="td-capacity-bar"><div style={{ width: `${fillPct}%` }} /></div>
                )}
              </span>
            </div>
          </div>
        </div>

        {isClosed && podium.length > 0 ? (
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
                    <div style={{ display: 'flex', justifyContent: 'center', margin: '6px 0' }}>
                      <Avatar name={p.name} src={p.avatar_url} size="md" />
                    </div>
                    <div className="podium-name">{p.name}</div>
                    {p.ville && <div className="podium-city">{p.ville}</div>}
                    <div className="podium-score">{num(p.score)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : <div />}
      </div>

      {/* ── Participants ──────────────────────────────────────── */}
      <div className="card card-pad td-section">
        <div className="td-pts-head">
          <div>
            <h3 className="card-title">
              {isClosed ? t('tournaments.detail.participantsFinal') : t('tournaments.detail.participants')}
              {participants.length > 0 && (
                <span className="td-pts-count">{participants.length}</span>
              )}
            </h3>
            <p className="card-sub">
              {tour.status === 'running'
                ? t('tournaments.detail.autoRefresh')
                : t('tournaments.detail.registeredHere')}
            </p>
          </div>
          {canAdd && (
            <button
              className={`btn btn-sm ${enrollOpen ? 'btn-ghost' : 'btn-gold'} td-enroll-cta`}
              onClick={() => { setEnrollOpen(!enrollOpen); if (enrollOpen) clearSearch(); }}
            >
              {enrollOpen
                ? <><X size={13} /> Fermer</>
                : <><UserPlus size={14} /> {t('tournaments.detail.addParticipant')}</>}
            </button>
          )}
        </div>

        {/* Enroll panel */}
        {canAdd && enrollOpen && (
          <div className="td-enroll-panel">
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

        {/* Table or empty */}
        {participants.length === 0 ? (
          <EmptyState
            icon={Users}
            title={t('tournaments.detail.noParticipantsTitle')}
            message={t('tournaments.detail.noParticipantsMessage')}
            action={canAdd && !enrollOpen && (
              <button className="btn btn-gold btn-sm" onClick={() => setEnrollOpen(true)}>
                <UserPlus size={14} /> {t('tournaments.detail.addParticipant')}
              </button>
            )}
          />
        ) : (
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>{t('tournaments.detail.rank')}</th>
                  <th>{t('tournaments.detail.player')}</th>
                  <th>{t('tournaments.detail.city')}</th>
                  <th>Niveau</th>
                  <th>{t('tournaments.detail.score')}</th>
                  {isClosed && <th>{t('tournaments.detail.gain')}</th>}
                  <th>{t('tournaments.detail.registeredAt')}</th>
                  {canRemove && <th>{t('tournaments.detail.actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {participants.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <span
                        className="tour-rank"
                        style={p.rank <= 3 ? { background: MEDAL_COLORS[p.rank - 1], color: '#fff' } : undefined}
                      >
                        {p.rank}{p.rank <= 3 && <Medal size={11} />}
                      </span>
                    </td>
                    <td>
                      <div className="row" style={{ gap: 9 }}>
                        <Avatar name={p.name} src={p.avatar_url} size="sm" />
                        <span className="cell-strong">{p.name}</span>
                      </div>
                    </td>
                    <td className="muted">{p.ville || '—'}</td>
                    <td><span className="td-level">Niv.&nbsp;{p.level}</span></td>
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

      {/* Confirmation modal */}
      <Modal
        open={!!confirm}
        onClose={() => (busy ? null : setConfirm(null))}
        title={confirm?.title}
        footer={confirm && (
          <>
            <button className="btn" onClick={() => setConfirm(null)} disabled={busy}>
              {t('common.cancel')}
            </button>
            <button
              className={`btn ${confirm.danger ? 'btn-danger' : 'btn-primary'}`}
              onClick={runConfirm}
              disabled={busy}
            >
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
