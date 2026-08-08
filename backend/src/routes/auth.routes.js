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
// Mot de passe oublié. DEUX limites, volontairement :
//  · par email — plafonne le harcèlement d'une boîte précise ;
//  · par IP    — sans elle, un seul acteur balaie des milliers d'adresses pour
//    découvrir lesquelles existent, ce que la réponse neutre à elle seule
//    n'empêche pas (il lui suffirait de mesurer le temps de réponse ou le volume).
// La validation du code a sa propre limite IP : c'est là que se tenterait un
// brute-force à 6 chiffres, en plus du plafond de 3 essais par code.
const forgotLimiter = rateLimit({
  max: env.passwordReset.requestLimitPerHour,
  windowSec: 3600,
  prefix: 'rl:pwdreset',
  keyGenerator: (req) => `email:${String(req.body.email || '').toLowerCase() || req.ip}`,
});
const forgotIpLimiter = rateLimit({
  max: 20,
  windowSec: 3600,
  prefix: 'rl:pwdreset:ip',
  keyGenerator: (req) => `ip:${req.ip}`,
});
const resetIpLimiter = rateLimit({
  max: 30,
  windowSec: 3600,
  prefix: 'rl:pwdreset:confirm',
  keyGenerator: (req) => `ip:${req.ip}`,
});

router.post('/change-password', authenticate, validate(schemas.changePassword), ctrl.changePassword);
router.post('/forgot-password', forgotIpLimiter, forgotLimiter, validate(schemas.forgotPassword), ctrl.forgotPassword);
router.post('/reset-password', resetIpLimiter, validate(schemas.resetPassword), ctrl.resetPassword);
router.post('/logout', authenticate, ctrl.logout);
router.get('/sessions', authenticate, ctrl.sessions);
router.post('/sessions/revoke-others', authenticate, ctrl.revokeOtherSessions);

module.exports = router;
