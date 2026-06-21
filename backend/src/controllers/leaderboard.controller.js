'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const leaderboardService = require('../services/leaderboardService');

/** Contrôleur Classement (spec §7). */

/** GET /leaderboard?scope=&theme=&limit=&cursor= → 200 { me, data, page } */
const get = asyncHandler(async (req, res) => {
  const { scope, theme, limit, cursor } = req.query;
  const result = await leaderboardService.getLeaderboard({
    scope,
    theme,
    limit,
    cursor,
    meUserId: req.user.id,
  });
  return ok(res, result);
});

module.exports = { get };
