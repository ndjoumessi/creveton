import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Plus, Upload, Search, Check, Eye, Send, ThumbsUp, ThumbsDown,
  Archive, RotateCcw, Zap, Download, ChevronUp, ChevronDown, ChevronsUpDown,
  ChevronLeft, ChevronRight, X, FileText, ListChecks, Tags, Copy, AlertCircle,
} from 'lucide-react';
import questionsService from '../services/questions.service';
import { useApiData } from '../hooks/useApiData';
import { THEME_KEYS, LEVEL_KEYS } from '../constants/enums';
import { themeLabels, levelLabels, questionStatusColors } from '../constants/theme';
import { pct, dateFr } from '../utils/format';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import ThemeBadge from '../components/ThemeBadge';
import Modal from '../components/Modal';
import Drawer from '../components/Drawer';
import EmptyState from '../components/EmptyState';
import { SkeletonTable } from '../components/Skeleton';
import { notify } from '../components/Toast';
import './Questions.css';

const STATUSES = ['draft', 'pending_review', 'approved', 'rejected', 'archived'];
const EMPTY_FILTERS = { theme: '', level: '', status: '', q: '' };
const PAGE_SIZE = 20;
const LETTERS = ['A', 'B', 'C', 'D'];

const LevelBadge = ({ level }) => (
  <span className="badge badge-level">{levelLabels[level] || level}</span>
);

/* ---------- En-tête de statut avec point pulsé si approuvée ---------- */
function QuestionStatus({ status }) {
  if (status !== 'approved') return <StatusBadge status={status} kind="question" />;
  const cfg = questionStatusColors.approved;
  return (
    <span className="badge" style={{ background: cfg.bg, color: cfg.fg }}>
      <span className="badge-dot pulse" style={{ background: cfg.fg }} />
      {cfg.label}
    </span>
  );
}

/* ---------- Import CSV (plomberie préservée) ---------- */
const CSV_TEMPLATE = [
  'question,option_a,option_b,option_c,option_d,correct,difficulty,category,explanation,language',
  'Quelle est la capitale du Cameroun ?,Douala,Yaoundé,Bafoussam,Garoua,B,beginner,geographie,Yaoundé est la capitale.,fr',
].join('\n');

function downloadCsv(content, filename) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
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
      footer={(
        <>
          <button className="btn" onClick={() => downloadCsv(CSV_TEMPLATE, 'modele-questions-creveton.csv')}>
            <Download size={15} /> Télécharger le modèle
          </button>
          <button className="btn" onClick={onClose}>Fermer</button>
        </>
      )}
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
          {report.errors?.length > 0 && (
            <div className="errors-list">
              {report.errors.map((e) => <div className="err" key={`${e.row}-${e.issue}`}>Ligne {e.row} — {e.issue}</div>)}
            </div>
          )}
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

/* ---------- Modal de création par étapes + preview live ---------- */
const STEP_META = [
  { icon: FileText, label: 'Contenu' },
  { icon: ListChecks, label: 'Options' },
  { icon: Tags, label: 'Métadonnées' },
];

const MAX_TEXT = 300;
const EMPTY_DRAFT = {
  textFr: '', opts: ['', '', '', ''], correct: 0,
  explanation: '', theme: 'culture', level: 'beginner', tags: [],
};

/* Convertit une question existante en brouillon pré-rempli (« Dupliquer »). */
function draftFromQuestion(q) {
  if (!q) return EMPTY_DRAFT;
  const base = (q.options || []).map((o) => o.text || '');
  const opts = [...base, '', '', '', ''].slice(0, 4);
  let correct = q.correct_index;
  if (correct == null) correct = (q.options || []).findIndex((o) => o.is_correct);
  if (correct == null || correct < 0) correct = 0;
  return {
    textFr: `${q.text_fr || ''} (Copie)`,
    opts,
    correct,
    explanation: q.explanation || '',
    theme: q.theme || 'culture',
    level: q.level || 'beginner',
    tags: Array.isArray(q.tags) ? [...q.tags] : [],
  };
}

function CreateModal({ open, onClose, onCreate, submitting, prefill }) {
  const [step, setStep] = useState(0);
  const [textFr, setTextFr] = useState('');
  const [opts, setOpts] = useState(['', '', '', '']);
  const [correct, setCorrect] = useState(0);
  const [explanation, setExplanation] = useState('');
  const [theme, setTheme] = useState('culture');
  const [level, setLevel] = useState('beginner');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState([]);

  const reset = () => {
    setStep(0); setTextFr(''); setOpts(['', '', '', '']); setCorrect(0);
    setExplanation(''); setTheme('culture'); setLevel('beginner'); setTagInput(''); setTags([]);
  };

  // Hydrate le formulaire à l'ouverture (vierge, ou pré-rempli pour « Dupliquer »).
  useEffect(() => {
    if (!open) return;
    const d = draftFromQuestion(prefill);
    setStep(0);
    setTextFr(d.textFr);
    setOpts(d.opts);
    setCorrect(d.correct);
    setExplanation(d.explanation);
    setTheme(d.theme);
    setLevel(d.level);
    setTagInput('');
    setTags(d.tags);
  }, [open, prefill]);

  const close = () => { reset(); onClose(); };

  const setOpt = (i, v) => setOpts((o) => o.map((x, idx) => (idx === i ? v : x)));
  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags((p) => [...p, t]);
    setTagInput('');
  };

  // --- Validation temps réel ---
  const trimmed = textFr.trim();
  const textOk = trimmed.length >= 10;
  const textOver = textFr.length > MAX_TEXT;
  const optsOk = Boolean(opts[0].trim() && opts[1].trim());
  const correctOk = Boolean(opts[correct]?.trim());
  const canCreate = textOk && !textOver && optsOk && correctOk;

  const step1Ok = trimmed.length >= 3 && !textOver;

  const submit = () => {
    if (!canCreate) return;
    onCreate({
      text_fr: trimmed,
      type: 'mcq',
      options: opts.map((text, i) => ({ text, is_correct: i === correct })),
      explanation: explanation || null,
      theme,
      level,
      tags,
    }, reset);
  };

  const next = () => setStep((s) => Math.min(2, s + 1));
  const prev = () => setStep((s) => Math.max(0, s - 1));

  const footer = (
    <>
      <button className="btn btn-ghost-soft" onClick={close}>Annuler</button>
      <div style={{ flex: 1 }} />
      {step > 0 && <button className="btn" onClick={prev}><ChevronLeft size={15} /> Précédent</button>}
      {step < 2 && (
        <button className="btn btn-primary" onClick={next} disabled={step === 0 && !step1Ok}>
          Suivant <ChevronRight size={15} />
        </button>
      )}
      {step === 2 && (
        <button className="btn btn-success" onClick={submit} disabled={!canCreate || submitting}>
          <Plus size={15} /> Créer (brouillon)
        </button>
      )}
    </>
  );

  const title = prefill ? 'Dupliquer la question' : 'Nouvelle question';

  return (
    <Modal open={open} onClose={close} title={title} footer={footer} width={820}>
      <div className="steps">
        {STEP_META.map((s, i) => (
          <div key={s.label} style={{ display: 'contents' }}>
            <span className={`step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}>
              <span className="num">{i < step ? <Check size={13} /> : i + 1}</span>
              {s.label}
            </span>
            {i < STEP_META.length - 1 && <span className="step-sep" />}
          </div>
        ))}
      </div>

      <div className="q-create-grid">
        <div>
          {step === 0 && (
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Énoncé (FR)</label>
              <textarea
                className="textarea"
                placeholder="Quelle est la capitale… ?"
                value={textFr}
                onChange={(e) => setTextFr(e.target.value)}
              />
              <div className={`char-count ${textOver ? 'over' : ''}`}>{textFr.length} / {MAX_TEXT}</div>
              <div className={`valid-hint ${textOk && !textOver ? 'ok' : 'ko'}`} style={{ marginTop: 4 }}>
                {textOk && !textOver
                  ? <><Check size={13} /> Énoncé valide</>
                  : <><AlertCircle size={13} /> {textOver ? `Énoncé trop long (max ${MAX_TEXT})` : 'Énoncé trop court (10 caractères min.)'}</>}
              </div>
            </div>
          )}

          {step === 1 && (
            <>
              <div className="field">
                <label>Options — sélectionnez la bonne réponse</label>
                {opts.map((v, i) => (
                  <div className="q-opt-row" key={LETTERS[i]}>
                    <input
                      className="input"
                      placeholder={`Option ${LETTERS[i]}`}
                      value={v}
                      onChange={(e) => setOpt(i, e.target.value)}
                    />
                    <button type="button" className={`q-opt-pick ${correct === i ? 'on' : ''}`} onClick={() => setCorrect(i)}>
                      <Check size={13} /> Bonne
                    </button>
                  </div>
                ))}
                <div className={`valid-hint ${optsOk && correctOk ? 'ok' : 'ko'}`}>
                  {optsOk && correctOk
                    ? <><Check size={13} /> Réponses valides</>
                    : <><AlertCircle size={13} /> {!optsOk ? 'Renseignez au moins 2 options' : 'La bonne réponse doit être renseignée'}</>}
                </div>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Explication (affichée après réponse)</label>
                <textarea
                  className="textarea"
                  placeholder="Pourquoi cette réponse est correcte…"
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
                <div className="field" style={{ flex: 1 }}>
                  <label>Thème</label>
                  <select className="select" value={theme} onChange={(e) => setTheme(e.target.value)}>
                    {THEME_KEYS.map((t) => <option key={t} value={t}>{themeLabels[t]}</option>)}
                  </select>
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>Niveau</label>
                  <select className="select" value={level} onChange={(e) => setLevel(e.target.value)}>
                    {LEVEL_KEYS.map((l) => <option key={l} value={l}>{levelLabels[l]}</option>)}
                  </select>
                </div>
              </div>
              <div className="field">
                <label>Tags</label>
                <input
                  className="input"
                  placeholder="Saisissez puis Entrée (ex. capitale)"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                  onBlur={addTag}
                />
                {tags.length > 0 && (
                  <div className="q-tags">
                    {tags.map((t) => (
                      <span className="q-tag" key={t}>
                        {t}
                        <button type="button" onClick={() => setTags((p) => p.filter((x) => x !== t))} aria-label={`Retirer ${t}`}>
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className={`valid-hint ${canCreate ? 'ok' : 'ko'}`}>
                {canCreate
                  ? <><Check size={13} /> Prêt à enregistrer</>
                  : <><AlertCircle size={13} /> Complétez l’énoncé et les réponses pour enregistrer</>}
              </div>
            </>
          )}
        </div>

        {/* Aperçu live façon application mobile (fond vert) */}
        <aside className="q-preview">
          <div className="q-preview-cap">Aperçu mobile</div>
          <div className="mobile-preview">
            <div className="row wrap" style={{ gap: 6 }}>
              <ThemeBadge theme={theme} />
              <LevelBadge level={level} />
            </div>
            <div className="mp-q">{trimmed || 'Votre énoncé apparaîtra ici…'}</div>
            {opts.map((o, i) => (
              <div className={`mp-opt ${i === correct && o.trim() ? 'correct' : ''}`} key={LETTERS[i]}>
                <span className="mp-letter">{LETTERS[i]}</span>
                <span className="q-opt-text">{o.trim() || `Option ${LETTERS[i]}`}</span>
                {i === correct && o.trim() && <Check size={15} />}
              </div>
            ))}
          </div>
          {explanation.trim() && <div className="explain" style={{ marginTop: 12 }}>{explanation}</div>}
        </aside>
      </div>
    </Modal>
  );
}

/* ---------- Page ---------- */
export default function Questions() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [showImport, setShowImport] = useState(false);
  const [creating, setCreating] = useState(false);
  const [prefill, setPrefill] = useState(null);
  const [detail, setDetail] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [sort, setSort] = useState({ key: 'created_at', dir: 'desc' });
  const [page, setPage] = useState(0);

  const { data, loading, refetch } = useApiData(
    () => questionsService.list(filters),
    [filters.theme, filters.level, filters.status, filters.q],
  );
  const rows = useMemo(() => data?.data || [], [data]);

  const total = rows.length;
  const approvedCount = useMemo(() => rows.filter((r) => r.status === 'approved').length, [rows]);
  const pendingCount = useMemo(() => rows.filter((r) => r.status === 'pending_review').length, [rows]);

  const hasFilters = filters.theme || filters.level || filters.status || filters.q;
  const setF = (k, v) => { setFilters((f) => ({ ...f, [k]: v })); setPage(0); };
  const resetFilters = () => { setFilters(EMPTY_FILTERS); setPage(0); };

  // --- Tri (préservé : cycle asc/desc par colonne) ---
  const toggleSort = (key) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
    setPage(0);
  };
  const sortedRows = useMemo(() => {
    const arr = [...rows];
    const { key, dir } = sort;
    arr.sort((a, b) => {
      const va = a[key]; const vb = b[key];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (va < vb) return dir === 'asc' ? -1 : 1;
      if (va > vb) return dir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [rows, sort]);

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const pageRows = useMemo(
    () => sortedRows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [sortedRows, page],
  );

  // --- Transitions / actions unitaires (plomberie préservée) ---
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
  const createQuestion = async (payload, resetForm) => {
    setSubmitting(true);
    try {
      await questionsService.create(payload);
      notify.success(prefill ? 'Copie créée (brouillon).' : 'Question créée (brouillon).');
      resetForm(); setCreating(false); setPrefill(null); refetch();
    } catch { notify.error('Enregistrement impossible.'); } finally { setSubmitting(false); }
  };
  const startCreate = () => { setPrefill(null); setCreating(true); };
  const startDuplicate = (q) => { setPrefill(q); setDetail(null); setCreating(true); };
  const closeCreate = () => { setCreating(false); setPrefill(null); };

  // --- Sélection multiple + actions groupées (préservé) ---
  const allSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));
  const toggleOne = (id) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setSelected((s) => {
    const n = new Set(s);
    if (allSelected) pageRows.forEach((r) => n.delete(r.id));
    else pageRows.forEach((r) => n.add(r.id));
    return n;
  });
  const clearSel = () => setSelected(new Set());

  const bulkTransition = async (to) => {
    const items = rows.filter((r) => selected.has(r.id));
    if (!items.length) return;
    try {
      await Promise.all(items.map((q) => questionsService.transition(q.id, to, to === 'rejected' ? 'Rejet groupé' : undefined)));
      notify.success(`${items.length} question(s) → ${questionStatusColors[to]?.label || to}`);
      clearSel(); refetch();
    } catch { notify.error('Action groupée impossible.'); }
  };
  const exportCsv = () => {
    const cols = ['id', 'text_fr', 'theme', 'level', 'status', 'success_rate', 'created_at'];
    const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const picked = selected.size ? rows.filter((r) => selected.has(r.id)) : rows;
    const csv = [cols.join(',')].concat(picked.map((q) => cols.map((k) => esc(q[k])).join(','))).join('\n');
    downloadCsv(csv, 'questions-creveton.csv');
    notify.success(`${picked.length} question(s) exportée(s)`);
  };

  const sortHead = (label, k) => {
    const active = sort.key === k;
    return (
      <span className="q-sort" onClick={() => toggleSort(k)}>
        {label}
        <span className={`q-sort-icon ${active ? 'on' : ''}`}>
          {active ? (sort.dir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />) : <ChevronsUpDown size={13} />}
        </span>
      </span>
    );
  };

  const renderWorkflow = (q) => (
    <div className="stack" style={{ gap: 8 }}>
      {q.status === 'draft' && (
        <button className="btn btn-primary btn-block" onClick={() => doTransition(q, 'pending_review')}><Send size={15} /> Soumettre à révision</button>
      )}
      {q.status === 'pending_review' && (
        <>
          <button className="btn btn-success btn-block" onClick={() => doTransition(q, 'approved')}><ThumbsUp size={15} /> Approuver</button>
          <button className="btn btn-danger-ghost btn-block" onClick={() => doTransition(q, 'rejected')}><ThumbsDown size={15} /> Rejeter</button>
        </>
      )}
      {q.status === 'approved' && (
        <>
          <button className="btn btn-block" onClick={() => doForceSync(q)}><Zap size={15} /> Force sync</button>
          <button className="btn btn-block" onClick={() => doTransition(q, 'archived')}><Archive size={15} /> Archiver</button>
        </>
      )}
      {q.status === 'rejected' && (
        <button className="btn btn-primary btn-block" onClick={() => doTransition(q, 'pending_review')}><RotateCcw size={15} /> Resoumettre</button>
      )}
      {q.status === 'archived' && (
        <button className="btn btn-block" onClick={() => doForceSync(q)}><Zap size={15} /> Force sync</button>
      )}
    </div>
  );

  return (
    <>
      {/* En-tête sticky : titre + compteurs inline + actions */}
      <div className="q-head">
        <PageHeader
          title={(
            <span className="q-title-line">
              Questions
              {!loading && <span className="q-count-inline"><strong>{total}</strong> chargées · <strong>{pendingCount}</strong> en attente</span>}
            </span>
          )}
          description="Gérez le contenu et le workflow de modération des questions du quiz."
          actions={(
            <>
              <button className="btn" onClick={() => setShowImport(true)}><Upload size={16} /> Import CSV</button>
              <button className="btn btn-primary" onClick={startCreate}><Plus size={16} /> Nouvelle question</button>
            </>
          )}
        />

        {/* KPI strip (3 blocs, chiffres Outfit 700, traits verticaux) */}
        {loading ? (
          <div className="kpi-strip"><span className="muted">Chargement…</span></div>
        ) : (
          <div className="kpi-strip">
            <div className="item"><span className="n">{total}</span><span className="l">questions</span></div>
            <div className="item"><span className="n">{approvedCount}</span><span className="l">approuvées</span></div>
            <div className="item"><span className="n">{pendingCount}</span><span className="l">en attente</span></div>
          </div>
        )}
      </div>

      {/* Barre filtres sticky */}
      <div className="q-filters">
        <div className="filters">
          <div className="search">
            <Search size={16} />
            <input className="input" placeholder="Rechercher un énoncé…" value={filters.q} onChange={(e) => setF('q', e.target.value)} />
          </div>
          <select className="select" value={filters.theme} onChange={(e) => setF('theme', e.target.value)}>
            <option value="">Tous thèmes</option>
            {THEME_KEYS.map((t) => <option key={t} value={t}>{themeLabels[t]}</option>)}
          </select>
          <select className="select" value={filters.level} onChange={(e) => setF('level', e.target.value)}>
            <option value="">Tous niveaux</option>
            {LEVEL_KEYS.map((l) => <option key={l} value={l}>{levelLabels[l]}</option>)}
          </select>
          <select className="select" value={filters.status} onChange={(e) => setF('status', e.target.value)}>
            <option value="">Tous statuts</option>
            {STATUSES.map((s) => <option key={s} value={s}>{questionStatusColors[s].label}</option>)}
          </select>
          {hasFilters && (
            <button className="btn btn-ghost-soft" onClick={resetFilters}>Réinitialiser filtres</button>
          )}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <SkeletonTable rows={8} cols={7} />
      ) : sortedRows.length === 0 ? (
        <div className="card">
          {hasFilters ? (
            <EmptyState
              title="Aucun résultat"
              message="Aucune question ne correspond à ces filtres."
              action={<button className="btn" onClick={resetFilters}>Réinitialiser les filtres</button>}
            />
          ) : (
            <EmptyState
              title="Importez vos premières questions"
              message="Aucune question pour l’instant. Créez-en une ou importez un lot CSV."
              action={(
                <div className="row" style={{ gap: 10 }}>
                  <button className="btn" onClick={() => setShowImport(true)}><Upload size={16} /> Import CSV</button>
                  <button className="btn btn-primary" onClick={startCreate}><Plus size={16} /> Nouvelle question</button>
                </div>
              )}
            />
          )}
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th className="q-th-sel">
                    <span className={`checkbox ${allSelected ? 'on' : ''}`} onClick={toggleAll}>{allSelected && <Check size={12} />}</span>
                  </th>
                  <th>{sortHead('Énoncé', 'text_fr')}</th>
                  <th>{sortHead('Thème', 'theme')}</th>
                  <th>{sortHead('Niveau', 'level')}</th>
                  <th>{sortHead('Statut', 'status')}</th>
                  <th>{sortHead('Taux réussite', 'success_rate')}</th>
                  <th>{sortHead('Créée le', 'created_at')}</th>
                  <th className="q-th-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((q) => {
                  const on = selected.has(q.id);
                  return (
                    <tr key={q.id} className="clickable" onClick={() => setDetail(q)}>
                      <td onClick={(e) => e.stopPropagation()}>
                        <span className={`checkbox ${on ? 'on' : ''}`} onClick={() => toggleOne(q.id)}>{on && <Check size={12} />}</span>
                      </td>
                      <td><span className="cell-strong q-statement">{q.text_fr}</span></td>
                      <td><ThemeBadge theme={q.theme} /></td>
                      <td><LevelBadge level={q.level} /></td>
                      <td><QuestionStatus status={q.status} /></td>
                      <td>{pct(q.success_rate)}</td>
                      <td className="muted">{dateFr(q.created_at)}</td>
                      <td className="q-td-actions" onClick={(e) => e.stopPropagation()}>
                        <div className="row nowrap" style={{ gap: 2 }}>
                          <button className="icon-action" title="Voir" onClick={() => setDetail(q)}><Eye size={17} /></button>
                          <button className="icon-action" title="Dupliquer" onClick={() => startDuplicate(q)}><Copy size={16} /></button>
                          {q.status === 'pending_review' && (
                            <button className="icon-action" title="Approuver" onClick={() => doTransition(q, 'approved')}><ThumbsUp size={16} /></button>
                          )}
                          {q.status === 'approved' && (
                            <button className="icon-action" title="Force sync" onClick={() => doForceSync(q)}><Zap size={16} /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {pageCount > 1 && (
            <div className="q-pager">
              <span className="page-info">{sortedRows.length} éléments · {PAGE_SIZE} par page</span>
              <div className="row" style={{ gap: 6 }}>
                <button className="icon-btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="Précédent"><ChevronLeft size={16} /></button>
                <span className="muted" style={{ fontSize: 13 }}>Page {page + 1} / {pageCount}</span>
                <button className="icon-btn" disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)} aria-label="Suivant"><ChevronRight size={16} /></button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Barre d'actions groupées (sticky bottom) */}
      {selected.size > 0 && (
        <div className="bulk-bar">
          <span>{selected.size} question(s) sélectionnée(s)</span>
          <div className="row wrap" style={{ gap: 8, marginLeft: 'auto' }}>
            <button className="btn btn-sm btn-success" onClick={() => bulkTransition('approved')}><ThumbsUp size={14} /> Approuver tout</button>
            <button className="btn btn-sm" onClick={() => bulkTransition('archived')}><Archive size={14} /> Archiver tout</button>
            <button className="btn btn-sm" onClick={exportCsv}><Download size={14} /> Export CSV</button>
            <button className="btn btn-sm btn-ghost" onClick={clearSel}>Désélectionner</button>
          </div>
        </div>
      )}

      {/* Modal de création par étapes */}
      <CreateModal open={creating} onClose={closeCreate} onCreate={createQuestion} submitting={submitting} prefill={prefill} />

      {/* Drawer vue question */}
      <Drawer open={Boolean(detail)} onClose={() => setDetail(null)} title="Détail de la question" width={480}>
        {detail && (
          <div className="stack" style={{ gap: 22 }}>
            <div className="row wrap" style={{ gap: 8 }}>
              <ThemeBadge theme={detail.theme} />
              <LevelBadge level={detail.level} />
              <QuestionStatus status={detail.status} />
            </div>

            <div>
              <div className="q-section-label">Énoncé</div>
              <div className="q-drawer-q">{detail.text_fr}</div>
            </div>

            <div>
              <div className="q-section-label">Réponses</div>
              {(detail.options || []).map((o, i) => {
                const ok = o.is_correct || i === detail.correct_index;
                return (
                  <div className={`opt-review ${ok ? 'correct' : ''}`} key={`${detail.id}-${i}`}>
                    <span className="q-opt-letter">{LETTERS[i]}</span>
                    <span className="q-opt-text">{o.text}</span>
                    {ok ? <Check size={16} className="q-opt-check" /> : <span className="q-opt-radio" />}
                  </div>
                );
              })}
            </div>

            {detail.explanation && (
              <div>
                <div className="q-section-label">Explication</div>
                <div className="explain">{detail.explanation}</div>
              </div>
            )}

            <div>
              <div className="q-section-label">Statistiques</div>
              <div className="kpi-strip">
                <div className="item"><span className="n">{detail.times_asked ?? '—'}</span><span className="l">Posée</span></div>
                <div className="item"><span className="n">{detail.times_correct ?? '—'}</span><span className="l">Réussie</span></div>
                <div className="item"><span className="n" style={{ color: 'var(--green700)' }}>{pct(detail.success_rate)}</span><span className="l">Taux</span></div>
              </div>
            </div>

            <div>
              <div className="q-section-label">Historique</div>
              <dl className="kv">
                <dt>Version</dt><dd>{detail.version ?? '—'}</dd>
                <dt>Créée le</dt><dd>{detail.created_at ? dateFr(detail.created_at) : '—'}</dd>
                <dt>Modifiée le</dt><dd>{detail.updated_at ? dateFr(detail.updated_at) : '—'}</dd>
                <dt>Approuvée le</dt><dd>{detail.approved_at ? dateFr(detail.approved_at) : '—'}</dd>
              </dl>
            </div>

            <div>
              <div className="q-section-label">Workflow</div>
              {renderWorkflow(detail)}
              <button className="btn btn-block" style={{ marginTop: 8 }} onClick={() => startDuplicate(detail)}>
                <Copy size={15} /> Dupliquer
              </button>
            </div>
          </div>
        )}
      </Drawer>

      <ImportModal open={showImport} onClose={() => setShowImport(false)} onDone={refetch} />
    </>
  );
}
