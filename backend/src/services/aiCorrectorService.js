'use strict';

// Correcteur linguistique IA (Anthropic) — proxy SERVEUR : la clé reste côté
// backend (ANTHROPIC_API_KEY), jamais exposée au frontend (cf. bundle public).
// Utilise le `fetch` global (Node 20) + AbortController pour un timeout de 10 s.

const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';
const TIMEOUT_MS = 10_000;

/**
 * Construit le prompt selon la langue et le type de champ. Bornes de longueur :
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
 * Appelle Anthropic pour corriger un texte. Renvoie la chaîne corrigée.
 * @param {{ text: string, lang?: 'fr'|'en', type?: 'statement'|'explanation' }} p
 * @returns {Promise<string>} texte corrigé (trim)
 * @throws {ApiError} AI_NOT_CONFIGURED | AI_TIMEOUT | AI_UNAVAILABLE
 */
async function improveText({ text, lang = 'fr', type = 'statement' }) {
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
        max_tokens: 600,
        messages: [{ role: 'user', content: buildPrompt(lang, type, text) }],
      }),
    });
  } catch (err) {
    clearTimeout(timer);
    if (err && err.name === 'AbortError') {
      logger.warn('Correcteur IA — timeout', { type, lang });
      throw new ApiError('AI_TIMEOUT');
    }
    logger.error('Correcteur IA — échec réseau', { error: err.message });
    throw new ApiError('AI_UNAVAILABLE');
  }
  clearTimeout(timer);

  if (!res.ok) {
    logger.error('Correcteur IA — réponse non-OK', { status: res.status });
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

module.exports = { improveText, buildPrompt };
