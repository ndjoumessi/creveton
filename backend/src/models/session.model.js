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
    session_id: row.id, // alias attendu par la vue joueur (historique mobile)
    user_id: row.user_id,
    mode: row.mode,
    theme: row.theme ?? null,
    level: row.level ?? null,
    score: row.score,
    correct_count: row.correct_count,
    question_count: row.question_count,
    streak_max: row.streak_max ?? 0,
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
       (user_id, mode, theme, level, score, correct_count, question_count, streak_max, xp_earned, answers)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
     RETURNING *`,
    [
      data.user_id,
      data.mode || 'normal',
      data.theme ?? null,
      data.level ?? null,
      data.score,
      data.correct_count,
      data.question_count,
      data.streak_max ?? 0,
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

/** Vue admin d'une partie (avec infos joueur jointes). */
function toAdminView(row) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    user: { name: row.user_name, ville: row.user_ville ?? null, level: row.user_level },
    mode: row.mode,
    theme: row.theme ?? null,
    level: row.level ?? null,
    score: row.score,
    correct_count: row.correct_count,
    question_count: row.question_count,
    xp_earned: row.xp_earned,
    // game_sessions n'a pas de colonne durée : on l'agrège depuis le temps passé
    // par réponse (answers JSONB). null si la donnée de timing est absente.
    duration_s: row.duration_ms != null ? Math.round(Number(row.duration_ms) / 1000) : null,
    played_at: row.played_at,
  };
}

/**
 * Liste admin des parties (JOIN users), filtres + pagination offset.
 * NB : game_sessions n'a pas de colonne deleted_at (pas de soft delete) ni de
 * colonne durée — celle-ci est calculée par somme des temps de réponse (JSONB).
 */
async function listAdmin({ userId = null, theme = null, level = null, dateFrom = null, limit = 20, offset = 0 }) {
  const { rows } = await db.query(
    `SELECT gs.id, gs.user_id, gs.mode, gs.theme, gs.level, gs.score, gs.correct_count,
            gs.question_count, gs.xp_earned, gs.played_at,
            (SELECT SUM(COALESCE((a->>'time_ms')::numeric, (a->>'elapsed_ms')::numeric))
               FROM jsonb_array_elements(gs.answers) AS a) AS duration_ms,
            u.name AS user_name, u.ville AS user_ville, u.level AS user_level
       FROM game_sessions gs
       JOIN users u ON gs.user_id = u.id
      WHERE ($1::uuid IS NULL OR gs.user_id = $1)
        AND ($2::text IS NULL OR gs.theme = $2)
        AND ($3::text IS NULL OR gs.level = $3)
        AND ($4::timestamptz IS NULL OR gs.played_at >= $4)
      ORDER BY gs.played_at DESC
      LIMIT $5 OFFSET $6`,
    [userId, theme, level, dateFrom, limit + 1, offset]
  );
  const hasMore = rows.length > limit;
  return { rows: hasMore ? rows.slice(0, limit) : rows, hasMore };
}

/** Une partie + infos joueur (détail admin avec answers JSONB brut). */
async function findByIdAdmin(id) {
  const { rows } = await db.query(
    `SELECT gs.*, u.name AS user_name, u.ville AS user_ville, u.level AS user_level
       FROM game_sessions gs
       JOIN users u ON gs.user_id = u.id
      WHERE gs.id = $1`,
    [id]
  );
  return rows[0] || null;
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

module.exports = { toView, toAdminView, create, listByUser, listAdmin, findByIdAdmin, statsByUser };
