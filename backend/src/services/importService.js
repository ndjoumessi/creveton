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

// Seuils de similarité trigramme (CDC §3.3, détection multi-niveaux).
//   > 0.85           → quasi-doublon : rejet automatique (non forçable).
//   ]0.70 ; 0.85]    → ressemblance forte : avertissement (forçable à l'import).
//   ≤ 0.70           → considéré comme nouveau.
const SIMILARITY_WARN = 0.7;
const SIMILARITY_REJECT = 0.85;

/** Arrondi à 2 décimales pour un rapport lisible (0.8537 → 0.85). */
function round2(n) {
  return Math.round(n * 100) / 100;
}

/** Pourcentage entier pour les libellés (0.853 → 85). */
function pctOf(n) {
  return Math.round(n * 100);
}

/** Compare deux jeux d'options (texte + bonne réponse) indépendamment de l'ordre. */
function optionsDiffer(a, b) {
  const norm = (opts) =>
    (Array.isArray(opts) ? opts : [])
      .map((o) => `${String(o.text || '').trim().toLowerCase()}|${o.is_correct ? 1 : 0}`)
      .sort()
      .join('§');
  return norm(a) !== norm(b);
}

/**
 * Importe un CSV avec détection de doublons multi-niveaux (CDC §3.3).
 *
 * Niveau 1 — hash exact : texte identique en base → REJET (« doublon exact »).
 * Niveau 2 — similarité pg_trgm : >0.85 → REJET (quasi-doublon) ; 0.70–0.85 →
 *            AVERTISSEMENT (non inséré sauf `force`).
 * Niveau 3 — même texte mais options modifiées → AVERTISSEMENT.
 *
 * Les lignes en avertissement ne sont PAS insérées par défaut ; l'admin peut les
 * forcer (`force: true`, bouton « Forcer l'import » côté console). Les rejets durs
 * (validation, doublon exact, similarité >0.85) ne sont jamais insérés.
 *
 * @param {Buffer} buffer
 * @param {object} [opts]
 * @param {string|null} [opts.createdBy]  admin à l'origine de l'import.
 * @param {boolean} [opts.persist=true]   insérer en base (false = dry-run).
 * @param {boolean} [opts.force=false]    insérer aussi les lignes en avertissement.
 * @returns {Promise<{ total, accepted, rejected, warnings, inserted, errors, warnings_list }>}
 */
async function importCsv(buffer, { createdBy = null, persist = true, force = false } = {}) {
  const raws = await parseBuffer(buffer);

  const toInsert = []; // questions effectivement insérables (propres + forcées)
  const errors = []; // rejets durs
  const warningsList = []; // avertissements (forçables)
  const seenHashes = new Set(); // doublons intra-lot (exacts)

  // Ligne 1 = en-têtes ; la 1re ligne de données est la ligne 2 du fichier.
  let line = 1;
  for (const raw of raws) {
    line += 1;
    const result = validateRow(raw);
    if (!result.ok) {
      errors.push({ row: line, issue: result.errors.join(' ; ') });
      continue;
    }
    const importedText = result.question.text_fr;

    // Doublon intra-lot (texte identique plus haut dans le même fichier).
    if (seenHashes.has(result.hash)) {
      errors.push({ row: line, issue: 'doublon dans le fichier (texte identique)' });
      continue;
    }
    seenHashes.add(result.hash);

    // Niveau 1 — doublon exact en base.
    const exact = await questionModel.findExactDuplicate(result.hash, result.normalized);
    if (exact) {
      // Niveau 3 — même texte, options modifiées → avertissement (forçable).
      if (optionsDiffer(result.question.options, exact.options)) {
        warningsList.push({
          row: line,
          issue: 'question existante avec des options modifiées',
          similar_to: exact.id,
          similarity: 1,
          existing_text: exact.text_fr,
          imported_text: importedText,
        });
        if (force) toInsert.push(result.question);
      } else {
        errors.push({
          row: line,
          issue: 'doublon exact',
          existing_id: exact.id,
          existing_text: exact.text_fr,
          imported_text: importedText,
        });
      }
      continue;
    }

    // Niveau 2 — quasi-doublons par similarité trigramme.
    const [top] = await questionModel.findSimilar(importedText, SIMILARITY_WARN, 3);
    if (top && top.sim > SIMILARITY_REJECT) {
      errors.push({
        row: line,
        issue: `question similaire à ${pctOf(top.sim)}%`,
        similar_to: top.id,
        similarity: round2(top.sim),
        existing_text: top.text_fr,
        imported_text: importedText,
      });
      continue;
    }
    if (top) {
      // 0.70 < sim ≤ 0.85 → avertissement (non inséré sauf force).
      warningsList.push({
        row: line,
        issue: `question similaire à ${pctOf(top.sim)}%`,
        similar_to: top.id,
        similarity: round2(top.sim),
        existing_text: top.text_fr,
        imported_text: importedText,
      });
      if (force) toInsert.push(result.question);
      continue;
    }

    // Aucun conflit → question propre, acceptée.
    toInsert.push(result.question);
  }

  let inserted = 0;
  const insertedIds = [];
  if (persist) {
    for (const question of toInsert) {
      const row = await questionModel.create({ ...question, created_by: createdBy });
      inserted += 1;
      if (row && row.id) insertedIds.push(row.id);
    }
  }

  // Chaque ligne tombe dans EXACTEMENT une catégorie : rejet dur, avertissement,
  // ou propre (accepted). accepted + warnings + rejected = total. `inserted` vaut
  // accepted, plus les avertissements si `force` (les lignes forcées sont écrites
  // mais restent comptées comme avertissements dans le rapport).
  const accepted = toInsert.length - (force ? warningsList.length : 0);

  return {
    total: raws.length,
    accepted,
    rejected: errors.length,
    warnings: warningsList.length,
    inserted,
    inserted_ids: insertedIds,
    errors,
    warnings_list: warningsList,
  };
}

module.exports = { importCsv, validateRow, parseBuffer, optionsDiffer, SIMILARITY_WARN, SIMILARITY_REJECT };
