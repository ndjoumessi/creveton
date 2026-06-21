'use strict';

const crypto = require('crypto');
const db = require('../config/database');

/**
 * Couche d'accès aux données « users » (réf. spec §15, migration 001).
 * N'utilise jamais process.env ni la connexion directement — passe par
 * db.query(). Les lectures excluent les comptes soft-deletés (deleted_at).
 */

// Colonnes sérialisées vers le client (objet User abrégé §15) — jamais le hash.
const PUBLIC_COLUMNS = `
  id, name, email, phone, phone_verified, ville, age, sexe, lang,
  total_xp, level, role, wallet_balance, referral_code,
  created_at, last_active_at
`;

/** Convertit une ligne SQL en objet User public (§15). */
function toPublic(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    phone_verified: row.phone_verified,
    ville: row.ville ?? null,
    age: row.age ?? null,
    sexe: row.sexe ?? null,
    lang: row.lang,
    total_xp: row.total_xp,
    level: row.level,
    role: row.role,
    // DECIMAL est renvoyé en string par node-postgres → on expose un nombre.
    wallet_balance: row.wallet_balance != null ? Number(row.wallet_balance) : 0,
    referral_code: row.referral_code,
    created_at: row.created_at,
    last_active_at: row.last_active_at ?? null,
  };
}

async function findById(id) {
  const { rows } = await db.query(
    'SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL',
    [id]
  );
  return rows[0] || null;
}

async function findByEmail(email) {
  const { rows } = await db.query(
    'SELECT * FROM users WHERE lower(email) = lower($1) AND deleted_at IS NULL',
    [email]
  );
  return rows[0] || null;
}

async function findByPhone(phone) {
  const { rows } = await db.query(
    'SELECT * FROM users WHERE phone = $1 AND deleted_at IS NULL',
    [phone]
  );
  return rows[0] || null;
}

async function findByReferralCode(code) {
  const { rows } = await db.query(
    'SELECT * FROM users WHERE referral_code = $1 AND deleted_at IS NULL',
    [code]
  );
  return rows[0] || null;
}

/**
 * Crée un compte. `password_hash` déjà calculé par le service.
 * Lève l'erreur pg 23505 (unique_violation) si email/phone déjà pris —
 * mappée par le service en EMAIL_ALREADY_USED / PHONE_ALREADY_USED.
 */
async function create(data) {
  const { rows } = await db.query(
    `INSERT INTO users
       (name, email, phone, password_hash, ville, age, sexe, lang,
        referral_code, referred_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      data.name,
      data.email,
      data.phone,
      data.password_hash,
      data.ville ?? null,
      data.age ?? null,
      data.sexe ?? null,
      data.lang || 'fr',
      data.referral_code,
      data.referred_by ?? null,
    ]
  );
  return rows[0];
}

/** Passe phone_verified à true (après OTP validé). */
async function markPhoneVerified(id) {
  const { rows } = await db.query(
    `UPDATE users SET phone_verified = true
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id]
  );
  return rows[0] || null;
}

/** Met à jour l'horodatage de dernière activité (suivi churn §4.1). */
async function touchLastActive(id) {
  await db.query('UPDATE users SET last_active_at = now() WHERE id = $1', [id]);
}

/**
 * Crédite (ou débite si delta négatif) le wallet d'un compte, de façon atomique.
 * @param {object} [executor=db] client de transaction si fourni.
 * @returns {Promise<number|null>} nouveau solde (FCFA), ou null si introuvable.
 */
async function incrementWallet(id, delta, executor = db) {
  const { rows } = await executor.query(
    `UPDATE users SET wallet_balance = wallet_balance + $2
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING wallet_balance`,
    [id, delta]
  );
  return rows[0] ? Number(rows[0].wallet_balance) : null;
}

// ---------------------------------------------------------------------------
// Opérations ADMIN (spec §12).
// ---------------------------------------------------------------------------

/** Liste admin paginée (offset) + filtres ville/level/role/status/q. */
async function listAdmin({ ville = null, level = null, role = null, status = null, q = null, limit = 20, offset = 0 }) {
  const params = [];
  const clauses = ['deleted_at IS NULL'];
  if (ville) {
    params.push(ville);
    clauses.push(`ville = $${params.length}`);
  }
  if (level) {
    params.push(level);
    clauses.push(`level = $${params.length}`);
  }
  if (role) {
    params.push(role);
    clauses.push(`role = $${params.length}`);
  }
  if (status) {
    params.push(status);
    clauses.push(`status = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    clauses.push(`(name ILIKE $${params.length} OR email ILIKE $${params.length} OR phone ILIKE $${params.length})`);
  }
  params.push(limit + 1);
  const limitIdx = params.length;
  params.push(offset);
  const { rows } = await db.query(
    `SELECT ${PUBLIC_COLUMNS}, status FROM users
      WHERE ${clauses.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${limitIdx} OFFSET $${params.length}`,
    params
  );
  const hasMore = rows.length > limit;
  return { rows: hasMore ? rows.slice(0, limit) : rows, hasMore };
}

/** Change le statut d'un compte (active|suspended|banned). */
async function setStatus(id, status) {
  const { rows } = await db.query(
    `UPDATE users SET status = $2 WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
    [id, status]
  );
  return rows[0] || null;
}

/** Soft delete RGPD (jamais de DELETE réel ; purge planifiée hors scope). */
async function softDelete(id) {
  const { rows } = await db.query(
    `UPDATE users SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
    [id]
  );
  return rows[0] || null;
}

/** Statistiques agrégées d'un joueur (fiche admin §3.2). */
async function stats(id) {
  const { rows } = await db.query(
    `SELECT
        (SELECT count(*)::int FROM game_sessions WHERE user_id = $1) AS sessions_played,
        (SELECT COALESCE(sum(score),0)::int FROM game_sessions WHERE user_id = $1) AS total_score,
        (SELECT count(*)::int FROM transactions WHERE user_id = $1) AS transactions_count`,
    [id]
  );
  return rows[0];
}

/** Nombre de comptes actifs (proxy du parc d'appareils pour le push force-sync). */
async function countActive() {
  const { rows } = await db.query(
    `SELECT count(*)::int AS n FROM users WHERE deleted_at IS NULL AND status = 'active'`
  );
  return rows[0].n;
}

/** Nombre d'inscrits via un code de parrainage donné. */
async function referralCount(code) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS count
       FROM users
      WHERE referred_by = (SELECT id FROM users WHERE referral_code = $1)
        AND deleted_at IS NULL`,
    [code]
  );
  return rows[0].count;
}

/**
 * Charge un lot de profils publics (id, name, level, ville) pour l'affichage
 * du classement (§7). Préserve l'ordre des `ids` fournis.
 * @param {string[]} ids
 * @returns {Promise<object[]>}
 */
async function findManyByIds(ids) {
  if (!ids || ids.length === 0) return [];
  const { rows } = await db.query(
    `SELECT id, name, level, ville FROM users WHERE id = ANY($1::uuid[])`,
    [ids]
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

/**
 * Crédite l'XP d'une partie et recalcule le niveau (1–5) en une transaction.
 * Verrou FOR UPDATE pour éviter les pertes de mise à jour concurrentes.
 * @param {string} id
 * @param {number} xpDelta
 * @param {(totalXp:number)=>number} levelFromXp
 * @param {object} [executor=db]  client de transaction si fourni.
 * @returns {Promise<{ level_before:number, level_after:number, total_xp:number }>}
 */
async function creditSessionXp(id, xpDelta, levelFromXp, executor = db) {
  const current = await executor.query(
    'SELECT total_xp, level FROM users WHERE id = $1 FOR UPDATE',
    [id]
  );
  if (!current.rows[0]) {
    const err = new Error('USER_NOT_FOUND');
    err.code = 'USER_NOT_FOUND';
    throw err;
  }
  const levelBefore = current.rows[0].level;
  const newTotal = current.rows[0].total_xp + xpDelta;
  const levelAfter = levelFromXp(newTotal);
  await executor.query(
    'UPDATE users SET total_xp = $2, level = $3, last_active_at = now() WHERE id = $1',
    [id, newTotal, levelAfter]
  );
  return { level_before: levelBefore, level_after: levelAfter, total_xp: newTotal };
}

/**
 * Génère un code de parrainage unique au format CREV-XXXX (4 caractères
 * alphanumériques non ambigus). Réessaie en cas de collision.
 */
async function generateUniqueReferralCode() {
  const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sans I,O,0,1,L
  for (let attempt = 0; attempt < 10; attempt += 1) {
    let suffix = '';
    for (let i = 0; i < 4; i += 1) {
      suffix += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
    }
    const code = `CREV-${suffix}`;
    const existing = await findByReferralCode(code);
    if (!existing) return code;
  }
  // Collision improbable après 10 essais : on rallonge avec de l'entropie.
  return `CREV-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

module.exports = {
  PUBLIC_COLUMNS,
  toPublic,
  findById,
  findByEmail,
  findByPhone,
  findByReferralCode,
  create,
  markPhoneVerified,
  touchLastActive,
  incrementWallet,
  findManyByIds,
  creditSessionXp,
  generateUniqueReferralCode,
  // admin
  listAdmin,
  setStatus,
  softDelete,
  stats,
  countActive,
  referralCount,
};
