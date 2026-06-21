import { useState, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import {
  Plus, Upload, Search, Check, Eye, Pencil, Trash2, Send, ThumbsUp, ThumbsDown,
  Archive, RotateCcw, Zap, Download,
} from 'lucide-react';
import questionsService from '../services/questions.service';
import { useApiData } from '../hooks/useApiData';
import { THEME_KEYS, LEVEL_KEYS } from '../constants/enums';
import { themeLabels, levelLabels, questionStatusColors } from '../constants/theme';
import { pct, dateFr } from '../utils/format';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';
import ThemeBadge from '../components/ThemeBadge';
import Modal from '../components/Modal';
import Drawer from '../components/Drawer';
import LoadingSpinner from '../components/LoadingSpinner';
import { notify } from '../components/Toast';

const STATUSES = ['draft', 'pending_review', 'approved', 'rejected', 'archived'];
const EMPTY_FILTERS = { theme: '', level: '', status: '', q: '' };
const truncate = (s, n = 60) => (s && s.length > n ? `${s.slice(0, n)}…` : s);

const LevelBadge = ({ level }) => (
  <span className="badge" style={{ background: '#f3f4f6', color: '#4b5563' }}>{levelLabels[level] || level}</span>
);

/* ---------- Formulaire création / édition ---------- */
function QuestionForm({ initial, onSubmit }) {
  const init = initial || {};
  const [correctIndex, setCorrectIndex] = useState(init.correct_index ?? 1);
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      text_fr: init.text_fr || '',
      theme: init.theme || 'culture',
      level: init.level || 'beginner',
      explanation: init.explanation || '',
      tags: (init.tags || []).join(', '),
      opt0: init.options?.[0]?.text || '',
      opt1: init.options?.[1]?.text || '',
      opt2: init.options?.[2]?.text || '',
      opt3: init.options?.[3]?.text || '',
    },
  });

  const submit = (v) => {
    const options = [0, 1, 2, 3].map((i) => ({ text: v[`opt${i}`], is_correct: i === correctIndex }));
    onSubmit({
      text_fr: v.text_fr,
      type: 'mcq',
      options,
      explanation: v.explanation || null,
      theme: v.theme,
      level: v.level,
      tags: v.tags ? v.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
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
      <div className="field"><label>Explication</label><textarea className="textarea" placeholder="Affichée après réponse" {...register('explanation')} /></div>
      <div className="field" style={{ marginBottom: 0 }}><label>Tags (séparés par des virgules)</label><input className="input" placeholder="capitale, géographie" {...register('tags')} /></div>
    </form>
  );
}

/* ---------- Import CSV ---------- */
const CSV_TEMPLATE = [
  'question,option_a,option_b,option_c,option_d,correct,difficulty,category,explanation,language',
  'Quelle est la capitale du Cameroun ?,Douala,Yaoundé,Bafoussam,Garoua,B,beginner,geographie,Yaoundé est la capitale.,fr',
].join('\n');

function downloadTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'modele-questions-creveton.csv';
  a.click();
  URL.revokeObjectURL(url);
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
    } catch { notify.error('Échec de l’import.'); } finally { setBusy(false); }
  };

  const runForceSync = async () => {
    try {
      const r = await questionsService.forceSync([]);
      notify.success(`Force sync envoyé · ${r.devices_targeted?.toLocaleString('fr-FR') || '—'} appareils`);
    } catch { notify.error('Force sync indisponible.'); }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import CSV de questions"
      footer={<>
        <button className="btn" onClick={downloadTemplate}><Download size={15} /> Télécharger le modèle</button>
        <button className="btn" onClick={onClose}>Fermer</button>
      </>}
    >
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
            <div className="import-stat" style={{ background: '#f3fbf5' }}><div className="n" style={{ color: '#15803d' }}>{report.accepted}</div><div className="muted">Acceptées</div></div>
            <div className="import-stat" style={{ background: '#fef2f2' }}><div className="n" style={{ color: '#dc2626' }}>{report.rejected}</div><div className="muted">Rejetées</div></div>
          </div>
          {report.errors?.length > 0 && <div className="errors-list">{report.errors.map((e, i) => <div className="err" key={i}>Ligne {e.row} — {e.issue}</div>)}</div>}
          {report.accepted > 0 && (
            <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} onClick={runForceSync}>
              <Zap size={15} /> Force sync (push silencieux)
            </button>
          )}
        </>
      )}
    </Modal>
  );
}

/* ---------- Page ---------- */
export default function Questions() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [showImport, setShowImport] = useState(false);
  const [editing, setEditing] = useState(undefined); // undefined=fermé, null=création, objet=édition
  const [detail, setDetail] = useState(null);
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
  const hasFilters = filters.theme || filters.level || filters.status || filters.q;
  const setF = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

  const doTransition = async (q, to) => {
    let reason;
    if (to === 'rejected') { reason = window.prompt('Motif du rejet :'); if (reason == null) return; }
    try {
      await questionsService.transition(q.id, to, reason);
      notify.success(`Statut → ${questionStatusColors[to]?.label || to}`);
      setDetail(null); refetch();
    } catch { notify.error('Transition impossible.'); }
  };
  const doForceSync = async (q) => {
    try { const r = await questionsService.forceSync([q.id]); notify.success(`Force sync · ${r.devices_targeted?.toLocaleString('fr-FR') || '—'} appareils`); }
    catch { notify.error('Échec du force sync.'); }
  };
  const doArchive = async (q) => {
    if (!window.confirm('Archiver cette question ? (soft delete)')) return;
    try { await questionsService.remove(q.id); notify.success('Question archivée.'); refetch(); }
    catch { notify.error('Archivage impossible.'); }
  };
  const saveQuestion = async (payload) => {
    setSubmitting(true);
    try {
      if (editing) { await questionsService.update(editing.id, payload); notify.success('Question mise à jour.'); }
      else { await questionsService.create(payload); notify.success('Question créée (brouillon).'); }
      setEditing(undefined); refetch();
    } catch { notify.error('Enregistrement impossible.'); } finally { setSubmitting(false); }
  };

  const columns = [
    { id: 'idx', header: '#', enableSorting: false, cell: ({ row }) => <span className="muted">{row.index + 1}</span> },
    { accessorKey: 'text_fr', header: 'Énoncé', cell: (c) => <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{truncate(c.getValue())}</span> },
    { accessorKey: 'theme', header: 'Thème', cell: (c) => <ThemeBadge theme={c.getValue()} /> },
    { accessorKey: 'level', header: 'Niveau', cell: (c) => <LevelBadge level={c.getValue()} /> },
    { accessorKey: 'status', header: 'Statut', cell: (c) => <StatusBadge status={c.getValue()} kind="question" /> },
    { accessorKey: 'success_rate', header: 'Taux réussite', cell: (c) => pct(c.getValue()) },
    { accessorKey: 'created_at', header: 'Créée le', cell: (c) => dateFr(c.getValue()) },
    {
      id: 'actions', header: 'Actions', enableSorting: false,
      cell: ({ row }) => {
        const q = row.original;
        return (
          <div className="row nowrap" style={{ gap: 2 }}>
            <button className="icon-action" title="Voir" onClick={() => setDetail(q)}><Eye size={17} /></button>
            <button className="icon-action" title="Éditer" onClick={() => setEditing(q)}><Pencil size={16} /></button>
            <button className="icon-action danger" title="Archiver" onClick={() => doArchive(q)}><Trash2 size={16} /></button>
          </div>
        );
      },
    },
  ];

  const renderWorkflow = (q) => (
    <div className="row wrap" style={{ gap: 8 }}>
      {q.status === 'draft' && <button className="btn btn-sm btn-primary" onClick={() => doTransition(q, 'pending_review')}><Send size={14} /> Soumettre</button>}
      {q.status === 'pending_review' && <>
        <button className="btn btn-sm btn-success" onClick={() => doTransition(q, 'approved')}><ThumbsUp size={14} /> Approuver</button>
        <button className="btn btn-sm btn-danger" onClick={() => doTransition(q, 'rejected')}><ThumbsDown size={14} /> Rejeter</button>
      </>}
      {q.status === 'approved' && <>
        <button className="btn btn-sm" onClick={() => doForceSync(q)}><Zap size={14} /> Force sync</button>
        <button className="btn btn-sm" onClick={() => doTransition(q, 'archived')}><Archive size={14} /> Archiver</button>
      </>}
      {q.status === 'rejected' && <button className="btn btn-sm btn-primary" onClick={() => doTransition(q, 'pending_review')}><RotateCcw size={14} /> Resoumettre</button>}
      {q.status === 'archived' && <button className="btn btn-sm" onClick={() => doForceSync(q)}><Zap size={14} /> Force sync</button>}
    </div>
  );

  return (
    <>
      <PageHeader
        title="Questions"
        description="Gérez le contenu et le workflow de modération des questions du quiz."
        actions={<>
          <button className="btn" onClick={() => setShowImport(true)}><Upload size={16} /> Import CSV</button>
          <button className="btn btn-creveton" onClick={() => setEditing(null)}><Plus size={16} /> Nouvelle question</button>
        </>}
      />

      <div className="grid grid-3" style={{ marginBottom: 20 }}>
        <div className="card kpi"><div className="kpi-label">Total chargées</div><div className="kpi-value">{rows.length}</div></div>
        <div className="card kpi"><div className="kpi-label">Taux de réussite moyen</div><div className="kpi-value">{pct(avgSuccess)}</div></div>
        <div className="card kpi"><div className="kpi-label">En attente de révision</div><div className="kpi-value">{rows.filter((r) => r.status === 'pending_review').length}</div></div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <div className="filters">
          <div className="search"><Search size={16} /><input className="input" placeholder="Rechercher un énoncé…" value={filters.q} onChange={(e) => setF('q', e.target.value)} /></div>
          <select className="select" value={filters.theme} onChange={(e) => setF('theme', e.target.value)}><option value="">Tous thèmes</option>{THEME_KEYS.map((t) => <option key={t} value={t}>{themeLabels[t]}</option>)}</select>
          <select className="select" value={filters.level} onChange={(e) => setF('level', e.target.value)}><option value="">Tous niveaux</option>{LEVEL_KEYS.map((l) => <option key={l} value={l}>{levelLabels[l]}</option>)}</select>
          <select className="select" value={filters.status} onChange={(e) => setF('status', e.target.value)}><option value="">Tous statuts</option>{STATUSES.map((s) => <option key={s} value={s}>{questionStatusColors[s].label}</option>)}</select>
        </div>
      </div>

      {loading ? (
        <div className="card"><LoadingSpinner label="Chargement…" /></div>
      ) : rows.length === 0 ? (
        <div className="card">
          <div className="empty">
            <div className="empty-illus">
              <svg width="76" height="76" viewBox="0 0 76 76" fill="none">
                <rect x="14" y="10" width="40" height="50" rx="6" fill="#ecfdf3" stroke="#5eca84" strokeWidth="2" />
                <rect x="22" y="22" width="40" height="50" rx="6" fill="#fff" stroke="#2a8a4f" strokeWidth="2" />
                <line x1="29" y1="34" x2="55" y2="34" stroke="#5eca84" strokeWidth="2" strokeLinecap="round" />
                <line x1="29" y1="44" x2="55" y2="44" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" />
                <line x1="29" y1="54" x2="46" y2="54" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            {hasFilters ? (
              <>
                <h3>Aucun résultat</h3>
                <span style={{ fontSize: 14 }}>Aucune question ne correspond à ces filtres.</span>
                <button className="btn" onClick={() => setFilters(EMPTY_FILTERS)}>Réinitialiser les filtres</button>
              </>
            ) : (
              <>
                <h3>Importez vos premières questions</h3>
                <span style={{ fontSize: 14 }}>Aucune question pour l’instant. Créez-en une ou importez un lot CSV.</span>
                <div className="row" style={{ gap: 10 }}>
                  <button className="btn" onClick={() => setShowImport(true)}><Upload size={16} /> Import CSV</button>
                  <button className="btn btn-creveton" onClick={() => setEditing(null)}><Plus size={16} /> Nouvelle question</button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <DataTable columns={columns} data={rows} />
      )}

      {/* Modal création / édition */}
      <Modal
        open={editing !== undefined}
        onClose={() => setEditing(undefined)}
        title={editing ? 'Modifier la question' : 'Nouvelle question'}
        footer={<>
          <button className="btn" onClick={() => setEditing(undefined)}>Annuler</button>
          <button className="btn btn-creveton" type="submit" form="question-form" disabled={submitting}>{editing ? 'Enregistrer' : 'Créer (brouillon)'}</button>
        </>}
      >
        <QuestionForm initial={editing || undefined} onSubmit={saveQuestion} />
      </Modal>

      {/* Drawer détail */}
      <Drawer open={Boolean(detail)} onClose={() => setDetail(null)} title="Détail de la question">
        {detail && (
          <div className="stack" style={{ gap: 18 }}>
            <div className="row wrap" style={{ gap: 8 }}>
              <ThemeBadge theme={detail.theme} /><LevelBadge level={detail.level} /><StatusBadge status={detail.status} kind="question" />
            </div>
            <div>
              <div className="muted" style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>ÉNONCÉ</div>
              <div style={{ fontFamily: 'Outfit', fontWeight: 600, fontSize: 16, color: 'var(--ink)' }}>{detail.text_fr}</div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>OPTIONS</div>
              {(detail.options || []).map((o, i) => (
                <div className={`opt-review ${o.is_correct || i === detail.correct_index ? 'correct' : ''}`} key={i}>
                  {(o.is_correct || i === detail.correct_index) ? <Check size={16} /> : <span style={{ width: 16 }} />}
                  {o.text}
                </div>
              ))}
            </div>
            {detail.explanation && (
              <div>
                <div className="muted" style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>EXPLICATION</div>
                <div style={{ fontSize: 14 }}>{detail.explanation}</div>
              </div>
            )}
            <dl className="kv">
              <dt>Taux réussite</dt><dd>{pct(detail.success_rate)}</dd>
              <dt>Version</dt><dd>{detail.version ?? '—'}</dd>
              <dt>Mise à jour</dt><dd>{dateFr(detail.updated_at)}</dd>
            </dl>
            <div>
              <div className="muted" style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>WORKFLOW</div>
              {renderWorkflow(detail)}
            </div>
          </div>
        )}
      </Drawer>

      <ImportModal open={showImport} onClose={() => setShowImport(false)} onDone={refetch} />
    </>
  );
}
