'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');
const dashboardService = require('../../services/dashboardService');

/** Tableau de bord admin (CDC §3.1). */

/** GET /admin/dashboard — KPIs + activité récente + à modérer + statut système. */
const overview = asyncHandler(async (req, res) => {
  const result = await dashboardService.getOverview();
  return ok(res, result);
});

module.exports = { overview };
