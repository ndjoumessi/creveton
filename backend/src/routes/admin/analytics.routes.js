'use strict';

const express = require('express');
const ctrl = require('../../controllers/admin/analytics.admin.controller');
const validate = require('../../middlewares/validate');
const { requirePermission } = require('../../middlewares/admin.middleware');
const schemas = require('../../validators/user.validator');
const financeSchemas = require('../../validators/transaction.validator');

const router = express.Router();

router.get('/', requirePermission('analytics:read'), validate(schemas.adminAnalytics, 'query'), ctrl.analytics);

// Finances : accès réservé à admin+ (transactions:read), plus strict qu'analytics.
router.get('/finances', requirePermission('transactions:read'), ctrl.financesSummary);
router.get('/finances/daily', requirePermission('transactions:read'), validate(financeSchemas.daily, 'query'), ctrl.financesDaily);

// Rapports détaillés (GROUP BY). Sessions = même seuil qu'analytics (moderator+) ;
// revenus = données financières, réservé admin+ (transactions:read).
router.get(
  '/reports/sessions',
  requirePermission('analytics:read'),
  validate(schemas.adminSessionsReport, 'query'),
  ctrl.reportsSessions
);
router.get(
  '/reports/revenue',
  requirePermission('transactions:read'),
  validate(schemas.adminRevenueReport, 'query'),
  ctrl.reportsRevenue
);

module.exports = router;
