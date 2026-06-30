'use strict';

const db = require('../config/database');

/**
 * Couche d'accès aux données « tournaments » + participants (migrations 004/005).
 * Réf. spec §8/§15.
 */

/** Vue Tournament (§15). `registered_players` fourni si compté en amont. */
function toView(row, registeredPlayers = null) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    entry_fee: row.entry_fee != null ? Number(row.entry_fee) : 0,
    currency: 'XAF',
    max_players: row.max_players ?? null,
    registered_players: registeredPlayers ?? (row.registered_players != null ? Number(row.registered_players) : 0),
    prize_pool: row.prize_pool != null ? Number(row.prize_pool) : 0,
    theme: row.theme ?? null,
    status: row.status,
    starts_at: row.starts_at,
    ends_at: row.ends_at ?? null,
  };
}

async function create(data) {
  const { rows } = await db.query(
    `INSERT INTO tournaments
       (name, type, theme, entry_fee, max_players, prize_pool, status, starts_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, 'scheduled', $7, $8)
     RETURNING *`,
    [
      data.name,
      data.type,
      data.theme ?? null,
      data.entry_fee ?? 0,
      data.max_players ?? null,
      data.prize_pool ?? 0,
      data.starts_at ?? null,
      data.created_by ?? null,
    ]
  );
  return rows[0];
}

async function findById(id) {
  const { rows } = await db.query('SELECT * FROM tournaments WHERE id = $1', [id]);
  return rows[0] || null;
}

/**
 * Liste tous les tournois vivants (non soft-deletés), du plus récent au plus
 * ancien, avec le nombre d'inscrits. Sert GET /tournaments (§8).
 */
async function findAll() {
  const { rows } = await db.query(
    `SELECT t.*,
            (SELECT count(*)::int FROM tournament_participants p WHERE p.tournament_id = t.id) AS registered_players
       FROM tournaments t
      WHERE t.deleted_at IS NULL
      ORDER BY t.created_at DESC`
  );
  return rows;
}

/** Participants détaillés (avec infos joueur) classés par score décroissant. */
async function participantsDetailed(id) {
  const { rows } = await db.query(
    `SELECT p.id, p.user_id, p.score, p.rank, p.payout, p.joined_at,
            u.name, u.ville, u.level, u.avatar_url
       FROM tournament_participants p
       JOIN users u ON u.id = p.user_id
      WHERE p.tournament_id = $1
      ORDER BY p.score DESC, p.joined_at ASC`,
    [id]
  );
  return rows.map((r, i) => ({
    id: r.id,
    user_id: r.user_id,
    name: r.name,
    ville: r.ville ?? null,
    level: r.level,
    avatar_url: r.avatar_url ?? null,
    score: r.score,
    rank: r.rank ?? i + 1,
    payout: r.payout != null ? Number(r.payout) : 0,
    joined_at: r.joined_at,
  }));
}

/** Vérifie si un joueur est déjà inscrit à un tournoi. */
async function findParticipant(tournamentId, userId) {
  const { rows } = await db.query(
    'SELECT * FROM tournament_participants WHERE tournament_id = $1 AND user_id = $2',
    [tournamentId, userId]
  );
  return rows[0] || null;
}

/** Retire un joueur d'un tournoi. Retourne la ligne supprimée ou null. */
async function removeParticipant(tournamentId, userId) {
  const { rows } = await db.query(
    'DELETE FROM tournament_participants WHERE tournament_id = $1 AND user_id = $2 RETURNING *',
    [tournamentId, userId]
  );
  return rows[0] || null;
}

/**
 * Inscrit un joueur à un tournoi (idempotent). La contrainte UNIQUE
 * (tournament_id, user_id) garantit un seul enregistrement : ON CONFLICT DO NOTHING
 * rend l'opération rejouable sans erreur. La table n'a pas de colonne `status`
 * (cf. migration 005) — le statut « confirmed » est porté par la couche service.
 */
async function addParticipant(tournamentId, userId, executor = db) {
  await executor.query(
    `INSERT INTO tournament_participants (tournament_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (tournament_id, user_id) DO NOTHING`,
    [tournamentId, userId]
  );
}

async function countParticipants(id) {
  const { rows } = await db.query(
    'SELECT count(*)::int AS n FROM tournament_participants WHERE tournament_id = $1',
    [id]
  );
  return rows[0].n;
}

/** Met à jour le statut (+ ends_at optionnel). */
async function setStatus(id, status, { endsAt } = {}) {
  const { rows } = await db.query(
    `UPDATE tournaments
        SET status = $2,
            ends_at = COALESCE($3, ends_at)
      WHERE id = $1
      RETURNING *`,
    [id, status, endsAt ?? null]
  );
  return rows[0] || null;
}

/** IDs des joueurs inscrits à un tournoi (pour la manche live). */
async function participantUserIds(id) {
  const { rows } = await db.query(
    'SELECT user_id FROM tournament_participants WHERE tournament_id = $1',
    [id]
  );
  return rows.map((r) => r.user_id);
}

/** Écrit le score d'un participant (fin de manche live). */
async function setScore(tournamentId, userId, score, executor = db) {
  await executor.query(
    'UPDATE tournament_participants SET score = $3 WHERE tournament_id = $1 AND user_id = $2',
    [tournamentId, userId, score]
  );
}

/** Participants triés par score décroissant (pour le classement/payout). */
async function rankedParticipants(id, executor = db) {
  const { rows } = await executor.query(
    `SELECT id, user_id, score
       FROM tournament_participants
      WHERE tournament_id = $1
      ORDER BY score DESC, joined_at ASC`,
    [id]
  );
  return rows;
}

/** Applique rang + payout à un participant. */
async function setResult(participantId, rank, payout, executor = db) {
  await executor.query(
    'UPDATE tournament_participants SET rank = $2, payout = $3 WHERE id = $1',
    [participantId, rank, payout]
  );
}

module.exports = {
  toView,
  create,
  findById,
  findAll,
  participantsDetailed,
  addParticipant,
  findParticipant,
  removeParticipant,
  countParticipants,
  setStatus,
  participantUserIds,
  setScore,
  rankedParticipants,
  setResult,
  getClient: () => db.getClient(),
};
