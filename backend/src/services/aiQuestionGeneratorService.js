'use strict';

// Génération assistée de questions (proxy Anthropic serveur). Réutilise le proxy
// existant (`aiCorrectorService.callAnthropic` / `parseJsonResponse`) plutôt que
// d'en créer un nouveau. Les questions générées sont insérées en `status='draft'`
// + `source='ai_generated'` : INVISIBLES pour l'app (le delta sync ne sert que
// `approved`). Relecture humaine obligatoire avant publication (voir
// questionService.approveDraft / rejectDraft).

const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const { callAnthropic, parseJsonResponse, autoTranslate } = require('./aiCorrectorService');
const questionModel = require('../models/question.model');
const questionService = require('./questionService');

const LEVEL_GUIDANCE = {
  beginner: 'grand public, faits très connus, accessibles à un débutant (12-15 ans)',
  intermediate: 'connaissances solides, un cran au-dessus de la culture générale de base',
  expert: 'pointu mais factuel, pour un joueur averti — jamais obscur ni piège',
};

/** Formate quelques exemples existants pour calibrer le ton dans le prompt. */
function formatSamples(samples) {
  if (!samples || samples.length === 0) return '';
  const lines = samples
    .slice(0, 4)
    .map((s, i) => {
      const opts = Array.isArray(s.options) ? s.options.map((o) => o.text).filter(Boolean) : [];
      return `Exemple ${i + 1} (niveau ${s.level}) : "${s.text_fr}" | options : ${JSON.stringify(opts)}`
        + (s.explanation ? ` | explication : "${s.explanation}"` : '');
    })
    .join('\n');
  return `\nVoici des questions existantes de ce thème pour calibrer le ton et le style (imite-les, ne les copie pas) :\n${lines}\n`;
}

/** Construit le prompt de génération d'un lot de N questions FR. */
function buildGenerationPrompt({ theme, level, count, samples }) {
  return (
    'Tu es un concepteur de quiz pour une application camerounaise (joueurs 12-30 ans).\n'
    + `Génère EXACTEMENT ${count} questions à choix multiple, en FRANÇAIS, sur le thème « ${theme} », `
    + `niveau « ${level} » (${LEVEL_GUIDANCE[level] || 'niveau standard'}).\n\n`
    + 'Règles STRICTES :\n'
    + '- Chaque question a 4 options, UNE SEULE bonne réponse.\n'
    + '- Uniquement des FAITS vérifiables et NON ambigus. Évite toute question à réponse '
    + 'discutable, subjective, ou dépendante de l\'actualité récente.\n'
    + '- Explication courte (< 200 caractères) qui justifie la bonne réponse.\n'
    + '- Les 3 mauvaises options doivent être plausibles mais clairement fausses.\n'
    + '- Pas de doublons entre les questions du lot.\n'
    + '- Adapte la difficulté au niveau demandé.\n'
    + formatSamples(samples)
    + '\nRéponds UNIQUEMENT avec un objet JSON valide, sans texte autour, de cette forme '
    + '(la clé "questions" contient le tableau) :\n'
    + '{\n'
    + '  "questions": [\n'
    + '    {\n'
    + '      "text_fr": "énoncé de la question ?",\n'
    + '      "options": ["option A", "option B", "option C", "option D"],\n'
    + '      "correct_index": 0,\n'
    + '      "explanation": "pourquoi c\'est la bonne réponse"\n'
    + '    }\n'
    + '  ]\n'
    + '}'
  );
}

/**
 * Valide et normalise un item IA vers la forme attendue par questionModel.create.
 * Renvoie null si la structure est invalide (l'item est alors ignoré).
 */
function normalizeItem(item, theme, level) {
  if (!item || typeof item !== 'object') return null;
  const text = typeof item.text_fr === 'string' ? item.text_fr.trim() : '';
  const opts = Array.isArray(item.options) ? item.options.map((o) => (typeof o === 'string' ? o.trim() : '')) : [];
  const ci = Number(item.correct_index);
  if (text.length < 3) return null;
  if (opts.length !== 4 || opts.some((o) => !o)) return null;
  if (!Number.isInteger(ci) || ci < 0 || ci > 3) return null;
  const explanation = typeof item.explanation === 'string' ? item.explanation.trim() : null;
  return {
    text_fr: text,
    type: 'mcq',
    theme,
    level,
    options: opts.map((t, i) => ({ text: t, is_correct: i === ci })),
    explanation: explanation || null,
    source: 'ai_generated',
  };
}

/** Auto-traduction FR→EN d'un brouillon (fire-and-forget), comme la création manuelle. */
function fireAutoTranslate(id) {
  if (!process.env.ANTHROPIC_API_KEY) return;
  autoTranslate(id, 'fr').catch((err) =>
    logger.warn('Auto-traduction brouillon FR→EN échouée', { id, error: err.message })
  );
}

/**
 * Génère un lot de brouillons. Appelle l'IA UNE fois pour tout le lot (limité à
 * 20 par appel côté validateur pour borner le risque d'erreur groupée). Chaque
 * item valide et non-dupliqué est inséré en brouillon via questionService.createByAdmin
 * (dédup + comptage exact d'une bonne réponse + audit réutilisés).
 *
 * @returns {Promise<{ requested:number, created:object[], skipped_duplicates:number, skipped_invalid:number }>}
 */
async function generateDrafts({ theme, level, count, createdBy }) {
  const samples = await questionModel.sampleForGeneration(theme, level, 4);
  const prompt = buildGenerationPrompt({ theme, level, count, samples });
  // Sortie longue (jusqu'à ~8000 tokens pour 20 questions structurées) → bien
  // plus lente qu'une correction de texte. On surcharge le timeout du correcteur
  // (15 s) par un timeout dédié qui grandit avec la taille du lot : base 40 s
  // + 4 s/question, plafonné à 120 s (< la limite proxy Railway de 300 s).
  const timeoutMs = Math.min(120_000, 40_000 + count * 4_000);
  const raw = await callAnthropic(prompt, {
    maxTokens: Math.min(8000, 400 * count + 500),
    meta: { generate: true, theme, level, count },
    timeoutMs,
  });

  let parsed;
  try {
    parsed = parseJsonResponse(raw);
  } catch (err) {
    logger.warn('Génération — JSON illisible', { theme, level, error: err.message });
    throw new ApiError('AI_UNAVAILABLE');
  }
  const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed.questions) ? parsed.questions : [];

  const created = [];
  let skippedDuplicates = 0;
  let skippedInvalid = 0;

  for (const item of items) {
    const normalized = normalizeItem(item, theme, level);
    if (!normalized) {
      skippedInvalid += 1;
      continue;
    }
    try {
      // createByAdmin force status='draft' ; on passe source='ai_generated'.
      const draft = await questionService.createByAdmin(normalized, createdBy);
      created.push(draft);
      fireAutoTranslate(draft.id);
    } catch (err) {
      if (err && err.code === 'DUPLICATE_QUESTION') skippedDuplicates += 1;
      else skippedInvalid += 1;
    }
  }

  return {
    requested: count,
    created,
    skipped_duplicates: skippedDuplicates,
    skipped_invalid: skippedInvalid,
  };
}

module.exports = { generateDrafts, buildGenerationPrompt, normalizeItem };
