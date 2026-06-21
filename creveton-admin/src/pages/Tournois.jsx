import './Tournois.css';
import { useMemo, useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Trophy, BarChart3, LayoutGrid, List, Lock, Play, X, Users,
  Calendar, Clock, ChevronLeft, ChevronRight, Eye,
} from 'lucide-react';
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
  if (min < 60) return `Commence dans ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `Commence dans ${h} h ${min % 60} min`;
  return null;
}

function isFutureDate(s) { return !!s && new Date(s).getTime() > Date.now(); }

function themeGradient(theme) {
  const c = themeBadgeColors[theme];
  return c ? `linear-gradient(135deg, ${c.fg}, ${c.fg}dd)` : 'linear-gradient(135deg, #1a5230, #2a8a4f)';
}

function StatusBadge({ status }) {
  const cfg = tournamentStatusColors[status] || { fg: '#6b7280', label: status };
  return (
    <span className={`tour-status ${status === 'running' ? 'is-live' : ''}`} style={{ color: cfg.fg, background: '#fff' }}>
      <span className="tour-status-dot" style={{ background: cfg.fg }} />
      {status === 'running' ? 'EN COURS' : cfg.label}
    </span>
  );
}

/** Carte tournoi — partagée entre la grille et l'aperçu live du formulaire. */
function TournamentCard({ t, onOpen, onStart, onCancel, preview }) {
  const cd = countdownFr(t.starts_at);
  const pct = t.max_players ? Math.min(100, Math.round((t.registered_players / t.max_players) * 100)) : 0;
  const emoji = (themeBadgeColors[t.theme] && themeBadgeColors[t.theme].icon) || '🏆';
  return (
    <div className={`card tour-card ${preview ? 'is-preview' : ''}`}>
      <div className="tour-card-head" style={{ background: themeGradient(t.theme) }}>
        <span className="tour-card-emoji">{emoji}</span>
        <StatusBadge status={t.status || 'scheduled'} />
      </div>
      <div className="tour-card-body">
        <div className="tour-card-name">{t.name || 'Nom du tournoi'}</div>
        <div className="tour-card-badges">
          <span className="tour-badge tour-badge-free">{Number(t.entry_fee) > 0 ? 'Payant' : 'Gratuit'}</span>
          {t.theme && <span className="tour-badge" style={{ background: themeBadgeColors[t.theme]?.bg, color: themeBadgeColors[t.theme]?.fg }}>{themeLabels[t.theme] || t.theme}</span>}
          {t.format && <span className="tour-badge tour-badge-soft">{t.format.questions} Q · {t.format.time_per_q_s}s</span>}
        </div>

        <div className="tour-players">
          <div className="tour-players-top">
            <Users size={14} /> {num(t.registered_players || 0)} / {t.max_players ? num(t.max_players) : '∞'} joueurs
          </div>
          <div className="tour-players-bar"><span style={{ width: `${pct}%` }} /></div>
        </div>

        <div className="tour-card-rewards">
          {Number(t.entry_fee) > 0 ? <>💰 {fcfa(t.prize_pool)}</> : <>🏅 XP &amp; badges</>}
        </div>

        <div className="tour-card-date">
          <Calendar size={14} /> {t.starts_at ? dateFr(t.starts_at, "dd MMM yyyy 'à' HH'h'mm") : 'Date à définir'}
          {cd && <span className="tour-card-cd"><Clock size={13} /> {cd}</span>}
        </div>
      </div>

      {!preview && (
        <div className="tour-card-foot">
          {(t.status === 'scheduled' || t.status === 'open') && (
            <>
              <button className="btn btn-sm btn-success" onClick={() => onStart(t)}><Play size={13} /> Démarrer</button>
              <button className="btn btn-sm btn-danger-ghost" onClick={() => onCancel(t)}><X size={13} /> Annuler</button>
            </>
          )}
          {t.status === 'running' && (
            <button className="btn btn-sm btn-primary" onClick={() => onOpen(t)}><Eye size={13} /> Suivi live</button>
          )}
          {(t.status === 'closed' || t.status === 'paid') && (
            <button className="btn btn-sm" onClick={() => onOpen(t)}><Trophy size={13} /> Résultats</button>
          )}
          {t.status !== 'running' && t.status !== 'closed' && t.status !== 'paid' && (
            <button className="btn btn-sm btn-ghost tour-card-detail" onClick={() => onOpen(t)}><Eye size={13} /> Détail</button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Modal de création (3 étapes + aperçu live) ── */
const EMPTY = { name: '', description: '', theme: 'culture', max_players: 32, starts_at: '', questions: 20, time_per_q_s: 30 };
function CreateModal({ open, onClose, onCreate, submitting }) {
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
      <button className="btn btn-ghost-soft" onClick={onClose}>Annuler</button>
      <div style={{ flex: 1 }} />
      {step > 0 && <button className="btn" onClick={() => setStep((s) => s - 1)}><ChevronLeft size={15} /> Précédent</button>}
      {step < 2 && <button className="btn btn-primary" onClick={() => setStep((s) => s + 1)} disabled={step === 0 && !nameOk}>Suivant <ChevronRight size={15} /></button>}
      {step === 2 && <button className="btn btn-success" onClick={submit} disabled={!canCreate || submitting}><Plus size={15} /> Créer le tournoi</button>}
    </>
  );

  return (
    <Modal open={open} onClose={onClose} title="Créer un tournoi" footer={footer} width={840}>
      <div className="steps">
        {['Identité', 'Format', 'Validation'].map((label, i) => (
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
                <label>Nom du tournoi</label>
                <input className="input" value={d.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex. Grand Quiz Culture du Cameroun" maxLength={120} />
                <div className={`field-help ${nameOk ? '' : 'field-error'}`}>{nameOk ? 'Nom valide' : '5 caractères minimum'}</div>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Description (optionnelle)</label>
                <textarea className="textarea" value={d.description} onChange={(e) => set('description', e.target.value)} placeholder="Présentez le tournoi aux joueurs…" />
              </div>
            </>
          )}
          {step === 1 && (
            <>
              <div className="field">
                <label>Thème</label>
                <select className="select" value={d.theme} onChange={(e) => set('theme', e.target.value)}>
                  {THEME_KEYS.map((k) => <option key={k} value={k}>{themeLabels[k]}</option>)}
                </select>
              </div>
              <div className="row" style={{ gap: 12 }}>
                <div className="field" style={{ flex: 1 }}>
                  <label>Joueurs max</label>
                  <select className="select" value={d.max_players} onChange={(e) => set('max_players', Number(e.target.value))}>
                    {MAX_PLAYER_OPTS.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>Questions</label>
                  <select className="select" value={d.questions} onChange={(e) => set('questions', Number(e.target.value))}>
                    {FORMAT_QUESTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>Temps / Q</label>
                  <select className="select" value={d.time_per_q_s} onChange={(e) => set('time_per_q_s', Number(e.target.value))}>
                    {FORMAT_TIMES.map((n) => <option key={n} value={n}>{n}s</option>)}
                  </select>
                </div>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Date &amp; heure de début</label>
                <input className="input" type="datetime-local" value={d.starts_at} onChange={(e) => set('starts_at', e.target.value)} />
                {!dateOk && d.starts_at && <div className="field-error">La date doit être dans le futur.</div>}
              </div>
            </>
          )}
          {step === 2 && (
            <div className="tour-validate">
              <div className="banner banner-locked"><Lock size={15} /> Type forcé à <strong>Gratuit</strong> (XP &amp; badges) — les tournois payants requièrent une licence (CDC §6).</div>
              <dl className="kv">
                <dt>Nom</dt><dd>{d.name || '—'}</dd>
                <dt>Thème</dt><dd>{themeLabels[d.theme]}</dd>
                <dt>Joueurs max</dt><dd>{d.max_players}</dd>
                <dt>Format</dt><dd>{d.questions} questions · {d.time_per_q_s}s / question</dd>
                <dt>Début</dt><dd>{d.starts_at ? dateFr(d.starts_at, "dd MMM yyyy 'à' HH'h'mm") : '—'}</dd>
              </dl>
              {!canCreate && <div className="field-error">Complétez le nom (≥ 5 car.) et une date future.</div>}
            </div>
          )}
        </div>

        <aside className="tour-preview-pane">
          <div className="tour-preview-cap">Aperçu live</div>
          <TournamentCard t={preview} preview />
        </aside>
      </div>
    </Modal>
  );
}

export default function Tournois() {
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
    const map = Object.fromEntries(tournaments.map((t) => [t.id, t.registered_players || 0]));
    if (prevReg.current) {
      for (const t of tournaments) {
        const before = prevReg.current[t.id];
        if (before != null && (t.registered_players || 0) > before) {
          const delta = (t.registered_players || 0) - before;
          notify.info(`👤 ${delta} nouvelle${delta > 1 ? 's' : ''} inscription${delta > 1 ? 's' : ''} · ${t.name}`);
        }
      }
    }
    prevReg.current = map;
  }, [tournaments]);

  const counts = useMemo(() => stats || {
    scheduled: tournaments.filter((t) => t.status === 'scheduled').length,
    running: tournaments.filter((t) => t.status === 'running').length,
    closed: tournaments.filter((t) => ['closed', 'paid'].includes(t.status)).length,
    registered_players_total: tournaments.reduce((s, t) => s + (t.registered_players || 0), 0),
    total: tournaments.length,
  }, [stats, tournaments]);

  const openDetail = (t) => navigate(`/tournaments/${t.id}`);

  const doStart = async (t) => {
    try { await tournamentsService.start(t.id); notify.success(`« ${t.name} » démarré`); refetch(); }
    catch (e) { notify.error(e?.response?.data?.error?.message || 'Démarrage impossible (min. 2 joueurs).'); }
  };
  const doCancel = async (t) => {
    if (!window.confirm(`Annuler le tournoi « ${t.name} » ?`)) return;
    try { await tournamentsService.cancel(t.id); notify.success('Tournoi annulé.'); refetch(); }
    catch { notify.error('Annulation impossible.'); }
  };
  const create = async (payload) => {
    setSubmitting(true);
    try {
      await tournamentsService.create(payload);
      notify.success('Tournoi créé (programmé).');
      setCreating(false); refetch();
    } catch (e) { notify.error(e?.response?.data?.error?.message || 'Création impossible.'); }
    finally { setSubmitting(false); }
  };

  return (
    <>
      <PageHeader
        title="Tournois"
        description={(
          <span className="tour-head-stats">
            Compétitions gratuites · <strong>{counts.scheduled || 0}</strong> programmé{(counts.scheduled || 0) > 1 ? 's' : ''} ·{' '}
            <strong>{counts.running || 0}</strong> en cours · <strong>{counts.closed || 0}</strong> terminé{(counts.closed || 0) > 1 ? 's' : ''}
          </span>
        )}
        actions={(
          <>
            <button className={`btn btn-ghost ${showStats ? 'tour-btn-on' : ''}`} onClick={() => setShowStats((s) => !s)}><BarChart3 size={16} /> Statistiques</button>
            <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Créer un tournoi</button>
          </>
        )}
      />

      {/* Bannière tournois payants */}
      <div className="tour-banner">
        <Lock size={18} />
        <div className="tour-banner-body">
          <div className="tour-banner-title">Tournois payants — en attente de licence</div>
          <div className="tour-banner-prog"><span className="tour-banner-prog-bar"><span style={{ width: '45%' }} /></span><span className="tour-banner-prog-lbl">Obtention licence : en cours</span></div>
        </div>
        <span className="tour-banner-cdc">CDC §6</span>
      </div>

      {/* Panneau statistiques */}
      {showStats && (
        <div className="card card-pad tour-stats">
          <div className="tour-stats-item"><span className="n">{num(counts.total || 0)}</span><span className="l">Total tournois</span></div>
          <div className="tour-stats-item"><span className="n">{num(counts.registered_players_total || 0)}</span><span className="l">Joueurs inscrits</span></div>
          <div className="tour-stats-item"><span className="n">{num(counts.running || 0)}</span><span className="l">En cours</span></div>
          <div className="tour-stats-item"><span className="n">{num(counts.closed || 0)}</span><span className="l">Terminés</span></div>
        </div>
      )}

      {/* Switch vue */}
      <div className="tour-toolbar">
        <div className="tour-view-switch">
          <button className={`tour-view-btn ${view === 'cards' ? 'is-active' : ''}`} onClick={() => setView('cards')}><LayoutGrid size={15} /> Cards</button>
          <button className={`tour-view-btn ${view === 'list' ? 'is-active' : ''}`} onClick={() => setView('list')}><List size={15} /> Liste</button>
        </div>
      </div>

      {loading && !data ? (
        <div className="tour-grid">{[0, 1, 2].map((i) => <Skeleton key={i} w="100%" h={300} r={14} />)}</div>
      ) : view === 'cards' ? (
        <div className="tour-grid">
          {tournaments.map((t) => (
            <TournamentCard key={t.id} t={t} onOpen={openDetail} onStart={doStart} onCancel={doCancel} />
          ))}
          <button className="card tour-create" onClick={() => setCreating(true)}>
            <Plus size={44} />
            <span className="tour-create-title">Créer un tournoi</span>
            <span className="tour-create-sub">Gratuit · XP &amp; badges</span>
          </button>
        </div>
      ) : tournaments.length === 0 ? (
        <div className="card"><EmptyState icon={Trophy} title="Aucun tournoi" message="Créez votre premier tournoi gratuit." action={<button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Créer</button>} /></div>
      ) : (
        <div className="card table-wrap">
          <table className="data">
            <thead><tr><th>Nom</th><th>Type</th><th>Thème</th><th>Joueurs</th><th>Statut</th><th>Récompenses</th><th>Date</th><th>Actions</th></tr></thead>
            <tbody>
              {tournaments.map((t) => (
                <tr key={t.id} className="clickable" onClick={() => openDetail(t)}>
                  <td className="cell-strong">{t.name}</td>
                  <td>{Number(t.entry_fee) > 0 ? 'Payant' : 'Gratuit'}</td>
                  <td>{themeLabels[t.theme] || t.theme || '—'}</td>
                  <td>{num(t.registered_players || 0)}{t.max_players ? ` / ${t.max_players}` : ''}</td>
                  <td><StatusBadge status={t.status} /></td>
                  <td>{Number(t.entry_fee) > 0 ? fcfa(t.prize_pool) : '🏅 XP'}</td>
                  <td className="muted">{t.starts_at ? dateFr(t.starts_at) : '—'}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {(t.status === 'scheduled' || t.status === 'open') && (
                      <div className="row nowrap" style={{ gap: 6 }}>
                        <button className="btn btn-sm btn-success" onClick={() => doStart(t)}><Play size={13} /></button>
                        <button className="btn btn-sm btn-danger-ghost" onClick={() => doCancel(t)}><X size={13} /></button>
                      </div>
                    )}
                    {t.status !== 'scheduled' && t.status !== 'open' && (
                      <button className="btn btn-sm btn-ghost" onClick={() => openDetail(t)}><Eye size={13} /></button>
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
