'use strict';

const db = require('../config/database');

/**
 * Couche d'accès aux données « challenges » (migration 006, §4.3).
 * Défi 1v1 : `seed` partagé → même tirage pour les deux joueurs (cf.
 * question.model.pickRandom). Montant `stake` en INTEGER (FCFA).
 */

function toView(row) {
  if (!row) return null;
  return {
    id: row.id,
    challenger_id: row.challenger_id,
    opponent_id: row.opponent_id ?? null,
    seed: row.seed ?? null,
    stake: row.stake != null ? Number(row.stake) : 0,
    status: row.status,
    score_challenger: row.score_challenger ?? null,
    score_opponent: row.score_opponent ?? null,
    winner_id: row.winner_id ?? null,
    created_at: row.created_at,
    played_at: row.played_at ?? null,
  };
}

/** Crée un défi (opponent_id NULL = matchmaking aléatoire en attente). */
async function create(data) {
  const { rows } = await db.query(
    `INSERT INTO challenges
       (challenger_id, opponent_id, seed, stake, status)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      data.challenger_id,
      data.opponent_id ?? null,
      data.seed ?? null,
      data.stake ?? 0,
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

/** Enregistre le résultat final + désigne le gagnant. */
async function setResult(id, { scoreChallenger, scoreOpponent, winnerId }) {
  const { rows } = await db.query(
    `UPDATE challenges
        SET score_challenger = $2,
            score_opponent   = $3,
            winner_id        = $4,
            status           = 'completed',
            played_at        = now()
      WHERE id = $1
      RETURNING *`,
    [id, scoreChallenger, scoreOpponent, winnerId ?? null]
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

module.exports = { toView, create, findById, setStatus, setResult, listByUser };
