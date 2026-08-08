'use strict';

const express = require('express');
const ctrl = require('../controllers/user.controller');
const validate = require('../middlewares/validate');
const authenticate = require('../middlewares/authenticate');
const featureFlag = require('../middlewares/featureFlag');
const rateLimit = require('../middlewares/rateLimit');
const { avatarUpload } = require('../config/multer');
const schemas = require('../validators/user.validator');

const router = express.Router();

router.use(authenticate);

router.get('/search', validate(schemas.search, 'query'), ctrl.search);
router.get('/me', ctrl.me);
router.patch('/me', validate(schemas.updateMe), ctrl.updateMe);
// Vérification d'adresse. Toutes authentifiées : c'est le titulaire du compte
// qui confirme ou corrige SON adresse — rien de public ici, donc pas
// d'anti-énumération à tenir. Le plafond horaire vit dans le service (5/h par
// compte) ; on ajoute une limite par IP contre le brute-force du code à 6
// chiffres, en plus des 3 essais par code.
const emailVerifyLimiter = rateLimit({
  max: 30,
  windowSec: 3600,
  prefix: 'rl:emailverify',
  keyGenerator: (req) => `u:${req.user?.id || req.ip}`,
});

router.post('/me/email', emailVerifyLimiter, validate(schemas.emailChange), ctrl.requestEmailChange);
router.post('/me/email/verify/request', emailVerifyLimiter, ctrl.requestEmailVerification);
router.post('/me/email/verify', emailVerifyLimiter, validate(schemas.emailVerify), ctrl.confirmEmailVerification);

router.post('/me/avatar', avatarUpload.single('avatar'), ctrl.uploadAvatar);
router.delete('/me/avatar', ctrl.deleteAvatar);
router.post('/me/referral/invite', validate(schemas.referralInvite), ctrl.referralInvite);
router.get('/me/history', validate(schemas.pagination, 'query'), ctrl.history);
router.get(
  '/me/transactions',
  featureFlag('tournaments.paid.enabled'),
  validate(schemas.pagination, 'query'),
  ctrl.transactions
);

module.exports = router;
