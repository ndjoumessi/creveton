'use strict';

const db = require('../config/database');

/**
 * Couche d'accès aux données « game_sessions » (migration 003, §4.3).
 * Une ligne = une partie complète. Le score est recalculé serveur (gameService)
 * AVANT insertion ; le détail des réponses est conservé en JSONB.
 */

function toView(row) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    mode: row.mode,
    theme: row.theme ?? null,
    level: row.level ?? null,
    score: row.score,
    correct_count: row.correct_count,
    question_count: row.question_count,
    xp_earned: row.xp_earned,
    played_at: row.played_at,
  };
}

/**
 * Insère une partie. `answers` (JSONB) doit porter au minimum
 * { question_id, is_correct } par réponse (lu par le batch success_rate).
 * @param {object} data
 * @param {object} [executor=db]  client de transaction (gameService) si fourni.
 */
async function create(data, executor = db) {
  const { rows } = await executor.query(
    `INSERT INTO game_sessions
       (user_id, mode, theme, level, score, correct_count, question_count, xp_earned, answers)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
     RETURNING *`,
    [
      data.user_id,
      data.mode || 'normal',
      data.theme ?? null,
      data.level ?? null,
      data.score,
      data.correct_count,
      data.question_count,
      data.xp_earned,
      JSON.stringify(data.answers || []),
    ]
  );
  return rows[0];
}

/** Historique paginé (offset) des parties d'un joueur (fiche admin §3.2). */
async function listByUser(userId, { limit = 50, offset = 0 } = {}) {
  const { rows } = await db.query(
    `SELECT * FROM game_sessions
      WHERE user_id = $1
      ORDER BY played_at DESC
      LIMIT $2 OFFSET $3`,
    [userId, limit + 1, offset]
  );
  const hasMore = rows.length > limit;
  return { rows: hasMore ? rows.slice(0, limit) : rows, hasMore };
}

/** Statistiques agrégées d'un joueur (nb parties, score cumulé). */
async function statsByUser(userId) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS sessions_played,
            COALESCE(sum(score), 0)::int AS total_score
       FROM game_sessions
      WHERE user_id = $1`,
    [userId]
  );
  return rows[0];
}

module.exports = { toView, create, listByUser, statsByUser };
