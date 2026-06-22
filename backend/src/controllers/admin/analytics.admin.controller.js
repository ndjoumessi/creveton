'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');
const analyticsService = require('../../services/analyticsService');
const financeService = require('../../services/financeService');

/** Analytics console admin (spec §12 / CDC §3.8). */

/** GET /admin/analytics?period=30d&metrics=dau,mau,revenue,retention */
const analytics = asyncHandler(async (req, res) => {
  const result = await analyticsService.getAnalytics({ period: req.query.period });
  return ok(res, result);
});

/** GET /admin/analytics/finances — KPIs financiers (ce mois + variation). */
const financesSummary = asyncHandler(async (req, res) => {
  return ok(res, await financeService.summary());
});

/** GET /admin/analytics/finances/daily?days=30 — série journalière. */
const financesDaily = asyncHandler(async (req, res) => {
  return ok(res, await financeService.daily(req.query.days || 30));
});

module.exports = { analytics, financesSummary, financesDaily };
