'use strict';

const userModel = require('../models/user.model');
const lbModel = require('../models/leaderboard.model');

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

  const entries = [{ key: 'lb:global', member: userId, score }];
  if (theme) entries.push({ key: `lb:theme:${theme}`, member: userId, score });
  entries.push({ key: `lb:weekly:${isoWeekKey()}`, member: userId, score, ttl: WEEKLY_TTL_SEC });
  entries.push({ key: `lb:monthly:${monthKey()}`, member: userId, score, ttl: MONTHLY_TTL_SEC });

  await lbModel.increment(entries);
}

/**
 * GET /leaderboard — page de classement + position du joueur.
 * Le curseur encode l'offset de rang (pagination par rang sur le ZSET).
 * @returns {Promise<{ me, data, page }>}
 */
async function getLeaderboard({ scope = 'global', theme = null, limit = 20, cursor = null, meUserId }) {
  const { key, ttl } = resolveKey(scope, theme);

  // Cache froid → reconstruire depuis la base (source de vérité).
  if ((await lbModel.card(key)) === 0) {
    const rows = await lbModel.aggregateFromDb(scope, theme);
    await lbModel.populate(key, rows, ttl);
  }

  const offset = Math.max(0, parseInt(cursor, 10) || 0);
  const total = await lbModel.card(key);
  const ranked = await lbModel.range(key, offset, limit);

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
    const pos = await lbModel.positionOf(key, meUserId);
    if (pos) {
      const meProfile = profileById.get(meUserId) || (await userModel.findById(meUserId)) || {};
      me = { rank: pos.rank, score: pos.score, level: meProfile.level ?? null };
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
