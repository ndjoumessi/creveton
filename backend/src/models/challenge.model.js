'use strict';

const db = require('../config/database');

/**
 * Couche d'accès aux données « challenges » (migration 006, §4.3 / §9).
 * Défi 1v1 : `seed` partagé + `question_ids` figé → même tirage pour les deux
 * joueurs. Montants (`stake`) en INTEGER (FCFA).
 */

function toView(row) {
  if (!row) return null;
  return {
    id: row.id,
    challenger_id: row.challenger_id,
    opponent_id: row.opponent_id ?? null,
    seed: row.seed ?? null,
    stake: row.stake != null ? Number(row.stake) : 0,
    theme: row.theme ?? null,
    level: row.level ?? null,
    question_ids: Array.isArray(row.question_ids) ? row.question_ids : [],
    status: row.status,
    score_challenger: row.score_challenger ?? null,
    score_opponent: row.score_opponent ?? null,
    xp_challenger: row.xp_challenger ?? null,
    xp_opponent: row.xp_opponent ?? null,
    winner_id: row.winner_id ?? null,
    created_at: row.created_at,
    played_at: row.played_at ?? null,
  };
}

/** Crée un défi (opponent_id NULL = matchmaking aléatoire en attente). */
async function create(data) {
  const { rows } = await db.query(
    `INSERT INTO challenges
       (challenger_id, opponent_id, seed, stake, theme, level, question_ids, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7::uuid[], $8)
     RETURNING *`,
    [
      data.challenger_id,
      data.opponent_id ?? null,
      data.seed ?? null,
      data.stake ?? 0,
      data.theme ?? null,
      data.level ?? null,
      data.question_ids ?? [],
      data.status || 'pending',
    ]
  );
  return rows[0];
}

async function findById(id) {
  const { rows } = await db.query('SELECT * FROM challenges WHERE id = $1', [id]);
  return rows[0] || null;
}

async function setStatus(id, status) {
  const { rows } = await db.query(
    'UPDATE challenges SET status = $2 WHERE id = $1 RETURNING *',
    [id, status]
  );
  return rows[0] || null;
}

/** Affecte l'adversaire d'un défi aléatoire au moment de l'acceptation. */
async function assignOpponent(id, opponentId) {
  const { rows } = await db.query(
    `UPDATE challenges SET opponent_id = $2, status = 'accepted'
      WHERE id = $1 AND opponent_id IS NULL
      RETURNING *`,
    [id, opponentId]
  );
  return rows[0] || null;
}

/**
 * Enregistre le score + l'XP d'un camp ('challenger' | 'opponent').
 * Passe le défi en 'active' tant qu'il n'est pas finalisé.
 */
async function recordScore(id, side, score, xp) {
  const scoreCol = side === 'challenger' ? 'score_challenger' : 'score_opponent';
  const xpCol = side === 'challenger' ? 'xp_challenger' : 'xp_opponent';
  const { rows } = await db.query(
    `UPDATE challenges
        SET ${scoreCol} = $2,
            ${xpCol} = $3,
            status = CASE WHEN status = 'completed' THEN status ELSE 'active' END
      WHERE id = $1
      RETURNING *`,
    [id, score, xp]
  );
  return rows[0] || null;
}

/** Désigne le gagnant et clôt le défi. winnerId NULL = égalité. */
async function finalize(id, winnerId) {
  const { rows } = await db.query(
    `UPDATE challenges
        SET winner_id = $2, status = 'completed', played_at = now()
      WHERE id = $1
      RETURNING *`,
    [id, winnerId ?? null]
  );
  return rows[0] || null;
}

/** Défis émis ou reçus par un joueur (filtre statut optionnel). */
async function listByUser(userId, { status = null } = {}) {
  const params = [userId];
  let where = '(challenger_id = $1 OR opponent_id = $1)';
  if (status) {
    params.push(status);
    where += ` AND status = $${params.length}`;
  }
  const { rows } = await db.query(
    `SELECT * FROM challenges WHERE ${where} ORDER BY created_at DESC`,
    params
  );
  return rows;
}

/**
 * Liste paginée des défis d'un joueur pour l'onglet « Défis » mobile.
 * Filtre `kind` :
 *   - received  : défis reçus en attente (opponent_id = moi, status pending)
 *   - sent      : défis envoyés en attente (challenger_id = moi, status pending)
 *   - completed : défis terminés où je participe (status completed)
 * Joint l'« autre » joueur (l'adversaire de mon point de vue) pour l'avatar +
 * le nom. Renvoie `limit + 1` lignes pour détecter la page suivante (has_more).
 */
async function listForUser(userId, { kind, limit = 20, offset = 0 } = {}) {
  // Colonnes qualifiées `c.` : `users` possède aussi une colonne `status` après
  // le JOIN → la référence non qualifiée serait ambiguë.
  let filter;
  if (kind === 'received') filter = "c.opponent_id = $1 AND c.status = 'pending'";
  else if (kind === 'sent') filter = "c.challenger_id = $1 AND c.status = 'pending'";
  else filter = "(c.challenger_id = $1 OR c.opponent_id = $1) AND c.status = 'completed'";

  // L'« autre » joueur dépend du camp : si je suis le challenger → opponent_id,
  // sinon → challenger_id.
  const otherId = 'CASE WHEN c.challenger_id = $1 THEN c.opponent_id ELSE c.challenger_id END';
  const { rows } = await db.query(
    `SELECT c.*,
        ${otherId} AS other_id,
        u.name AS other_name,
        u.avatar_url AS other_avatar_url,
        u.level AS other_level
       FROM challenges c
       LEFT JOIN users u ON u.id = (${otherId})
      WHERE ${filter}
      ORDER BY c.created_at DESC
      LIMIT $2 OFFSET $3`,
    [userId, limit + 1, offset]
  );
  const hasMore = rows.length > limit;
  return { rows: hasMore ? rows.slice(0, limit) : rows, hasMore };
}

module.exports = {
  toView,
  create,
  findById,
  setStatus,
  assignOpponent,
  recordScore,
  finalize,
  listByUser,
  listForUser,
};
