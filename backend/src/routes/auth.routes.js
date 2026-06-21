'use strict';

const express = require('express');
const ctrl = require('../controllers/auth.controller');
const validate = require('../middlewares/validate');
const authenticate = require('../middlewares/authenticate');
const rateLimit = require('../middlewares/rateLimit');
const schemas = require('../validators/auth.validator');
const env = require('../config/env');

const router = express.Router();

// Limite spécifique sur l'envoi d'OTP : 5/heure/numéro (spec §1).
const otpLimiter = rateLimit({
  max: env.otp.resendLimitPerHour,
  windowSec: 3600,
  prefix: 'rl:otp',
  keyGenerator: (req) => `phone:${req.body.phone || req.ip}`,
});

router.post('/register', validate(schemas.register), ctrl.register);
router.post('/verify-otp', validate(schemas.verifyOtp), ctrl.verifyOtp);
router.post('/resend-otp', otpLimiter, validate(schemas.resendOtp), ctrl.resendOtp);
router.post('/login', validate(schemas.login), ctrl.login);
router.post('/refresh', validate(schemas.refresh), ctrl.refresh);
router.post('/logout', authenticate, ctrl.logout);

module.exports = router;
