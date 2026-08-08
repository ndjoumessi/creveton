'use strict';

const crypto = require('crypto');

const { redis } = require('../config/redis');
const env = require('../config/env');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const userModel = require('../models/user.model');
const emailService = require('./emailService');
const smsService = require('./smsService');

/**
 * Vérification de l'adresse email — à l'inscription et au changement d'adresse.
 *
 * ─ Pourquoi ─
 * L'email est requis et unique à l'inscription, mais n'était jamais vérifié.
 * Une adresse mal saisie créait donc un compte dont la récupération de mot de
 * passe partait chez un inconnu, qui pouvait le prendre. On réserve désormais
 * cette récupération aux adresses dont on a prouvé le contrôle
 * (`passwordResetService` refuse les autres).
 *
 * ─ Non bloquant, volontairement ─
 * Vérifier au moment de l'inscription, en bloquant, aurait imposé DEUX codes
 * (SMS pour le téléphone + email) à un parcours qui en a déjà un, et aurait
 * verrouillé tous les comptes existants. Le compte est donc créé et jouable
 * immédiatement ; l'email de vérification part en parallèle de l'OTP, et le
 * profil rappelle l'adresse non confirmée. Ce qui est refusé sans vérification,
 * c'est la RÉCUPÉRATION — pas l'usage.
 *
 * ─ Changer d'adresse fait partie du lot ─
 * Sans elle, gater la récupération serait un piège : `PATCH /users/me`
 * n'acceptait pas `email`, donc une faute de frappe à l'inscription était
 * définitive et le compte devenait irrécupérable pour toujours. Le changement
 * passe par le même code, envoyé à la NOUVELLE adresse : on ne pose jamais une
 * adresse qu'on n'a pas prouvée.
 *
 * Stockage Redis, clé `emailverify:<user_id>` : { code, attempts, email }.
 * `email` est l'adresse VISÉE — identique à celle du compte lors d'une simple
 * confirmation, différente lors d'un changement. La garder ici évite qu'un code
 * demandé pour une adresse serve à en valider une autre.
 *
 * Le code n'est pas haché : six chiffres, hacher ne protège de rien (voir la
 * note détaillée dans passwordResetService).
 */

const verifyKey = (userId) => `emailverify:${userId}`;
const throttleKey = (userId) => `emailverify:sent:${userId}`;

function generateCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

function normalize(email) {
  return String(email || '').trim().toLowerCase();
}

/**
 * Émet un code vers `targetEmail` (l'adresse du compte, ou une nouvelle).
 *
 * @param {object} user
 * @param {string} targetEmail
 * @param {{ isChange?: boolean, awaitDelivery?: boolean }} opts
 */
async function issue(user, targetEmail, { isChange = false, awaitDelivery = true } = {}) {
  const email = normalize(targetEmail);
  if (!email) {
    throw new ApiError('VALIDATION_ERROR', { message: { fr: 'Adresse email manquante.', en: 'Missing email address.' } });
  }

  const sent = await redis.incr(throttleKey(user.id));
  if (sent === 1) await redis.expire(throttleKey(user.id), 3600);
  if (sent > env.emailVerification.requestLimitPerHour) {
    throw new ApiError('RATE_LIMITED', {
      message: { fr: 'Trop de demandes de vérification, réessayez plus tard.', en: 'Too many verification requests, try again later.' },
    });
  }

  const code = generateCode();
  const ttlSec = env.emailVerification.expiresMinutes * 60;
  await redis.hset(verifyKey(user.id), { code, attempts: 0, email });
  await redis.expire(verifyKey(user.id), ttlSec);

  const delivery = emailService
    .sendEmailVerificationCode({
      to: email,
      name: user.name,
      code,
      expiresMinutes: env.emailVerification.expiresMinutes,
      isChange,
      lang: user.lang || 'fr',
    })
    .then((result) => {
      if (!result.sent) {
        logger.warn("Code de vérification d'adresse non délivré", {
          user_id: user.id,
          skipped: !!result.skipped,
          error: result.error || null,
        });
      }
      return result;
    })
    .catch((err) => {
      logger.error("Exception à l'envoi du code de vérification", {
        user_id: user.id,
        error: err.message,
      });
      return { sent: false };
    });

  const base = {
    email,
    expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
  };

  // À l'inscription on n'attend pas : le prestataire ne doit pas rallonger la
  // création de compte (mesuré 16 s sur un envoi en échec côté réinitialisation).
  if (!awaitDelivery) return { ...base, sent: null };

  const result = await delivery;
  return { ...base, sent: !!result.sent };
}

/**
 * Déclenchement à l'inscription — jamais bloquant, jamais propagé : un email qui
 * ne part pas ne doit pas faire échouer une création de compte par ailleurs
 * réussie (le joueur pourra redemander un code depuis son profil).
 */
function issueOnRegister(user) {
  if (!user.email) return;
  issue(user, user.email, { awaitDelivery: false }).catch((err) => {
    logger.warn("Code de vérification non émis à l'inscription", {
      user_id: user.id,
      code: err.code || null,
    });
  });
}

/** POST /users/me/email/verify/request — (re)demande un code pour l'adresse courante. */
async function requestForCurrentEmail(userId) {
  const user = await userModel.findById(userId);
  if (!user) throw new ApiError('USER_NOT_FOUND');
  if (!user.email) {
    throw new ApiError('VALIDATION_ERROR', { message: { fr: "Ce compte n'a pas d'adresse email.", en: 'This account has no email address.' } });
  }
  if (user.email_verified) {
    throw new ApiError('EMAIL_ALREADY_VERIFIED');
  }
  const res = await issue(user, user.email);
  return { sent: res.sent, email: res.email, expires_at: res.expires_at };
}

/**
 * POST /users/me/email — demande un CHANGEMENT d'adresse.
 *
 * L'unicité est contrôlée ici pour un message clair, et de nouveau à la
 * confirmation : entre les deux, quelqu'un a pu prendre l'adresse.
 */
async function requestEmailChange(userId, newEmail) {
  const user = await userModel.findById(userId);
  if (!user) throw new ApiError('USER_NOT_FOUND');

  const email = normalize(newEmail);
  if (email === normalize(user.email)) {
    if (user.email_verified) throw new ApiError('EMAIL_ALREADY_VERIFIED');
    // Même adresse, pas encore vérifiée : c'est une simple redemande de code.
    const same = await issue(user, email);
    return { sent: same.sent, email: same.email, expires_at: same.expires_at };
  }

  const taken = await userModel.findByEmail(email);
  if (taken && taken.id !== user.id) throw new ApiError('EMAIL_ALREADY_USED');

  const res = await issue(user, email, { isChange: true });
  return { sent: res.sent, email: res.email, expires_at: res.expires_at };
}

/**
 * POST /users/me/email/verify — confirme le code.
 *
 * Pose l'adresse VISÉE (celle stockée avec le code), pas celle du corps de la
 * requête : sinon un code obtenu pour une adresse servirait à en valider une
 * autre.
 */
async function confirm(userId, code) {
  const user = await userModel.findById(userId);
  if (!user) throw new ApiError('USER_NOT_FOUND');

  const key = verifyKey(userId);
  const data = await redis.hgetall(key);
  if (!data || !data.code) throw new ApiError('VERIFY_CODE_EXPIRED');

  const attempts = parseInt(data.attempts, 10) || 0;
  if (attempts >= env.emailVerification.maxAttempts) {
    await redis.del(key);
    throw new ApiError('VERIFY_TOO_MANY_ATTEMPTS');
  }

  const given = Buffer.from(String(code));
  const expected = Buffer.from(String(data.code));
  const match = given.length === expected.length && crypto.timingSafeEqual(given, expected);

  if (!match) {
    const next = await redis.hincrby(key, 'attempts', 1);
    if (next >= env.emailVerification.maxAttempts) {
      await redis.del(key);
      throw new ApiError('VERIFY_TOO_MANY_ATTEMPTS');
    }
    throw new ApiError('VERIFY_CODE_INVALID');
  }

  await redis.del(key);
  await redis.del(throttleKey(userId));

  const target = normalize(data.email);
  const isChange = target !== normalize(user.email);

  let updated;
  try {
    updated = isChange
      ? await userModel.setVerifiedEmail(userId, target)
      : await userModel.markEmailVerified(userId);
  } catch (err) {
    // Course perdue sur l'unicité : quelqu'un a pris l'adresse entre la demande
    // et la confirmation. Le code est déjà consommé — c'est volontaire, il ne
    // doit pas resservir sur une adresse désormais indisponible.
    if (err && err.code === '23505') throw new ApiError('EMAIL_ALREADY_USED');
    throw err;
  }

  // L'email est l'identifiant de connexion : un changement modifie la façon de
  // se connecter. On prévient sur le canal VÉRIFIÉ (le téléphone) — une alerte
  // envoyée à une adresse email n'aurait aucune valeur ici, puisque c'est
  // précisément l'adresse qui vient de bouger.
  if (isChange) notifyEmailChanged(updated || user, target);

  return {
    email: (updated || user).email,
    email_verified: true,
    changed: isChange,
  };
}

/** SMS « ton adresse a changé ». Jamais bloquant, jamais propagé. */
function notifyEmailChanged(user, newEmail) {
  if (!user.phone || !user.phone_verified) return;
  const isFr = (user.lang || 'fr') !== 'en';
  const body = isFr
    ? `Creveton : l'adresse de connexion de ton compte est maintenant ${newEmail}. Ce n'était pas toi ? Contacte-nous immédiatement.`
    : `Creveton: your account sign-in address is now ${newEmail}. Not you? Contact us immediately.`;
  smsService.sendSms(user.phone, body).catch((err) => {
    logger.warn("SMS de notification de changement d'adresse non envoyé", {
      user_id: user.id,
      error: err.message,
    });
  });
}

module.exports = {
  issueOnRegister,
  requestForCurrentEmail,
  requestEmailChange,
  confirm,
};
