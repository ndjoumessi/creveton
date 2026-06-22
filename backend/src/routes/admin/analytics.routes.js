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

module.exports = router;
