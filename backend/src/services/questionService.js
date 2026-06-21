'use strict';

const crypto = require('crypto');
const db = require('../config/database');
const ApiError = require('../utils/ApiError');
const questionModel = require('../models/question.model');
const deltaSync = require('../utils/deltaSync');

/**
 * Logique métier des questions & synchronisation (réf. spec §5).
 *  - tirage aléatoire anti-répétition (3 dernières parties)
 *  - delta sync (new / updated / deleted_ids depuis un timestamp)
 *  - détection de doublons par hash du texte
 *  - recalcul nocturne de success_rate (batch)
 */

const RECENT_SESSIONS = 3; // anti-répétition : exclure les 3 dernières parties

/** Génère un seed court (6 hex, ex. "a3f9c1") comme dans le contrat §5. */
function generateSeed() {
  return crypto.randomBytes(3).toString('hex');
}

/** Normalise un texte pour la comparaison de doublons (casse + espaces). */
function normalizeText(text) {
  return String(text).toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Hash stable du texte normalisé (détection de doublons intra-lot). */
function hashText(text) {
  return crypto.createHash('sha256').update(normalizeText(text)).digest('hex');
}

/**
 * GET /questions — set de questions pour démarrer une partie.
 *
 * Challenge (seed fourni par le client) : tirage déterministe partagé, SANS
 * anti-répétition (sinon les deux joueurs auraient des sets différents).
 * Solo (pas de seed) : on génère un seed et on exclut les questions des 3
 * dernières parties ; si le pool est trop réduit, on complète pour atteindre
 * `count` plutôt que de renvoyer moins.
 *
 * @returns {Promise<{ data: object[], seed: string }>}
 */
async function getQuestionSet({ userId, theme, level, count = 10, seed }) {
  const isChallenge = Boolean(seed);
  const effectiveSeed = isChallenge ? String(seed) : generateSeed();

  const excludeIds = isChallenge ? [] : await questionModel.recentQuestionIds(userId, RECENT_SESSIONS);

  let rows = await questionModel.pickRandom({
    theme: theme ?? null,
    level: level ?? null,
    count,
    excludeIds,
    seed: effectiveSeed,
  });

  // Solo : compléter si l'anti-répétition a trop vidé le pool (best-effort,
  // sans exclusion). Non appliqué en challenge pour préserver le déterminisme.
  if (!isChallenge && rows.length < count && excludeIds.length) {
    const seen = new Set(rows.map((r) => r.id));
    const fill = await questionModel.pickRandom({
      theme: theme ?? null,
      level: level ?? null,
      count,
      excludeIds: [],
      seed: effectiveSeed,
    });
    for (const row of fill) {
      if (rows.length >= count) break;
      if (!seen.has(row.id)) {
        rows.push(row);
        seen.add(row.id);
      }
    }
  }

  if (rows.length === 0) {
    throw new ApiError('NO_QUESTIONS_AVAILABLE');
  }

  return {
    data: rows.map((row) => questionModel.toPlayerView(row)),
    seed: effectiveSeed,
  };
}

/**
 * GET /questions/delta — synchronisation incrémentale depuis `since`.
 * @returns {Promise<{ new, updated, deleted_ids, synced_at }>}
 */
async function getDelta(sinceValue) {
  const since = deltaSync.parseSince(sinceValue); // → INVALID_TIMESTAMP si mal formé
  // Borne haute figée AVANT les requêtes : pas de fuite des écritures
  // concurrentes, et idempotence (le prochain sync repart de synced_at).
  const syncedAt = await questionModel.serverNow();

  const [rows, deletedIds] = await Promise.all([
    questionModel.changedSince(since, syncedAt),
    questionModel.deletedSince(since, syncedAt),
  ]);

  return deltaSync.buildDeltaResponse({
    rows,
    deletedIds,
    since,
    syncedAt,
    project: (row) => questionModel.toPlayerView(row),
  });
}

/**
 * GET /questions/all — snapshot complet paginé (premier lancement).
 * @returns {Promise<{ data, page, synced_at }>}
 */
async function getAll({ limit = 200, cursor = null }) {
  const syncedAt = await questionModel.serverNow();
  const { rows, hasMore, nextCursor } = await questionModel.listAllApproved({ limit, cursor });
  return {
    data: rows.map((row) => questionModel.toPlayerView(row)),
    page: { limit, next_cursor: nextCursor, has_more: hasMore },
    synced_at: deltaSync.toIso(syncedAt),
  };
}

/**
 * Vérifie si un texte de question est un doublon (déjà en base).
 * @returns {Promise<boolean>}
 */
async function isDuplicate(text) {
  return questionModel.existsByNormalizedText(normalizeText(text));
}

/**
 * Recalcul nocturne du taux de réussite par question (batch).
 *
 * success_rate = (réponses correctes) / (réponses totales), agrégé depuis
 * game_sessions.answers (JSONB). `windowDays` limite éventuellement la fenêtre.
 *
 * IMPORTANT : success_rate N'EST PAS exposé dans la vue joueur (§15) — il ne
 * doit donc pas déclencher de delta sync. On désactive le trigger updated_at le
 * temps du batch pour éviter de marquer toutes les questions comme « modifiées »
 * (sinon full re-sync nocturne pour tous les clients). Le DISABLE TRIGGER est
 * transactionnel : un ROLLBACK le rétablit automatiquement.
 *
 * @param {object} [opts]
 * @param {number|null} [opts.windowDays=null]
 * @returns {Promise<{ updated: number }>}
 */
async function recomputeSuccessRates({ windowDays = null } = {}) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await client.query('ALTER TABLE questions DISABLE TRIGGER set_questions_updated_at');

    const windowClause = windowDays
      ? `WHERE gs.played_at >= now() - ($1 || ' days')::interval`
      : '';
    const params = windowDays ? [windowDays] : [];

    const res = await client.query(
      `WITH attempts AS (
         SELECT (a->>'question_id')::uuid AS qid,
                COALESCE((a->>'is_correct')::boolean, false) AS is_correct
           FROM game_sessions gs
           CROSS JOIN LATERAL jsonb_array_elements(gs.answers) AS a
           ${windowClause}
       ),
       stats AS (
         SELECT qid,
                avg(CASE WHEN is_correct THEN 1.0 ELSE 0.0 END)::float AS rate
           FROM attempts
          WHERE qid IS NOT NULL
          GROUP BY qid
       )
       UPDATE questions q
          SET success_rate = stats.rate
         FROM stats
        WHERE q.id = stats.qid`,
      params
    );

    await client.query('ALTER TABLE questions ENABLE TRIGGER set_questions_updated_at');
    await client.query('COMMIT');
    return { updated: res.rowCount };
  } catch (err) {
    await client.query('ROLLBACK'); // rétablit aussi le trigger (DDL transactionnel)
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Opérations ADMIN (spec §12) — workflow, CRUD, force-sync.
// ---------------------------------------------------------------------------

// Transitions de statut autorisées (workflow de modération §12).
const STATUS_TRANSITIONS = {
  draft: ['review'],
  review: ['approved', 'rejected'],
  approved: ['archived'],
  rejected: ['review'],
  archived: [],
};

/** Compte les options marquées correctes. */
function correctOptionCount(options) {
  return (options || []).filter((o) => o.is_correct).length;
}

/**
 * POST /admin/questions — crée une question (statut forcé à `draft`, jamais
 * approved directement). Valide « exactement une bonne réponse » et l'unicité.
 */
async function createByAdmin(input, createdBy) {
  if (correctOptionCount(input.options) !== 1) {
    throw new ApiError('INVALID_CORRECT_OPTION_COUNT');
  }
  if (await isDuplicate(input.text_fr)) {
    throw new ApiError('DUPLICATE_QUESTION');
  }
  const correctIndex = input.options.findIndex((o) => o.is_correct);
  const row = await questionModel.create({
    text_fr: input.text_fr,
    text_en: input.text_en ?? null,
    type: input.type || 'mcq',
    options: input.options,
    correct_index: correctIndex,
    theme: input.theme,
    level: input.level,
    explanation: input.explanation ?? null,
    media_url: input.media_url ?? null,
    source: input.source || 'manual',
    status: 'draft', // jamais publié directement (spec §12)
    created_by: createdBy,
  });
  return questionModel.toAdminView(row);
}

/**
 * PATCH /admin/questions/:id — modifie une question (version++, success_rate
 * réinitialisé si la solution change). Recalcule correct_index si options change.
 */
async function updateByAdmin(id, fields) {
  const existing = await questionModel.findByIdAny(id);
  if (!existing || existing.deleted_at) throw new ApiError('QUESTION_NOT_FOUND');

  const patch = { ...fields };
  if (fields.options !== undefined) {
    if (correctOptionCount(fields.options) !== 1) {
      throw new ApiError('INVALID_CORRECT_OPTION_COUNT');
    }
    patch.correct_index = fields.options.findIndex((o) => o.is_correct);
  }
  const row = await questionModel.update(id, patch);
  if (!row) throw new ApiError('QUESTION_NOT_FOUND');
  return questionModel.toAdminView(row);
}

/**
 * POST /admin/questions/:id/transition — change le statut selon le workflow.
 * @param {string} [_reason]  motif (requis si `to === 'rejected'`, validé en
 *   amont) — accepté pour l'audit, non persisté (pas de colonne dédiée).
 */
async function transitionStatus(id, to, _reason) {
  const existing = await questionModel.findByIdAny(id);
  if (!existing || existing.deleted_at) throw new ApiError('QUESTION_NOT_FOUND');

  const allowed = STATUS_TRANSITIONS[existing.status] || [];
  if (!allowed.includes(to)) {
    throw new ApiError('VALIDATION_ERROR', {
      message: `Transition interdite : ${existing.status} → ${to}.`,
      details: [{ field: 'to', issue: 'invalid_transition', expected: allowed.join(' | ') || 'aucune' }],
    });
  }
  const row = await questionModel.setStatus(id, to);
  return questionModel.toAdminView(row);
}

/** DELETE /admin/questions/:id — soft delete (deleted_at + archived). */
async function softDeleteByAdmin(id) {
  const existing = await questionModel.findByIdAny(id);
  if (!existing) throw new ApiError('QUESTION_NOT_FOUND');
  const row = await questionModel.softDelete(id);
  // Déjà supprimée → idempotent : on renvoie la vue existante.
  return questionModel.toAdminView(row || existing);
}

/** Liste admin paginée (curseur opaque = offset). */
async function listForAdmin({ status, theme, level, q, limit = 20, cursor }) {
  // Pagination simple par offset encodé dans le curseur.
  const offset = Math.max(0, parseInt(cursor, 10) || 0);
  const { rows, hasMore } = await questionModel.listAdmin({ status, theme, level, q, limit, offset });
  return {
    data: rows.map((r) => questionModel.toAdminView(r)),
    page: { limit, next_cursor: hasMore ? String(offset + limit) : null, has_more: hasMore },
  };
}

module.exports = {
  getQuestionSet,
  getDelta,
  getAll,
  isDuplicate,
  recomputeSuccessRates,
  generateSeed,
  normalizeText,
  hashText,
  RECENT_SESSIONS,
  // admin
  createByAdmin,
  updateByAdmin,
  transitionStatus,
  softDeleteByAdmin,
  listForAdmin,
  STATUS_TRANSITIONS,
};

// Exécution directe : `node src/services/questionService.js` lance le batch
// success_rate (à brancher sur un cron nocturne — CDC §4.2).
if (require.main === module) {
  const logger = require('../config/logger');
  recomputeSuccessRates()
    .then((res) => logger.info('Batch success_rate terminé', res))
    .then(() => db.close())
    .then(() => process.exit(0))
    .catch(async (err) => {
      logger.error('Batch success_rate échoué', { error: err.message });
      try {
        await db.close();
      } catch (_) {
        /* ignore */
      }
      process.exit(1);
    });
}
