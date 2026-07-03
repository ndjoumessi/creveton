import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Sparkles, ThumbsUp, Pencil, Ban, Loader2, Check } from 'lucide-react';
import FilterSelect from './FilterSelect';
import Modal from './Modal';
import EmptyState from './EmptyState';
import { SkeletonTable } from './Skeleton';
import ThemeBadge from './ThemeBadge';
import { notify } from './Toast';
import { useApiData, triggerRefresh } from '../hooks/useApiData';
import { THEME_KEYS, LEVEL_KEYS } from '../constants/enums';
import { themeLabels, levelLabels } from '../constants/theme';
import questionsService from '../services/questions.service';

/**
 * Écran de relecture des brouillons générés par IA (status='draft',
 * source='ai_generated'). Approuver / Éditer / Rejeter par question ou en lot.
 * L'édition rouvre l'éditeur bilingue existant via `onEditDraft` (PATCH /:id).
 *
 * @param {(draft) => void} onEditDraft   ouvre l'éditeur pour corriger un brouillon.
 * @param {() => void} onClose            retour à la liste des questions.
 * @param {() => void} onOpenGenerate     ouvre la modale « Générer ».
 */
export default function DraftsReview({ onEditDraft, onClose, onOpenGenerate }) {
  const { t } = useTranslation();
  const [theme, setTheme] = useState('');
  const [level, setLevel] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [rejectTarget, setRejectTarget] = useState(null); // draft | { bulk: true }
  const [rejectReason, setRejectReason] = useState('');

  const { data, loading, error, refetch } = useApiData(
    () => questionsService.listDrafts({ theme, level }),
    [theme, level],
  );
  const drafts = useMemo(() => data?.data || [], [data]);

  const themeOptions = THEME_KEYS.map((k) => ({ value: k, label: t(`questions.themes.${k}`, themeLabels[k]) }));
  const levelOptions = LEVEL_KEYS.map((k) => ({ value: k, label: t(`questions.levels.${k}`, levelLabels[k]) }));

  const toggle = (id) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const clearSel = () => setSelected(new Set());
  const allSelected = drafts.length > 0 && drafts.every((d) => selected.has(d.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(drafts.map((d) => d.id)));

  // Rafraîchit la vue brouillons ET la liste principale (une question approuvée
  // rejoint la liste publiée).
  const refreshAll = () => { refetch(); triggerRefresh(); };

  const approve = async (id) => {
    setBusy(true);
    try {
      await questionsService.approveDraft(id);
      notify.success(t('questions.drafts.approved'));
      setSelected((s) => { const n = new Set(s); n.delete(id); return n; });
      refreshAll();
    } catch { notify.error(t('common.error')); } finally { setBusy(false); }
  };

  const bulkApprove = async () => {
    const ids = [...selected];
    setBusy(true);
    try {
      await Promise.all(ids.map((id) => questionsService.approveDraft(id)));
      notify.success(t('questions.drafts.approvedN', { count: ids.length }));
      clearSel();
      refreshAll();
    } catch { notify.error(t('common.error')); } finally { setBusy(false); }
  };

  const doReject = async () => {
    const reason = rejectReason.trim() || undefined;
    const ids = rejectTarget?.bulk ? [...selected] : [rejectTarget.id];
    setBusy(true);
    try {
      await Promise.all(ids.map((id) => questionsService.rejectDraft(id, reason)));
      notify.success(t('questions.drafts.rejectedN', { count: ids.length }));
      setRejectTarget(null); setRejectReason(''); clearSel();
      refreshAll();
    } catch { notify.error(t('common.error')); } finally { setBusy(false); }
  };

  return (
    <div className="q-drafts">
      <div className="q-drafts-bar">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
          <ArrowLeft size={15} /> {t('questions.drafts.backToList')}
        </button>
        <h2 className="q-drafts-title">
          {t('questions.drafts.title')}
          {!loading && <span className="q-drafts-count">{drafts.length}</span>}
        </h2>
        <div className="q-drafts-filters">
          <FilterSelect options={themeOptions} value={theme} onChange={setTheme} placeholder={t('questions.allThemes')} ariaLabel={t('questions.columns.theme')} clearLabel={t('questions.reset')} />
          <FilterSelect options={levelOptions} value={level} onChange={setLevel} placeholder={t('questions.allLevels')} ariaLabel={t('questions.columns.level')} clearLabel={t('questions.reset')} />
          <button type="button" className="btn btn-primary btn-sm" onClick={onOpenGenerate}>
            <Sparkles size={15} /> {t('questions.generate.cta')}
          </button>
        </div>
      </div>

      {loading ? (
        <SkeletonTable rows={5} cols={2} />
      ) : error ? (
        <div className="card">
          <EmptyState title={t('common.error')} message={t('questions.drafts.loadError')} action={<button className="btn" onClick={refetch}>{t('common.retry')}</button>} />
        </div>
      ) : drafts.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Sparkles}
            title={t('questions.drafts.empty')}
            message={t('questions.drafts.emptyHint')}
            action={<button className="btn btn-primary" onClick={onOpenGenerate}><Sparkles size={15} /> {t('questions.generate.cta')}</button>}
          />
        </div>
      ) : (
        <>
          <div className="q-drafts-selall">
            <label className="q-draft-check">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label={t('questions.drafts.selectAll')} />
              <span>{t('questions.drafts.selectAll')}</span>
            </label>
          </div>
          <div className="q-drafts-list">
            {drafts.map((d) => {
              const correct = (d.options || []).findIndex((o) => o.is_correct);
              return (
                <div key={d.id} className={`q-draft-card ${selected.has(d.id) ? 'is-selected' : ''}`}>
                  <label className="q-draft-check q-draft-card-check">
                    <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} aria-label={t('questions.drafts.select')} />
                  </label>
                  <div className="q-draft-body">
                    <div className="q-draft-meta">
                      <ThemeBadge theme={d.theme} />
                      <span className="q-draft-level">{t(`questions.levels.${d.level}`, levelLabels[d.level])}</span>
                    </div>
                    <p className="q-draft-text">{d.text_fr}</p>
                    <ul className="q-draft-opts">
                      {(d.options || []).map((o, i) => (
                        <li key={i} className={i === correct ? 'is-correct' : ''}>
                          {i === correct && <Check size={13} className="q-draft-opt-ic" />}
                          {o.text}
                        </li>
                      ))}
                    </ul>
                    {d.explanation && <p className="q-draft-expl">{d.explanation}</p>}
                  </div>
                  <div className="q-draft-actions">
                    <button type="button" className="btn btn-sm btn-success" disabled={busy} onClick={() => approve(d.id)}>
                      <ThumbsUp size={14} /> {t('questions.actions.approve')}
                    </button>
                    <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => onEditDraft(d)}>
                      <Pencil size={14} /> {t('questions.actions.edit')}
                    </button>
                    <button type="button" className="btn btn-sm btn-danger-ghost" disabled={busy} onClick={() => { setRejectReason(''); setRejectTarget(d); }}>
                      <Ban size={14} /> {t('questions.actions.reject')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {selected.size > 0 && (
        <div className="q-bulk-bar">
          <span className="q-bulk-count">{selected.size} {t('questions.selected')}</span>
          <div className="row wrap" style={{ gap: 8, marginLeft: 'auto' }}>
            <button className="btn btn-sm btn-success" disabled={busy} onClick={bulkApprove}>
              <ThumbsUp size={14} /> {t('questions.drafts.approveSelection')}
            </button>
            <button className="btn btn-sm btn-danger-ghost" disabled={busy} onClick={() => { setRejectReason(''); setRejectTarget({ bulk: true }); }}>
              <Ban size={14} /> {t('questions.drafts.rejectSelection')}
            </button>
            <button className="btn btn-sm btn-ghost" onClick={clearSel}>{t('questions.deselect')}</button>
          </div>
        </div>
      )}

      <Modal
        open={Boolean(rejectTarget)}
        onClose={() => setRejectTarget(null)}
        title={t('questions.drafts.rejectTitle')}
        width={420}
        footer={(
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setRejectTarget(null)} disabled={busy}>{t('common.cancel')}</button>
            <button type="button" className="btn btn-danger" onClick={doReject} disabled={busy}>
              {busy ? <Loader2 size={15} className="q-spin" /> : <Ban size={15} />} {t('questions.actions.reject')}
            </button>
          </>
        )}
      >
        <p className="q-draft-reject-msg">
          {rejectTarget?.bulk
            ? t('questions.drafts.rejectBulkMsg', { count: selected.size })
            : t('questions.drafts.rejectMsg')}
        </p>
        <textarea
          className="textarea"
          placeholder={t('questions.drafts.rejectReason')}
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
        />
      </Modal>
    </div>
  );
}
