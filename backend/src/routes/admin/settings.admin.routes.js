'use strict';

const express = require('express');
const ctrl = require('../../controllers/admin/settings.admin.controller');
const validate = require('../../middlewares/validate');
const { requirePermission } = require('../../middlewares/admin.middleware');
const schemas = require('../../validators/settings.validator');

const router = express.Router();

// Feature flags (lecture : admin ; écriture : super_admin).
router.get('/flags', requirePermission('settings:read'), ctrl.getFlags);
router.patch('/flags/:key', requirePermission('settings:manage'), validate(schemas.patchFlag), ctrl.patchFlag);

// État système & intégrations (lecture admin).
router.get('/system', requirePermission('system:read'), ctrl.system);
router.get('/integrations', requirePermission('settings:read'), ctrl.integrations);

// Actions de maintenance & exports (super_admin).
router.post('/system/recompute-success-rates', requirePermission('system:manage'), ctrl.recomputeSuccessRates);
router.post('/system/recompute-xp', requirePermission('system:manage'), ctrl.recomputeXp);
router.get('/exports/questions', requirePermission('system:manage'), ctrl.exportQuestions);
router.get('/exports/users', requirePermission('system:manage'), ctrl.exportUsers);

module.exports = router;
