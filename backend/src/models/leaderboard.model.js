'use strict';

const db = require('../config/database');
const { redis } = require('../config/redis');

/**
 * Couche d'accès aux données « classement » : sorted sets Redis (cache) avec
 * repli PostgreSQL (source de vérité game_sessions) — réf. spec §7.
 *
 * Membre du ZSET = user_id, score = somme des scores de parties. Les clés et
 * TTL par scope/période sont décidés par leaderboardService ; ce modèle ne
 * manipule que des primitives sur une clé donnée.
 */

/** Cardinalité d'un classement (0 ⇒ cache froid à reconstruire). */
async function card(key) {
  return redis.zcard(key);
}

/**
 * Page de classement décroissante depuis un offset de rang.
 * @returns {Promise<Array<{ user_id: string, score: number }>>}
 */
async function range(key, offset, limit) {
  const flat = await redis.zrevrange(key, offset, offset + limit - 1, 'WITHSCORES');
  const out = [];
  for (let i = 0; i < flat.length; i += 2) {
    out.push({ user_id: flat[i], score: Number(flat[i + 1]) });
  }
  return out;
}

/**
 * Position (rang 1-indexé) + score d'un membre, ou null s'il est absent.
 * @returns {Promise<{ rank: number, score: number }|null>}
 */
async function positionOf(key, member) {
  const [rank, score] = await Promise.all([redis.zrevrank(key, member), redis.zscore(key, member)]);
  if (rank === null || rank === undefined) return null;
  return { rank: rank + 1, score: Number(score) };
}

/**
 * Incrémente plusieurs clés en une passe (pipeline).
 * @param {Array<{ key: string, member: string, score: number, ttl?: number }>} entries
 */
async function increment(entries) {
  const pipeline = redis.pipeline();
  for (const e of entries) {
    pipeline.zincrby(e.key, e.score, e.member);
    if (e.ttl) pipeline.expire(e.key, e.ttl);
  }
  await pipeline.exec();
}

/**
 * Agrège un scope depuis game_sessions (repli quand le ZSET est froid/vidé).
 * @returns {Promise<Array<{ user_id: string, total: number }>>}
 */
async function aggregateFromDb(scope, theme) {
  let where = '';
  const params = [];
  if (scope === 'theme') {
    params.push(theme);
    where = `WHERE theme = $1`;
  } else if (scope === 'weekly') {
    where = `WHERE played_at >= date_trunc('week', now())`;
  } else if (scope === 'monthly') {
    where = `WHERE played_at >= date_trunc('month', now())`;
  }
  const { rows } = await db.query(
    `SELECT user_id, SUM(score)::int AS total
       FROM game_sessions
       ${where}
      GROUP BY user_id
      HAVING SUM(score) > 0`,
    params
  );
  return rows;
}

/** Reconstruit un ZSET depuis les lignes agrégées (avec TTL optionnel). */
async function populate(key, rows, ttl) {
  if (!rows.length) return;
  const pipeline = redis.pipeline();
  const args = [];
  for (const r of rows) {
    args.push(r.total, r.user_id);
  }
  pipeline.zadd(key, ...args);
  if (ttl) pipeline.expire(key, ttl);
  await pipeline.exec();
}

module.exports = { card, range, positionOf, increment, aggregateFromDb, populate };
