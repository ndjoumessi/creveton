'use strict';

const db = require('../config/database');

/**
 * Couche d'accès aux données « transactions » (migration 007, §15).
 * Montants en INTEGER (FCFA, sans décimales). Idempotence par `reference` UNIQUE.
 */

/** Vue Transaction (§15). */
function toView(row) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    type: row.type,
    amount: row.amount != null ? Number(row.amount) : 0,
    currency: row.currency,
    provider: row.provider ?? null,
    status: row.status,
    reference: row.reference ?? null,
    created_at: row.created_at,
  };
}

/**
 * Crée une transaction. `reference` UNIQUE → l'INSERT lève 23505 si rejouée
 * (idempotence Mobile Money). Le service traduit en conflit applicatif.
 * @param {object} data
 * @param {object} [executor=db]
 */
async function create(data, executor = db) {
  const { rows } = await executor.query(
    `INSERT INTO transactions
       (user_id, type, amount, currency, provider, status, reference, external_id, tournament_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
     RETURNING *`,
    [
      data.user_id,
      data.type,
      data.amount,
      data.currency || 'XAF',
      data.provider ?? null,
      data.status || 'pending',
      data.reference ?? null,
      data.external_id ?? null,
      data.tournament_id ?? null,
      JSON.stringify(data.metadata || {}),
    ]
  );
  return rows[0];
}

async function findById(id) {
  const { rows } = await db.query('SELECT * FROM transactions WHERE id = $1', [id]);
  return rows[0] || null;
}

/** Recherche par référence métier (idempotence). */
async function findByReference(reference) {
  const { rows } = await db.query('SELECT * FROM transactions WHERE reference = $1', [reference]);
  return rows[0] || null;
}

/** Historique paginé (offset) d'un utilisateur. */
async function listByUser(userId, { limit = 20, offset = 0 } = {}) {
  const { rows } = await db.query(
    `SELECT * FROM transactions
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3`,
    [userId, limit + 1, offset]
  );
  const hasMore = rows.length > limit;
  return { rows: hasMore ? rows.slice(0, limit) : rows, hasMore };
}

/** Met à jour le statut (transitions Mobile Money). */
async function setStatus(id, status, executor = db) {
  const { rows } = await executor.query(
    'UPDATE transactions SET status = $2 WHERE id = $1 RETURNING *',
    [id, status]
  );
  return rows[0] || null;
}

module.exports = { toView, create, findById, findByReference, listByUser, setStatus };
