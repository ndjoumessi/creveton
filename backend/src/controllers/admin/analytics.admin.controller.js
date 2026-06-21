'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');
const analyticsService = require('../../services/analyticsService');

/** Analytics console admin (spec §12 / CDC §3.8). */

/** GET /admin/analytics?period=30d&metrics=dau,mau,revenue,retention */
const analytics = asyncHandler(async (req, res) => {
  const result = await analyticsService.getAnalytics({ period: req.query.period });
  return ok(res, result);
});

module.exports = { analytics };
