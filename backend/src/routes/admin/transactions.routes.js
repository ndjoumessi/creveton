'use strict';

const express = require('express');
const ctrl = require('../../controllers/admin/transactions.admin.controller');
const validate = require('../../middlewares/validate');
const { requirePermission } = require('../../middlewares/admin.middleware');
const schemas = require('../../validators/transaction.validator');

const router = express.Router();

// Lecture du journal financier (admin).
router.get('/', requirePermission('transactions:read'), validate(schemas.list, 'query'), ctrl.list);
// Export CSV — défini avant toute route paramétrée (pas de collision avec /:id).
router.get('/export', requirePermission('transactions:read'), validate(schemas.list, 'query'), ctrl.exportCsv);

// Validation / rejet manuel (admin).
router.post('/:id/validate', requirePermission('transactions:manage'), ctrl.validate);
router.post('/:id/reject', requirePermission('transactions:manage'), validate(schemas.reject), ctrl.reject);

module.exports = router;
