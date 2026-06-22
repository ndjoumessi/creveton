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

/** Total des recharges en attente (affiché dans GET /wallet → `pending`). */
async function pendingTotal(userId) {
  const { rows } = await db.query(
    `SELECT COALESCE(SUM(amount), 0)::int AS total
       FROM transactions
      WHERE user_id = $1 AND status = 'pending' AND type = 'deposit'`,
    [userId]
  );
  return rows[0].total;
}

/** Met à jour le statut (transitions Mobile Money). */
async function setStatus(id, status, executor = db) {
  const { rows } = await executor.query(
    'UPDATE transactions SET status = $2 WHERE id = $1 RETURNING *',
    [id, status]
  );
  return rows[0] || null;
}

/* ─── Vue admin (console Finances) ─────────────────────────────────────────── */

const TZ = 'Africa/Douala'; // fuseau de référence pour le groupage par jour/mois.

/** Vue admin enrichie (JOIN users pour email/nom). */
function toAdminView(row) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    user_email: row.user_email ?? null,
    user_name: row.user_name ?? null,
    type: row.type,
    amount: row.amount != null ? Number(row.amount) : 0,
    currency: row.currency,
    provider: row.provider ?? null,
    status: row.status,
    reference: row.reference ?? null,
    created_at: row.created_at,
  };
}

/** Construit la clause WHERE des filtres admin (status/type/provider/from/to). */
function buildFilters({ status, type, provider, from, to } = {}) {
  const cond = [];
  const params = [];
  if (status) { params.push(status); cond.push(`t.status = $${params.length}`); }
  if (type) { params.push(type); cond.push(`t.type = $${params.length}`); }
  if (provider) { params.push(provider); cond.push(`t.provider = $${params.length}`); }
  if (from) { params.push(from); cond.push(`t.created_at >= $${params.length}`); }
  if (to) { params.push(to); cond.push(`t.created_at <= $${params.length}`); }
  return { cond, params };
}

/**
 * Liste admin paginée par CURSEUR keyset sur (created_at, id) décroissant.
 * Le curseur est l'`id` de la dernière ligne reçue (stable sous insertions).
 * @returns {Promise<{rows: object[], hasMore: boolean}>}
 */
async function listAdmin({ status, type, provider, from, to, limit = 20, cursor = null } = {}) {
  const { cond, params } = buildFilters({ status, type, provider, from, to });
  if (cursor) {
    params.push(cursor);
    // Borne keyset : antérieur au curseur dans l'ordre (created_at DESC, id DESC).
    cond.push(`(t.created_at, t.id) < (SELECT created_at, id FROM transactions WHERE id = $${params.length})`);
  }
  const whereSql = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  params.push(limit + 1);
  const { rows } = await db.query(
    `SELECT t.*, u.email AS user_email, u.name AS user_name
       FROM transactions t
       JOIN users u ON u.id = t.user_id
       ${whereSql}
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT $${params.length}`,
    params
  );
  const hasMore = rows.length > limit;
  return { rows: hasMore ? rows.slice(0, limit) : rows, hasMore };
}

/** Export admin (mêmes filtres, sans pagination, plafonné). */
async function listForExport({ status, type, provider, from, to } = {}, cap = 10000) {
  const { cond, params } = buildFilters({ status, type, provider, from, to });
  const whereSql = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  params.push(cap);
  const { rows } = await db.query(
    `SELECT t.*, u.email AS user_email, u.name AS user_name
       FROM transactions t
       JOIN users u ON u.id = t.user_id
       ${whereSql}
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT $${params.length}`,
    params
  );
  return rows;
}

/**
 * KPIs financiers : sommes ce mois vs mois précédent (fuseau Africa/Douala) +
 * total des transactions en attente. Renvoie une ligne d'agrégats bruts.
 */
async function financeSummary() {
  const { rows } = await db.query(
    `SELECT
        COALESCE(SUM(t.amount) FILTER (WHERE t.status='success' AND z.loc >= b.cur_start), 0)::bigint AS vol_cur,
        COALESCE(SUM(t.amount) FILTER (WHERE t.status='success' AND z.loc >= b.prev_start AND z.loc < b.cur_start), 0)::bigint AS vol_prev,
        COALESCE(SUM(t.amount) FILTER (WHERE t.type='deposit' AND t.status='success' AND z.loc >= b.cur_start), 0)::bigint AS dep_cur,
        COALESCE(SUM(t.amount) FILTER (WHERE t.type='deposit' AND t.status='success' AND z.loc >= b.prev_start AND z.loc < b.cur_start), 0)::bigint AS dep_prev,
        COALESCE(SUM(t.amount) FILTER (WHERE t.type='withdraw' AND t.status='success' AND z.loc >= b.cur_start), 0)::bigint AS wd_cur,
        COALESCE(SUM(t.amount) FILTER (WHERE t.type='withdraw' AND t.status='success' AND z.loc >= b.prev_start AND z.loc < b.cur_start), 0)::bigint AS wd_prev,
        COUNT(*) FILTER (WHERE t.status='pending')::int AS pending_count,
        COALESCE(SUM(t.amount) FILTER (WHERE t.status='pending'), 0)::bigint AS pending_amount
       FROM transactions t
       CROSS JOIN (
         SELECT date_trunc('month', (now() AT TIME ZONE $1)) AS cur_start,
                date_trunc('month', (now() AT TIME ZONE $1)) - interval '1 month' AS prev_start
       ) b
       CROSS JOIN LATERAL (SELECT (t.created_at AT TIME ZONE $1) AS loc) z`,
    [TZ]
  );
  const r = rows[0] || {};
  // pg renvoie bigint en string → Number() (montants FCFA, valeurs raisonnables).
  return {
    vol_cur: Number(r.vol_cur || 0),
    vol_prev: Number(r.vol_prev || 0),
    dep_cur: Number(r.dep_cur || 0),
    dep_prev: Number(r.dep_prev || 0),
    wd_cur: Number(r.wd_cur || 0),
    wd_prev: Number(r.wd_prev || 0),
    pending_count: Number(r.pending_count || 0),
    pending_amount: Number(r.pending_amount || 0),
  };
}

/**
 * Série journalière (N jours) groupée par jour calendaire dans Africa/Douala.
 * generate_series garantit exactement `days` points (zéros inclus).
 */
async function financeDaily(days = 30) {
  const { rows } = await db.query(
    `WITH d AS (
       SELECT gd::date AS day
         FROM generate_series(
           ((now() AT TIME ZONE $1)::date - ($2::int - 1)),
           (now() AT TIME ZONE $1)::date,
           interval '1 day') gd
     )
     SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
            COALESCE(SUM(t.amount) FILTER (WHERE t.type='deposit' AND t.status='success'), 0)::bigint AS deposits,
            COALESCE(SUM(t.amount) FILTER (WHERE t.type='withdraw' AND t.status='success'), 0)::bigint AS withdrawals
       FROM d
       LEFT JOIN transactions t
         ON (t.created_at AT TIME ZONE $1)::date = d.day
      GROUP BY d.day
      ORDER BY d.day`,
    [TZ, days]
  );
  return rows.map((r) => ({ date: r.date, deposits: Number(r.deposits), withdrawals: Number(r.withdrawals) }));
}

/**
 * Transition de statut par un admin (validate/reject). Journalise l'action dans
 * `metadata.admin_action` (trace co-localisée à la ligne — il n'existe pas encore
 * de table audit_events dédiée). Renvoie la ligne enrichie (JOIN users) ou null.
 */
async function adminUpdateStatus(id, status, actionMeta, executor = db) {
  const { rows } = await executor.query(
    `WITH upd AS (
       UPDATE transactions
          SET status = $2,
              metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('admin_action', $3::jsonb)
        WHERE id = $1
        RETURNING *
     )
     SELECT upd.*, u.email AS user_email, u.name AS user_name
       FROM upd JOIN users u ON u.id = upd.user_id`,
    [id, status, JSON.stringify(actionMeta || {})]
  );
  return rows[0] || null;
}

module.exports = {
  toView,
  create,
  findById,
  findByReference,
  listByUser,
  pendingTotal,
  setStatus,
  toAdminView,
  listAdmin,
  listForExport,
  financeSummary,
  financeDaily,
  adminUpdateStatus,
};
