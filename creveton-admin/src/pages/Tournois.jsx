import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import {
  Plus, Lock, Play, X, Trophy, Calendar, Users,
} from 'lucide-react';
import tournamentsService from '../services/tournaments.service';
import { useApiData } from '../hooks/useApiData';
import { THEME_KEYS, tournamentTypeLabels } from '../constants/enums';
import { themeLabels, themeBadgeColors } from '../constants/theme';
import {
  num, dateFr, dateTimeFr, initials, avatarColor,
} from '../utils/format';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import ThemeBadge from '../components/ThemeBadge';
import Modal from '../components/Modal';
import Drawer from '../components/Drawer';
import EmptyState from '../components/EmptyState';
import { SkeletonCard } from '../components/Skeleton';
import { notify } from '../components/Toast';
import './Tournois.css';

// Statuts terminaux : on ne peut plus annuler le tournoi.
const TERMINAL = ['paid', 'cancelled'];

// Nombre (mock déterministe) de questions disponibles par thème — aperçu création.
const THEME_QUESTION_COUNT = {
  culture: 120, geographie: 95, histoire: 80, industrie: 60, sport: 110, science: 70,
};
const themeQuestionCount = (theme) => THEME_QUESTION_COUNT[theme] || 50;

// Prénoms / villes pour générer des participants de démonstration.
const DEMO_NAMES = ['Awa Mbarga', 'Jean Fotso', 'Nadège Eyenga', 'Paul Atangana', 'Sandrine Kana', 'Eric Ndongo'];
const DEMO_CITIES = ['Yaoundé', 'Douala', 'Bafoussam', 'Garoua', 'Bamenda', 'Kribi'];

/** Construit une liste de participants fictifs déterministe pour un tournoi. */
function demoParticipants(t) {
  const count = Math.min(Math.max(t.registered_players || 0, 4), 6) || 4;
  return Array.from({ length: count }, (_, i) => ({
    name: DEMO_NAMES[i % DEMO_NAMES.length],
    ville: DEMO_CITIES[i % DEMO_CITIES.length],
    joined_at: t.starts_at,
    score: ((i * 37 + 53) % 90) + 10,
  }));
}

/** Ratio de remplissage (0-100) inscrits / capacité. */
function fillPct(t) {
  return t.max_players ? Math.min(100, Math.round((t.registered_players / t.max_players) * 100)) : 0;
}

/** Avatar carré coloré (initiales) — réutilisé dans le drawer. */
function Avatar({ name }) {
  return (
    <span className="avatar-c" style={{ background: avatarColor(name) }}>{initials(name)}</span>
  );
}

/**
 * Statut d'un tournoi. Si `running`, badge rouge animé « EN COURS » bien
 * visible ; sinon, badge de statut standard du design system.
 */
function TournamentStatus({ status }) {
  if (status === 'running') {
    return (
      <span className="badge tour-live-badge" title="Tournoi en cours">
        <span className="badge-dot pulse" />
        EN COURS
      </span>
    );
  }
  return <StatusBadge status={status} kind="tournament" />;
}

/**
 * Card de présentation d'un tournoi (utilisée dans la grille ET en preview live).
 * `interactive` = card cliquable (ouvre le drawer) avec boutons d'action.
 */
function TournamentCard({
  t, interactive = false, onOpen, onStart, onCancel,
}) {
  const cfg = themeBadgeColors[t.theme] || { fg: '#1a5230' };
  const canStart = t.status === 'scheduled' || t.status === 'open';
  const canCancel = !TERMINAL.includes(t.status);
  const pct = fillPct(t);
  const full = t.registered_players >= t.max_players && t.max_players > 0;

  return (
    <div
      className={`card t-card${interactive ? ' tour-card' : ''}`}
      style={{ '--tour-fg': cfg.fg }}
      onClick={interactive ? () => onOpen(t) : undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
    >
      <div className="t-card-banner tour-banner">
        {t.status === 'running' && (
          <span className="tour-live"><span className="live-dot" />LIVE</span>
        )}
        <span className="tour-banner-emoji" aria-hidden="true">{cfg.icon || '🏆'}</span>
      </div>

      <div className="t-card-body tour-card-body">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <span className="t-card-name">{t.name || 'Nom du tournoi'}</span>
          <TournamentStatus status={t.status} />
        </div>

        <div className="row" style={{ gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="badge" style={{ background: '#ede9fe', color: '#7c3aed' }}>
            {tournamentTypeLabels[t.type] || t.type}
          </span>
          <ThemeBadge theme={t.theme} />
        </div>

        <div>
          <div className="tour-players">
            <span>
              <span className="tour-players-count">{num(t.registered_players || 0)}</span>
              {` / ${num(t.max_players || 0)} joueurs`}
            </span>
            {full && <span className="tour-players-full">Complet</span>}
          </div>
          <div className="progress"><span style={{ width: `${pct}%` }} /></div>
        </div>

        <div className="t-meta">
          <div>
            <div className="m-label">Récompense</div>
            <div className="m-value">{t.prize_pool > 0 ? `${num(t.prize_pool)} FCFA` : 'XP & badges'}</div>
          </div>
          <div>
            <div className="m-label">Début</div>
            <div className="m-value">
              <span className="tour-meta-row"><Calendar size={13} />{dateFr(t.starts_at)}</span>
            </div>
          </div>
        </div>
      </div>

      {interactive && (canStart || canCancel) && (
        <div className="t-card-foot" onClick={(e) => e.stopPropagation()}>
          {canStart && (
            <button type="button" className="btn btn-sm btn-success" onClick={() => onStart(t)}>
              <Play size={14} /> Démarrer
            </button>
          )}
          {canCancel && (
            <button type="button" className="btn btn-sm btn-danger" onClick={() => onCancel(t)}>
              <X size={14} /> Annuler
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Formulaire de création de tournoi (mode gratuit forcé — payants désactivés).
 * Émet aussi les valeurs courantes via `onChange` pour alimenter la preview live.
 */
function TournamentForm({ onSubmit, onChange }) {
  const {
    register, handleSubmit, watch, formState: { errors },
  } = useForm({
    defaultValues: {
      name: '', theme: 'culture', max_players: '64', description: '', starts_at: '',
    },
  });
  const theme = watch('theme');

  // Remonte les valeurs au parent à chaque changement (preview temps réel).
  useEffect(() => {
    const sub = watch((values) => onChange(values));
    return () => sub.unsubscribe();
  }, [watch, onChange]);

  const submit = (v) => {
    onSubmit({
      name: v.name,
      type: 'free',
      theme: v.theme,
      max_players: Number(v.max_players),
      entry_fee: 0, // tournois payants désactivés (feature flag)
      format: { questions: 10, time_per_q_s: 20 },
      starts_at: new Date(v.starts_at).toISOString(),
    });
  };

  return (
    <form id="tournament-form" onSubmit={handleSubmit(submit)}>
      <div className="field">
        <label>Nom du tournoi</label>
        <input className="input" placeholder="Grand Quiz National" {...register('name', { required: 'Nom requis' })} />
        {errors.name && <span className="field-error">{errors.name.message}</span>}
      </div>

      <div className="field">
        <label>Thème</label>
        <select className="select" {...register('theme')}>
          {THEME_KEYS.map((t) => <option key={t} value={t}>{themeLabels[t]}</option>)}
        </select>
        <span className="field-help">
          {`Ce tournoi aura ~${themeQuestionCount(theme)} questions disponibles sur ce thème.`}
        </span>
      </div>

      <div className="row" style={{ gap: 12 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>Nombre max de joueurs</label>
          <select className="select" {...register('max_players')}>
            <option value="32">32</option>
            <option value="64">64</option>
            <option value="128">128</option>
          </select>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Date et heure de début</label>
          <input className="input" type="datetime-local" {...register('starts_at', { required: 'Date de début requise' })} />
          {errors.starts_at && <span className="field-error">{errors.starts_at.message}</span>}
        </div>
      </div>

      <div className="field">
        <label>Description</label>
        <textarea className="textarea" placeholder="Description du tournoi (optionnel)" {...register('description')} />
      </div>

      <div className="field" style={{ marginBottom: 0 }}>
        <label>Type</label>
        <select className="select" defaultValue="free" disabled>
          <option value="free">Gratuit</option>
          <option value="premium" disabled>Premium — Bientôt</option>
        </select>
        <span className="field-help">Les tournois payants arrivent bientôt.</span>
      </div>
    </form>
  );
}

export default function Tournois() {
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState({ name: '', theme: 'culture', max_players: '64' });

  const { data, loading, refetch } = useApiData(() => tournamentsService.list(), []);
  const rows = useMemo(() => data?.data || [], [data]);

  // Actions admin : on appelle le service, on notifie, puis on rafraîchit.
  const doStart = async (t) => {
    try {
      await tournamentsService.start(t.id);
      notify.success('Tournoi démarré.');
      setSelected(null);
      refetch();
    } catch { notify.error('Démarrage impossible.'); }
  };

  const doCancel = async (t) => {
    if (!window.confirm(`Annuler le tournoi « ${t.name} » ?`)) return;
    try {
      await tournamentsService.cancel(t.id);
      notify.success('Tournoi annulé.');
      setSelected(null);
      refetch();
    } catch { notify.error('Annulation impossible.'); }
  };

  const doPayout = async (t) => {
    try {
      await tournamentsService.payout(t.id);
      notify.success('Résultats publiés.');
      setSelected(null);
      refetch();
    } catch { notify.error('Publication impossible.'); }
  };

  const createTournament = async (payload) => {
    setSubmitting(true);
    try {
      await tournamentsService.create(payload);
      notify.success('Tournoi créé.');
      setShowForm(false);
      refetch();
    } catch { notify.error('Création impossible.'); } finally { setSubmitting(false); }
  };

  const sel = selected;
  const selCanStart = sel && (sel.status === 'scheduled' || sel.status === 'open');
  const selCanCancel = sel && !TERMINAL.includes(sel.status);
  const selCanPayout = sel && (sel.status === 'running' || sel.status === 'closed');
  const participants = sel ? demoParticipants(sel) : [];
  const ranking = sel ? [...participants].sort((a, b) => b.score - a.score) : [];

  // Tournoi factice pour la preview live (statut "programmé").
  const previewTournament = {
    name: draft.name,
    type: 'free',
    theme: draft.theme,
    max_players: Number(draft.max_players) || 0,
    registered_players: 0,
    prize_pool: 0,
    status: 'scheduled',
    starts_at: draft.starts_at || null,
  };

  return (
    <>
      <PageHeader
        title="Tournois"
        description="Création, démarrage et suivi des tournois Creveton."
        actions={(
          <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Plus size={16} /> Créer un tournoi
          </button>
        )}
      />

      {/* Bannière info : tournois payants désactivés (MVP gratuit). */}
      <div className="banner banner-locked">
        <span className="tour-banner-icon"><Lock size={16} /></span>
        Les tournois payants arrivent dans une prochaine version. Vous pouvez dès à présent
        créer des tournois gratuits (récompenses en XP &amp; badges).
      </div>

      {loading ? (
        <div className="grid-auto">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} h={300} />)}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="Aucun tournoi"
          message="Lancez votre premier tournoi gratuit pour animer la communauté."
          action={(
            <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>
              <Plus size={16} /> Créer un tournoi
            </button>
          )}
        />
      ) : (
        <div className="grid-auto">
          {rows.map((t) => (
            <TournamentCard
              key={t.id}
              t={t}
              interactive
              onOpen={setSelected}
              onStart={doStart}
              onCancel={doCancel}
            />
          ))}

          {/* Card "Créer un tournoi" — pointillés or, fond cream. */}
          <button type="button" className="card t-create" onClick={() => setShowForm(true)}>
            <span className="tour-create-icon"><Plus size={26} /></span>
            Créer un tournoi
            <span className="tour-create-sub">Gratuit · XP &amp; badges</span>
          </button>
        </div>
      )}

      {/* Modal création — 2 colonnes : formulaire + preview live. */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title="Créer un tournoi"
        width={820}
        footer={(
          <>
            <button type="button" className="btn" onClick={() => setShowForm(false)}>Annuler</button>
            <button type="submit" className="btn btn-primary" form="tournament-form" disabled={submitting}>
              {submitting ? 'Création…' : 'Créer le tournoi'}
            </button>
          </>
        )}
      >
        <div className="tour-modal-grid">
          <TournamentForm onSubmit={createTournament} onChange={setDraft} />

          <div className="tour-preview">
            <span className="tour-preview-label">Aperçu</span>
            <TournamentCard t={previewTournament} />
            <div className="tour-preview-hint">
              Ce tournoi aura <b>{themeQuestionCount(draft.theme)}</b> questions disponibles
              et <b>10</b> questions par partie (20 s chacune).
            </div>
          </div>
        </div>
      </Modal>

      {/* Drawer détail — préservé (participants + classement live démo). */}
      <Drawer
        open={Boolean(sel)}
        onClose={() => setSelected(null)}
        title={sel ? sel.name : ''}
        footer={sel && (
          <>
            {selCanStart && <button type="button" className="btn btn-sm btn-success" onClick={() => doStart(sel)}><Play size={14} /> Démarrer</button>}
            {selCanCancel && <button type="button" className="btn btn-sm btn-danger" onClick={() => doCancel(sel)}><X size={14} /> Annuler</button>}
            {selCanPayout && <button type="button" className="btn btn-sm btn-primary" onClick={() => doPayout(sel)}><Trophy size={14} /> Voir résultats</button>}
          </>
        )}
      >
        {sel && (
          <div className="stack" style={{ gap: 18 }}>
            <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
              <TournamentStatus status={sel.status} />
              <ThemeBadge theme={sel.theme} />
            </div>

            <div>
              <div className="tour-players">
                <span className="row" style={{ gap: 6, alignItems: 'center' }}>
                  <Users size={14} />
                  <span className="tour-players-count">{num(sel.registered_players)}</span>
                  {` / ${num(sel.max_players)} joueurs`}
                </span>
              </div>
              <div className="progress"><span style={{ width: `${fillPct(sel)}%` }} /></div>
            </div>

            <dl className="kv">
              <dt>Type</dt><dd>{tournamentTypeLabels[sel.type] || sel.type}</dd>
              <dt>Thème</dt><dd>{themeLabels[sel.theme] || sel.theme}</dd>
              <dt>Récompense</dt><dd>{sel.prize_pool > 0 ? `${num(sel.prize_pool)} FCFA` : 'XP & badges'}</dd>
              <dt>Début</dt><dd>{dateTimeFr(sel.starts_at)}</dd>
            </dl>

            <div>
              <div className="muted" style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
                PARTICIPANTS INSCRITS <span style={{ fontWeight: 400 }}>(démo)</span>
              </div>
              {participants.map((p) => (
                <div className="list-row" key={`${p.name}-${p.ville}`}>
                  <Avatar name={p.name} />
                  <div className="grow">
                    <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{p.name}</div>
                    <div className="muted" style={{ fontSize: 12.5 }}>{p.ville}</div>
                  </div>
                  <span className="muted" style={{ fontSize: 12.5 }}>{dateFr(p.joined_at)}</span>
                </div>
              ))}
            </div>

            {sel.status === 'running' && (
              <div>
                <div className="muted" style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
                  CLASSEMENT LIVE <span style={{ fontWeight: 400 }}>(démo)</span>
                </div>
                {ranking.map((p, i) => (
                  <div className="list-row" key={`rank-${p.name}-${p.ville}`}>
                    <span
                      className="avatar-c"
                      style={{ background: i === 0 ? 'var(--gold)' : avatarColor(p.name) }}
                      title={`${i + 1}ᵉ place`}
                    >
                      {i + 1}
                    </span>
                    <div className="grow">
                      <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{p.name}</div>
                      <div className="muted" style={{ fontSize: 12.5 }}>{p.ville}</div>
                    </div>
                    <span className="tour-rank-score" style={{ fontWeight: 700, color: 'var(--ink)' }}>{`${num(p.score)} pts`}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Drawer>
    </>
  );
}
