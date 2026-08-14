'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const { redis } = require('../config/redis');
const env = require('../config/env');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const userModel = require('../models/user.model');
const otpChannel = require('./otpChannel');
const smsService = require('./smsService');
const authService = require('./authService');

/**
 * Mot de passe oublié — code à 6 chiffres envoyé sur le TÉLÉPHONE, par
 * `otpChannel` (WhatsApp, repli SMS).
 *
 * L'identifiant reste l'email : c'est celui que l'utilisateur vient de taper sur
 * l'écran de connexion, lui redemander son numéro dans un format international
 * ajouterait une chose à retrouver. Ce qui change, c'est la DESTINATION du code.
 *
 * ─ Pourquoi le téléphone plutôt que l'email ─
 * Le numéro est le seul identifiant dont le contrôle est prouvé à l'inscription
 * (OTP obligatoire). L'adresse, elle, n'est vérifiée que si le joueur en prend
 * l'initiative depuis son profil. Adosser la récupération de compte à l'email
 * revenait donc à l'adosser au maillon FAIBLE, et le service se contredisait
 * lui-même : il exigeait `email_verified` pour envoyer le code tout en
 * justifiant l'envoi de la notification par SMS au motif que c'est « le canal
 * vérifié ». C'est maintenant le même canal pour les deux.
 *
 * Conséquence pratique : un joueur dont l'adresse n'est pas confirmée peut
 * désormais récupérer son compte. C'était l'immense majorité d'entre eux — la
 * vérification d'adresse est facultative et le code de vérification lui-même
 * suppose un envoi d'email qui fonctionne.
 *
 * ─ L'email n'est PAS un repli ici ─
 * `otpChannel` sait retomber sur l'email, mais on ne lui passe volontairement
 * pas `email` : son canal email se désactive alors seul (`canReach`). Livrer un
 * code de réinitialisation à une adresse non prouvée rouvrirait exactement le
 * trou que `email_verified` fermait — une faute de frappe à l'inscription
 * offrirait le compte à qui relève cette adresse.
 *
 * Pourquoi un code et pas un lien : un lien exige une page d'atterrissage et des
 * liens universels iOS/Android qui ne sont pas configurés. Un code se recopie
 * dans l'app, sans quitter le flux.
 *
 * La notification de changement, elle, reste un SMS : le modèle WhatsApp de
 * catégorie AUTHENTICATION ne transporte QU'UN CODE. Faire passer une phrase
 * par là demanderait un second modèle, de catégorie utility, approuvé par Meta.
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
 * Génère un code, le stocke et l'envoie sur le téléphone. Usage interne : les
 * appelants publics (forgot-password) ne doivent JAMAIS révéler si le compte
 * existe.
 *
 * @returns {Promise<{ sent: boolean|null, channel: string|null, expires_at: string }>}
 */
async function issueFor(user, { awaitDelivery = true } = {}) {
  // Plafond par compte, en plus du rate limit HTTP (qui porte sur l'email brut
  // et l'IP) : empêche de noyer une boîte via des variantes d'adresse.
  const sent = await redis.incr(throttleKey(user.id));
  if (sent === 1) await redis.expire(throttleKey(user.id), 3600);
  if (sent > env.passwordReset.requestLimitPerHour) {
    throw new ApiError('RATE_LIMITED', {
      message: { fr: 'Trop de demandes de réinitialisation, réessayez plus tard.', en: 'Too many reset requests, try again later.' },
    });
  }

  const code = generateCode();
  const ttlSec = env.passwordReset.expiresMinutes * 60;
  await redis.hset(resetKey(user.id), { code, attempts: 0 });
  await redis.expire(resetKey(user.id), ttlSec);

  // `email` n'est PAS passé (cf. en-tête) : le canal email d'`otpChannel` se
  // déclare alors injoignable et la chaîne se réduit à WhatsApp puis SMS.
  //
  // ⚠️ Contrairement à `emailService`, qui renvoyait toujours `{ sent: false }`,
  // `otpChannel.sendCode` JETTE quand aucun canal n'aboutit. Sur le chemin
  // public on ne l'attend pas : sans ce `.catch()`, le rejet remonterait en
  // `unhandledRejection` — soit un plantage du processus, pour un échec d'envoi
  // que ce service traite justement comme non fatal.
  const send = otpChannel
    .sendCode(
      { phone: user.phone, name: user.name, lang: user.lang || 'fr' },
      code
    )
    .then((res) => ({ sent: true, channel: res.channel }))
    .catch((err) => {
      logger.warn('Code de réinitialisation non délivré', {
        user_id: user.id,
        error: err.message,
      });
      return { sent: false, channel: null };
    });

  const base = {
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
  if (!awaitDelivery) return { ...base, sent: null, channel: null };

  const result = await send;
  return { ...base, sent: result.sent, channel: result.channel };
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

  // Trois refus, une seule réponse. `phone_verified` en fait partie : le code
  // part sur le numéro, l'envoyer vers un numéro non prouvé n'aurait aucune
  // valeur de preuve. En pratique la condition est presque toujours remplie —
  // l'OTP d'inscription la pose — et elle ne peut être fausse que pour un compte
  // resté bloqué avant sa vérification.
  if (!user || !user.password_hash || !user.phone_verified) {
    logger.info('Demande de réinitialisation sans destinataire', {
      email_known: !!user,
      phone_verified: user ? !!user.phone_verified : null,
    });
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

  // Compte inconnu, sans mot de passe, ou numéro non vérifié : même erreur que
  // « code faux ». Sinon l'écran de saisie du code devient à son tour un oracle,
  // sur l'existence du compte comme sur son état de vérification.
  if (!user || !user.password_hash || !user.phone_verified) {
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
      message: { fr: "Le nouveau mot de passe doit différer de l'ancien.", en: 'The new password must differ from the old one.' },
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

/**
 * SMS « ton mot de passe a changé ». Jamais bloquant, jamais propagé.
 *
 * Reste un SMS alors que le CODE est passé sur WhatsApp : le modèle WhatsApp de
 * catégorie AUTHENTICATION ne porte qu'un code à six chiffres, pas une phrase.
 * Router cette alerte par WhatsApp exigerait un second modèle, de catégorie
 * utility, soumis à l'approbation de Meta — un chantier à part, pas un
 * paramètre. Sans Twilio configuré, `smsService` simule : l'alerte n'existe
 * donc pas aujourd'hui, ce qui était déjà le cas avant ce changement.
 */
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
  if (!user.phone) {
    throw new ApiError('VALIDATION_ERROR', {
      message: { fr: "Ce compte n'a pas de numéro : impossible d'envoyer un code.", en: 'This account has no phone number: a code cannot be sent.' },
    });
  }
  // Pas d'anti-énumération à tenir ici (l'appelant est authentifié et a la fiche
  // sous les yeux) : on dit franchement pourquoi c'est refusé, sinon l'opérateur
  // croirait à une panne.
  if (!user.phone_verified) {
    throw new ApiError('VALIDATION_ERROR', {
      message: {
        fr: "Le numéro de ce compte n'est pas vérifié : lui envoyer un code de réinitialisation n'aurait aucune valeur de preuve.",
        en: "This account's phone number is not verified: sending it a reset code would prove nothing.",
      },
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
