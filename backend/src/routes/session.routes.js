'use strict';

const express = require('express');
const ctrl = require('../controllers/session.controller');
const validate = require('../middlewares/validate');
const authenticate = require('../middlewares/authenticate');
const schemas = require('../validators/session.validator');

const router = express.Router();

router.post('/submit', authenticate, validate(schemas.submit), ctrl.submit);

module.exports = router;
