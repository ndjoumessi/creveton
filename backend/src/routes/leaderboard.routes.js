'use strict';

const express = require('express');
const Joi = require('joi');
const ctrl = require('../controllers/leaderboard.controller');
const validate = require('../middlewares/validate');
const authenticate = require('../middlewares/authenticate');
const { LEADERBOARD_SCOPES, THEMES } = require('../utils/constants');

const router = express.Router();

const query = Joi.object({
  scope: Joi.string().valid(...LEADERBOARD_SCOPES).default('global'),
  theme: Joi.when('scope', {
    is: 'theme',
    then: Joi.string().valid(...THEMES).required(),
    otherwise: Joi.string().valid(...THEMES).optional(),
  }),
  limit: Joi.number().integer().min(1).max(100).default(20),
  cursor: Joi.string().optional(),
});

router.get('/', authenticate, validate(query, 'query'), ctrl.get);

module.exports = router;
