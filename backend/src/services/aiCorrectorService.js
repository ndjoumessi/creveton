'use strict';

// Correcteur + traducteur linguistique IA (Anthropic) — proxy SERVEUR : la clé
// reste côté backend (ANTHROPIC_API_KEY), jamais exposée au frontend (cf. bundle
// public). Utilise le `fetch` global (Node 20) + AbortController (timeout).

const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const questionModel = require('../models/question.model');

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';
const TIMEOUT_MS = 15_000;

/**
 * Appel bas niveau Anthropic. Renvoie le texte brut (trim) du premier bloc.
 * @param {string} prompt
 * @param {{ maxTokens?: number, meta?: object }} [opts]
 * @throws {ApiError} AI_NOT_CONFIGURED | AI_TIMEOUT | AI_UNAVAILABLE
 */
async function callAnthropic(prompt, { maxTokens = 600, meta = {} } = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ApiError('AI_NOT_CONFIGURED');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } catch (err) {
    clearTimeout(timer);
    if (err && err.name === 'AbortError') {
      logger.warn('IA — timeout', meta);
      throw new ApiError('AI_TIMEOUT');
    }
    logger.error('IA — échec réseau', { error: err.message, ...meta });
    throw new ApiError('AI_UNAVAILABLE');
  }
  clearTimeout(timer);

  if (!res.ok) {
    logger.error('IA — réponse non-OK', { status: res.status, ...meta });
    throw new ApiError('AI_UNAVAILABLE');
  }

  let data;
  try {
    data = await res.json();
  } catch (_) {
    throw new ApiError('AI_UNAVAILABLE');
  }
  const out = (data && data.content && data.content[0] && data.content[0].text || '').trim();
  if (!out) {
    throw new ApiError('AI_UNAVAILABLE');
  }
  return out;
}

/**
 * Prompt de TRADUCTION d'un seul texte (action='translate' du correcteur). Bornes :
 * énoncé 300 / explication 500 caractères. Réponse = texte traduit uniquement.
 */
function buildTranslatePrompt(type, text) {
  const isExpl = type === 'explanation';
  const max = isExpl ? 500 : 300;
  return (
    'You are translating a Cameroonian quiz question from French to English.\n'
    + 'Translate accurately, keeping the same meaning and difficulty.\n'
    + 'Keep proper nouns (Cameroonian cities, people, institutions) as-is.\n'
    + `Maximum ${max} characters for a ${isExpl ? 'explanation' : 'statement'}.\n`
    + 'Reply ONLY with the translated text, no explanation.\n'
    + `French text: "${text}"`
  );
}

/**
 * Construit le prompt de correction selon la langue et le type de champ. Bornes :
 * énoncé 300 / explication 500 caractères. Réponse = texte corrigé uniquement.
 */
function buildPrompt(lang, type, text) {
  const isExpl = type === 'explanation';
  if (lang === 'en') {
    const what = isExpl ? 'this quiz explanation' : 'this quiz statement';
    const max = isExpl ? 500 : 300;
    return (
      `You are an educational quiz corrector. Fix spelling and grammar of ${what} in English. `
      + `Keep the same meaning. Maximum ${max} characters. Reply ONLY with the corrected text.\n\nText: ${text}`
    );
  }
  const what = isExpl ? 'cette explication' : 'cet énoncé';
  const max = isExpl ? 500 : 300;
  return (
    `Tu es un correcteur de quiz éducatif camerounais. Corrige l'orthographe et la grammaire de ${what} `
    + `de quiz en français. Garde le même sens. Maximum ${max} caractères. `
    + `Réponds UNIQUEMENT avec le texte corrigé, sans explication.\n\nTexte: ${text}`
  );
}

/**
 * Corrige (ou traduit, si action='translate') un texte. Renvoie la chaîne résultat.
 * @param {{ text: string, lang?: 'fr'|'en', type?: 'statement'|'explanation', action?: 'correct'|'translate' }} p
 * @returns {Promise<string>} texte corrigé/traduit (trim)
 */
async function improveText({ text, lang = 'fr', type = 'statement', action = 'correct' }) {
  const prompt = action === 'translate'
    ? buildTranslatePrompt(type, text)
    : buildPrompt(lang, type, text);
  return callAnthropic(prompt, { meta: { type, lang, action } });
}

/**
 * Prompt de TRADUCTION d'une question complète (énoncé + options) en JSON, dans
 * le sens donné. Utilisé par l'auto-traduction (création/import) et le bouton
 * « Traduire » de la console.
 * @param {'fr'|'en'} sourceLang  langue SOURCE
 * @param {string} text           énoncé source
 * @param {string[]} optionTexts  textes des options (langue source)
 */
function buildQuestionTranslatePrompt(sourceLang, text, optionTexts) {
  if (sourceLang === 'fr') {
    return (
      'You are translating a Cameroonian educational quiz question from French to English.\n'
      + 'Translate accurately. Keep proper nouns (cities, people, institutions) as-is.\n'
      + 'Return ONLY valid JSON, no explanation:\n'
      + '{\n  "text_en": "translated question",\n  "options_en": ["option A", "option B", "option C", "option D"]\n}\n'
      + `French question: "${text}"\n`
      + `French options: ${JSON.stringify(optionTexts)}`
    );
  }
  return (
    'You are translating a Cameroonian educational quiz question from English to French.\n'
    + 'Translate accurately. Keep proper nouns (cities, people, institutions) as-is.\n'
    + 'Return ONLY valid JSON, no explanation:\n'
    + '{\n  "text_fr": "question traduite",\n  "options_fr": ["option A", "option B", "option C", "option D"]\n}\n'
    + `English question: "${text}"\n`
    + `English options: ${JSON.stringify(optionTexts)}`
  );
}

/** Parse une réponse JSON Claude (tolère un éventuel fence markdown). */
function parseJsonResponse(raw) {
  let clean = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  if (!clean.startsWith('{')) {
    const s = clean.indexOf('{');
    const e = clean.lastIndexOf('}');
    if (s !== -1 && e !== -1 && e > s) clean = clean.slice(s, e + 1);
  }
  return JSON.parse(clean);
}

/**
 * Auto-traduction d'une question stockée. Détermine le sens selon `sourceLang` et
 * remplit la langue cible manquante (énoncé + chaque option), puis persiste via
 * `applyTranslation` (bump version pour le delta sync, success_rate préservé).
 *
 * @param {string} questionId
 * @param {'fr'|'en'} [sourceLang='fr']
 * @returns {Promise<{ translated: boolean, targetLang?: 'en'|'fr', reason?: string,
 *   text_en?: string, text_fr?: string }>}
 */
async function autoTranslate(questionId, sourceLang = 'fr') {
  const row = await questionModel.findByIdAny(questionId);
  if (!row || row.deleted_at) return { translated: false, reason: 'not_found' };

  const options = Array.isArray(row.options) ? row.options : [];
  const targetLang = sourceLang === 'fr' ? 'en' : 'fr';

  // Source présente ? (sinon rien à traduire)
  const sourceText = sourceLang === 'fr' ? row.text_fr : row.text_en;
  if (!sourceText) return { translated: false, reason: 'no_source' };

  const sourceOptionTexts = options.map((o) => (sourceLang === 'fr' ? o.text : (o.text_en || o.text)) || '');
  const prompt = buildQuestionTranslatePrompt(sourceLang, sourceText, sourceOptionTexts);
  const raw = await callAnthropic(prompt, { maxTokens: 1500, meta: { autoTranslate: true, sourceLang } });

  let parsed;
  try {
    parsed = parseJsonResponse(raw);
  } catch (err) {
    logger.warn('Auto-traduction — JSON illisible', { id: questionId, error: err.message });
    throw new ApiError('AI_UNAVAILABLE');
  }

  if (sourceLang === 'fr') {
    const textEn = String(parsed.text_en || '').trim();
    const optsEn = Array.isArray(parsed.options_en) ? parsed.options_en : [];
    if (!textEn) throw new ApiError('AI_UNAVAILABLE');
    // Fusionne text_en dans chaque option (conserve text + is_correct).
    const mergedOptions = options.map((o, i) => ({ ...o, text_en: (optsEn[i] || '').trim() || o.text_en || null }));
    const updated = await questionModel.applyTranslation(questionId, { text_en: textEn, options: mergedOptions });
    return { translated: true, targetLang, text_en: textEn, text_fr: updated ? updated.text_fr : row.text_fr };
  }

  // EN → FR (cas limite : question créée en anglais sans FR).
  const textFr = String(parsed.text_fr || '').trim();
  const optsFr = Array.isArray(parsed.options_fr) ? parsed.options_fr : [];
  if (!textFr) throw new ApiError('AI_UNAVAILABLE');
  const mergedOptions = options.map((o, i) => ({ ...o, text: (optsFr[i] || '').trim() || o.text }));
  const updated = await questionModel.applyTranslation(questionId, { text_fr: textFr, options: mergedOptions });
  return { translated: true, targetLang, text_fr: textFr, text_en: updated ? updated.text_en : row.text_en };
}

module.exports = { improveText, autoTranslate, buildPrompt, buildTranslatePrompt, buildQuestionTranslatePrompt };
