import { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  Plus, AlertTriangle, Play, Ban, Award,
} from 'lucide-react';
import tournamentsService from '../services/tournaments.service';
import { useApiData } from '../hooks/useApiData';
import { THEME_KEYS, TOURNAMENT_TYPE_KEYS, tournamentTypeLabels } from '../constants/enums';
import { themeLabels } from '../constants/theme';
import { fcfa, num, dateFr } from '../utils/format';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import { notify } from '../components/Toast';

// Statuts non terminaux : on peut encore agir dessus (annuler / démarrer / valider).
const NON_TERMINAL = ['scheduled', 'open', 'running', 'closed'];

/** Formulaire de création de tournoi (mode gratuit forcé — mise = 0). */
function TournamentForm({ onSubmit }) {
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: { type: 'free', theme: 'culture', max_players: 64 },
  });

  const submit = (values) => {
    onSubmit({
      name: values.name,
      type: values.type,
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
          <select className="select" {...register('type')}>{TOURNAMENT_TYPE_KEYS.map((t) => <option key={t} value={t}>{tournamentTypeLabels[t]}</option>)}</select>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Thème</label>
          <select className="select" {...register('theme')}>{THEME_KEYS.map((t) => <option key={t} value={t}>{themeLabels[t]}</option>)}</select>
        </div>
      </div>

      <div className="row" style={{ gap: 12 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>Joueurs max</label>
          <input className="input" type="number" {...register('max_players', { required: 'Requis', min: { value: 2, message: '2 joueurs min' } })} />
          {errors.max_players && <span className="field-error">{errors.max_players.message}</span>}
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Début</label>
          <input className="input" type="datetime-local" {...register('starts_at', { required: 'Date de début requise' })} />
          {errors.starts_at && <span className="field-error">{errors.starts_at.message}</span>}
        </div>
      </div>

      <div className="field" style={{ marginBottom: 0 }}>
        <label>Mise d’inscription</label>
        <input className="input" value="Gratuit (tournois payants désactivés)" disabled readOnly />
      </div>
    </form>
  );
}

export default function Tournois() {
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { data, loading, refetch } = useApiData(() => tournamentsService.list(), []);
  const rows = data?.data || [];

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

  const doPayout = async (t) => {
    try {
      await tournamentsService.payout(t.id);
      notify.success('Résultats validés.');
      refetch();
    } catch { notify.error('Validation impossible.'); }
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

  const Action = ({ icon: Icon, label, onClick, danger }) => (
    <button className={`btn btn-sm ${danger ? 'btn-danger' : ''}`} onClick={(e) => { e.stopPropagation(); onClick(); }} title={label}>
      <Icon size={14} /> {label}
    </button>
  );

  const columns = [
    { accessorKey: 'name', header: 'Nom', cell: (c) => <span style={{ fontWeight: 500 }}>{c.getValue()}</span> },
    { accessorKey: 'type', header: 'Type', cell: (c) => <span className="tag">{tournamentTypeLabels[c.getValue()] || c.getValue()}</span> },
    { accessorKey: 'entry_fee', header: 'Mise', cell: (c) => (c.getValue() ? fcfa(c.getValue()) : 'Gratuit') },
    { id: 'players', header: 'Joueurs', enableSorting: false, cell: ({ row }) => `${num(row.original.registered_players)}/${num(row.original.max_players)} joueurs` },
    { accessorKey: 'prize_pool', header: 'Cagnotte', cell: (c) => fcfa(c.getValue()) },
    { accessorKey: 'status', header: 'Statut', cell: (c) => <StatusBadge status={c.getValue()} kind="tournament" /> },
    { accessorKey: 'starts_at', header: 'Début', cell: (c) => dateFr(c.getValue()) },
    {
      id: 'actions', header: 'Actions', enableSorting: false,
      cell: ({ row }) => {
        const t = row.original;
        return (
          <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
            {(t.status === 'scheduled' || t.status === 'open') && <Action icon={Play} label="Démarrer" onClick={() => doStart(t)} />}
            {(t.status === 'running' || t.status === 'closed') && <Action icon={Award} label="Valider résultats" onClick={() => doPayout(t)} />}
            {NON_TERMINAL.includes(t.status) && <Action icon={Ban} label="Annuler" danger onClick={() => doCancel(t)} />}
          </div>
        );
      },
    },
  ];

  return (
    <>
      {/* Bandeau d'avertissement : tournois payants désactivés (feature flag). */}
      <div className="banner">
        <AlertTriangle size={16} />
        Tournois payants désactivés (feature flag) — disponibles dans une prochaine version.
      </div>

      <PageHeader
        title="Tournois"
        description="Gestion des tournois : création, démarrage, annulation et validation des résultats."
        actions={<button className="btn btn-primary" onClick={() => setShowForm(true)}><Plus size={16} /> Créer un tournoi</button>}
      />

      {/* Stats */}
      <div className="grid grid-3" style={{ marginBottom: 18 }}>
        <div className="card kpi"><div className="kpi-label">Total tournois</div><div className="kpi-value">{rows.length}</div></div>
        <div className="card kpi"><div className="kpi-label">En cours</div><div className="kpi-value">{rows.filter((r) => r.status === 'running').length}</div></div>
        <div className="card kpi"><div className="kpi-label">Programmés</div><div className="kpi-value">{rows.filter((r) => r.status === 'scheduled').length}</div></div>
      </div>

      <DataTable columns={columns} data={rows} loading={loading} emptyMessage="Aucun tournoi pour le moment." />

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
