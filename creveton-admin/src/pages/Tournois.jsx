import './Tournois.css';
import { useMemo, useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Plus, Trophy, BarChart3, LayoutGrid, List, Lock, Play, X, Users,
  Calendar, Clock, ChevronLeft, ChevronRight, Eye,
} from 'lucide-react';
import i18n from '../i18n';
import tournamentsService from '../services/tournaments.service';
import { useApiData } from '../hooks/useApiData';
import { THEME_KEYS } from '../constants/enums';
import { themeBadgeColors, themeLabels, tournamentStatusColors } from '../constants/theme';
import { num, fcfa, dateFr } from '../utils/format';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import { Skeleton } from '../components/Skeleton';
import { notify } from '../components/Toast';

const MAX_PLAYER_OPTS = [8, 16, 32, 64, 128];
const FORMAT_QUESTIONS = [10, 20, 32];
const FORMAT_TIMES = [15, 20, 30, 45];

/** Décompte « dans 9 h 23 min » si < 48 h, sinon null. */
function countdownFr(iso) {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(diff) || diff <= 0) return null;
  const min = Math.floor(diff / 60000);
  if (min < 60) return i18n.t('tournaments.card.startsInMin', { m: min });
  const h = Math.floor(min / 60);
  if (h < 48) return i18n.t('tournaments.card.startsInHm', { h, m: min % 60 });
  return null;
}

function isFutureDate(s) { return !!s && new Date(s).getTime() > Date.now(); }

function themeGradient(theme) {
  const c = themeBadgeColors[theme];
  return c ? `linear-gradient(135deg, ${c.fg}, ${c.fg}dd)` : 'linear-gradient(135deg, #1a5230, #2a8a4f)';
}

function StatusBadge({ status }) {
  const { t } = useTranslation();
  const cfg = tournamentStatusColors[status] || { fg: '#6b7280', label: status };
  const label = t(`tournaments.statuses.${status}`, cfg.label);
  return (
    <span className={`tour-status ${status === 'running' ? 'is-live' : ''}`} style={{ color: cfg.fg, background: '#fff' }}>
      <span className="tour-status-dot" style={{ background: cfg.fg }} />
      {status === 'running' ? t('tournaments.statuses.running') : label}
    </span>
  );
}

/** Carte tournoi — partagée entre la grille et l'aperçu live du formulaire. */
function TournamentCard({ t: tour, onOpen, onStart, onCancel, preview }) {
  const { t } = useTranslation();
  const cd = countdownFr(tour.starts_at);
  const pct = tour.max_players ? Math.min(100, Math.round((tour.registered_players / tour.max_players) * 100)) : 0;
  const emoji = (themeBadgeColors[tour.theme] && themeBadgeColors[tour.theme].icon) || '🏆';
  return (
    <div className={`card tour-card ${preview ? 'is-preview' : ''}`}>
      <div className="tour-card-head" style={{ background: themeGradient(tour.theme) }}>
        <span className="tour-card-emoji">{emoji}</span>
        <StatusBadge status={tour.status || 'scheduled'} />
      </div>
      <div className="tour-card-body">
        <div className="tour-card-name">{tour.name || t('tournaments.card.placeholderName')}</div>
        <div className="tour-card-badges">
          <span className="tour-badge tour-badge-free">{Number(tour.entry_fee) > 0 ? t('tournaments.card.paid') : t('tournaments.card.free')}</span>
          {tour.theme && <span className="tour-badge" style={{ background: themeBadgeColors[tour.theme]?.bg, color: themeBadgeColors[tour.theme]?.fg }}>{t(`questions.themes.${tour.theme}`, themeLabels[tour.theme] || tour.theme)}</span>}
          {tour.format && <span className="tour-badge tour-badge-soft">{t('tournaments.card.formatBadge', { q: tour.format.questions, s: tour.format.time_per_q_s })}</span>}
        </div>

        <div className="tour-players">
          <div className="tour-players-top">
            <Users size={14} /> {t('tournaments.card.playersCount', { n: num(tour.registered_players || 0), max: tour.max_players ? num(tour.max_players) : '∞' })}
          </div>
          <div className="tour-players-bar"><span style={{ width: `${pct}%` }} /></div>
        </div>

        <div className="tour-card-rewards">
          {Number(tour.entry_fee) > 0 ? <>💰 {fcfa(tour.prize_pool)}</> : <>🏅 {t('tournaments.card.xpBadges')}</>}
        </div>

        <div className="tour-card-date">
          <Calendar size={14} /> {tour.starts_at ? dateFr(tour.starts_at, "dd MMM yyyy 'à' HH'h'mm") : t('tournaments.card.dateTbd')}
          {cd && <span className="tour-card-cd"><Clock size={13} /> {cd}</span>}
        </div>
      </div>

      {!preview && (
        <div className="tour-card-foot">
          {(tour.status === 'scheduled' || tour.status === 'open') && (
            <>
              <button className="btn btn-sm btn-success" onClick={() => onStart(tour)}><Play size={13} /> {t('tournaments.actions.start')}</button>
              <button className="btn btn-sm btn-danger-ghost" onClick={() => onCancel(tour)}><X size={13} /> {t('tournaments.actions.cancel')}</button>
            </>
          )}
          {tour.status === 'running' && (
            <button className="btn btn-sm btn-primary" onClick={() => onOpen(tour)}><Eye size={13} /> {t('tournaments.actions.liveFollow')}</button>
          )}
          {(tour.status === 'closed' || tour.status === 'paid') && (
            <button className="btn btn-sm" onClick={() => onOpen(tour)}><Trophy size={13} /> {t('tournaments.actions.results')}</button>
          )}
          {tour.status !== 'running' && tour.status !== 'closed' && tour.status !== 'paid' && (
            <button className="btn btn-sm btn-ghost tour-card-detail" onClick={() => onOpen(tour)}><Eye size={13} /> {t('tournaments.actions.detail')}</button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Modal de création (3 étapes + aperçu live) ── */
const EMPTY = { name: '', description: '', theme: 'culture', max_players: 32, starts_at: '', questions: 20, time_per_q_s: 30 };
function CreateModal({ open, onClose, onCreate, submitting }) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [d, setD] = useState(EMPTY);
  useEffect(() => { if (open) { setStep(0); setD(EMPTY); } }, [open]);
  const set = (k, v) => setD((p) => ({ ...p, [k]: v }));

  const nameOk = d.name.trim().length >= 5;
  const dateOk = isFutureDate(d.starts_at);
  const canCreate = nameOk && dateOk;

  const preview = {
    name: d.name, theme: d.theme, max_players: d.max_players, registered_players: 0,
    entry_fee: 0, status: 'scheduled', starts_at: d.starts_at || null,
    format: { questions: d.questions, time_per_q_s: d.time_per_q_s },
  };

  const submit = () => {
    if (!canCreate) return;
    onCreate({
      name: d.name.trim(),
      type: 'free',
      theme: d.theme,
      entry_fee: 0,
      max_players: d.max_players,
      format: { questions: d.questions, time_per_q_s: d.time_per_q_s },
      starts_at: new Date(d.starts_at).toISOString(),
    });
  };

  const footer = (
    <>
      <button className="btn btn-ghost-soft" onClick={onClose}>{t('tournaments.modal.cancel')}</button>
      <div style={{ flex: 1 }} />
      {step > 0 && <button className="btn" onClick={() => setStep((s) => s - 1)}><ChevronLeft size={15} /> {t('tournaments.modal.previous')}</button>}
      {step < 2 && <button className="btn btn-primary" onClick={() => setStep((s) => s + 1)} disabled={step === 0 && !nameOk}>{t('tournaments.modal.next')} <ChevronRight size={15} /></button>}
      {step === 2 && <button className="btn btn-success" onClick={submit} disabled={!canCreate || submitting}><Plus size={15} /> {t('tournaments.modal.create')}</button>}
    </>
  );

  return (
    <Modal open={open} onClose={onClose} title={t('tournaments.modal.title')} footer={footer} width={840}>
      <div className="steps">
        {[t('tournaments.modal.stepIdentity'), t('tournaments.modal.stepFormat'), t('tournaments.modal.stepValidation')].map((label, i) => (
          <div key={label} style={{ display: 'contents' }}>
            <span className={`step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}>
              <span className="num">{i + 1}</span>{label}
            </span>
            {i < 2 && <span className="step-sep" />}
          </div>
        ))}
      </div>

      <div className="tour-modal-grid">
        <div>
          {step === 0 && (
            <>
              <div className="field">
                <label>{t('tournaments.modal.name')}</label>
                <input className="input" value={d.name} onChange={(e) => set('name', e.target.value)} placeholder={t('tournaments.modal.namePlaceholder')} maxLength={120} />
                <div className={`field-help ${nameOk ? '' : 'field-error'}`}>{nameOk ? t('tournaments.modal.nameValid') : t('tournaments.modal.nameMin')}</div>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>{t('tournaments.modal.descriptionOptional')}</label>
                <textarea className="textarea" value={d.description} onChange={(e) => set('description', e.target.value)} placeholder={t('tournaments.modal.descriptionPlaceholder')} />
              </div>
            </>
          )}
          {step === 1 && (
            <>
              <div className="field">
                <label>{t('tournaments.modal.theme')}</label>
                <select className="select" value={d.theme} onChange={(e) => set('theme', e.target.value)}>
                  {THEME_KEYS.map((k) => <option key={k} value={k}>{t(`questions.themes.${k}`, themeLabels[k])}</option>)}
                </select>
              </div>
              <div className="row" style={{ gap: 12 }}>
                <div className="field" style={{ flex: 1 }}>
                  <label>{t('tournaments.modal.maxPlayersShort')}</label>
                  <select className="select" value={d.max_players} onChange={(e) => set('max_players', Number(e.target.value))}>
                    {MAX_PLAYER_OPTS.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>{t('tournaments.modal.questions')}</label>
                  <select className="select" value={d.questions} onChange={(e) => set('questions', Number(e.target.value))}>
                    {FORMAT_QUESTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>{t('tournaments.modal.timePerQ')}</label>
                  <select className="select" value={d.time_per_q_s} onChange={(e) => set('time_per_q_s', Number(e.target.value))}>
                    {FORMAT_TIMES.map((n) => <option key={n} value={n}>{t('tournaments.modal.seconds', { n })}</option>)}
                  </select>
                </div>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>{t('tournaments.modal.startDateTime')}</label>
                <input className="input" type="datetime-local" value={d.starts_at} onChange={(e) => set('starts_at', e.target.value)} />
                {!dateOk && d.starts_at && <div className="field-error">{t('tournaments.modal.dateFuture')}</div>}
              </div>
            </>
          )}
          {step === 2 && (
            <div className="tour-validate">
              <div className="banner banner-locked"><Lock size={15} /> {t('tournaments.modal.lockedBannerPre')} <strong>{t('tournaments.modal.lockedBannerFree')}</strong> {t('tournaments.modal.lockedBannerPost')}</div>
              <dl className="kv">
                <dt>{t('tournaments.modal.nameLabel')}</dt><dd>{d.name || '—'}</dd>
                <dt>{t('tournaments.modal.theme')}</dt><dd>{t(`questions.themes.${d.theme}`, themeLabels[d.theme])}</dd>
                <dt>{t('tournaments.modal.maxPlayersShort')}</dt><dd>{d.max_players}</dd>
                <dt>{t('tournaments.modal.formatLabel')}</dt><dd>{t('tournaments.modal.formatValue', { q: d.questions, s: d.time_per_q_s })}</dd>
                <dt>{t('tournaments.modal.startLabel')}</dt><dd>{d.starts_at ? dateFr(d.starts_at, "dd MMM yyyy 'à' HH'h'mm") : '—'}</dd>
              </dl>
              {!canCreate && <div className="field-error">{t('tournaments.modal.completeRequired')}</div>}
            </div>
          )}
        </div>

        <aside className="tour-preview-pane">
          <div className="tour-preview-cap">{t('tournaments.modal.livePreview')}</div>
          <TournamentCard t={preview} preview />
        </aside>
      </div>
    </Modal>
  );
}

export default function Tournois() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, loading, refetch } = useApiData(() => tournamentsService.list(), [], { pollMs: 30000 });
  const [view, setView] = useState('cards');
  const [showStats, setShowStats] = useState(false);
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const tournaments = useMemo(() => (data && data.data) || [], [data]);
  const stats = useMemo(() => (data && data.stats) || null, [data]);

  // Détection de nouvelles inscriptions (toast via polling 30 s).
  const prevReg = useRef(null);
  useEffect(() => {
    const map = Object.fromEntries(tournaments.map((tour) => [tour.id, tour.registered_players || 0]));
    if (prevReg.current) {
      for (const tour of tournaments) {
        const before = prevReg.current[tour.id];
        if (before != null && (tour.registered_players || 0) > before) {
          const delta = (tour.registered_players || 0) - before;
          notify.info(`👤 ${t('tournaments.toast.newRegistrations', { count: delta })} · ${tour.name}`);
        }
      }
    }
    prevReg.current = map;
  }, [tournaments, t]);

  const counts = useMemo(() => stats || {
    scheduled: tournaments.filter((tour) => tour.status === 'scheduled').length,
    running: tournaments.filter((tour) => tour.status === 'running').length,
    closed: tournaments.filter((tour) => ['closed', 'paid'].includes(tour.status)).length,
    registered_players_total: tournaments.reduce((s, tour) => s + (tour.registered_players || 0), 0),
    total: tournaments.length,
  }, [stats, tournaments]);

  const openDetail = (tour) => navigate(`/tournaments/${tour.id}`);

  const doStart = async (tour) => {
    try { await tournamentsService.start(tour.id); notify.success(t('tournaments.toast.started', { name: tour.name })); refetch(); }
    catch (e) { notify.error(e?.response?.data?.error?.message || t('tournaments.notify.startFailedMin')); }
  };
  const doCancel = async (tour) => {
    if (!window.confirm(t('tournaments.confirm.cancel', { name: tour.name }))) return;
    try { await tournamentsService.cancel(tour.id); notify.success(t('tournaments.toast.cancelled')); refetch(); }
    catch { notify.error(t('tournaments.notify.cancelFailed')); }
  };
  const create = async (payload) => {
    setSubmitting(true);
    try {
      await tournamentsService.create(payload);
      notify.success(t('tournaments.toast.created'));
      setCreating(false); refetch();
    } catch (e) { notify.error(e?.response?.data?.error?.message || t('tournaments.notify.createFailed')); }
    finally { setSubmitting(false); }
  };

  return (
    <>
      <PageHeader
        title={t('tournaments.title')}
        description={(
          <span className="tour-head-stats">
            {t('tournaments.headStats', {
              scheduled: counts.scheduled || 0,
              running: counts.running || 0,
              closed: counts.closed || 0,
            })}
          </span>
        )}
        actions={(
          <>
            <button className={`btn btn-ghost ${showStats ? 'tour-btn-on' : ''}`} onClick={() => setShowStats((s) => !s)}><BarChart3 size={16} /> {t('tournaments.viewStats')}</button>
            <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> {t('tournaments.create')}</button>
          </>
        )}
      />

      {/* Bannière tournois payants */}
      <div className="tour-banner">
        <Lock size={18} />
        <div className="tour-banner-body">
          <div className="tour-banner-title">{t('tournaments.banner.title')}</div>
          <div className="tour-banner-prog"><span className="tour-banner-prog-bar"><span style={{ width: '45%' }} /></span><span className="tour-banner-prog-lbl">{t('tournaments.banner.progress')}</span></div>
        </div>
        <span className="tour-banner-cdc">{t('tournaments.banner.cdc')}</span>
      </div>

      {/* Panneau statistiques */}
      {showStats && (
        <div className="card card-pad tour-stats">
          <div className="tour-stats-item"><span className="n">{num(counts.total || 0)}</span><span className="l">{t('tournaments.statsPanel.total')}</span></div>
          <div className="tour-stats-item"><span className="n">{num(counts.registered_players_total || 0)}</span><span className="l">{t('tournaments.statsPanel.registered')}</span></div>
          <div className="tour-stats-item"><span className="n">{num(counts.running || 0)}</span><span className="l">{t('tournaments.statsPanel.running')}</span></div>
          <div className="tour-stats-item"><span className="n">{num(counts.closed || 0)}</span><span className="l">{t('tournaments.statsPanel.finished')}</span></div>
        </div>
      )}

      {/* Switch vue */}
      <div className="tour-toolbar">
        <div className="tour-view-switch">
          <button className={`tour-view-btn ${view === 'cards' ? 'is-active' : ''}`} onClick={() => setView('cards')}><LayoutGrid size={15} /> {t('tournaments.views.cards')}</button>
          <button className={`tour-view-btn ${view === 'list' ? 'is-active' : ''}`} onClick={() => setView('list')}><List size={15} /> {t('tournaments.views.list')}</button>
        </div>
      </div>

      {loading && !data ? (
        <div className="tour-grid">{[0, 1, 2].map((i) => <Skeleton key={i} w="100%" h={300} r={14} />)}</div>
      ) : view === 'cards' ? (
        <div className="tour-grid">
          {tournaments.map((tour) => (
            <TournamentCard key={tour.id} t={tour} onOpen={openDetail} onStart={doStart} onCancel={doCancel} />
          ))}
          <button className="card tour-create" onClick={() => setCreating(true)}>
            <Plus size={44} />
            <span className="tour-create-title">{t('tournaments.card.createNew')}</span>
            <span className="tour-create-sub">{t('tournaments.card.freeOnly')}</span>
          </button>
        </div>
      ) : tournaments.length === 0 ? (
        <div className="card"><EmptyState icon={Trophy} title={t('tournaments.empty.title')} message={t('tournaments.empty.message')} action={<button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> {t('tournaments.actions.createShort')}</button>} /></div>
      ) : (
        <div className="card table-wrap">
          <table className="data">
            <thead><tr><th>{t('tournaments.table.name')}</th><th>{t('tournaments.table.type')}</th><th>{t('tournaments.table.theme')}</th><th>{t('tournaments.table.players')}</th><th>{t('tournaments.table.status')}</th><th>{t('tournaments.table.rewards')}</th><th>{t('tournaments.table.date')}</th><th>{t('tournaments.table.actions')}</th></tr></thead>
            <tbody>
              {tournaments.map((tour) => (
                <tr key={tour.id} className="clickable" onClick={() => openDetail(tour)}>
                  <td className="cell-strong">{tour.name}</td>
                  <td>{Number(tour.entry_fee) > 0 ? t('tournaments.card.paid') : t('tournaments.card.free')}</td>
                  <td>{t(`questions.themes.${tour.theme}`, themeLabels[tour.theme] || tour.theme || '—')}</td>
                  <td>{num(tour.registered_players || 0)}{tour.max_players ? ` / ${tour.max_players}` : ''}</td>
                  <td><StatusBadge status={tour.status} /></td>
                  <td>{Number(tour.entry_fee) > 0 ? fcfa(tour.prize_pool) : t('tournaments.table.xpReward')}</td>
                  <td className="muted">{tour.starts_at ? dateFr(tour.starts_at) : '—'}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {(tour.status === 'scheduled' || tour.status === 'open') && (
                      <div className="row nowrap" style={{ gap: 6 }}>
                        <button className="btn btn-sm btn-success" onClick={() => doStart(tour)} aria-label={t('tournaments.actions.start')}><Play size={13} /></button>
                        <button className="btn btn-sm btn-danger-ghost" onClick={() => doCancel(tour)} aria-label={t('tournaments.actions.cancel')}><X size={13} /></button>
                      </div>
                    )}
                    {tour.status !== 'scheduled' && tour.status !== 'open' && (
                      <button className="btn btn-sm btn-ghost" onClick={() => openDetail(tour)} aria-label={t('tournaments.actions.detail')}><Eye size={13} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateModal open={creating} onClose={() => setCreating(false)} onCreate={create} submitting={submitting} />
    </>
  );
}
