'use strict';

const express = require('express');
const ctrl = require('../../controllers/admin/leaderboard.admin.controller');
const validate = require('../../middlewares/validate');
const { requirePermission } = require('../../middlewares/admin.middleware');
const schemas = require('../../validators/user.validator');

const router = express.Router();

router.get('/', requirePermission('leaderboard:read'), validate(schemas.adminLeaderboard, 'query'), ctrl.get);

module.exports = router;
