import { useState, useMemo, useRef, useEffect, useCallback, Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import {
  Plus, Upload, Search, Check, Eye, Send, ThumbsUp, ThumbsDown,
  Archive, RotateCcw, Zap, Download, ChevronUp, ChevronDown, ChevronsUpDown,
  ChevronLeft, ChevronRight, X, FileText, ListChecks, Tags, Copy, AlertCircle,
  AlertTriangle, CheckCircle2, XCircle, Pencil, BarChart3, History, Lock,
  LayoutGrid, Table2, Moon, Sun, Code2, Play, Rows3,
} from 'lucide-react';
import Papa from 'papaparse';
import questionsService from '../services/questions.service';
import { useApiData } from '../hooks/useApiData';
import { THEME_KEYS, LEVEL_KEYS } from '../constants/enums';
import { themeLabels, levelLabels, questionStatusColors } from '../constants/theme';
import { pct, dateFr } from '../utils/format';
import PageHeader from '../components/PageHeader';
import ThemeBadge from '../components/ThemeBadge';
import Gauge from '../components/Gauge';
import Modal from '../components/Modal';
import Drawer from '../components/Drawer';
import FilterSelect from '../components/FilterSelect';
import EmptyState from '../components/EmptyState';
import { SkeletonTable } from '../components/Skeleton';
import { notify } from '../components/Toast';
import './Questions.css';

const STATUSES = ['draft', 'pending_review', 'approved', 'rejected', 'archived'];
const PAGE_SIZE = 20;
const LETTERS = ['A', 'B', 'C', 'D'];
const THEME_EMOJI = { geographie: '🌍', culture: '📚', histoire: '🏛️', industrie: '🏭', sport: '🏃', science: '🔬' };
const LEVEL_EMOJI = { beginner: '🟢', intermediate: '🟡', expert: '🔴' };
const PERIODS = ['today', 'week', 'month'];

/** Vrai si la date ISO tombe dans la période (today|week|month). Date.now hors rendu. */
function inPeriod(iso, period) {
  if (!period || !iso) return true;
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return false;
  const now = Date.now();
  const day = 86400000;
  if (period === 'today') { const s = new Date(now); s.setHours(0, 0, 0, 0); return d >= s.getTime(); }
  if (period === 'week') return d >= now - 7 * day;
  if (period === 'month') return d >= now - 30 * day;
  return true;
}

// Pills d'accès rapide : { id, type: all|status|theme|level, value, icon }.
const QUICK_PILLS = [
  { id: 'all', type: 'all', icon: '🌟' },
  { id: 'approved', type: 'status', value: 'approved', icon: '✓' },
  { id: 'pending_review', type: 'status', value: 'pending_review', icon: '⏳' },
  { id: 'draft', type: 'status', value: 'draft', icon: '📝' },
  { id: 'rejected', type: 'status', value: 'rejected', icon: '⚠️' },
  { id: 'geographie', type: 'theme', value: 'geographie', icon: '🌍' },
  { id: 'culture', type: 'theme', value: 'culture', icon: '📚' },
  { id: 'histoire', type: 'theme', value: 'histoire', icon: '🏛️' },
  { id: 'industrie', type: 'theme', value: 'industrie', icon: '🏭' },
  { id: 'beginner', type: 'level', value: 'beginner', icon: '🟢' },
  { id: 'expert', type: 'level', value: 'expert', icon: '🔴' },
];
const STATEMENT_MAX = 70;

/* ---------- Helpers d'affichage (purs : aucun Date.now()/new Date() implicite) ---------- */
function truncate(s, max) {
  const t = String(s ?? '').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}


/* Badge d'état de traduction : FR+EN (vert) / FR (gris) / EN (ambre, cas limite). */
function BilingualBadge({ q }) {
  const { t } = useTranslation();
  const hasFr = Boolean(q.text_fr);
  const hasEn = Boolean(q.text_en);
  if (hasFr && hasEn) return <span className="q-lang-badge q-lang-badge--both" title={t('questions.bilingual.frEn')}>FR+EN</span>;
  if (hasFr) return <span className="q-lang-badge q-lang-badge--fr" title={t('questions.bilingual.frOnly')}>FR</span>;
  if (hasEn) return <span className="q-lang-badge q-lang-badge--en" title="EN">EN</span>;
  return null;
}

/* Pilule de niveau (Débutant vert clair / Intermédiaire or / Expert rouge doux). */
function LevelPill({ level }) {
  const { t } = useTranslation();
  return (
    <span className={`q-level-pill q-level-${level}`}>{t(`questions.levels.${level}`, levelLabels[level] || level)}</span>
  );
}
/* Alias conservé pour la plomberie de l'aperçu mobile de CreateModal. */
const LevelBadge = ({ level }) => {
  const { t } = useTranslation();
  return (
    <span className="badge badge-level">{t(`questions.levels.${level}`, levelLabels[level] || level)}</span>
  );
};

/* Statut : point coloré + libellé (sens doublé couleur + texte). */
// Date localisée selon la langue active. `withTime` ajoute l'heure (drawer).
// Renvoie « — » si la date est absente/invalide (jamais de crash).
function formatDate(date, lang, withTime = false) {
  if (!date) return '—';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  const opts = withTime ? { dateStyle: 'long', timeStyle: 'short' } : { dateStyle: 'long' };
  return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-US', opts).format(d);
}

// Badge de statut : pastille colorée (bg + fg du token). Statut inconnu/absent →
// libellé « Inconnu » gris (BUG : t('questions.statuses.undefined') auparavant).
function StatusDot({ status }) {
  const { t } = useTranslation();
  const known = Boolean(questionStatusColors[status]);
  const cfg = questionStatusColors[status] || { bg: '#f3f4f6', fg: '#6b7280' };
  return (
    <span className="q-status-badge" style={{ background: cfg.bg, color: cfg.fg }}>
      <span className="q-status-pip" style={{ background: cfg.fg }} />
      {known ? t(`questions.statuses.${status}`, status) : t('questions.statuses.unknown')}
    </span>
  );
}

/* Mini-barre de taux de réussite (rouge <40 % / or 40–70 % / vert >70 %). */
function SuccessBar({ rate }) {
  if (rate == null) return <span className="q-rate-empty">—</span>;
  const v = Math.max(0, Math.min(1, rate));
  const tone = v < 0.40 ? 'low' : v <= 0.70 ? 'mid' : 'high';
  return (
    <span className="q-rate">
      <span className="q-rate-track">
        <span className={`q-rate-fill ${tone}`} style={{ width: `${Math.round(v * 100)}%` }} />
      </span>
      <span className="q-rate-val">{pct(rate, 0)}</span>
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

/* Échappe un champ pour le CSV de rapport (virgules / guillemets / retours). */
function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/* Construit un CSV du rapport d'import (rejets + avertissements). */
function buildReportCsv(report) {
  const head = 'categorie,ligne,probleme,similarite,question_importee,question_existante';
  const lines = [
    ...(report.errors || []).map((e) =>
      ['rejet', e.row, e.issue, e.similarity ?? '', e.imported_text ?? '', e.existing_text ?? ''].map(csvCell).join(',')),
    ...(report.warnings_list || []).map((w) =>
      ['avertissement', w.row, w.issue, w.similarity ?? '', w.imported_text ?? '', w.existing_text ?? ''].map(csvCell).join(',')),
  ];
  return [head, ...lines].join('\n');
}

/* Carte de comparaison côte à côte : question importée vs question existante. */
function CompareRow({ item, tone }) {
  const { t } = useTranslation();
  return (
    <div className={`import-compare import-compare-${tone}`}>
      <div className="import-compare-head">
        <span className="import-compare-line">{t('questions.misc.lineN', { n: item.row })}</span>
        <span className="import-compare-issue">{item.issue}</span>
        {item.similarity != null && (
          <span className="import-compare-sim">{Math.round(item.similarity * 100)} %</span>
        )}
      </div>
      <div className="import-compare-grid">
        <div className="import-compare-col">
          <span className="import-compare-label">{t('questions.import.importedCol')}</span>
          <p className="import-compare-text">{item.imported_text || '—'}</p>
        </div>
        <div className="import-compare-col import-compare-col-existing">
          <span className="import-compare-label">{t('questions.import.existingCol')}</span>
          <p className="import-compare-text">{item.existing_text || '—'}</p>
        </div>
      </div>
    </div>
  );
}

function ImportModal({ open, onClose, onDone }) {
  const { t } = useTranslation();
  const [drag, setDrag] = useState(false);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('rejected');
  const lastFileRef = useRef(null);
  const inputRef = useRef();

  const runImport = async (file, { force = false } = {}) => {
    if (!file) return;
    lastFileRef.current = file;
    setBusy(true);
    try {
      const res = await questionsService.importCsv(file, { force });
      setReport(res);
      // Onglet ouvert par défaut sur la catégorie la plus « actionnable ».
      setTab(res.warnings > 0 ? 'warnings' : res.rejected > 0 ? 'rejected' : 'accepted');
      notify.success(
        `${t('toast.importSuccess')} : ${res.accepted} ${t('questions.import.accepted').toLowerCase()}, ${res.warnings || 0} ${t('questions.import.warnings').toLowerCase()}, ${res.rejected} ${t('questions.import.errors').toLowerCase()}`,
      );
      onDone?.();
    } catch { notify.error(t('questions.notify.importFailed')); } finally { setBusy(false); }
  };

  const forceWarnings = () => runImport(lastFileRef.current, { force: true });

  const downloadReport = () => {
    downloadCsv(buildReportCsv(report), 'rapport-import-creveton.csv');
  };

  const reset = () => { setReport(null); lastFileRef.current = null; };

  const errors = report?.errors || [];
  const warnings = report?.warnings_list || [];

  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose(); }}
      title={t('questions.import.title')}
      footer={(
        <>
          <button className="btn" onClick={() => downloadCsv(CSV_TEMPLATE, 'modele-questions-creveton.csv')}>
            <Download size={15} /> {t('questions.import.downloadTemplate')}
          </button>
          {report && (errors.length > 0 || warnings.length > 0) && (
            <button className="btn" onClick={downloadReport}>
              <Download size={15} /> {t('questions.import.downloadReport')}
            </button>
          )}
          <button className="btn" onClick={() => { reset(); onClose(); }}>{t('common.close')}</button>
        </>
      )}
    >
      {!report && (
        <div
          className={`dropzone ${drag ? 'drag' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); runImport(e.dataTransfer.files[0]); }}
          onClick={() => inputRef.current?.click()}
        >
          <Upload size={26} style={{ marginBottom: 8 }} />
          <div><strong>{t('questions.import.dropzoneStrong')}</strong> {t('questions.import.dropzoneRest')}</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>{t('questions.import.columnsHint')}</div>
          <input ref={inputRef} type="file" accept=".csv" hidden onChange={(e) => runImport(e.target.files[0])} />
        </div>
      )}
      {busy && <p className="muted" style={{ textAlign: 'center', marginTop: 14 }}>{t('questions.import.analyzing')}</p>}

      {report && !busy && (
        <>
          <div className="import-report">
            <div className="import-stat"><div className="n">{report.total_rows}</div><div className="muted">{t('questions.import.rows')}</div></div>
            <div className="import-stat" style={{ background: '#f3fbf5' }}><div className="n" style={{ color: '#15803d' }}>{report.accepted}</div><div className="muted">{t('questions.import.accepted')}</div></div>
            <div className="import-stat" style={{ background: '#fffbeb' }}><div className="n" style={{ color: '#b45309' }}>{report.warnings || 0}</div><div className="muted">{t('questions.import.warningsShort')}</div></div>
            <div className="import-stat" style={{ background: '#fef2f2' }}><div className="n" style={{ color: '#dc2626' }}>{report.rejected}</div><div className="muted">{t('questions.import.errors')}</div></div>
          </div>

          <div className="import-tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'accepted'} className={`import-tab ${tab === 'accepted' ? 'active' : ''}`} onClick={() => setTab('accepted')}>
              <CheckCircle2 size={15} /> {t('questions.import.accepted')} ({report.accepted})
            </button>
            <button role="tab" aria-selected={tab === 'warnings'} className={`import-tab ${tab === 'warnings' ? 'active' : ''}`} onClick={() => setTab('warnings')}>
              <AlertTriangle size={15} /> {t('questions.import.warnings')} ({warnings.length})
            </button>
            <button role="tab" aria-selected={tab === 'rejected'} className={`import-tab ${tab === 'rejected' ? 'active' : ''}`} onClick={() => setTab('rejected')}>
              <XCircle size={15} /> {t('questions.import.errors')} ({errors.length})
            </button>
          </div>

          {tab === 'accepted' && (
            report.accepted > 0
              ? <p className="muted import-tabnote"><Check size={15} /> {t('questions.import.acceptedNote', { n: report.accepted })}</p>
              : <EmptyState title={t('questions.emptyState.acceptedTitle')} subtitle={t('questions.emptyState.acceptedSub')} />
          )}

          {tab === 'warnings' && (
            warnings.length > 0 ? (
              <>
                <p className="muted import-tabnote">
                  <AlertTriangle size={15} /> {t('questions.import.warningsNote')}
                </p>
                {warnings.map((w) => <CompareRow key={`w-${w.row}`} item={w} tone="warn" />)}
                <button className="btn btn-gold btn-block" style={{ marginTop: 14 }} onClick={forceWarnings}>
                  <Zap size={15} /> {t('questions.import.forceImport')}
                </button>
              </>
            ) : <EmptyState title={t('questions.emptyState.warningsTitle')} subtitle={t('questions.emptyState.warningsSub')} />
          )}

          {tab === 'rejected' && (
            errors.length > 0 ? (
              <div className="import-rejects">
                {errors.map((e) => (
                  e.imported_text || e.existing_text
                    ? <CompareRow key={`e-${e.row}`} item={e} tone="reject" />
                    : <div className="err" key={`e-${e.row}`}>{t('questions.misc.lineN', { n: e.row })} — {e.issue}</div>
                ))}
              </div>
            ) : <EmptyState title={t('questions.emptyState.rejectedTitle')} subtitle={t('questions.emptyState.rejectedSub')} />
          )}

          <button className="btn btn-block" style={{ marginTop: 14 }} onClick={reset}>
            <RotateCcw size={15} /> {t('questions.import.importAnother')}
          </button>
        </>
      )}
    </Modal>
  );
}

/* ---------- Correcteur linguistique IA (proxy backend) ---------- */
// AI corrector calls backend proxy — no Anthropic key needed in frontend.
/**
 * Hook correcteur IA pour un champ texte. Renvoie { button, panel } à insérer
 * (bouton au-dessus du textarea, panneau de suggestion en dessous). L'appel passe
 * par le proxy backend `/admin/questions/improve-text` (la clé Anthropic reste
 * côté serveur). `kind` = 'statement' | 'explanation'.
 */
function useCorrector(text, kind, onAccept, lang = 'fr') {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [err, setErr] = useState(null);

  const run = async () => {
    if (!text.trim()) return;
    setErr(null); setSuggestion(null); setLoading(true);
    try {
      // Le correcteur passe par le proxy backend → aucune clé Anthropic dans le frontend.
      const res = await questionsService.improveText({ text, lang, type: kind });
      setSuggestion((res?.suggestion || '').trim());
    } catch (e) {
      // Pas de réponse serveur (réseau coupé) → message « réseau » ; sinon erreur API.
      setErr(e?.response ? 'api' : 'network');
    } finally {
      setLoading(false);
    }
  };

  const noChange = suggestion != null && suggestion.trim() === text.trim();
  const button = (
    <button type="button" className="q-ai-btn" disabled={loading || !text.trim()} onClick={run}>
      {loading
        ? <><span className="q-ai-spin" /> {t('questions.corrector.loading')}</>
        : <>✨ {t('questions.corrector.button')}</>}
    </button>
  );
  const panel = (err || suggestion != null) ? (
    <div className="q-ai-panel">
      {err ? (
        <div className="q-ai-error">{t(err === 'network' ? 'questions.corrector.errorNetwork' : 'questions.corrector.error')}</div>
      ) : noChange ? (
        <div className="q-ai-nochange">✓ {t('questions.corrector.noChange')}</div>
      ) : (
        <>
          <div className="q-ai-panel-label">{t('questions.corrector.suggestion')}</div>
          <div className="q-ai-suggestion">{suggestion}</div>
          <div className="q-ai-actions">
            <button type="button" className="btn btn-success btn-sm" onClick={() => { onAccept(suggestion); setSuggestion(null); }}>
              {t('questions.corrector.accept')}
            </button>
            <button type="button" className="btn btn-ghost-soft btn-sm" onClick={() => setSuggestion(null)}>
              {t('questions.corrector.ignore')}
            </button>
          </div>
        </>
      )}
    </div>
  ) : null;
  return { button, panel };
}

/* ---------- Modal de création par étapes + preview live ---------- */
const STEP_META = [
  { icon: FileText, key: 'step1' },
  { icon: ListChecks, key: 'step2' },
  { icon: Tags, key: 'step3' },
];

const MAX_TEXT = 300;
const EMPTY_DRAFT = {
  textFr: '', textEn: '', opts: ['', '', '', ''], optsEn: ['', '', '', ''], correct: 0,
  explanation: '', explanationEn: '', theme: 'culture', level: 'beginner', tags: [],
};

/* Convertit une question existante en brouillon pré-rempli (« Dupliquer »). */
function draftFromQuestion(q) {
  if (!q) return EMPTY_DRAFT;
  const base = (q.options || []).map((o) => o.text || '');
  const baseEn = (q.options || []).map((o) => o.text_en || '');
  const opts = [...base, '', '', '', ''].slice(0, 4);
  const optsEn = [...baseEn, '', '', '', ''].slice(0, 4);
  let correct = q.correct_index;
  if (correct == null) correct = (q.options || []).findIndex((o) => o.is_correct);
  if (correct == null || correct < 0) correct = 0;
  return {
    textFr: `${q.text_fr || ''} (Copie)`,
    textEn: q.text_en || '',
    opts,
    optsEn,
    correct,
    explanation: q.explanation || '',
    explanationEn: q.explanation_en || '',
    theme: q.theme || 'culture',
    level: q.level || 'beginner',
    tags: Array.isArray(q.tags) ? [...q.tags] : [],
  };
}

function CreateModal({ open, onClose, onCreate, submitting, prefill }) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [textFr, setTextFr] = useState('');
  const [textEn, setTextEn] = useState('');
  const [opts, setOpts] = useState(['', '', '', '']);
  const [optsEn, setOptsEn] = useState(['', '', '', '']);
  const [correct, setCorrect] = useState(0);
  const [explanation, setExplanation] = useState('');
  const [explanationEn, setExplanationEn] = useState('');
  // Traduction IA : indicateur d'occupation ('stmt' | 'expl' | 'all' | `opt-${i}`).
  const [translating, setTranslating] = useState(null);
  const [theme, setTheme] = useState('culture');
  const [level, setLevel] = useState('beginner');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState([]);
  // Image optionnelle : fichier gardé en local, uploadé APRÈS la création (la
  // route image exige un id de question). `imagePreview` = objectURL pour l'aperçu.
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  // Recadrage de l'image (object-position via glisser) — {x,y} en %, aperçu only.
  const [offset, setOffset] = useState({ x: 50, y: 50 });
  const taRef = useRef(null);

  const clearImage = () => {
    setImagePreview((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    setImageFile(null);
    setOffset({ x: 50, y: 50 });
  };
  const pickImage = (file) => {
    setImagePreview((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(file); });
    setImageFile(file);
    setOffset({ x: 50, y: 50 }); // nouvelle image → recadrage centré par défaut
  };

  // Correcteurs IA — bouton ✨ + panneau de suggestion. FR (énoncé/explication)
  // + EN (énoncé) avec la langue cible adaptée.
  const stmtAi = useCorrector(textFr, 'statement', setTextFr);
  const explAi = useCorrector(explanation, 'explanation', setExplanation);
  const stmtEnAi = useCorrector(textEn, 'statement', setTextEn, 'en');
  const explEnAi = useCorrector(explanationEn, 'explanation', setExplanationEn, 'en');

  // Traduction IA FR→EN (action='translate'). En création la question n'a pas
  // encore d'id → on passe par le correcteur (improve-text action=translate),
  // pas l'endpoint /:id/translate (réservé aux questions existantes, cf. drawer).
  const translateText = async (frText, type) => {
    const res = await questionsService.improveText({ text: frText, lang: 'en', type, action: 'translate' });
    return (res?.suggestion || '').trim();
  };
  const onTranslateStatement = async () => {
    const src = textFr.trim();
    if (src.length < 10) return;
    setTranslating('stmt');
    try { setTextEn(await translateText(src, 'statement')); }
    catch { notify.error(t('questions.bilingual.translateFailed')); }
    finally { setTranslating(null); }
  };
  const onTranslateExplanation = async () => {
    const src = explanation.trim();
    if (!src) return;
    setTranslating('expl');
    try { setExplanationEn(await translateText(src, 'explanation')); }
    catch { notify.error(t('questions.bilingual.translateFailed')); }
    finally { setTranslating(null); }
  };
  const onTranslateOption = async (i) => {
    const src = (opts[i] || '').trim();
    if (!src) return;
    setTranslating(`opt-${i}`);
    try {
      const en = await translateText(src, 'statement');
      setOptsEn((arr) => arr.map((x, idx) => (idx === i ? en : x)));
    } catch { notify.error(t('questions.bilingual.translateFailed')); }
    finally { setTranslating(null); }
  };
  const onTranslateAllOptions = async () => {
    setTranslating('all');
    try {
      const next = [...optsEn];
      for (let i = 0; i < opts.length; i += 1) {
        const src = (opts[i] || '').trim();
        if (src) next[i] = await translateText(src, 'statement');
      }
      setOptsEn(next);
    } catch { notify.error(t('questions.bilingual.translateFailed')); }
    finally { setTranslating(null); }
  };

  const reset = () => {
    setStep(0); setTextFr(''); setTextEn(''); setOpts(['', '', '', '']); setOptsEn(['', '', '', '']); setCorrect(0);
    setExplanation(''); setExplanationEn(''); setTheme('culture'); setLevel('beginner'); setTagInput(''); setTags([]);
    clearImage();
  };

  // Hydrate le formulaire à l'ouverture (vierge, ou pré-rempli pour « Dupliquer »).
  useEffect(() => {
    if (!open) return;
    const dft = draftFromQuestion(prefill);
    setStep(0); setTextFr(dft.textFr); setTextEn(dft.textEn); setOpts(dft.opts); setOptsEn(dft.optsEn); setCorrect(dft.correct);
    setExplanation(dft.explanation); setExplanationEn(dft.explanationEn); setTheme(dft.theme); setLevel(dft.level); setTagInput(''); setTags(dft.tags);
    clearImage();
  }, [open, prefill]);

  // Auto-resize du textarea énoncé.
  const autoGrow = (el) => { if (!el) return; el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 320)}px`; };
  useEffect(() => { if (step === 0) autoGrow(taRef.current); }, [textFr, step, open]);

  const close = () => { reset(); onClose(); };
  const setOpt = (i, v) => setOpts((o) => o.map((x, idx) => (idx === i ? v : x)));
  const setOptEn = (i, v) => setOptsEn((o) => o.map((x, idx) => (idx === i ? v : x)));
  const addTag = () => { const tg = tagInput.trim(); if (tg && !tags.includes(tg)) setTags((p) => [...p, tg]); setTagInput(''); };

  // --- Validation temps réel ---
  const trimmed = textFr.trim();
  const textOk = trimmed.length >= 10;
  const textOver = textFr.length > MAX_TEXT;
  const optsOk = Boolean(opts[0].trim() && opts[1].trim());
  const correctOk = Boolean(opts[correct]?.trim());
  const canCreate = textOk && !textOver && optsOk && correctOk;
  const nextDisabled = (step === 0 && !(textOk && !textOver)) || (step === 1 && !(optsOk && correctOk));

  const STEP_LABELS = [t('questions.modal.step1'), t('questions.modal.step2'), t('questions.modal.step3')];
  const THEME_EMOJI = { geographie: '🌍', culture: '📚', histoire: '🏛️', industrie: '🏭', sport: '⚽', science: '🔬' };

  const submit = () => {
    if (!canCreate) return;
    onCreate({
      text_fr: trimmed,
      text_en: textEn.trim() || null,
      type: 'mcq',
      options: opts.map((text, i) => ({ text, text_en: (optsEn[i] || '').trim() || null, is_correct: i === correct })),
      explanation: explanation || null,
      explanation_en: explanationEn.trim() || null,
      theme,
      level,
      tags,
    }, reset, imageFile);
  };

  const footer = (
    <>
      <button className="btn btn-ghost-soft" onClick={close}>{t('questions.modal.cancel')}</button>
      <div style={{ flex: 1 }} />
      {step > 0 && <button className="btn" onClick={() => setStep((s) => Math.max(0, s - 1))}><ChevronLeft size={15} /> {t('questions.modal.previous')}</button>}
      {step < 2 && (
        <button className="btn btn-primary" onClick={() => setStep((s) => Math.min(2, s + 1))} disabled={nextDisabled}>
          {t('questions.modal.next')} <ChevronRight size={15} />
        </button>
      )}
      {step === 2 && (
        <button className="btn btn-success" onClick={submit} disabled={!canCreate || submitting}>
          <Plus size={15} /> {t('questions.modal.save')}
        </button>
      )}
    </>
  );

  return (
    <Modal open={open} onClose={close} title={prefill ? t('questions.modal.edit') : t('questions.modal.create')} footer={footer} width={860}>
      <div className="steps">
        {STEP_META.map((s, i) => (
          <div key={s.key} style={{ display: 'contents' }}>
            <span className={`step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}>
              <span className="num">{i < step ? <Check size={13} /> : i + 1}</span>
              {STEP_LABELS[i]}
            </span>
            {i < STEP_META.length - 1 && <span className="step-sep" />}
          </div>
        ))}
      </div>

      <div className="q-create-grid">
        <div className="q-create-form">
          {step === 0 && (
            <>
              <div className="field">
                <div className="q-field-head">
                  <label>{t('questions.bilingual.statementFr')}</label>
                  {stmtAi.button}
                </div>
                <textarea
                  ref={taRef}
                  className="textarea q-grow"
                  rows={4}
                  spellCheck="true"
                  lang="fr"
                  placeholder={t('questions.placeholder.statement')}
                  value={textFr}
                  onChange={(e) => { setTextFr(e.target.value); autoGrow(e.target); }}
                />
                {stmtAi.panel}
                <div className={`char-count ${textOver ? 'over' : textFr.length > 270 ? 'warn' : ''}`}>{textFr.length} / {MAX_TEXT}</div>
                <div className={`valid-hint ${textOk && !textOver ? 'ok' : 'ko'}`} style={{ marginTop: 4 }}>
                  {textOk && !textOver
                    ? <><Check size={13} /> {t('questions.validation.statementOk')}</>
                    : <><AlertCircle size={13} /> {textOver ? t('questions.validation.statementTooLong', { max: MAX_TEXT }) : t('questions.validation.statementTooShort')}</>}
                </div>
              </div>

              {/* Énoncé EN (optionnel) — traduction auto FR→EN + correcteur EN. */}
              <div className="field">
                <div className="q-field-head">
                  <label>{t('questions.bilingual.statementEn')} <span className="q-opt-label">{t('questions.modal.explanationOptional')}</span></label>
                  <div className="row nowrap" style={{ gap: 6 }}>
                    <button
                      type="button"
                      className="q-translate-btn"
                      disabled={textFr.trim().length < 10 || translating === 'stmt'}
                      onClick={onTranslateStatement}
                    >
                      {translating === 'stmt'
                        ? <><span className="q-ai-spin" /> {t('questions.bilingual.translating')}</>
                        : <>🌐 {t('questions.bilingual.translateToEn')}</>}
                    </button>
                    {stmtEnAi.button}
                  </div>
                </div>
                <textarea
                  className="textarea"
                  rows={3}
                  spellCheck="true"
                  lang="en"
                  placeholder={t('questions.placeholder.statementEn')}
                  value={textEn}
                  onChange={(e) => setTextEn(e.target.value)}
                />
                {stmtEnAi.panel}
                <div className={`char-count ${textEn.length > MAX_TEXT ? 'over' : textEn.length > 270 ? 'warn' : ''}`}>{textEn.length} / {MAX_TEXT}</div>
              </div>

              <div className="field">
                <div className="q-field-head">
                  <label>{t('questions.modal.explanation')} <span className="q-opt-label">{t('questions.modal.explanationOptional')}</span></label>
                  {explAi.button}
                </div>
                <textarea
                  className="textarea"
                  rows={3}
                  spellCheck="true"
                  lang="fr"
                  placeholder={t('questions.placeholder.explanationCreate')}
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                />
                {explAi.panel}
              </div>

              {/* Explication EN (optionnelle) — traduction auto FR→EN + correcteur EN. */}
              <div className="field">
                <div className="q-field-head">
                  <label>{t('questions.bilingual.explanationEn')} <span className="q-opt-label">{t('questions.modal.explanationOptional')}</span></label>
                  <div className="row nowrap" style={{ gap: 6 }}>
                    <button
                      type="button"
                      className="q-translate-btn"
                      disabled={!explanation.trim() || translating === 'expl'}
                      onClick={onTranslateExplanation}
                    >
                      {translating === 'expl'
                        ? <><span className="q-ai-spin" /> {t('questions.bilingual.translating')}</>
                        : <>🌐 {t('questions.bilingual.translateToEn')}</>}
                    </button>
                    {explEnAi.button}
                  </div>
                </div>
                <textarea
                  className="textarea"
                  rows={3}
                  spellCheck="true"
                  lang="en"
                  placeholder={t('questions.placeholder.explanationEn')}
                  value={explanationEn}
                  onChange={(e) => setExplanationEn(e.target.value)}
                />
                {explEnAi.panel}
                <div className={`char-count ${explanationEn.length > 500 ? 'over' : explanationEn.length > 470 ? 'warn' : ''}`}>{explanationEn.length} / 500</div>
              </div>
              {/* Image = contenu (déplacée depuis Métadonnées) : énoncé + image ensemble. */}
              <div className="field" style={{ marginBottom: 0 }}>
                <label>🖼 {t('questions.image.label')}</label>
                <ImageDropzone
                  previewUrl={imagePreview}
                  onSelect={pickImage}
                  onClear={clearImage}
                  height={150}
                  compact
                  offset={offset}
                  onOffsetChange={setOffset}
                />
              </div>
            </>
          )}

          {step === 1 && (
            <div className="field" style={{ marginBottom: 0 }}>
              <div className="q-field-head">
                <label>{t('questions.modal.optionsChoose')}</label>
                <button
                  type="button"
                  className="q-translate-btn"
                  disabled={!opts.some((o) => o.trim()) || translating === 'all'}
                  onClick={onTranslateAllOptions}
                >
                  {translating === 'all'
                    ? <><span className="q-ai-spin" /> {t('questions.bilingual.translating')}</>
                    : <>🌐 {t('questions.bilingual.translateAll')}</>}
                </button>
              </div>
              {opts.map((v, i) => (
                <div className={`q-opt-row q-opt-row--bi ${correct === i ? 'is-correct' : ''}`} key={LETTERS[i]}>
                  <span className="q-opt-letter">{LETTERS[i]}</span>
                  <div className="q-opt-bi">
                    <input className="input" placeholder={t('questions.placeholder.option', { letter: LETTERS[i] })} value={v} onChange={(e) => setOpt(i, e.target.value)} />
                    <button
                      type="button"
                      className="q-translate-mini"
                      title={t('questions.bilingual.translateToEn')}
                      disabled={!v.trim() || translating === `opt-${i}`}
                      onClick={() => onTranslateOption(i)}
                    >
                      {translating === `opt-${i}` ? <span className="q-ai-spin" /> : '🌐'}
                    </button>
                    <input className="input" lang="en" placeholder={t('questions.placeholder.optionEn', { letter: LETTERS[i] })} value={optsEn[i]} onChange={(e) => setOptEn(i, e.target.value)} />
                  </div>
                  <label className="q-opt-radio" title={t('questions.modal.markCorrect')}>
                    <input type="radio" name="q-correct-option" checked={correct === i} onChange={() => setCorrect(i)} />
                    <span>{t('questions.modal.goodAnswer')}</span>
                  </label>
                </div>
              ))}
              <div className={`valid-hint ${optsOk && correctOk ? 'ok' : 'ko'}`}>
                {optsOk && correctOk
                  ? <><Check size={13} /> {t('questions.validation.optionsOk')}</>
                  : <><AlertCircle size={13} /> {!optsOk ? t('questions.validation.optionsMin') : t('questions.validation.correctHasText')}</>}
              </div>
            </div>
          )}

          {step === 2 && (
            <>
              <div className="field">
                <label>{t('questions.modal.theme')}</label>
                <select className="select" value={theme} onChange={(e) => setTheme(e.target.value)}>
                  {THEME_KEYS.map((k) => <option key={k} value={k}>{`${THEME_EMOJI[k] || ''} ${t(`questions.themes.${k}`, themeLabels[k])}`}</option>)}
                </select>
              </div>
              <div className="field">
                <label>{t('questions.modal.level')}</label>
                <div className="q-level-pills">
                  {LEVEL_KEYS.map((k) => (
                    <button type="button" key={k} className={`q-level-choice ${level === k ? 'is-active' : ''}`} onClick={() => setLevel(k)}>{t(`questions.levels.${k}`, levelLabels[k])}</button>
                  ))}
                </div>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>{t('questions.modal.tags')} <span className="q-opt-label">{t('questions.modal.tagsHint')}</span></label>
                <input
                  className="input"
                  placeholder={t('questions.placeholder.tagExample')}
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                  onBlur={addTag}
                />
                {tags.length > 0 && (
                  <div className="q-tags">
                    {tags.map((tag) => (
                      <span className="q-tag" key={tag}>
                        {tag}
                        <button type="button" onClick={() => setTags((p) => p.filter((x) => x !== tag))} aria-label={t('questions.a11y.removeTag', { tag })}><X size={12} /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {canCreate ? (
                <div className="q-ready-pill"><Check size={14} /> {t('questions.validation.readyToSave')}</div>
              ) : (
                <div className="valid-hint ko"><AlertCircle size={13} /> {t('questions.validation.completeToSaveShort')}</div>
              )}
            </>
          )}
        </div>

        {/* Aperçu mobile — NON interactif (pointer-events: none en CSS) */}
        <aside className="q-preview" aria-hidden="true">
          <div className="q-preview-cap">{t('questions.misc.mobilePreview')}</div>
          <div className="mobile-preview">
            <div className="row wrap" style={{ gap: 6 }}>
              <ThemeBadge theme={theme} />
              <LevelBadge level={level} />
            </div>
            <div className="mp-timer"><span style={{ width: '60%' }} /></div>
            {imagePreview && <img src={imagePreview} alt="" className="mp-img" style={{ objectPosition: `${offset.x}% ${offset.y}%` }} />}
            <div className="mp-q">{trimmed || t('questions.placeholder.statementPreview')}</div>
            {opts.map((o, i) => (
              <div className={`mp-opt ${i === correct && o.trim() ? 'correct' : ''}`} key={LETTERS[i]}>
                <span className="mp-letter">{LETTERS[i]}</span>
                <span className="q-opt-text">{o.trim() || t('questions.placeholder.option', { letter: LETTERS[i] })}</span>
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

/* ---------- Modal de rejet (motif obligatoire) ---------- */
function RejectModal({ open, onClose, onConfirm, busy }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  useEffect(() => { if (open) setReason(''); }, [open]);
  const ok = reason.trim().length >= 3;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('questions.confirm.rejectTitle')}
      footer={(
        <>
          <button className="btn btn-ghost-soft" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn btn-danger" disabled={!ok || busy} onClick={() => onConfirm(reason.trim())}>
            <ThumbsDown size={15} /> {t('questions.confirm.rejectConfirm')}
          </button>
        </>
      )}
    >
      <div className="field" style={{ marginBottom: 0 }}>
        <label>{t('questions.misc.rejectReasonLabel')}</label>
        <textarea
          className="textarea"
          placeholder={t('questions.placeholder.rejectReason')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          autoFocus
        />
        <div className={`valid-hint ${ok ? 'ok' : 'ko'}`} style={{ marginTop: 4 }}>
          {ok ? <><Check size={13} /> {t('questions.validation.reasonOk')}</> : <><AlertCircle size={13} /> {t('questions.validation.reasonMin')}</>}
        </div>
      </div>
    </Modal>
  );
}

/* ---------- Modal de confirmation destructrice ---------- */
function ConfirmModal({ open, title, message, confirmLabel, onConfirm, onClose, busy }) {
  const { t } = useTranslation();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={(
        <>
          <button className="btn btn-ghost-soft" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn btn-danger" disabled={busy} onClick={onConfirm}>
            <Archive size={15} /> {confirmLabel}
          </button>
        </>
      )}
    >
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>{message}</p>
    </Modal>
  );
}

/* ---------- Aperçu mobile (drawer) — option lue, bonne réponse mise en valeur ---------- */
function PreviewOption({ letter, text, correct }) {
  const { t } = useTranslation();
  return (
    <div className={`q-mp-opt ${correct ? 'correct' : ''}`}>
      <span className="q-mp-letter">{letter}</span>
      <span className="q-mp-opt-text">{text || t('questions.placeholder.option', { letter })}</span>
      {correct && <Check size={15} className="q-mp-check" />}
    </div>
  );
}

/* Libellés des évènements d'audit (onglet Historique). */
const EVENT_META = {
  created: { labelKey: 'created', dot: '' },
  updated: { labelKey: 'updated', dot: 'q-tl-dot-gold' },
  submitted: { labelKey: 'submitted', dot: '' },
  resubmitted: { labelKey: 'resubmitted', dot: '' },
  approved: { labelKey: 'approved', dot: 'q-tl-dot-green' },
  rejected: { labelKey: 'rejected', dot: 'q-tl-dot-red' },
  archived: { labelKey: 'archived', dot: '' },
  force_sync: { labelKey: 'forceSync', dot: 'q-tl-dot-blue' },
};
const FIELD_LABELS = {
  text_fr: 'textFr', text_en: 'textEn', theme: 'theme', level: 'level',
  explanation: 'explanation', media_url: 'mediaUrl', options: 'options',
};
/* Transitions autorisées (miroir du workflow backend) pour le drag&drop Kanban. */
const STATUS_TRANSITIONS = {
  draft: ['pending_review'],
  pending_review: ['approved', 'rejected'],
  approved: ['archived'],
  rejected: ['pending_review'],
  archived: [],
};

/* ---------- Panneau « Stats globales » (slide-down) ---------- */
function GlobalStatsPanel({ open }) {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setLoading(true);
    questionsService.globalStats()
      .then((r) => { if (alive) setData(r); })
      .catch(() => { if (alive) notify.error(t('questions.notify.globalStatsUnavailable')); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, t]);
  if (!open) return null;
  const byTheme = data?.by_theme || [];
  return (
    <div className="q-stats-panel">
      {loading && !data ? (
        <p className="muted" style={{ margin: 0 }}>{t('questions.misc.loadingStats')}</p>
      ) : (
        <>
          <div className="q-stats-gauges">
            {byTheme.map((th) => (
              <div className="q-stats-gauge" key={th.theme}>
                <Gauge value={th.avg_rate != null ? Math.round(th.avg_rate * 100) : 0} size={120} label={themeLabels[th.theme] || th.theme} />
                <span className="q-stats-gauge-sub">{th.approved} {th.approved > 1 ? t('questions.misc.approvedPlural') : t('questions.misc.approvedSingular')}{th.avg_rate == null ? ` · ${t('questions.misc.neverAsked')}` : ''}</span>
              </div>
            ))}
            {byTheme.length === 0 && <span className="muted">{t('questions.emptyState.noApproved')}</span>}
          </div>
          <div className="q-stats-extremes">
            <div className="q-stats-ex">
              <div className="q-stats-ex-title"><ThumbsDown size={14} /> {t('questions.misc.mostFailed')}</div>
              {(data?.hardest || []).length === 0 && <p className="muted q-stats-ex-empty">{t('questions.misc.noDataYet')}</p>}
              {(data?.hardest || []).map((q) => (
                <div className="q-stats-ex-row" key={q.id}>
                  <span className="q-stats-ex-text">{truncate(q.text_fr, 54)}</span>
                  <span className="q-stats-ex-rate low">{pct(q.success_rate, 0)}</span>
                </div>
              ))}
            </div>
            <div className="q-stats-ex">
              <div className="q-stats-ex-title"><ThumbsUp size={14} /> {t('questions.misc.mostSucceeded')}</div>
              {(data?.easiest || []).length === 0 && <p className="muted q-stats-ex-empty">{t('questions.misc.noDataYet')}</p>}
              {(data?.easiest || []).map((q) => (
                <div className="q-stats-ex-row" key={q.id}>
                  <span className="q-stats-ex-text">{truncate(q.text_fr, 54)}</span>
                  <span className="q-stats-ex-rate high">{pct(q.success_rate, 0)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- Onglet Statistiques du drawer (distracteurs réels) ---------- */
function StatsPane({ question }) {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    questionsService.questionStats(question.id)
      .then((r) => { if (alive) setData(r); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [question.id]);

  if (loading) return <p className="muted" style={{ padding: '20px 0' }}>{t('questions.misc.loadingStats')}</p>;
  if (!data || data.total_answers === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title={t('questions.emptyState.gameDataTitle')}
        message={t('questions.emptyState.gameDataSub')}
      />
    );
  }

  const dist = data.distribution || [];
  const main = data.main_distractor_index != null ? dist.find((d) => d.index === data.main_distractor_index) : null;
  let comparison = null;
  if (data.success_rate != null && data.theme_avg_rate != null) {
    const diff = Math.round((data.success_rate - data.theme_avg_rate) * 100);
    const themeName = themeLabels[data.theme] || data.theme;
    if (diff <= -3) comparison = { tone: 'hard', text: t('questions.misc.harderThanAvg', { n: Math.abs(diff), theme: themeName }) };
    else if (diff >= 3) comparison = { tone: 'easy', text: t('questions.misc.easierThanAvg', { n: diff, theme: themeName }) };
    else comparison = { tone: 'balanced', text: t('questions.misc.inLineWithAvg', { theme: themeName }) };
  }

  return (
    <div className="q-tabpane">
      <div className="q-stat-line">
        <div className="q-stat-kpi"><span className="n">{pct(data.success_rate, 0)}</span><span className="l">{t('questions.misc.successLabel')}</span></div>
        <div className="q-stat-kpi"><span className="n">{data.total_answers.toLocaleString('fr-FR')}</span><span className="l">{t('questions.misc.answersLabel')}</span></div>
        <div className="q-stat-kpi"><span className="n">{data.theme_avg_rate != null ? pct(data.theme_avg_rate, 0) : '—'}</span><span className="l">{t('questions.misc.themeAvgLabel')}</span></div>
      </div>

      <div className="q-section-label">{t('questions.misc.distractorAnalysis')}</div>
      <div className="q-dist">
        {dist.map((d) => (
          <div className="q-dist-row" key={d.index}>
            <span className="q-dist-letter">{LETTERS[d.index]}</span>
            <span className="q-dist-bar-wrap">
              <span className={`q-dist-bar ${d.is_correct ? 'correct' : d.index === data.main_distractor_index ? 'distractor' : ''}`} style={{ width: `${Math.max(2, d.pct)}%` }} />
            </span>
            <span className="q-dist-pct">{d.pct}%</span>
            {d.is_correct && <span className="q-dist-tag ok">{t('questions.misc.correctAnswerTag')}</span>}
          </div>
        ))}
      </div>
      {main && (
        <p className="q-stats-insight"><AlertTriangle size={15} /> {t('questions.misc.mainDistractorInsight', { letter: LETTERS[main.index], pct: main.pct })}</p>
      )}
      {comparison && (
        <p className={`q-compare q-compare-${comparison.tone}`}>
          {comparison.tone === 'hard' ? '⚠️' : comparison.tone === 'easy' ? 'ℹ️' : '✓'} {t('questions.misc.questionIs', { text: comparison.text })}
        </p>
      )}
    </div>
  );
}

/* ---------- Onglet Historique du drawer (audit réel) ---------- */
function HistoryPane({ question }) {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    questionsService.questionHistory(question.id)
      .then((r) => { if (alive) setData(r); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [question.id]);

  if (loading) return <p className="muted" style={{ padding: '20px 0' }}>{t('questions.misc.loadingHistory')}</p>;
  const events = data?.events || [];
  const syncCount = events.filter((e) => e.event === 'force_sync').length;

  return (
    <div className="q-tabpane">
      <div className="q-hist-summary">
        <span>{t('questions.misc.currentVersion')} <strong>{data?.version ?? question.version ?? 1}</strong></span>
        <span>{t('questions.misc.syncedPrefix')} <strong>{syncCount}</strong> {t('questions.misc.syncedSuffix')}</span>
      </div>
      {events.length === 0 ? (
        <p className="q-tl-empty">{t('questions.emptyState.historyEventsTitle')}</p>
      ) : (
        <ol className="q-timeline">
          {events.map((e) => {
            const meta = EVENT_META[e.event] || { labelKey: null, dot: '' };
            const changed = e.meta?.changed || [];
            return (
              <li key={e.id}>
                <span className={`q-tl-dot ${meta.dot}`} />
                <div>
                  <div className="q-tl-title">{meta.labelKey ? t(`questions.events.${meta.labelKey}`) : e.event}{e.actor_name ? <span className="q-tl-actor"> · {e.actor_name}</span> : ''}</div>
                  <div className="q-tl-meta">{dateFr(e.created_at, "dd MMM yyyy 'à' HH'h'mm")}{e.meta?.version ? ` · ${t('questions.misc.versionN', { n: e.meta.version })}` : ''}</div>
                  {e.reason && <div className="q-tl-reason">« {e.reason} »</div>}
                  {e.event === 'updated' && changed.length > 0 && (
                    <div className="q-tl-diff">
                      {changed.map((f) => (
                        <div className="q-tl-diff-row" key={f}>
                          <span className="q-tl-diff-field">{FIELD_LABELS[f] ? t(`questions.fields.${FIELD_LABELS[f]}`) : f}</span>
                          {f !== 'options' && (
                            <span className="q-tl-diff-vals">
                              <span className="q-tl-old">{truncate(String(e.meta?.before?.[f] ?? '—'), 32)}</span>
                              <ChevronRight size={12} />
                              <span className="q-tl-new">{truncate(String(e.meta?.after?.[f] ?? '—'), 32)}</span>
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/* ---------- Vue Kanban (drag & drop entre statuts) ---------- */
const KANBAN_COLS = [
  { status: 'draft' },
  { status: 'pending_review' },
  { status: 'approved' },
  { status: 'archived' },
];
function KanbanBoard({ rows, onOpen, onMove }) {
  const { t, i18n } = useTranslation();
  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const byStatus = useMemo(() => {
    const map = Object.fromEntries(KANBAN_COLS.map((c) => [c.status, []]));
    rows.forEach((q) => { if (map[q.status]) map[q.status].push(q); });
    return map;
  }, [rows]);
  const rejected = useMemo(() => rows.filter((q) => q.status === 'rejected'), [rows]);

  return (
    <div className="q-kanban">
      {KANBAN_COLS.map((col) => {
        const items = col.status === 'pending_review' ? [...byStatus[col.status], ...rejected] : byStatus[col.status];
        return (
          <div
            key={col.status}
            className={`q-kanban-col ${overCol === col.status ? 'over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setOverCol(col.status); }}
            onDragLeave={() => setOverCol((c) => (c === col.status ? null : c))}
            onDrop={(e) => { e.preventDefault(); setOverCol(null); if (dragId) onMove(dragId, col.status); setDragId(null); }}
          >
            <div className="q-kanban-head">
              <span className="q-kanban-title">{t(`questions.statuses.${col.status}`)}</span>
              <span className="q-kanban-count">{items.length}</span>
            </div>
            <div className="q-kanban-body">
              {items.map((q) => (
                <div
                  key={q.id}
                  className={`q-kanban-card ${q.status === 'rejected' ? 'is-rejected' : ''} ${dragId === q.id ? 'dragging' : ''}`}
                  draggable
                  onDragStart={() => setDragId(q.id)}
                  onDragEnd={() => { setDragId(null); setOverCol(null); }}
                  onClick={() => onOpen(q)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') onOpen(q); }}
                >
                  <div className="q-kanban-card-text">{truncate(i18n.language === 'en' && q.text_en ? q.text_en : q.text_fr, 60)}</div>
                  <div className="q-kanban-card-meta">
                    <ThemeBadge theme={q.theme} />
                    <LevelPill level={q.level} />
                    {q.status === 'rejected' && <span className="q-kanban-tag-rejected"><XCircle size={11} /> {t('questions.statuses.rejected')}</span>}
                  </div>
                  <div className="q-kanban-card-foot">{t('questions.misc.createdOn', { date: dateFr(q.created_at) })}</div>
                </div>
              ))}
              {items.length === 0 && <div className="q-kanban-empty">—</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Image : dropzone réutilisable (modale création + drawer détail) ---------- */
const IMG_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const IMG_MAX = 2 * 1024 * 1024;

/**
 * Zone d'image réutilisable : glisser-déposer OU clic. Sans aperçu → grande zone
 * pointillée ; avec aperçu → image pleine largeur + overlay « Remplacer / Supprimer ».
 * Valide type (JPG/PNG/WebP) et taille (2 Mo) avant d'appeler `onSelect(file)`.
 */
function ImageDropzone({ previewUrl, onSelect, onClear, busy = false, height = 180, compact = false, offset = { x: 50, y: 50 }, onOffsetChange = () => {} }) {
  const { t } = useTranslation();
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);

  const validate = (file) => {
    if (!file) return;
    if (!IMG_MIME.includes(file.type)) { notify.error(t('questions.image.errType')); return; }
    if (file.size > IMG_MAX) { notify.error(t('questions.image.errSize')); return; }
    onSelect(file);
  };
  const pick = () => { if (!busy) inputRef.current?.click(); };
  const onDrop = (e) => { e.preventDefault(); setDrag(false); if (!busy) validate(e.dataTransfer.files?.[0]); };
  const onChange = (e) => { validate(e.target.files?.[0]); e.target.value = ''; };

  return (
    <>
      {previewUrl ? (
        <div className={`q-img-box ${compact ? 'q-img-box--compact' : ''}`}>
          <DraggableImage src={previewUrl} offset={offset} onOffsetChange={onOffsetChange} />
          <div className="q-img-overlay">
            <button type="button" className="btn btn-light" disabled={busy} onClick={pick}>🔄 {t('questions.image.replace')}</button>
            <button type="button" className="btn btn-light" disabled={busy} onClick={onClear}>🗑 {t('questions.image.remove')}</button>
          </div>
          {busy && <div className="q-img-busy">{t('questions.image.uploading')}</div>}
        </div>
      ) : (
        <div
          className={`q-dropzone ${drag ? 'is-drag' : ''} ${busy ? 'is-busy' : ''}`}
          style={{ minHeight: height }}
          role="button"
          tabIndex={0}
          onClick={pick}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } }}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
        >
          <div className="q-dropzone-icon">🖼</div>
          <div className="q-dropzone-text">{busy ? t('questions.image.uploading') : t('questions.image.dropTitle')}</div>
          <div className="q-dropzone-sub">{t('questions.image.guidelines')}</div>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onChange} />
    </>
  );
}

/* ---------- Image repositionnable (glisser pour recadrer) ---------- */
// Remplace le point focal figé : l'admin fait glisser l'image dans le cadre
// (object-fit:cover). `offset` {x,y} en % est piloté par le parent → synchro de
// l'aperçu mobile. Souris + tactile (admin sur tablette).
function DraggableImage({ src, offset, onOffsetChange }) {
  const { t } = useTranslation();
  const [dragging, setDragging] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const dragStart = useRef(null);
  const containerRef = useRef(null);

  // Indice « glisser pour recadrer » : visible 2 s à chaque nouvelle image.
  useEffect(() => {
    setShowHint(true);
    const id = setTimeout(() => setShowHint(false), 2200);
    return () => clearTimeout(id);
  }, [src]);

  const start = (cx, cy) => {
    setDragging(true);
    dragStart.current = { x: cx, y: cy, ox: offset.x, oy: offset.y };
  };
  const move = (cx, cy) => {
    if (!dragging || !dragStart.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dx = ((cx - dragStart.current.x) / rect.width) * 100;
    const dy = ((cy - dragStart.current.y) / rect.height) * 100;
    onOffsetChange({
      x: Math.max(0, Math.min(100, dragStart.current.ox - dx)),
      y: Math.max(0, Math.min(100, dragStart.current.oy - dy)),
    });
  };
  const end = () => { setDragging(false); dragStart.current = null; };

  return (
    <div
      ref={containerRef}
      className={`q-drag-img ${dragging ? 'is-dragging' : ''}`}
      onMouseDown={(e) => { start(e.clientX, e.clientY); e.preventDefault(); }}
      onMouseMove={(e) => move(e.clientX, e.clientY)}
      onMouseUp={end}
      onMouseLeave={end}
      onTouchStart={(e) => { const tp = e.touches[0]; if (tp) start(tp.clientX, tp.clientY); }}
      onTouchMove={(e) => { const tp = e.touches[0]; if (tp) move(tp.clientX, tp.clientY); }}
      onTouchEnd={end}
    >
      <img
        src={src}
        alt=""
        className="q-drag-img-el"
        draggable={false}
        style={{ objectPosition: `${offset.x}% ${offset.y}%` }}
      />
      {showHint && <div className="q-drag-hint">✋ {t('questions.image.dragHint')}</div>}
    </div>
  );
}

/* ---------- Section image (drawer détail) — upload immédiat ---------- */
function QuestionImageSection({ question, onChange, onRequestRemove }) {
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const [offset, setOffset] = useState({ x: 50, y: 50 });
  const mediaUrl = question.media_url || null;
  // Recadrage centré par défaut à chaque changement d'image.
  useEffect(() => { setOffset({ x: 50, y: 50 }); }, [mediaUrl]);

  const onPick = async (file) => {
    setUploading(true);
    try {
      const res = await questionsService.uploadImage(question.id, file);
      onChange(res.media_url);
      notify.success(t('questions.image.uploaded'));
    } catch {
      notify.error(t('questions.image.uploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <div className="q-section-label">🖼 {t('questions.image.label')}</div>
      <ImageDropzone previewUrl={mediaUrl} onSelect={onPick} onClear={onRequestRemove} busy={uploading} height={120} offset={offset} onOffsetChange={setOffset} />
    </>
  );
}

/* ---------- Page ---------- */
export default function Questions() {
  const { t, i18n } = useTranslation();
  // Filtres persistés dans l'URL (rechargeable / partageable : ?theme=&level=…).
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => ({
    theme: params.get('theme') || '',
    level: params.get('level') || '',
    status: params.get('status') || '',
    q: params.get('q') || '',
  }), [params]);
  const period = params.get('period') || '';
  const [searchInput, setSearchInput] = useState(params.get('q') || '');
  const [showImport, setShowImport] = useState(false);
  const [creating, setCreating] = useState(false);
  const [prefill, setPrefill] = useState(null);
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useState('overview');
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [sort, setSort] = useState({ key: 'created_at', dir: 'desc' });
  const [page, setPage] = useState(0);
  const [reject, setReject] = useState(null); // question en cours de rejet
  const [confirm, setConfirm] = useState(null); // { title, message, confirmLabel, run }
  const [actionBusy, setActionBusy] = useState(false);
  // Vue (table/kanban), densité, panneau stats, lignes dépliées, édition inline.
  const [view, setView] = useState('table');
  const [density, setDensity] = useState('compact');
  const [showStats, setShowStats] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set());
  const [editing, setEditing] = useState(null); // { id, field }
  // Aperçu drawer : mode nuit + simulation de réponse.
  const [previewNight, setPreviewNight] = useState(false);
  const [testPick, setTestPick] = useState(null);
  // Traduction IA d'une question existante (drawer) : 'en' | 'fr' en cours, ou null.
  const [translatingDetail, setTranslatingDetail] = useState(null);
  // Section « Gestion bilingue » du drawer : repliée par défaut (réinit à l'ouverture).
  const [bilingualOpen, setBilingualOpen] = useState(false);

  const { data, loading, refetch } = useApiData(
    () => questionsService.list(filters),
    [filters.theme, filters.level, filters.status, filters.q],
  );
  const rows = useMemo(() => data?.data || [], [data]);

  const total = rows.length;
  const approvedCount = useMemo(() => rows.filter((r) => r.status === 'approved').length, [rows]);
  const pendingCount = useMemo(() => rows.filter((r) => r.status === 'pending_review').length, [rows]);

  const hasFilters = Boolean(filters.theme || filters.level || filters.status || filters.q || period);

  const updateParams = useCallback((patch) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      Object.entries(patch).forEach(([k, v]) => { if (v) next.set(k, v); else next.delete(k); });
      return next;
    }, { replace: true });
    setPage(0);
  }, [setParams]);
  const setF = (k, v) => updateParams({ [k]: v });
  const resetFilters = useCallback(() => { setSearchInput(''); setParams({}, { replace: true }); setPage(0); }, [setParams]);

  // Recherche : debounce 300 ms avant d'écrire dans l'URL (→ requête API).
  useEffect(() => {
    const id = setTimeout(() => { if (searchInput !== filters.q) updateParams({ q: searchInput }); }, 300);
    return () => clearTimeout(id);
  }, [searchInput, filters.q, updateParams]);
  // Resynchronise l'input si q change via une pill / un reset / l'URL.
  useEffect(() => { setSearchInput((s) => (s === filters.q ? s : filters.q)); }, [filters.q]);

  // Total de référence (sans filtre) pour l'affichage « X sur N ».
  const grandTotalRef = useRef(0);
  useEffect(() => { if (!hasFilters) grandTotalRef.current = rows.length; }, [hasFilters, rows.length]);

  // --- Tri (préservé : cycle asc/desc par colonne) ---
  const toggleSort = (key) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
    setPage(0);
  };
  const sortedRows = useMemo(() => {
    const arr = rows.filter((r) => inPeriod(r.created_at, period));
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
  }, [rows, sort, period]);
  const resultCount = sortedRows.length;
  const grandTotal = grandTotalRef.current || rows.length;

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const pageRows = useMemo(
    () => sortedRows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [sortedRows, page],
  );

  // --- Transitions / actions unitaires (plomberie préservée) ---
  const doTransition = async (q, to, reason) => {
    setActionBusy(true);
    try {
      await questionsService.transition(q.id, to, reason);
      notify.success(`${t('questions.columns.status')} → ${t(`questions.statuses.${to}`, questionStatusColors[to]?.label || to)}`);
      setDetail(null); setReject(null); refetch();
    } catch { notify.error(t('questions.notify.transitionFailed')); } finally { setActionBusy(false); }
  };
  const askReject = (q) => setReject(q);
  const doForceSync = async (q) => {
    try { const r = await questionsService.forceSync([q.id]); notify.success(t('questions.notify.forceSyncOne', { devices: r.devices_targeted?.toLocaleString('fr-FR') || '—' })); }
    catch { notify.error(t('questions.notify.forceSyncFailed')); }
  };
  const headerForceSync = async () => {
    const ids = selectedRows.length ? selectedRows.map((q) => q.id) : rows.filter((q) => q.status === 'approved').map((q) => q.id);
    if (!ids.length) { notify.info(t('questions.notify.noApprovedToSync')); return; }
    try {
      const r = await questionsService.forceSync(ids);
      notify.success(t('questions.notify.forceSyncMany', { n: ids.length, devices: r.devices_targeted?.toLocaleString('fr-FR') || '—' }));
    } catch { notify.error(t('questions.notify.forceSyncFailed')); }
  };
  const doArchive = async (q) => {
    setActionBusy(true);
    try {
      await questionsService.remove(q.id);
      notify.success(t('toast.archived'));
      setDetail(null); setConfirm(null); refetch();
    } catch { notify.error(t('questions.notify.archiveFailed')); } finally { setActionBusy(false); }
  };
  const askArchive = (q) => setConfirm({
    title: t('questions.confirm.archiveTitle'),
    message: t('questions.confirm.archiveMessage'),
    confirmLabel: t('questions.actions.archive'),
    run: () => doArchive(q),
  });

  const createQuestion = async (payload, resetForm, imageFile) => {
    setSubmitting(true);
    try {
      const created = await questionsService.create(payload);
      // Image (optionnelle) : uploadée après la création (la route exige l'id).
      // Un échec d'upload ne fait PAS échouer la création — la question existe.
      if (imageFile && created?.id) {
        try { await questionsService.uploadImage(created.id, imageFile); }
        catch { notify.error(t('questions.image.uploadFailed')); }
      }
      notify.success(prefill ? t('toast.duplicated') : t('toast.saved'));
      resetForm(); setCreating(false); setPrefill(null); refetch();
    } catch { notify.error(t('questions.notify.saveFailed')); } finally { setSubmitting(false); }
  };
  const startCreate = () => { setPrefill(null); setCreating(true); };
  const startEdit = (q) => { setPrefill(q); setDetail(null); setCreating(true); };
  const startDuplicate = (q) => { setPrefill(q); setDetail(null); setCreating(true); };
  const closeCreate = () => { setCreating(false); setPrefill(null); };

  const openDetail = (q) => { setTab('overview'); setTestPick(null); setPreviewNight(false); setBilingualOpen(false); setDetail(q); };

  // --- Dépliage de ligne + édition inline (thème / niveau) ---
  const toggleExpand = (id) => setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const saveInline = async (q, field, value) => {
    setEditing(null);
    if (value === q[field]) return;
    try {
      await questionsService.update(q.id, { [field]: value });
      notify.success(t('questions.notify.updated'));
      refetch();
    } catch { notify.error(t('questions.notify.updateFailed')); }
  };

  // --- Drag & drop Kanban : applique une transition de statut valide ---
  const kanbanMove = (id, toStatus) => {
    const q = rows.find((r) => r.id === id);
    if (!q || q.status === toStatus) return;
    if (toStatus === 'rejected') { askReject(q); return; }
    const allowed = STATUS_TRANSITIONS[q.status] || [];
    if (!allowed.includes(toStatus)) {
      notify.error(t('questions.notify.transitionNotAllowed', { from: t(`questions.statuses.${q.status}`, q.status), to: t(`questions.statuses.${toStatus}`, toStatus) }));
      return;
    }
    doTransition(q, toStatus);
  };

  // Traduction IA d'une question EXISTANTE (drawer) via l'endpoint dédié.
  const doTranslateDetail = async (q, targetLang) => {
    setTranslatingDetail(targetLang);
    try {
      const res = await questionsService.translateQuestion(q.id, targetLang);
      setDetail((d) => (d ? {
        ...d,
        text_fr: res.text_fr,
        text_en: res.text_en,
        explanation: res.explanation ?? d.explanation,
        explanation_en: res.explanation_en ?? d.explanation_en,
        options: res.options || d.options,
      } : d));
      notify.success(t('questions.bilingual.translated'));
      refetch();
    } catch { notify.error(t('questions.bilingual.translateFailed')); }
    finally { setTranslatingDetail(null); }
  };

  // Copie le JSON de la question dans le presse-papiers (onglet Aperçu).
  const copyJson = async (q) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(q, null, 2));
      notify.success(t('questions.notify.jsonCopied'));
    } catch { notify.error(t('questions.notify.copyFailed')); }
  };

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

  const selectedRows = rows.filter((r) => selected.has(r.id));
  const eligibleApprove = selectedRows.filter((r) => r.status === 'pending_review');

  const bulkApprove = async () => {
    if (!eligibleApprove.length) { notify.info(t('questions.notify.noEligibleApprove')); return; }
    setActionBusy(true);
    try {
      await Promise.all(eligibleApprove.map((q) => questionsService.transition(q.id, 'approved')));
      notify.success(t('questions.notify.bulkApproved', { n: eligibleApprove.length }));
      clearSel(); refetch();
    } catch { notify.error(t('questions.notify.bulkApproveFailed')); } finally { setActionBusy(false); }
  };
  const bulkArchive = async () => {
    const items = selectedRows;
    setActionBusy(true);
    try {
      await Promise.all(items.map((q) => questionsService.remove(q.id)));
      notify.success(t('questions.notify.bulkArchived', { n: items.length }));
      clearSel(); setConfirm(null); refetch();
    } catch { notify.error(t('questions.notify.bulkArchiveFailed')); } finally { setActionBusy(false); }
  };
  const askBulkArchive = () => setConfirm({
    title: t('questions.confirm.bulkArchiveTitle'),
    message: t('questions.confirm.bulkArchiveMessage', { n: selected.size }),
    confirmLabel: `${t('questions.actions.archive')} ${selected.size}`,
    run: bulkArchive,
  });

  const exportCsv = () => {
    const picked = selected.size ? selectedRows : rows;
    const csv = Papa.unparse(picked.map((q) => ({
      id: q.id,
      enonce: q.text_fr,
      theme: t(`questions.themes.${q.theme}`, themeLabels[q.theme] || q.theme),
      niveau: t(`questions.levels.${q.level}`, levelLabels[q.level] || q.level),
      statut: t(`questions.statuses.${q.status}`, questionStatusColors[q.status]?.label || q.status),
      taux_reussite: q.success_rate == null ? '' : Math.round(q.success_rate * 100),
      creee_le: q.created_at || '',
    })));
    downloadCsv(csv, 'questions-creveton.csv');
    notify.success(t('toast.exportSuccess'));
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

  // --- Drawer : workflow contextuel ---
  const renderWorkflow = (q) => {
    if (q.status === 'draft') {
      return (
        <button className="btn btn-gold btn-block" disabled={actionBusy} onClick={() => doTransition(q, 'pending_review')}>
          <Send size={15} /> {t('questions.actions.submit')}
        </button>
      );
    }
    if (q.status === 'pending_review') {
      return (
        <div className="q-wf-split">
          <button className="btn btn-success" disabled={actionBusy} onClick={() => doTransition(q, 'approved')}>
            <ThumbsUp size={15} /> {t('questions.actions.approve')}
          </button>
          <button className="btn btn-danger" disabled={actionBusy} onClick={() => askReject(q)}>
            <ThumbsDown size={15} /> {t('questions.actions.reject')}
          </button>
        </div>
      );
    }
    if (q.status === 'approved') {
      return (
        <div className="stack" style={{ gap: 8 }}>
          <div className="q-wf-split">
            <button className="btn btn-ghost" onClick={() => startEdit(q)}><Pencil size={15} /> {t('common.edit')}</button>
            <button className="btn btn-ghost" onClick={() => startDuplicate(q)}><Copy size={15} /> {t('questions.actions.duplicate')}</button>
          </div>
          <button className="btn btn-danger-ghost btn-block" disabled={actionBusy} onClick={() => askArchive(q)}>
            <Archive size={15} /> {t('questions.actions.archive')}
          </button>
        </div>
      );
    }
    if (q.status === 'rejected') {
      return (
        <button className="btn btn-gold btn-block" disabled={actionBusy} onClick={() => doTransition(q, 'pending_review')}>
          <RotateCcw size={15} /> {t('questions.actions.resubmit')}
        </button>
      );
    }
    // archived → pas d'endpoint de restauration
    return (
      <div className="q-archived-note">
        <Lock size={15} />
        <span>{q.updated_at ? t('questions.misc.archivedNoteDated', { date: dateFr(q.updated_at) }) : t('questions.misc.archivedNote')}</span>
      </div>
    );
  };

  // Options des selects custom (réutilise les libellés i18n existants).
  const themeOptions = [{ value: '', label: t('questions.allThemes') }, ...THEME_KEYS.map((k) => ({ value: k, label: t(`questions.themes.${k}`, themeLabels[k]), icon: THEME_EMOJI[k] }))];
  const levelOptions = [{ value: '', label: t('questions.allLevels') }, ...LEVEL_KEYS.map((k) => ({ value: k, label: t(`questions.levels.${k}`, levelLabels[k]), icon: LEVEL_EMOJI[k] }))];
  const statusOptions = [{ value: '', label: t('questions.allStatuses') }, ...STATUSES.map((s) => ({ value: s, label: t(`questions.statuses.${s}`, questionStatusColors[s].label), dot: questionStatusColors[s].fg }))];
  const periodOptions = [{ value: '', label: t('questions.filters.allPeriods') }, ...PERIODS.map((p) => ({ value: p, label: t(`questions.filters.periods.${p}`), icon: '📅' }))];

  // Résumé des filtres actifs (segments de la barre de statut).
  const activeSegments = [
    filters.theme && `${t('questions.columns.theme')}: ${t(`questions.themes.${filters.theme}`, themeLabels[filters.theme])}`,
    filters.level && `${t('questions.columns.level')}: ${t(`questions.levels.${filters.level}`, levelLabels[filters.level])}`,
    filters.status && `${t('questions.columns.status')}: ${t(`questions.statuses.${filters.status}`, questionStatusColors[filters.status]?.label)}`,
    period && t(`questions.filters.periods.${period}`),
    filters.q && `${t('common.search')}: « ${filters.q} »`,
  ].filter(Boolean);

  // Pills d'accès rapide.
  const pillActive = (p) => (p.type === 'all' ? !hasFilters : filters[p.type] === p.value);
  const applyPill = (p) => {
    if (p.type === 'all') { resetFilters(); return; }
    updateParams({ [p.type]: filters[p.type] === p.value ? '' : p.value }); // toggle
  };
  const pillLabel = (p) => {
    if (p.type === 'all') return t('questions.filters.quickAll');
    if (p.type === 'theme') return t(`questions.themes.${p.value}`, themeLabels[p.value]);
    if (p.type === 'level') return t(`questions.levels.${p.value}`, levelLabels[p.value]);
    return t(`questions.statuses.${p.value}`, questionStatusColors[p.value]?.label);
  };

  return (
    <>
      {/* En-tête sticky : titre + compteurs inline + actions */}
      <div className="q-head">
        <PageHeader
          title={(
            <span className="q-title-line">
              {t('questions.title')}
              {!loading && (
                <span className="q-count-inline">
                  <strong>{total}</strong> {t('questions.loaded')} · <strong>{approvedCount}</strong> {t('questions.approved')} · <strong>{pendingCount}</strong> {t('questions.pending')}
                </span>
              )}
            </span>
          )}
          description={t('questions.subtitle')}
          actions={(
            <>
              <button className="btn q-btn-sync" onClick={headerForceSync} title={t('questions.a11y.forceSyncTitle')}>
                <Zap size={16} /> {t('questions.forceSync')}
              </button>
              <button className={`btn btn-ghost ${showStats ? 'q-btn-stats-on' : ''}`} onClick={() => setShowStats((s) => !s)}>
                <BarChart3 size={16} /> {t('questions.globalStats')}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowImport(true)}><Upload size={16} /> {t('questions.importCsv')}</button>
              <button className="btn btn-primary" onClick={startCreate}><Plus size={16} /> {t('questions.newQuestion')}</button>
            </>
          )}
        />

        {/* KPI strip (3 blocs, chiffres Outfit 800 36px, traits verticaux) */}
        {loading ? (
          <div className="q-kpi-strip"><span className="muted">{t('common.loading')}</span></div>
        ) : (
          <div className="q-kpi-strip">
            <div className="q-kpi"><span className="n">{total}</span><span className="l">{t('questions.loaded')}</span></div>
            <div className="q-kpi"><span className="n">{approvedCount}</span><span className="l">{t('questions.approved')}</span></div>
            <div className="q-kpi"><span className="n">{pendingCount}</span><span className="l">{t('questions.pending')}</span></div>
          </div>
        )}

        {/* Panneau stats globales (slide-down) */}
        <GlobalStatsPanel open={showStats} />

        {/* Barre vue (table / kanban) + densité */}
        <div className="q-view-toolbar">
          <div className="q-view-switch" role="tablist" aria-label={t('questions.a11y.viewSwitch')}>
            <button type="button" className={`q-view-btn ${view === 'table' ? 'is-active' : ''}`} onClick={() => setView('table')}>
              <Table2 size={15} /> {t('questions.viewTable')}
            </button>
            <button type="button" className={`q-view-btn ${view === 'kanban' ? 'is-active' : ''}`} onClick={() => setView('kanban')}>
              <LayoutGrid size={15} /> {t('questions.viewKanban')}
            </button>
          </div>
          {view === 'table' && (
            <div className="q-density" title={t('questions.a11y.density')}>
              <Rows3 size={14} />
              {[['compact', t('questions.misc.densityCompact')], ['normal', t('questions.misc.densityNormal')], ['spacious', t('questions.misc.densitySpacious')]].map(([k, lbl]) => (
                <button key={k} type="button" className={`q-density-btn ${density === k ? 'is-active' : ''}`} onClick={() => setDensity(k)}>{lbl}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Filtres — card premium (recherche · selects custom · accès rapide · statut) */}
      <div className="q-filters card">
        {/* Ligne 1 : recherche */}
        <div className="q-search-wrap">
          <Search size={18} className="q-search-ic" />
          <input
            className="q-search-input"
            placeholder={t('questions.filters.searchPlaceholder')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label={t('questions.filters.searchPlaceholder')}
          />
          {searchInput && (
            <>
              <span className="q-search-count">{t('questions.filters.results', { count: resultCount })}</span>
              <button type="button" className="q-search-clear" onClick={() => setSearchInput('')} aria-label={t('questions.reset')}><X size={15} /></button>
            </>
          )}
        </div>

        {/* Ligne 2 : selects custom */}
        <div className="q-filter-selects">
          <FilterSelect options={themeOptions} value={filters.theme} onChange={(v) => setF('theme', v)} placeholder={t('questions.allThemes')} ariaLabel={t('questions.columns.theme')} clearLabel={t('questions.reset')} />
          <FilterSelect options={levelOptions} value={filters.level} onChange={(v) => setF('level', v)} placeholder={t('questions.allLevels')} ariaLabel={t('questions.columns.level')} clearLabel={t('questions.reset')} />
          <FilterSelect options={statusOptions} value={filters.status} onChange={(v) => setF('status', v)} placeholder={t('questions.allStatuses')} ariaLabel={t('questions.columns.status')} clearLabel={t('questions.reset')} />
          <FilterSelect options={periodOptions} value={period} onChange={(v) => setF('period', v)} placeholder={t('questions.filters.allPeriods')} ariaLabel={t('questions.filters.period')} clearLabel={t('questions.reset')} />
        </div>

        {/* Ligne 3 : pills d'accès rapide */}
        <div className="q-quick">
          <span className="q-quick-label">{t('questions.filters.quickAccess')}</span>
          <div className="q-quick-pills">
            {QUICK_PILLS.map((p) => (
              <button key={p.id} type="button" className={`q-quick-pill ${pillActive(p) ? 'is-active' : ''}`} onClick={() => applyPill(p)}>
                <span aria-hidden="true">{p.icon}</span> {pillLabel(p)}
              </button>
            ))}
          </div>
        </div>

        {/* Ligne 4 : barre de statut des filtres actifs */}
        {hasFilters && (
          <div className="q-filter-status">
            <span className="q-filter-status-active"><Search size={14} /> {t('questions.filters.activeLabel')} {activeSegments.join(' · ')}</span>
            <span className="q-filter-status-count">{t('questions.filters.found', { count: resultCount, total: grandTotal })}</span>
            <button type="button" className="q-filter-status-clear" onClick={resetFilters}><X size={14} /> {t('questions.filters.clearAll')}</button>
          </div>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <SkeletonTable rows={8} cols={8} />
      ) : sortedRows.length === 0 ? (
        <div className="card">
          {hasFilters ? (
            <EmptyState
              title={t('questions.noResults')}
              message={t('questions.noResultsSubtitle')}
              action={<button className="btn" onClick={resetFilters}>{t('questions.reset')}</button>}
            />
          ) : (
            <EmptyState
              title={t('questions.empty')}
              message={t('questions.emptySubtitle')}
              action={(
                <div className="row" style={{ gap: 10 }}>
                  <button className="btn btn-ghost" onClick={() => setShowImport(true)}><Upload size={16} /> {t('questions.importCsv')}</button>
                  <button className="btn btn-primary" onClick={startCreate}><Plus size={16} /> {t('questions.newQuestion')}</button>
                </div>
              )}
            />
          )}
        </div>
      ) : view === 'kanban' ? (
        <KanbanBoard rows={sortedRows} onOpen={openDetail} onMove={kanbanMove} />
      ) : (
        <div className="card q-table-card">
          <div className="table-wrap">
            <table className={`data q-table q-table--${density}`}>
              <thead>
                <tr>
                  <th className="q-th-sel">
                    <span className={`checkbox ${allSelected ? 'on' : ''}`} onClick={toggleAll}>{allSelected && <Check size={12} />}</span>
                  </th>
                  <th className="q-th-exp" aria-hidden="true" />
                  <th className="q-th-num">{t('questions.columns.number')}</th>
                  <th>{sortHead(t('questions.columns.statement'), 'text_fr')}</th>
                  <th>{sortHead(t('questions.columns.theme'), 'theme')}</th>
                  <th>{sortHead(t('questions.columns.level'), 'level')}</th>
                  <th>{sortHead(t('questions.columns.status'), 'status')}</th>
                  <th className="q-col-secondary">{sortHead(t('questions.columns.successRate'), 'success_rate')}</th>
                  <th className="q-col-secondary">{sortHead(t('questions.columns.createdAt'), 'created_at')}</th>
                  <th className="q-th-actions">{t('questions.columns.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((q, i) => {
                  const on = selected.has(q.id);
                  const isExp = expanded.has(q.id);
                  const opts = q.options || [];
                  const cIdx = q.correct_index != null ? q.correct_index : opts.findIndex((o) => o.is_correct);
                  // Affiche l'énoncé/explication dans la langue active de la console
                  // (repli FR si la traduction EN manque).
                  const displayText = i18n.language === 'en' && q.text_en ? q.text_en : q.text_fr;
                  const displayExplanation = i18n.language === 'en' && q.explanation_en ? q.explanation_en : q.explanation;
                  return (
                    <Fragment key={q.id}>
                      <tr className={`clickable ${on ? 'q-row-on' : ''}`} onClick={() => openDetail(q)}>
                        <td onClick={(e) => e.stopPropagation()}>
                          <span className={`checkbox ${on ? 'on' : ''}`} onClick={() => toggleOne(q.id)}>{on && <Check size={12} />}</span>
                        </td>
                        <td className="q-cell-exp" onClick={(e) => { e.stopPropagation(); toggleExpand(q.id); }}>
                          <button className={`q-exp-btn ${isExp ? 'open' : ''}`} aria-label={t('questions.a11y.expandOptions')} aria-expanded={isExp}><ChevronRight size={15} /></button>
                        </td>
                        <td className="q-cell-num">{page * PAGE_SIZE + i + 1}</td>
                        <td className="q-cell-statement">
                          <span className="q-statement-row">
                            {q.media_url && <img src={q.media_url} alt="" className="q-statement-thumb" title={t('questions.image.hasBadge')} loading="lazy" />}
                            <span className="q-statement-text">{truncate(displayText, STATEMENT_MAX)}</span>
                            <BilingualBadge q={q} />
                          </span>
                          {displayExplanation && <span className="q-statement-sub">{truncate(displayExplanation, 90)}</span>}
                        </td>
                        <td className="q-cell-edit" onClick={(e) => e.stopPropagation()}>
                          {editing && editing.id === q.id && editing.field === 'theme' ? (
                            <select className="select q-inline-select" defaultValue={q.theme} autoFocus onChange={(e) => saveInline(q, 'theme', e.target.value)} onBlur={() => setEditing(null)}>
                              {THEME_KEYS.map((k) => <option key={k} value={k}>{t(`questions.themes.${k}`, themeLabels[k])}</option>)}
                            </select>
                          ) : (
                            <button type="button" className="q-inline-trigger" onClick={() => setEditing({ id: q.id, field: 'theme' })} title={t('questions.a11y.editThemeTitle')}><ThemeBadge theme={q.theme} /></button>
                          )}
                        </td>
                        <td className="q-cell-edit" onClick={(e) => e.stopPropagation()}>
                          {editing && editing.id === q.id && editing.field === 'level' ? (
                            <select className="select q-inline-select" defaultValue={q.level} autoFocus onChange={(e) => saveInline(q, 'level', e.target.value)} onBlur={() => setEditing(null)}>
                              {LEVEL_KEYS.map((k) => <option key={k} value={k}>{t(`questions.levels.${k}`, levelLabels[k])}</option>)}
                            </select>
                          ) : (
                            <button type="button" className="q-inline-trigger" onClick={() => setEditing({ id: q.id, field: 'level' })} title={t('questions.a11y.editLevelTitle')}><LevelPill level={q.level} /></button>
                          )}
                        </td>
                        <td><StatusDot status={q.status} /></td>
                        <td className="q-col-secondary"><SuccessBar rate={q.success_rate} /></td>
                        <td className="muted q-col-secondary">{dateFr(q.created_at)}</td>
                        <td className="q-td-actions" onClick={(e) => e.stopPropagation()}>
                          <div className="row nowrap" style={{ gap: 2 }}>
                            <button className="icon-action" title={t('questions.actions.view')} onClick={() => openDetail(q)}><Eye size={17} /></button>
                            <button className="icon-action" title={t('questions.actions.edit')} onClick={() => startEdit(q)}><Pencil size={16} /></button>
                            <button className="icon-action" title={t('questions.actions.duplicate')} onClick={() => startDuplicate(q)}><Copy size={16} /></button>
                            {(q.status === 'approved' || q.status === 'archived') && (
                              <button className="icon-action" title={t('questions.forceSync')} onClick={() => doForceSync(q)}><Zap size={16} /></button>
                            )}
                            {q.status !== 'archived' && (
                              <button className="icon-action danger" title={t('questions.actions.archive')} onClick={() => askArchive(q)}><Archive size={16} /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExp && (
                        <tr className="q-expand-row">
                          <td colSpan={10}>
                            <div className="q-expand">
                              {opts.map((o, idx) => (
                                <div className={`q-expand-opt ${idx === cIdx ? 'correct' : ''}`} key={`${q.id}-x-${idx}`}>
                                  <span className="q-expand-letter">{LETTERS[idx]}</span>
                                  <span className="q-expand-text">{i18n.language === 'en' && o.text_en ? o.text_en : o.text}</span>
                                  {idx === cIdx && <Check size={14} />}
                                </div>
                              ))}
                              {displayExplanation && <div className="explain q-expand-explain">{displayExplanation}</div>}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {pageCount > 1 && (
            <div className="q-pager">
              <span className="page-info">{t('questions.misc.pagerCount', { n: sortedRows.length, perPage: PAGE_SIZE })}</span>
              <div className="row" style={{ gap: 6 }}>
                <button className="icon-btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label={t('common.previous')}><ChevronLeft size={16} /></button>
                <span className="muted" style={{ fontSize: 13 }}>{t('questions.misc.pageOf', { page: page + 1, total: pageCount })}</span>
                <button className="icon-btn" disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)} aria-label={t('common.next')}><ChevronRight size={16} /></button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Barre d'actions groupées (sticky bottom) */}
      {selected.size > 0 && (
        <div className="q-bulk-bar">
          <span className="q-bulk-count">{selected.size} {t('questions.selected')}</span>
          <div className="row wrap" style={{ gap: 8, marginLeft: 'auto' }}>
            <button className="btn btn-sm btn-success" disabled={actionBusy} onClick={bulkApprove}>
              <ThumbsUp size={14} /> {t('questions.approveAll')}{eligibleApprove.length ? ` (${eligibleApprove.length})` : ''}
            </button>
            <button className="btn btn-sm" disabled={actionBusy} onClick={askBulkArchive}><Archive size={14} /> {t('questions.archiveAll')}</button>
            <button className="btn btn-sm" onClick={exportCsv}><Download size={14} /> {t('questions.exportCsv')}</button>
            <button className="btn btn-sm btn-ghost" onClick={clearSel}><X size={14} /> {t('questions.deselect')}</button>
          </div>
        </div>
      )}

      {/* Modal de création / édition par étapes */}
      <CreateModal open={creating} onClose={closeCreate} onCreate={createQuestion} submitting={submitting} prefill={prefill} />

      {/* Modal rejet (motif obligatoire) */}
      <RejectModal
        open={Boolean(reject)}
        busy={actionBusy}
        onClose={() => setReject(null)}
        onConfirm={(reason) => doTransition(reject, 'rejected', reason)}
      />

      {/* Confirmation destructrice (archivage unitaire ou groupé) */}
      <ConfirmModal
        open={Boolean(confirm)}
        busy={actionBusy}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        onConfirm={() => confirm?.run()}
        onClose={() => setConfirm(null)}
      />

      {/* Drawer détail question */}
      <Drawer open={Boolean(detail)} onClose={() => setDetail(null)} title={t('questions.misc.questionDetail')} width={560}>
        {detail && (() => {
          const opts = detail.options || [];
          const correctIdx = detail.correct_index != null
            ? detail.correct_index
            : opts.findIndex((o) => o.is_correct);
          // Aperçu dans la langue active de la console (repli FR si EN absent).
          // Recalculé à CHAQUE rendu (l'IIFE re-tourne quand Questions() se
          // re-rend sur 'languageChanged') → bascule FR↔EN immédiate, drawer ouvert.
          const displayText = i18n.language === 'en' && detail.text_en ? detail.text_en : detail.text_fr;
          const displayOption = (o) => (i18n.language === 'en' && o.text_en ? o.text_en : o.text);
          const displayExplanation = i18n.language === 'en' && detail.explanation_en
            ? detail.explanation_en
            : detail.explanation;
          return (
            <div className="q-drawer">
              {/* Hero sombre */}
              <div className="q-hero">
                <div className="q-hero-badges">
                  <ThemeBadge theme={detail.theme} />
                  <LevelPill level={detail.level} />
                  <StatusDot status={detail.status} />
                </div>
                <div className="q-hero-meta">
                  {t('questions.drawer.createdOn')} {formatDate(detail.created_at, i18n.language, true)}
                  {' · '}
                  {t('questions.drawer.modifiedOn')} {formatDate(detail.updated_at, i18n.language, true)}
                </div>
              </div>

              {/* Onglets */}
              <div className="q-tabs" role="tablist">
                <button role="tab" aria-selected={tab === 'overview'} className={`q-tab ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>
                  <Eye size={15} /> {t('questions.drawer.preview')}
                </button>
                <button role="tab" aria-selected={tab === 'stats'} className={`q-tab ${tab === 'stats' ? 'active' : ''}`} onClick={() => setTab('stats')}>
                  <BarChart3 size={15} /> {t('questions.drawer.statistics')}
                </button>
                <button role="tab" aria-selected={tab === 'history'} className={`q-tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>
                  <History size={15} /> {t('questions.drawer.history')}
                </button>
              </div>

                            {/* APERÇU */}
              {tab === 'overview' && (
                <div className="q-tabpane">
                  {detail.status === 'rejected' && (
                    <div className="q-banner-reject">
                      <XCircle size={16} /> {t('questions.misc.rejectedBanner')}
                    </div>
                  )}

                  <div className="q-preview-tools">
                    <button type="button" className="q-prev-tool" onClick={() => setPreviewNight((n) => !n)}>
                      {previewNight ? <Sun size={14} /> : <Moon size={14} />} {previewNight ? t('questions.drawer.lightMode') : t('questions.drawer.darkMode')}
                    </button>
                    <button type="button" className="q-prev-tool" onClick={() => copyJson(detail)}><Code2 size={14} /> {t('questions.drawer.copyJson')}</button>
                    {testPick != null ? (
                      <button type="button" className="q-prev-tool" onClick={() => setTestPick(null)}><RotateCcw size={14} /> {t('questions.reset')}</button>
                    ) : (
                      <button type="button" className="q-prev-tool q-prev-tool-go" onClick={() => setTestPick(-1)}><Play size={14} /> {t('questions.drawer.testQuestion')}</button>
                    )}
                  </div>

                  <div className={`q-phone ${previewNight ? 'q-phone--night' : ''}`}>
                    <div className="q-phone-top">
                      <span className="q-phone-step">{t('questions.preview.demoStep')}</span>
                      <span className="q-phone-pts">{t('questions.preview.demoPoints')}</span>
                    </div>
                    <div className="q-phone-timer"><span style={{ width: '60%' }} /></div>
                    {detail.media_url && <img src={detail.media_url} alt="" className="q-phone-img" />}
                    <div className="q-phone-q">{displayText || t('questions.drawer.noStatement')}</div>
                    <div className="q-phone-opts">
                      {opts.map((o, i) => {
                        const testing = testPick != null;
                        const answered = testPick != null && testPick >= 0;
                        if (!testing) {
                          return <PreviewOption key={`${detail.id}-mp-${i}`} letter={LETTERS[i]} text={displayOption(o)} correct={i === correctIdx} />;
                        }
                        const showCorrect = answered && i === correctIdx;
                        const showWrong = answered && i === testPick && i !== correctIdx;
                        return (
                          <button
                            type="button"
                            key={`${detail.id}-mp-${i}`}
                            className={`q-mp-opt q-mp-opt--btn ${showCorrect ? 'correct' : ''} ${showWrong ? 'wrong' : ''}`}
                            onClick={() => { if (testPick === -1) setTestPick(i); }}
                            disabled={answered}
                          >
                            <span className="q-mp-letter">{LETTERS[i]}</span>
                            <span className="q-mp-opt-text">{displayOption(o) || t('questions.placeholder.option', { letter: LETTERS[i] })}</span>
                            {showCorrect && <Check size={15} className="q-mp-check" />}
                            {showWrong && <X size={15} className="q-mp-check" />}
                          </button>
                        );
                      })}
                    </div>
                    {testPick === -1 && <div className="q-phone-hint">{t('questions.preview.selectAnswer')}</div>}
                    {(testPick == null || testPick >= 0) && correctIdx >= 0 && (
                      <div className="q-phone-answer">{t('questions.preview.correctAnswer', { letter: LETTERS[correctIdx], text: opts[correctIdx] ? displayOption(opts[correctIdx]) : '' })}</div>
                    )}
                    {displayExplanation && (testPick == null || testPick >= 0) && (
                      <div className="q-phone-explain"><span>💡</span><span>{displayExplanation}</span></div>
                    )}
                  </div>

                  <div className="q-section-label">{t('questions.misc.statementRaw')}</div>
                  <textarea className="textarea q-raw" readOnly value={displayText || ''} rows={3} />

                  {/* OPTIONS — langue active uniquement (le FR|EN côte à côte vit dans
                      la section « Gestion bilingue » repliable plus bas). */}
                  {opts.length > 0 && (
                    <>
                      <div className="q-section-label">{t('questions.modal.options')}</div>
                      <div className="q-opt-view">
                        {opts.map((o, i) => (
                          <div className={`q-opt-view-row ${i === correctIdx ? 'is-correct' : ''}`} key={`${detail.id}-ov-${i}`}>
                            <span className="q-bi-letter">{LETTERS[i]}</span>
                            <span className="q-opt-view-text">{displayOption(o)}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {displayExplanation && (
                    <>
                      <div className="q-section-label">{t('questions.misc.fullExplanation')}</div>
                      <div className="explain">{displayExplanation}</div>
                    </>
                  )}

                  {/* IMAGE — champ optionnel le plus visible (avant SOURCE). */}
                  <QuestionImageSection
                    question={detail}
                    onChange={(url) => { setDetail((d) => ({ ...d, media_url: url })); refetch(); }}
                    onRequestRemove={() => setConfirm({
                      title: t('questions.image.removeTitle'),
                      message: t('questions.image.removeMessage'),
                      confirmLabel: t('questions.image.remove'),
                      run: async () => {
                        try {
                          await questionsService.deleteImage(detail.id);
                          setDetail((d) => ({ ...d, media_url: null }));
                          setConfirm(null); refetch();
                          notify.success(t('questions.image.removed'));
                        } catch { notify.error(t('questions.image.removeFailed')); }
                      },
                    })}
                  />

                  {detail.source && (
                    <>
                      <div className="q-section-label">{t('questions.misc.source')}</div>
                      <div className="q-source">{detail.source}</div>
                    </>
                  )}

                  {/* 🌐 GESTION BILINGUE — repliable (réduit le scroll par défaut). */}
                  <div className="q-bilingual-mgmt">
                    <button
                      type="button"
                      className="q-bilingual-toggle"
                      aria-expanded={bilingualOpen}
                      onClick={() => setBilingualOpen((v) => !v)}
                    >
                      <span>🌐 {t('questions.bilingual.management')}</span>
                      <ChevronRight size={16} className={`q-bilingual-chevron ${bilingualOpen ? 'open' : ''}`} />
                    </button>

                    {bilingualOpen && (
                      <div className="q-bilingual-body">
                        {/* ÉNONCÉ (EN) — texte traduit, ou « non traduit » + bouton. */}
                        <div className="q-section-label q-section-label--bi">
                          {t('questions.bilingual.statementEn')}
                          {detail.text_en
                            ? <span className="q-bi-badge q-bi-badge--ok">FR+EN</span>
                            : <span className="q-bi-badge q-bi-badge--missing">{t('questions.bilingual.notTranslated')}</span>}
                        </div>
                        {detail.text_en ? (
                          <textarea className="textarea q-raw" readOnly value={detail.text_en} rows={3} />
                        ) : (
                          <button
                            type="button"
                            className="q-translate-btn"
                            disabled={!detail.text_fr || translatingDetail === 'en'}
                            onClick={() => doTranslateDetail(detail, 'en')}
                          >
                            {translatingDetail === 'en'
                              ? <><span className="q-ai-spin" /> {t('questions.bilingual.translating')}</>
                              : <>🌐 {t('questions.bilingual.translateToEn')}</>}
                          </button>
                        )}

                        {/* Options FR / EN côte à côte (petite police). */}
                        {opts.length > 0 && (
                          <>
                            <div className="q-section-label">{t('questions.modal.options')}</div>
                            <div className="q-bi-opts">
                              {opts.map((o, i) => (
                                <div className={`q-bi-opt ${i === correctIdx ? 'is-correct' : ''}`} key={`${detail.id}-bi-${i}`}>
                                  <span className="q-bi-letter">{LETTERS[i]}</span>
                                  <span className="q-bi-fr">{o.text}</span>
                                  <span className={`q-bi-en ${o.text_en ? '' : 'q-bi-en--missing'}`}>{o.text_en || t('questions.bilingual.notTranslated')}</span>
                                </div>
                              ))}
                            </div>
                          </>
                        )}

                        {/* EXPLICATION (EN) — masquée si identique au FR (Fix 1). */}
                        {(detail.explanation || detail.explanation_en) && detail.explanation_en !== detail.explanation && (
                          <>
                            <div className="q-section-label q-section-label--bi">
                              {t('questions.bilingual.fullExplanationEn')}
                              {detail.explanation_en
                                ? <span className="q-bi-badge q-bi-badge--ok">EN</span>
                                : <span className="q-bi-badge q-bi-badge--missing">{t('questions.bilingual.notTranslated')}</span>}
                            </div>
                            {detail.explanation_en ? (
                              <div className="explain">{detail.explanation_en}</div>
                            ) : (
                              <button
                                type="button"
                                className="q-translate-btn"
                                disabled={!detail.explanation || translatingDetail === 'en'}
                                onClick={() => doTranslateDetail(detail, 'en')}
                              >
                                {translatingDetail === 'en'
                                  ? <><span className="q-ai-spin" /> {t('questions.bilingual.translating')}</>
                                  : <>🌐 {t('questions.bilingual.translateToEn')}</>}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* STATISTIQUES */}
              {tab === 'stats' && <StatsPane question={detail} />}

              {/* HISTORIQUE */}
              {tab === 'history' && <HistoryPane question={detail} />}

              {/* Workflow (sticky bottom) */}
              <div className="q-drawer-actions">{renderWorkflow(detail)}</div>
            </div>
          );
        })()}
      </Drawer>

      <ImportModal open={showImport} onClose={() => setShowImport(false)} onDone={refetch} />
    </>
  );
}
