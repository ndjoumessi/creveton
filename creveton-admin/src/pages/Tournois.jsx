import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import {
  Plus, AlertTriangle, Play, X,
} from 'lucide-react';
import tournamentsService from '../services/tournaments.service';
import { useApiData } from '../hooks/useApiData';
import { THEME_KEYS, tournamentTypeLabels } from '../constants/enums';
import { themeLabels } from '../constants/theme';
import { dateFr } from '../utils/format';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import LoadingSpinner from '../components/LoadingSpinner';
import { notify } from '../components/Toast';

// Statuts terminaux : on ne peut plus annuler le tournoi.
const TERMINAL = ['paid', 'cancelled'];

/** Formulaire de création de tournoi (mode gratuit forcé — tournois payants désactivés). */
function TournamentForm({ onSubmit }) {
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: { theme: 'culture', max_players: 64 },
  });

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

      <div className="row" style={{ gap: 12 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>Type</label>
          <select className="select" defaultValue="free" disabled>
            <option value="free">Gratuit</option>
            <option value="premium" disabled>Premium — Bientôt</option>
          </select>
          <span className="muted" style={{ fontSize: 12, marginTop: 4 }}>Payant — Bientôt</span>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Thème</label>
          <select className="select" {...register('theme')}>{THEME_KEYS.map((t) => <option key={t} value={t}>{themeLabels[t]}</option>)}</select>
        </div>
      </div>

      <div className="row" style={{ gap: 12 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>Nombre max de joueurs</label>
          <input className="input" type="number" {...register('max_players', { required: 'Requis', min: { value: 2, message: '2 joueurs min' } })} />
          {errors.max_players && <span className="field-error">{errors.max_players.message}</span>}
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Date / heure de début</label>
          <input className="input" type="datetime-local" {...register('starts_at', { required: 'Date de début requise' })} />
          {errors.starts_at && <span className="field-error">{errors.starts_at.message}</span>}
        </div>
      </div>
    </form>
  );
}

export default function Tournois() {
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { data, loading, refetch } = useApiData(() => tournamentsService.list(), []);
  const rows = useMemo(() => data?.data || [], [data]);

  // Actions admin : on appelle le service, on notifie, puis on rafraîchit.
  const doStart = async (t) => {
    try {
      await tournamentsService.start(t.id);
      notify.success('Tournoi démarré.');
      refetch();
    } catch { notify.error('Démarrage impossible.'); }
  };

  const doCancel = async (t) => {
    if (!window.confirm(`Annuler le tournoi « ${t.name} » ?`)) return;
    try {
      await tournamentsService.cancel(t.id);
      notify.success('Tournoi annulé.');
      refetch();
    } catch { notify.error('Annulation impossible.'); }
  };

  const createTournament = async (payload) => {
    setSubmitting(true);
    try {
      await tournamentsService.create(payload);
      notify.success('Tournoi créé.');
      setShowForm(false);
      refetch();
    } catch { notify.error('Création impossible.'); }
    finally { setSubmitting(false); }
  };

  const renderCard = (t) => {
    const canStart = t.status === 'scheduled' || t.status === 'open';
    const canCancel = !TERMINAL.includes(t.status);
    return (
      <div className="card t-card" key={t.id}>
        <div className="t-card-head">
          <span className="t-card-name">{t.name}</span>
          <StatusBadge status={t.status} kind="tournament" />
        </div>

        <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="badge" style={{ background: '#ede9fe', color: '#7c3aed' }}>{tournamentTypeLabels[t.type] || t.type}</span>
          <span className="muted" style={{ fontSize: 13 }}>{themeLabels[t.theme] || t.theme}</span>
        </div>

        <div className="t-meta">
          <div><div className="m-label">Joueurs</div><div className="m-value">{`${t.registered_players}/${t.max_players}`}</div></div>
          <div><div className="m-label">Cagnotte</div><div className="m-value">{t.prize_pool > 0 ? `${t.prize_pool} FCFA` : 'XP & badges'}</div></div>
          <div><div className="m-label">Début</div><div className="m-value">{dateFr(t.starts_at)}</div></div>
          <div><div className="m-label">Type</div><div className="m-value">{tournamentTypeLabels[t.type] || t.type}</div></div>
        </div>

        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {canStart && (
            <button className="btn btn-sm btn-success" onClick={() => doStart(t)}>
              <Play size={14} /> Démarrer
            </button>
          )}
          {canCancel && (
            <button className="btn btn-sm btn-danger" onClick={() => doCancel(t)}>
              <X size={14} /> Annuler
            </button>
          )}
        </div>
      </div>
    );
  };

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
        <div className="cards-grid">{rows.map(renderCard)}</div>
      )}

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title="Créer un tournoi"
        footer={<><button className="btn" onClick={() => setShowForm(false)}>Annuler</button><button className="btn btn-primary" type="submit" form="tournament-form" disabled={submitting}>Créer</button></>}
      >
        <TournamentForm onSubmit={createTournament} />
      </Modal>
    </>
  );
}
