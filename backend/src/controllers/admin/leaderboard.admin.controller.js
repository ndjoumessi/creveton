'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');
const leaderboardService = require('../../services/leaderboardService');

/** Classement côté admin (§7) — proxy du leaderboard, top 100. */

/** GET /admin/leaderboard?scope=global&theme= */
const get = asyncHandler(async (req, res) => {
  const result = await leaderboardService.getLeaderboard({
    scope: req.query.scope || 'global',
    theme: req.query.theme || null,
    limit: 100,
    meUserId: req.user.id,
  });
  return ok(res, result);
});

module.exports = { get };
