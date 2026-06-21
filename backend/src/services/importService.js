'use strict';

const { Readable } = require('stream');
const csv = require('csv-parser');

const { THEMES, LEVELS } = require('../utils/constants');
const questionModel = require('../models/question.model');
const questionService = require('./questionService');

/**
 * Import de questions par lot CSV (réf. CDC §3.3).
 *
 * Pipeline : parsing → validation de schéma → détection de doublons (intra-lot
 * + base) → insertion des lignes acceptées (statut `pending_review`, source `import`) →
 * rapport lignes acceptées / rejetées (avec n° de ligne et motifs).
 *
 * Template attendu (en-têtes) :
 *   question, option_a, option_b, option_c, option_d, correct, difficulty,
 *   category, explanation, language
 * où `correct` ∈ {A,B,C,D}, `category` = thème, `difficulty` = niveau.
 */

const LETTER_INDEX = { A: 0, B: 1, C: 2, D: 3 };

/** Parse un buffer CSV en tableau d'objets (clé = en-tête). */
function parseBuffer(buffer) {
  return new Promise((resolve, reject) => {
    const rows = [];
    Readable.from(buffer)
      .pipe(csv())
      .on('data', (row) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

/**
 * Valide une ligne brute et la transforme en question prête à insérer.
 * @returns {{ ok: true, question, normalized, hash } | { ok: false, errors: string[] }}
 */
function validateRow(raw) {
  const errors = [];

  const question = String(raw.question || '').trim();
  if (question.length < 3) errors.push('question manquante ou trop courte (min 3 caractères)');

  const optionTexts = [raw.option_a, raw.option_b, raw.option_c, raw.option_d].map((o) =>
    String(o || '').trim()
  );
  if (optionTexts.filter(Boolean).length < 2) errors.push('au moins 2 options non vides requises');

  const correctLetter = String(raw.correct || '').trim().toUpperCase();
  if (!(correctLetter in LETTER_INDEX)) {
    errors.push(`« correct » invalide (attendu A–D), reçu « ${raw.correct ?? ''} »`);
  } else if (!optionTexts[LETTER_INDEX[correctLetter]]) {
    errors.push(`l'option correcte ${correctLetter} est vide`);
  }

  const theme = String(raw.category || '').trim().toLowerCase();
  if (!THEMES.includes(theme)) errors.push(`thème (« category ») invalide : « ${raw.category ?? ''} »`);

  const level = String(raw.difficulty || '').trim().toLowerCase();
  if (!LEVELS.includes(level)) errors.push(`difficulté invalide : « ${raw.difficulty ?? ''} »`);

  if (errors.length) return { ok: false, errors };

  // Construit options[{text,is_correct}] en ne gardant que les non vides, puis
  // recalcule correct_index sur la liste compactée.
  const options = optionTexts
    .map((text, i) => ({ text, is_correct: i === LETTER_INDEX[correctLetter] }))
    .filter((opt) => opt.text);
  const correctIndex = options.findIndex((opt) => opt.is_correct);

  const language = String(raw.language || 'fr').trim().toLowerCase();

  return {
    ok: true,
    question: {
      text_fr: question,
      text_en: null,
      type: 'mcq',
      options,
      correct_index: correctIndex,
      theme,
      level,
      explanation: String(raw.explanation || '').trim() || null,
      media_url: null,
      source: 'import',
      status: 'pending_review', // jamais publié directement (CDC §3.3)
      language,
    },
    normalized: questionService.normalizeText(question),
    hash: questionService.hashText(question),
  };
}

/**
 * Importe un CSV.
 * @param {Buffer} buffer
 * @param {object} [opts]
 * @param {string|null} [opts.createdBy]  admin à l'origine de l'import.
 * @param {boolean} [opts.persist=true]   insérer en base (false = dry-run).
 * @returns {Promise<{ total, accepted, rejected, inserted, rejected_rows }>}
 */
async function importCsv(buffer, { createdBy = null, persist = true } = {}) {
  const raws = await parseBuffer(buffer);

  const accepted = [];
  const rejectedRows = [];
  const seenHashes = new Set();

  // Ligne 1 = en-têtes ; la 1re ligne de données est la ligne 2 du fichier.
  let line = 1;
  for (const raw of raws) {
    line += 1;
    const result = validateRow(raw);
    if (!result.ok) {
      rejectedRows.push({ line, errors: result.errors });
      continue;
    }
    if (seenHashes.has(result.hash)) {
      rejectedRows.push({ line, errors: ['doublon dans le fichier (texte identique)'] });
      continue;
    }
    if (await questionModel.existsByNormalizedText(result.normalized)) {
      rejectedRows.push({ line, errors: ['doublon : question déjà présente en base'] });
      continue;
    }
    seenHashes.add(result.hash);
    accepted.push(result.question);
  }

  let inserted = 0;
  if (persist) {
    for (const question of accepted) {
      await questionModel.create({ ...question, created_by: createdBy });
      inserted += 1;
    }
  }

  return {
    total: raws.length,
    accepted: accepted.length,
    rejected: rejectedRows.length,
    inserted,
    rejected_rows: rejectedRows,
  };
}

module.exports = { importCsv, validateRow, parseBuffer };
