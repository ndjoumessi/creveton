'use strict';

const express = require('express');
const ctrl = require('../../controllers/admin/sessions.admin.controller');
const validate = require('../../middlewares/validate');
const { requirePermission } = require('../../middlewares/admin.middleware');
const schemas = require('../../validators/user.validator');

const router = express.Router();

router.get('/', requirePermission('sessions:read'), validate(schemas.adminSessions, 'query'), ctrl.list);
router.get('/:id', requirePermission('sessions:read'), ctrl.get);

module.exports = router;
