import { useState, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import {
  Plus, Upload, Search, Check, Send, ThumbsUp, ThumbsDown, Archive, RotateCcw, Zap,
} from 'lucide-react';
import questionsService from '../services/questions.service';
import { useApiData } from '../hooks/useApiData';
import { THEME_KEYS, LEVEL_KEYS } from '../constants/enums';
import { themeLabels, levelLabels, questionStatusColors } from '../constants/theme';
import { pct, dateFr } from '../utils/format';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import { notify } from '../components/Toast';

const STATUSES = ['draft', 'pending_review', 'approved', 'rejected', 'archived'];
const EMPTY_FILTERS = { theme: '', level: '', status: '', q: '' };

function QuestionForm({ onSubmit }) {
  const [correctIndex, setCorrectIndex] = useState(1);
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: { type: 'mcq', theme: 'culture', level: 'beginner' },
  });

  const submit = (values) => {
    const options = [0, 1, 2, 3].map((i) => ({ text: values[`opt${i}`], is_correct: i === correctIndex }));
    onSubmit({
      text_fr: values.text_fr,
      type: 'mcq',
      options,
      explanation: values.explanation || null,
      theme: values.theme,
      level: values.level,
      tags: values.tags ? values.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    });
  };

  return (
    <form id="question-form" onSubmit={handleSubmit(submit)}>
      <div className="field">
        <label>Énoncé (FR)</label>
        <textarea className="textarea" placeholder="Quelle est la capitale… ?" {...register('text_fr', { required: 'Énoncé requis', minLength: { value: 3, message: '3 caractères min' } })} />
        {errors.text_fr && <span className="field-error">{errors.text_fr.message}</span>}
      </div>

      <div className="field">
        <label>Options — cochez la bonne réponse</label>
        <div className="options-list">
          {[0, 1, 2, 3].map((i) => (
            <div className="option-row" key={i}>
              <input className="input" placeholder={`Option ${String.fromCharCode(65 + i)}`} {...register(`opt${i}`, { required: i < 2 })} />
              <button type="button" className={`toggle-correct ${correctIndex === i ? 'on' : ''}`} onClick={() => setCorrectIndex(i)}>
                <Check size={14} /> Bonne
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="row" style={{ gap: 12 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>Thème</label>
          <select className="select" {...register('theme')}>{THEME_KEYS.map((t) => <option key={t} value={t}>{themeLabels[t]}</option>)}</select>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Niveau</label>
          <select className="select" {...register('level')}>{LEVEL_KEYS.map((l) => <option key={l} value={l}>{levelLabels[l]}</option>)}</select>
        </div>
      </div>

      <div className="field">
        <label>Explication</label>
        <textarea className="textarea" placeholder="Affichée après réponse" {...register('explanation')} />
      </div>

      <div className="field" style={{ marginBottom: 0 }}>
        <label>Tags (séparés par des virgules)</label>
        <input className="input" placeholder="capitale, géographie" {...register('tags')} />
      </div>
    </form>
  );
}

function ImportModal({ open, onClose, onDone }) {
  const [drag, setDrag] = useState(false);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef();

  const handleFile = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const res = await questionsService.importCsv(file);
      setReport(res);
      notify.success(`Import : ${res.accepted} acceptées, ${res.rejected} rejetées`);
      onDone?.();
    } catch {
      notify.error('Échec de l’import.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Import CSV de questions" footer={<button className="btn" onClick={onClose}>Fermer</button>}>
      <div
        className={`dropzone ${drag ? 'drag' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]); }}
        onClick={() => inputRef.current?.click()}
      >
        <Upload size={26} style={{ marginBottom: 8 }} />
        <div><strong>Glissez-déposez</strong> un fichier CSV, ou cliquez pour parcourir.</div>
        <div style={{ fontSize: 12, marginTop: 6 }}>Colonnes : question, option_a…d, correct, difficulty, category</div>
        <input ref={inputRef} type="file" accept=".csv" hidden onChange={(e) => handleFile(e.target.files[0])} />
      </div>

      {busy && <p className="muted" style={{ textAlign: 'center', marginTop: 14 }}>Traitement…</p>}

      {report && (
        <>
          <div className="import-report">
            <div className="import-stat"><div className="n">{report.total_rows}</div><div className="muted">Lignes</div></div>
            <div className="import-stat" style={{ background: '#f3fbf5' }}><div className="n" style={{ color: '#1a7a3f' }}>{report.accepted}</div><div className="muted">Acceptées</div></div>
            <div className="import-stat" style={{ background: '#fdf2f0' }}><div className="n" style={{ color: '#c0392b' }}>{report.rejected}</div><div className="muted">Rejetées</div></div>
          </div>
          {report.errors?.length > 0 && (
            <div className="errors-list">
              {report.errors.map((e, i) => <div className="err" key={i}>Ligne {e.row} — {e.issue}</div>)}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

export default function Questions() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { data, loading, refetch } = useApiData(
    () => questionsService.list(filters),
    [filters.theme, filters.level, filters.status, filters.q],
  );
  const rows = useMemo(() => data?.data || [], [data]);

  const avgSuccess = useMemo(() => {
    const rated = rows.filter((r) => r.success_rate != null);
    return rated.length ? rated.reduce((s, r) => s + r.success_rate, 0) / rated.length : null;
  }, [rows]);

  const setF = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

  const doTransition = async (q, to) => {
    let reason;
    if (to === 'rejected') {
      reason = window.prompt('Motif du rejet :');
      if (reason == null) return;
    }
    try {
      await questionsService.transition(q.id, to, reason);
      notify.success(`Statut → ${questionStatusColors[to]?.label || to}`);
      refetch();
    } catch { notify.error('Transition impossible.'); }
  };

  const doForceSync = async (q) => {
    try {
      const res = await questionsService.forceSync([q.id]);
      notify.success(`Force sync envoyé · ${res.devices_targeted?.toLocaleString('fr-FR') || '—'} appareils`);
    } catch { notify.error('Échec du force sync.'); }
  };

  const createQuestion = async (payload) => {
    setSubmitting(true);
    try {
      await questionsService.create(payload);
      notify.success('Question créée (brouillon).');
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
    { accessorKey: 'text_fr', header: 'Question', cell: (c) => <span style={{ display: 'block', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{c.getValue()}</span> },
    { accessorKey: 'theme', header: 'Thème', cell: (c) => <span className="tag">{themeLabels[c.getValue()] || c.getValue()}</span> },
    { accessorKey: 'level', header: 'Niveau', cell: (c) => levelLabels[c.getValue()] || c.getValue() },
    { accessorKey: 'status', header: 'Statut', cell: (c) => <StatusBadge status={c.getValue()} kind="question" /> },
    { accessorKey: 'success_rate', header: 'Réussite', cell: (c) => pct(c.getValue()) },
    { accessorKey: 'updated_at', header: 'Modifiée', cell: (c) => dateFr(c.getValue()) },
    {
      id: 'actions', header: 'Actions', enableSorting: false,
      cell: ({ row }) => {
        const q = row.original;
        return (
          <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
            {q.status === 'draft' && <Action icon={Send} label="Soumettre" onClick={() => doTransition(q, 'pending_review')} />}
            {q.status === 'pending_review' && <><Action icon={ThumbsUp} label="Approuver" onClick={() => doTransition(q, 'approved')} /><Action icon={ThumbsDown} label="Rejeter" danger onClick={() => doTransition(q, 'rejected')} /></>}
            {q.status === 'approved' && <><Action icon={Zap} label="Force sync" onClick={() => doForceSync(q)} /><Action icon={Archive} label="Archiver" onClick={() => doTransition(q, 'archived')} /></>}
            {q.status === 'rejected' && <Action icon={RotateCcw} label="Resoumettre" onClick={() => doTransition(q, 'pending_review')} />}
            {q.status === 'archived' && <Action icon={Zap} label="Force sync" onClick={() => doForceSync(q)} />}
          </div>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Questions"
        description="Gestion du contenu et workflow de modération."
        actions={
          <>
            <button className="btn" onClick={() => setShowImport(true)}><Upload size={16} /> Import CSV</button>
            <button className="btn btn-primary" onClick={() => setShowForm(true)}><Plus size={16} /> Nouvelle question</button>
          </>
        }
      />

      {/* Stats */}
      <div className="grid grid-3" style={{ marginBottom: 18 }}>
        <div className="card kpi"><div className="kpi-label">Total chargées</div><div className="kpi-value">{rows.length}</div></div>
        <div className="card kpi"><div className="kpi-label">Taux de réussite moyen</div><div className="kpi-value">{pct(avgSuccess)}</div></div>
        <div className="card kpi"><div className="kpi-label">En attente de révision</div><div className="kpi-value">{rows.filter((r) => r.status === 'pending_review').length}</div></div>
      </div>

      {/* Filtres */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="filters">
          <div className="search"><Search size={16} /><input className="input" placeholder="Rechercher un énoncé…" value={filters.q} onChange={(e) => setF('q', e.target.value)} /></div>
          <select className="select" value={filters.theme} onChange={(e) => setF('theme', e.target.value)}><option value="">Tous thèmes</option>{THEME_KEYS.map((t) => <option key={t} value={t}>{themeLabels[t]}</option>)}</select>
          <select className="select" value={filters.level} onChange={(e) => setF('level', e.target.value)}><option value="">Tous niveaux</option>{LEVEL_KEYS.map((l) => <option key={l} value={l}>{levelLabels[l]}</option>)}</select>
          <select className="select" value={filters.status} onChange={(e) => setF('status', e.target.value)}><option value="">Tous statuts</option>{STATUSES.map((s) => <option key={s} value={s}>{questionStatusColors[s].label}</option>)}</select>
        </div>
      </div>

      <DataTable columns={columns} data={rows} loading={loading} onRowClick={undefined} emptyMessage="Aucune question pour ces filtres." />

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title="Nouvelle question"
        footer={<><button className="btn" onClick={() => setShowForm(false)}>Annuler</button><button className="btn btn-primary" type="submit" form="question-form" disabled={submitting}>Créer (brouillon)</button></>}
      >
        <QuestionForm onSubmit={createQuestion} />
      </Modal>

      <ImportModal open={showImport} onClose={() => setShowImport(false)} onDone={refetch} />
    </>
  );
}
