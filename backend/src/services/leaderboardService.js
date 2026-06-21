'use strict';

const db = require('../config/database');
const { redis } = require('../config/redis');
const userModel = require('../models/user.model');

/**
 * Classements via Redis (réf. spec §7).
 *
 * Chaque scope est un sorted set Redis (membre = user_id, score = somme des
 * scores de parties). Mis à jour à chaque /sessions/submit (recordScore). Si un
 * scope est froid/vidé, il est reconstruit à la volée depuis game_sessions
 * (source de vérité) — le ZSET reste donc un simple cache.
 *
 *   global        → lb:global                (cumul total)
 *   theme:<t>     → lb:theme:<t>             (cumul par thème)
 *   weekly:<wk>   → lb:weekly:<YYYY-Www>     (semaine ISO courante)
 *   monthly:<mo>  → lb:monthly:<YYYY-MM>     (mois courant)
 */

const WEEKLY_TTL_SEC = 14 * 24 * 3600; // survit à la semaine courante puis purge
const MONTHLY_TTL_SEC = 45 * 24 * 3600;

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Clé de mois courant (UTC) : YYYY-MM. */
function monthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`;
}

/** Numéro de semaine ISO (UTC) : YYYY-Www. */
function isoWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // lundi = 0
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // jeudi de la semaine ISO
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${pad2(week)}`;
}

/** Résout la clé Redis + sa TTL éventuelle pour un scope. */
function resolveKey(scope, theme) {
  switch (scope) {
    case 'theme':
      return { key: `lb:theme:${theme}`, ttl: null };
    case 'weekly':
      return { key: `lb:weekly:${isoWeekKey()}`, ttl: WEEKLY_TTL_SEC };
    case 'monthly':
      return { key: `lb:monthly:${monthKey()}`, ttl: MONTHLY_TTL_SEC };
    case 'global':
    default:
      return { key: 'lb:global', ttl: null };
  }
}

/**
 * Incrémente tous les scopes pertinents après une partie.
 * Best-effort : ne doit jamais faire échouer la soumission de partie.
 */
async function recordScore({ userId, theme, score }) {
  if (!score || score <= 0) return; // une partie à 0 ne modifie pas le classement
  const pipeline = redis.pipeline();

  pipeline.zincrby('lb:global', score, userId);
  if (theme) pipeline.zincrby(`lb:theme:${theme}`, score, userId);

  const weeklyKey = `lb:weekly:${isoWeekKey()}`;
  pipeline.zincrby(weeklyKey, score, userId);
  pipeline.expire(weeklyKey, WEEKLY_TTL_SEC);

  const monthlyKey = `lb:monthly:${monthKey()}`;
  pipeline.zincrby(monthlyKey, score, userId);
  pipeline.expire(monthlyKey, MONTHLY_TTL_SEC);

  await pipeline.exec();
}

/** Agrège un scope depuis game_sessions (source de vérité). */
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

/** Reconstruit le ZSET d'un scope depuis la base (cache froid / vidé). */
async function rebuild(scope, theme, key, ttl) {
  const rows = await aggregateFromDb(scope, theme);
  if (rows.length === 0) return;
  const pipeline = redis.pipeline();
  // ZADD key score member [score member ...]
  const args = [];
  for (const r of rows) {
    args.push(r.total, r.user_id);
  }
  pipeline.zadd(key, ...args);
  if (ttl) pipeline.expire(key, ttl);
  await pipeline.exec();
}

/** Convertit la sortie plate ZREVRANGE WITHSCORES en [{ user_id, score }]. */
function parseRange(flat) {
  const out = [];
  for (let i = 0; i < flat.length; i += 2) {
    out.push({ user_id: flat[i], score: Number(flat[i + 1]) });
  }
  return out;
}

/**
 * GET /leaderboard — page de classement + position du joueur.
 * Le curseur encode l'offset de rang (pagination par rang sur le ZSET).
 * @returns {Promise<{ me, data, page }>}
 */
async function getLeaderboard({ scope = 'global', theme = null, limit = 20, cursor = null, meUserId }) {
  const { key, ttl } = resolveKey(scope, theme);

  // Cache froid → reconstruire depuis la base.
  if ((await redis.zcard(key)) === 0) {
    await rebuild(scope, theme, key, ttl);
  }

  const offset = Math.max(0, parseInt(cursor, 10) || 0);
  const total = await redis.zcard(key);

  const flat = await redis.zrevrange(key, offset, offset + limit - 1, 'WITHSCORES');
  const ranked = parseRange(flat);

  // Profils (name/level/ville) chargés en une requête, ordre préservé.
  const profiles = await userModel.findManyByIds(ranked.map((r) => r.user_id));
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  const data = ranked.map((entry, i) => {
    const p = profileById.get(entry.user_id) || {};
    return {
      rank: offset + i + 1,
      user_id: entry.user_id,
      name: p.name ?? null,
      level: p.level ?? null,
      score: entry.score,
      ville: p.ville ?? null,
    };
  });

  // Position du joueur courant.
  let me = null;
  if (meUserId) {
    const [meRank, meScore] = await Promise.all([
      redis.zrevrank(key, meUserId),
      redis.zscore(key, meUserId),
    ]);
    if (meRank !== null && meRank !== undefined) {
      const meProfile = profileById.get(meUserId) || (await userModel.findById(meUserId)) || {};
      me = {
        rank: meRank + 1,
        score: Number(meScore),
        level: meProfile.level ?? null,
      };
    }
  }

  const hasMore = offset + limit < total;
  return {
    me,
    data,
    page: {
      limit,
      next_cursor: hasMore ? String(offset + limit) : null,
      has_more: hasMore,
    },
  };
}

module.exports = {
  recordScore,
  getLeaderboard,
  // exportés pour les tests
  isoWeekKey,
  monthKey,
  resolveKey,
};
