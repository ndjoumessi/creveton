import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import {
  Plus, AlertTriangle, Play, X, Trophy,
} from 'lucide-react';
import tournamentsService from '../services/tournaments.service';
import { useApiData } from '../hooks/useApiData';
import { THEME_KEYS, tournamentTypeLabels } from '../constants/enums';
import { themeLabels } from '../constants/theme';
import {
  num, dateFr, dateTimeFr, initials, avatarColor,
} from '../utils/format';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import Drawer from '../components/Drawer';
import LoadingSpinner from '../components/LoadingSpinner';
import { notify } from '../components/Toast';

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

/** Avatar carré coloré (initiales) — réutilisé dans les listes. */
function Avatar({ name }) {
  return (
    <span className="avatar-c" style={{ background: avatarColor(name) }}>{initials(name)}</span>
  );
}

/** Formulaire de création de tournoi (mode gratuit forcé — tournois payants désactivés). */
function TournamentForm({ onSubmit }) {
  const {
    register, handleSubmit, watch, formState: { errors },
  } = useForm({
    defaultValues: { theme: 'culture', max_players: '64' },
  });
  const theme = watch('theme');

  const submit = (values) => {
    onSubmit({
      name: values.name,
      type: 'free',
      theme: values.theme,
      max_players: Number(values.max_players),
      entry_fee: 0, // tournois payants désactivés (feature flag)
      format: { questions: 10, time_per_q_s: 20 },
      starts_at: new Date(values.starts_at).toISOString(),
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
        <span className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          Ce tournoi aura ~
          {themeQuestionCount(theme)}
          {' '}
          questions disponibles sur ce thème.
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
          <option value="premium" disabled style={{ color: '#9ca3af' }}>Premium — Bientôt</option>
        </select>
        <span className="muted" style={{ fontSize: 12, marginTop: 4 }}>Les tournois payants arrivent bientôt.</span>
      </div>
    </form>
  );
}

/** Carte d'un tournoi (rendue via .map — pas de composant majuscule imbriqué). */
function renderTournamentCard(t, { onOpen, onStart, onCancel }) {
  const canStart = t.status === 'scheduled' || t.status === 'open';
  const canCancel = !TERMINAL.includes(t.status);
  const pct = t.max_players ? Math.min(100, Math.round((t.registered_players / t.max_players) * 100)) : 0;

  return (
    <div className="card t-card" key={t.id} onClick={() => onOpen(t)} style={{ cursor: 'pointer' }}>
      <div className="t-card-head">
        <span className="t-card-name">{t.name}</span>
        <span className="row" style={{ gap: 6, alignItems: 'center' }}>
          {t.status === 'running' && <span className="live-dot" />}
          <StatusBadge status={t.status} kind="tournament" />
        </span>
      </div>

      <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="badge" style={{ background: '#ede9fe', color: '#7c3aed' }}>{tournamentTypeLabels[t.type] || t.type}</span>
        <span className="muted" style={{ fontSize: 13 }}>{themeLabels[t.theme] || t.theme}</span>
      </div>

      <div>
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 6 }}>
          {`${t.registered_players}/${t.max_players} joueurs`}
        </div>
        <div className="progress"><span style={{ width: `${pct}%` }} /></div>
      </div>

      <div className="t-meta">
        <div><div className="m-label">Cagnotte</div><div className="m-value">{t.prize_pool > 0 ? `${num(t.prize_pool)} FCFA` : 'XP & badges'}</div></div>
        <div><div className="m-label">Début</div><div className="m-value">{dateFr(t.starts_at)}</div></div>
      </div>

      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
        {canStart && (
          <button className="btn btn-sm btn-success" onClick={() => onStart(t)}>
            <Play size={14} /> Démarrer
          </button>
        )}
        {canCancel && (
          <button className="btn btn-sm btn-danger" onClick={() => onCancel(t)}>
            <X size={14} /> Annuler
          </button>
        )}
      </div>
    </div>
  );
}

export default function Tournois() {
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState(null);

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

  const cardHandlers = { onOpen: setSelected, onStart: doStart, onCancel: doCancel };

  const sel = selected;
  const selCanStart = sel && (sel.status === 'scheduled' || sel.status === 'open');
  const selCanCancel = sel && !TERMINAL.includes(sel.status);
  const selCanPayout = sel && (sel.status === 'running' || sel.status === 'closed');
  const participants = sel ? demoParticipants(sel) : [];
  const ranking = sel ? [...participants].sort((a, b) => b.score - a.score) : [];

  return (
    <>
      {/* Bandeau d'avertissement : tournois payants désactivés (feature flag). */}
      <div className="banner">
        <AlertTriangle size={16} />
        Les tournois payants seront disponibles dans une prochaine version. Vous pouvez créer des tournois gratuits (XP & badges uniquement).
      </div>

      <PageHeader
        title="Tournois"
        description="Gestion des tournois : création, démarrage et annulation."
        actions={<button className="btn btn-primary" onClick={() => setShowForm(true)}><Plus size={16} /> Créer un tournoi</button>}
      />

      {/* Stats */}
      <div className="grid grid-3" style={{ marginBottom: 18 }}>
        <div className="card kpi"><div className="kpi-label">Total tournois</div><div className="kpi-value">{rows.length}</div></div>
        <div className="card kpi"><div className="kpi-label">En cours</div><div className="kpi-value">{rows.filter((r) => r.status === 'running').length}</div></div>
        <div className="card kpi"><div className="kpi-label">Programmés</div><div className="kpi-value">{rows.filter((r) => r.status === 'scheduled').length}</div></div>
      </div>

      {loading ? (
        <div className="card"><LoadingSpinner label="Chargement…" /></div>
      ) : rows.length === 0 ? (
        <div className="card"><div className="empty"><h3>Aucun tournoi</h3><span style={{ fontSize: 14 }}>Aucun tournoi pour le moment.</span></div></div>
      ) : (
        <div className="cards-grid">{rows.map((t) => renderTournamentCard(t, cardHandlers))}</div>
      )}

      {/* Modal création */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title="Créer un tournoi"
        footer={<><button className="btn" onClick={() => setShowForm(false)}>Annuler</button><button className="btn btn-primary" type="submit" form="tournament-form" disabled={submitting}>Créer</button></>}
      >
        <TournamentForm onSubmit={createTournament} />
      </Modal>

      {/* Drawer détail */}
      <Drawer
        open={Boolean(sel)}
        onClose={() => setSelected(null)}
        title={sel ? sel.name : ''}
        footer={sel && (
          <>
            {selCanStart && <button className="btn btn-sm btn-success" onClick={() => doStart(sel)}><Play size={14} /> Démarrer</button>}
            {selCanCancel && <button className="btn btn-sm btn-danger" onClick={() => doCancel(sel)}><X size={14} /> Annuler</button>}
            {selCanPayout && <button className="btn btn-sm btn-primary" onClick={() => doPayout(sel)}><Trophy size={14} /> Voir résultats</button>}
          </>
        )}
      >
        {sel && (
          <div className="stack" style={{ gap: 18 }}>
            <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
              {sel.status === 'running' && <span className="live-dot" />}
              <StatusBadge status={sel.status} kind="tournament" />
            </div>

            <dl className="kv">
              <dt>Type</dt><dd>{tournamentTypeLabels[sel.type] || sel.type}</dd>
              <dt>Thème</dt><dd>{themeLabels[sel.theme] || sel.theme}</dd>
              <dt>Joueurs</dt><dd>{`${sel.registered_players}/${sel.max_players}`}</dd>
              <dt>Cagnotte</dt><dd>{sel.prize_pool > 0 ? `${num(sel.prize_pool)} FCFA` : 'XP & badges'}</dd>
              <dt>Début</dt><dd>{dateTimeFr(sel.starts_at)}</dd>
              <dt>Statut</dt><dd>{tournamentStatusLabel(sel.status)}</dd>
            </dl>

            <div>
              <div className="muted" style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
                PARTICIPANTS INSCRITS
                {' '}
                <span style={{ fontWeight: 400 }}>(démo)</span>
              </div>
              {participants.map((p, i) => (
                <div className="list-row" key={i}>
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
                  CLASSEMENT LIVE
                  {' '}
                  <span style={{ fontWeight: 400 }}>(démo)</span>
                </div>
                {ranking.map((p, i) => (
                  <div className="list-row" key={i}>
                    <span className="avatar-c" style={{ background: i === 0 ? '#d4a017' : avatarColor(p.name) }}>{i + 1}</span>
                    <div className="grow">
                      <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{p.name}</div>
                      <div className="muted" style={{ fontSize: 12.5 }}>{p.ville}</div>
                    </div>
                    <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{`${p.score} pts`}</span>
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

// Libellé de statut tournoi (réutilise la même table que les badges).
function tournamentStatusLabel(status) {
  const LABELS = {
    scheduled: 'Programmé',
    open: 'Inscriptions',
    running: 'En cours',
    closed: 'Clôturé',
    paid: 'Payé',
    cancelled: 'Annulé',
  };
  return LABELS[status] || status;
}
