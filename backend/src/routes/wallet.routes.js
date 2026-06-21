'use strict';

const express = require('express');
const Joi = require('joi');
const ctrl = require('../controllers/wallet.controller');
const validate = require('../middlewares/validate');
const authenticate = require('../middlewares/authenticate');
const featureFlag = require('../middlewares/featureFlag');
const { PAYMENT_PROVIDERS, PHONE_REGEX } = require('../utils/constants');

const router = express.Router();

// Tout le bloc wallet dépend du flag payant (spec §11).
router.use(authenticate, featureFlag('tournaments.paid.enabled'));

const recharge = Joi.object({
  amount: Joi.number().integer().min(100).required(),
  provider: Joi.string().valid(...PAYMENT_PROVIDERS).required(),
  phone: Joi.string().pattern(PHONE_REGEX).required(),
});

router.get('/', ctrl.get);
router.post('/recharge', validate(recharge), ctrl.recharge);

module.exports = router;
