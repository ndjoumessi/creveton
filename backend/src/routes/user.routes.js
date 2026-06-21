'use strict';

const express = require('express');
const ctrl = require('../controllers/user.controller');
const validate = require('../middlewares/validate');
const authenticate = require('../middlewares/authenticate');
const featureFlag = require('../middlewares/featureFlag');
const schemas = require('../validators/user.validator');

const router = express.Router();

router.use(authenticate);

router.get('/me', ctrl.me);
router.patch('/me', validate(schemas.updateMe), ctrl.updateMe);
router.get('/me/history', validate(schemas.pagination, 'query'), ctrl.history);
router.get(
  '/me/transactions',
  featureFlag('tournaments.paid.enabled'),
  validate(schemas.pagination, 'query'),
  ctrl.transactions
);

module.exports = router;
