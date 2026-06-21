'use strict';

const db = require('../config/database');

/**
 * Journal d'audit des questions (migration 010). Écrit à chaque évènement de
 * cycle de vie (création, édition, transition, force-sync) et relu par l'onglet
 * Historique de la console (§12).
 */

/**
 * Enregistre un évènement. `executor` permet de l'inscrire dans une transaction
 * existante. Best-effort : ne doit jamais faire échouer l'opération métier — les
 * appelants encapsulent l'appel dans un try/catch silencieux.
 * @param {object} e
 * @param {string} e.questionId
 * @param {string} e.event   created|updated|submitted|approved|rejected|resubmitted|archived|force_sync
 * @param {string|null} [e.actorId]
 * @param {string|null} [e.reason]
 * @param {object} [e.meta]
 */
async function record({ questionId, event, actorId = null, reason = null, meta = {} }, executor = db) {
  await executor.query(
    `INSERT INTO question_events (question_id, event, actor_id, reason, meta)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [questionId, event, actorId, reason, JSON.stringify(meta || {})]
  );
}

/** Historique complet d'une question (avec nom de l'acteur). */
async function listByQuestion(questionId) {
  const { rows } = await db.query(
    `SELECT e.id, e.event, e.reason, e.meta, e.created_at,
            e.actor_id, u.name AS actor_name
       FROM question_events e
       LEFT JOIN users u ON u.id = e.actor_id
      WHERE e.question_id = $1
      ORDER BY e.created_at DESC`,
    [questionId]
  );
  return rows.map((r) => ({
    id: r.id,
    event: r.event,
    reason: r.reason ?? null,
    meta: r.meta || {},
    actor_id: r.actor_id ?? null,
    actor_name: r.actor_name ?? null,
    created_at: r.created_at,
  }));
}

/** Nombre de force-sync subies par une question (compteur de l'historique). */
async function countSync(questionId) {
  const { rows } = await db.query(
    "SELECT count(*)::int AS n FROM question_events WHERE question_id = $1 AND event = 'force_sync'",
    [questionId]
  );
  return rows[0].n;
}

module.exports = { record, listByQuestion, countSync };
