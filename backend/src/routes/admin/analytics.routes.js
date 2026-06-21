'use strict';

const express = require('express');
const ctrl = require('../../controllers/admin/analytics.admin.controller');
const validate = require('../../middlewares/validate');
const { requirePermission } = require('../../middlewares/admin.middleware');
const schemas = require('../../validators/user.validator');

const router = express.Router();

router.get('/', requirePermission('analytics:read'), validate(schemas.adminAnalytics, 'query'), ctrl.analytics);

module.exports = router;
