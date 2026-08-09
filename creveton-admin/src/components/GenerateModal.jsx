import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Loader2, CheckCircle2 } from 'lucide-react';
import Modal from './Modal';
import FilterSelect from './FilterSelect';
import { notify } from './Toast';
import { THEME_KEYS, LEVEL_KEYS } from '../constants/enums';
import { themeLabel, levelLabel } from '../constants/theme';
import questionsService from '../services/questions.service';

/**
 * Modale de génération assistée IA d'un lot de brouillons (thème + niveau +
 * quantité). Appel bloquant (l'IA met quelques secondes) ; à la réussite, affiche
 * un récapitulatif et propose d'ouvrir la relecture des brouillons.
 *
 * @param {boolean} open
 * @param {() => void} onClose
 * @param {(result) => void} onGenerated  appelé après un lot réussi (≥1 créé) pour
 *   rafraîchir la vue brouillons.
 * @param {() => void} onReview  ouvre l'écran « Brouillons IA ».
 */
export default function GenerateModal({ open, onClose, onGenerated, onReview }) {
  const { t } = useTranslation();
  const [theme, setTheme] = useState('');
  const [level, setLevel] = useState('');
  const [count, setCount] = useState(10);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const themeOptions = THEME_KEYS.map((k) => ({ value: k, label: t(`questions.themes.${k}`, themeLabel(k)) }));
  const levelOptions = LEVEL_KEYS.map((k) => ({ value: k, label: t(`questions.levels.${k}`, levelLabel(k)) }));
  const canGenerate = theme && level && count >= 1 && count <= 20 && !busy;

  const reset = () => { setResult(null); setBusy(false); };
  const close = () => { reset(); onClose(); };

  const generate = async () => {
    if (!canGenerate) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await questionsService.generate({ theme, level, count });
      setResult(res);
      if (res.created?.length) {
        notify.success(t('questions.generate.done', { count: res.created.length }));
        onGenerated?.(res);
      } else {
        notify.info(t('questions.generate.none'));
      }
    } catch (e) {
      const code = e?.response?.data?.error?.code;
      notify.error(code === 'AI_NOT_CONFIGURED' ? t('questions.generate.notConfigured') : t('questions.generate.failed'));
    } finally {
      setBusy(false);
    }
  };

  const footer = result ? (
    <>
      <button type="button" className="btn btn-ghost" onClick={close}>{t('common.close')}</button>
      {result.created?.length ? (
        <button type="button" className="btn btn-primary" onClick={() => { close(); onReview?.(); }}>
          {t('questions.generate.review', { count: result.created.length })}
        </button>
      ) : (
        <button type="button" className="btn btn-primary" onClick={reset}>{t('questions.generate.retry')}</button>
      )}
    </>
  ) : (
    <>
      <button type="button" className="btn btn-ghost" onClick={close} disabled={busy}>{t('common.cancel')}</button>
      <button type="button" className="btn btn-primary" onClick={generate} disabled={!canGenerate}>
        {busy ? <><Loader2 size={15} className="q-spin" /> {t('questions.generate.generating')}</> : <><Sparkles size={15} /> {t('questions.generate.cta')}</>}
      </button>
    </>
  );

  return (
    <Modal open={open} onClose={busy ? () => {} : close} title={t('questions.generate.title')} footer={footer} width={480}>
      {result ? (
        <div className="q-gen-result">
          <CheckCircle2 size={28} className="q-gen-result-ic" />
          <p className="q-gen-result-main">{t('questions.generate.summary', { created: result.created?.length || 0, requested: result.requested })}</p>
          <ul className="q-gen-result-meta">
            <li>{t('questions.generate.createdN', { count: result.created?.length || 0 })}</li>
            {result.skipped_duplicates > 0 && <li>{t('questions.generate.skippedDup', { count: result.skipped_duplicates })}</li>}
            {result.skipped_invalid > 0 && <li>{t('questions.generate.skippedInvalid', { count: result.skipped_invalid })}</li>}
          </ul>
          <p className="q-gen-hint">{t('questions.generate.reviewHint')}</p>
        </div>
      ) : (
        <div className="q-gen-form">
          <p className="q-gen-intro">{t('questions.generate.intro')}</p>
          <label className="q-gen-field">
            <span className="q-gen-label">{t('questions.columns.theme')}</span>
            <FilterSelect options={themeOptions} value={theme} onChange={setTheme} placeholder={t('questions.generate.pickTheme')} ariaLabel={t('questions.columns.theme')} />
          </label>
          <label className="q-gen-field">
            <span className="q-gen-label">{t('questions.columns.level')}</span>
            <FilterSelect options={levelOptions} value={level} onChange={setLevel} placeholder={t('questions.generate.pickLevel')} ariaLabel={t('questions.columns.level')} />
          </label>
          <label className="q-gen-field">
            <span className="q-gen-label">{t('questions.generate.count')}</span>
            <input
              type="number"
              className="input q-gen-count"
              min={1}
              max={20}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
            />
            <span className="q-gen-hint">{t('questions.generate.countHint')}</span>
          </label>
          <p className="q-gen-note">{t('questions.generate.draftNote')}</p>
        </div>
      )}
    </Modal>
  );
}
