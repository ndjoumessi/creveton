// Helpers de localisation du CONTENU des questions (FR/EN). Le cache local et
// l'API portent `text`/`text_fr` (FR) + `text_en` (EN) au niveau question ET
// option. Règle d'or : text_fr est TOUJOURS le repli — on ne renvoie jamais une
// chaîne vide tant qu'un texte existe (cf. anti-triche : pas d'écran cassé).

/** Normalise une langue i18next (« en-US », « fr »…) en 'en' | 'fr'. */
export const normalizeLang = (lang) => (String(lang || '').startsWith('en') ? 'en' : 'fr');

/** Énoncé localisé d'une question. */
export const getQuestionText = (question, lang) => {
  if (!question) return '';
  if (normalizeLang(lang) === 'en') {
    return question.text_en || question.text_fr || question.text || '';
  }
  return question.text_fr || question.text || '';
};

/** Texte localisé d'une option. */
export const getOptionText = (option, lang) => {
  if (!option) return '';
  if (normalizeLang(lang) === 'en') {
    return option.text_en || option.text_fr || option.text || '';
  }
  return option.text_fr || option.text || '';
};
