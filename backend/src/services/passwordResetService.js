'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const { redis } = require('../config/redis');
const env = require('../config/env');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const userModel = require('../models/user.model');
const emailService = require('./emailService');
const smsService = require('./smsService');
const authService = require('./authService');

/**
 * Mot de passe oublié — code à 6 chiffres envoyé par EMAIL.
 *
 * Pourquoi l'email et pas le SMS : l'email est déjà l'identifiant de connexion
 * (c'est celui que l'utilisateur vient de taper sur l'écran de login), alors que
 * demander le téléphone ajouterait une seconde chose à retrouver, dans un format
 * international. Et chaque tentative sur un endpoint PUBLIC coûterait un SMS.
 *
 * Pourquoi un code et pas un lien : un lien exige une page d'atterrissage et des
 * liens universels iOS/Android qui ne sont pas configurés. Un code se recopie
 * dans l'app, sans quitter le flux, et fonctionne même si l'email est lu depuis
 * un autre appareil.
 *
 * ─ Limite connue et assumée ─
 * L'email n'est PAS vérifié à l'inscription (requis et unique, rien de plus) :
 * une adresse mal saisie ou usurpée expose le compte. Le garde-fou habituel
 * — « email de confirmation après changement » — serait ici inutile puisqu'il
 * partirait à l'attaquant. La notification part donc par SMS, sur le SEUL canal
 * dont on sait qu'il appartient au titulaire (`phone_verified`). Fermer
 * complètement le trou demande une vérification d'email à l'inscription :
 * chantier séparé.
 *
 * Stockage : Redis, clé `pwdreset:<user_id>` — l'ID et pas l'email, pour qu'un
 * changement d'adresse en cours de route ne puisse pas être exploité.
 *
 * Le code n'est PAS haché. Un SHA-256 sur un espace de 10^6 se casse
 * instantanément : ce serait du théâtre. Ce qui protège réellement, c'est le TTL
 * court, le plafond de tentatives et le rate limit (le hachage a du sens pour un
 * token long, comme celui des invitations — pas pour six chiffres).
 */

const BCRYPT_COST = 12;
const resetKey = (userId) => `pwdreset:${userId}`;
const throttleKey = (userId) => `pwdreset:sent:${userId}`;

function generateCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * Génère un code, le stocke et l'envoie par email. Usage interne : les appelants
 * publics (forgot-password) ne doivent JAMAIS révéler si le compte existe.
 *
 * @returns {Promise<{ sent: boolean, channel: string, expires_at: string }>}
 */
async function issueFor(user, { awaitDelivery = true } = {}) {
  // Plafond par compte, en plus du rate limit HTTP (qui porte sur l'email brut
  // et l'IP) : empêche de noyer une boîte via des variantes d'adresse.
  const sent = await redis.incr(throttleKey(user.id));
  if (sent === 1) await redis.expire(throttleKey(user.id), 3600);
  if (sent > env.passwordReset.requestLimitPerHour) {
    throw new ApiError('RATE_LIMITED', {
      message: 'Trop de demandes de réinitialisation, réessayez plus tard.',
    });
  }

  const code = generateCode();
  const ttlSec = env.passwordReset.expiresMinutes * 60;
  await redis.hset(resetKey(user.id), { code, attempts: 0 });
  await redis.expire(resetKey(user.id), ttlSec);

  // L'envoi ne jette jamais (règle d'emailService) : un échec de délivrance ne
  // doit pas révéler l'existence du compte via un 503 différencié.
  const send = emailService
    .sendPasswordResetCode({
      to: user.email,
      name: user.name,
      code,
      expiresMinutes: env.passwordReset.expiresMinutes,
      lang: user.lang || 'fr',
    })
    .then((result) => {
      if (!result.sent) {
        logger.warn('Code de réinitialisation non délivré par email', {
          user_id: user.id,
          skipped: !!result.skipped,
          error: result.error || null,
        });
      }
      return result;
    });

  const base = {
    channel: 'email',
    expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
  };

  // Appel PUBLIC : on n'attend pas le prestataire. Deux raisons, la seconde
  // décisive.
  //  · Latence : mesuré 16,4 s sur un appel Resend en échec, pour une réponse
  //    qui ne dit rien de la délivrance de toute façon (204 systématique).
  //  · Anti-énumération : c'est le trou que la réponse neutre était censée
  //    fermer. Un email INCONNU renvoyait instantanément, un email CONNU après
  //    l'aller-retour Resend — le chronomètre trahissait ce que le corps de la
  //    réponse taisait. En rendant la main tout de suite dans les deux cas, les
  //    deux chemins deviennent indistinguables.
  if (!awaitDelivery) return { ...base, sent: null };

  const result = await send;
  return { ...base, sent: !!result.sent };
}

/**
 * POST /auth/forgot-password — demande un code.
 *
 * Renvoie TOUJOURS le même résultat, que le compte existe ou non : le login
 * applique déjà cette règle (`AUTH_INVALID_CREDENTIALS` dans les deux cas), un
 * endpoint public qui distinguerait les deux serait un annuaire d'adresses.
 * Même chose pour les comptes sans mot de passe (admins invités n'ayant pas
 * encore accepté) : rien n'est envoyé, la réponse est identique.
 */
async function requestReset(email) {
  const user = await userModel.findByEmail(String(email).trim().toLowerCase());

  if (!user || !user.password_hash) {
    logger.info('Demande de réinitialisation sans destinataire', { email_known: !!user });
    return { requested: true };
  }

  try {
    await issueFor(user, { awaitDelivery: false });
  } catch (err) {
    // Y compris RATE_LIMITED : le remonter tel quel dirait « ce compte existe et
    // a déjà été sollicité ». On journalise et on répond comme d'habitude.
    logger.warn('Émission du code de réinitialisation refusée', {
      user_id: user.id,
      code: err.code || null,
    });
  }

  return { requested: true };
}

/**
 * POST /auth/reset-password — valide le code et pose le nouveau mot de passe.
 *
 * Contrairement à `changePassword` (compte authentifié, qui ne coupe que les
 * AUTRES sessions), une réinitialisation signifie « j'ai peut-être été
 * compromis » : toutes les sessions tombent, y compris celles de l'appareil
 * courant. On réémet ensuite des tokens neufs — l'utilisateur vient de prouver
 * qu'il contrôle la boîte, le renvoyer au login n'apporterait rien.
 *
 * @returns {Promise<object>} enveloppe tokens (même contrat que /auth/login)
 */
async function confirmReset({ email, code, newPassword }) {
  const user = await userModel.findByEmail(String(email).trim().toLowerCase());

  // Compte inconnu : même erreur que « code faux ». Sinon l'écran de saisie du
  // code devient à son tour un oracle d'existence.
  if (!user || !user.password_hash) {
    throw new ApiError('RESET_CODE_INVALID');
  }

  const key = resetKey(user.id);
  const data = await redis.hgetall(key);
  if (!data || !data.code) {
    throw new ApiError('RESET_CODE_EXPIRED');
  }

  const attempts = parseInt(data.attempts, 10) || 0;
  if (attempts >= env.passwordReset.maxAttempts) {
    await redis.del(key);
    throw new ApiError('RESET_TOO_MANY_ATTEMPTS');
  }

  // Comparaison à temps constant : les deux chaînes font 6 caractères, mais on
  // ne veut pas d'un `===` qui court-circuite au premier chiffre différent.
  const given = Buffer.from(String(code));
  const expected = Buffer.from(String(data.code));
  const match =
    given.length === expected.length && crypto.timingSafeEqual(given, expected);

  if (!match) {
    const next = await redis.hincrby(key, 'attempts', 1);
    if (next >= env.passwordReset.maxAttempts) {
      // Plafond atteint : le code meurt ici, il faut en redemander un. Laisser
      // vivre un code à 6 chiffres après 3 échecs le rendrait devinable.
      await redis.del(key);
      throw new ApiError('RESET_TOO_MANY_ATTEMPTS');
    }
    throw new ApiError('RESET_CODE_INVALID');
  }

  // Code valide : usage unique, consommé avant toute écriture.
  await redis.del(key);
  await redis.del(throttleKey(user.id));

  if (await bcrypt.compare(newPassword, user.password_hash)) {
    throw new ApiError('VALIDATION_ERROR', {
      message: "Le nouveau mot de passe doit différer de l'ancien.",
    });
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  await userModel.setPassword(user.id, passwordHash);
  await authService.revokeAllSessions(user.id);

  // Notification sur le canal VÉRIFIÉ (cf. en-tête du fichier) — fire-and-forget :
  // un SMS qui échoue ne doit pas faire échouer une réinitialisation réussie.
  notifyPasswordChanged(user);

  const fresh = await userModel.findById(user.id);
  return authService.issueTokens(fresh || user);
}

/** SMS « ton mot de passe a changé ». Jamais bloquant, jamais propagé. */
function notifyPasswordChanged(user) {
  if (!user.phone || !user.phone_verified) return;
  const isFr = (user.lang || 'fr') !== 'en';
  const body = isFr
    ? "Creveton : ton mot de passe vient d'être modifié. Ce n'était pas toi ? Contacte-nous immédiatement."
    : 'Creveton: your password was just changed. Not you? Contact us immediately.';
  smsService.sendSms(user.phone, body).catch((err) => {
    logger.warn('SMS de notification de changement de mot de passe non envoyé', {
      user_id: user.id,
      error: err.message,
    });
  });
}

/**
 * Déclenchement par un admin (POST /admin/users/:id/reset-password).
 *
 * L'admin déclenche, il ne reçoit rien : le code part chez l'utilisateur. La
 * réponse dit par quel canal, pour que la console puisse l'afficher au lieu d'un
 * `reset_initiated: true` qui n'engageait rien.
 *
 * Ici on remonte les erreurs (pas d'anti-énumération à tenir : l'appelant est
 * authentifié et a déjà l'utilisateur sous les yeux).
 */
async function issueForUser(user) {
  if (!user.email) {
    throw new ApiError('VALIDATION_ERROR', {
      message: "Ce compte n'a pas d'adresse email : impossible d'envoyer un code.",
    });
  }
  // Ici on ATTEND la délivrance : l'admin déclenche depuis la console et a
  // besoin de savoir si le code est réellement parti (il n'y a pas
  // d'anti-énumération à tenir, l'appelant est authentifié).
  const result = await issueFor(user, { awaitDelivery: true });
  return {
    reset_initiated: true,
    channel: result.channel,
    delivered: result.sent,
    expires_at: result.expires_at,
  };
}

module.exports = { requestReset, confirmReset, issueForUser };
