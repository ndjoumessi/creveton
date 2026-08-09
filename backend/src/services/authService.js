'use strict';

const { randomUUID } = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { redis } = require('../config/redis');
const ApiError = require('../utils/ApiError');
const { deviceLabel } = require('../utils/device');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} = require('../utils/jwt');
const userModel = require('../models/user.model');
const otpService = require('./otpService');
const emailVerificationService = require('./emailVerificationService');

/**
 * Logique métier d'authentification (réf. spec §4).
 *
 *  - Hash bcrypt (coût 12).
 *  - JWT access (1 h) + refresh (30 j), reliés par un identifiant de session `sid`.
 *  - Allowlist des refresh tokens dans Redis → révocation au logout, refus
 *    d'un refresh révoqué. Clé : `refresh:{userId}:{sid}` avec TTL = durée du
 *    refresh token. Fermer une session = supprimer cette clé.
 */

const BCRYPT_COST = 12;
const refreshKey = (userId, sid) => `refresh:${userId}:${sid}`;

/** Durée de vie (s) d'un token signé, lue depuis le token lui-même (exp - iat). */
function tokenTtlSeconds(token) {
  const decoded = jwt.decode(token);
  if (decoded && decoded.exp && decoded.iat) return decoded.exp - decoded.iat;
  return null;
}

/**
 * Émet une paire access/refresh pour un utilisateur et enregistre la session
 * dans l'allowlist Redis.
 * @returns {Promise<object>} enveloppe tokens + user abrégé (contrat §4).
 */
async function issueTokens(user, meta = {}) {
  const sid = randomUUID();
  const accessToken = signAccessToken(user, sid);
  const refreshToken = signRefreshToken(user, sid);

  const refreshTtl = tokenTtlSeconds(refreshToken) || 30 * 24 * 3600;
  // La valeur était `'1'` : l'allowlist ne savait donc RIEN de la session, et
  // l'écran « Sessions actives » ne pouvait afficher qu'un sid tronqué. On y
  // range désormais de quoi la reconnaître — étiquette d'appareil et date
  // d'ouverture, rien d'autre (cf. utils/device.js sur le choix de ne pas
  // conserver l'IP). Ça expire avec le token, aucune rétention nouvelle.
  const entry = JSON.stringify({
    device: deviceLabel(meta.userAgent) || null,
    at: new Date().toISOString(),
  });
  await redis.set(refreshKey(user.id, sid), entry, 'EX', refreshTtl);

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'Bearer',
    expires_in: tokenTtlSeconds(accessToken) || 3600,
    user: userModel.toPublic(user),
  };
}

/**
 * POST /auth/register — crée un compte (phone_verified=false) et envoie un OTP.
 * @returns {{ user_id, phone, otp_sent, otp_expires_at }}
 */
async function register(input) {
  // Pré-checks explicites pour des codes d'erreur clairs (la contrainte UNIQUE
  // en base reste le garde-fou ultime contre les races — cf. catch 23505).
  if (await userModel.findByEmail(input.email)) {
    throw new ApiError('EMAIL_ALREADY_USED');
  }
  if (await userModel.findByPhone(input.phone)) {
    throw new ApiError('PHONE_ALREADY_USED');
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);

  // Parrainage : on rattache si le code existe, sinon on ignore silencieusement
  // (aucun code d'erreur « referral invalide » au contrat register §4).
  let referredBy = null;
  if (input.referral_code) {
    const parrain = await userModel.findByReferralCode(input.referral_code);
    if (parrain) referredBy = parrain.id;
  }

  const referralCode = await userModel.generateUniqueReferralCode();

  let user;
  try {
    user = await userModel.create({
      name: input.name,
      email: input.email,
      phone: input.phone,
      password_hash: passwordHash,
      ville: input.ville,
      age: input.age,
      sexe: input.sexe,
      lang: input.lang,
      referral_code: referralCode,
      referred_by: referredBy,
    });
  } catch (err) {
    if (err && err.code === '23505') {
      // Course perdue sur l'unicité : on retraduit la contrainte violée.
      if (String(err.constraint || err.detail).includes('email')) {
        throw new ApiError('EMAIL_ALREADY_USED');
      }
      throw new ApiError('PHONE_ALREADY_USED');
    }
    throw err;
  }

  // Vérification d'adresse : lancée EN PARALLÈLE de l'OTP, sans bloquer. Le
  // compte est utilisable sans elle (seule la récupération de mot de passe
  // l'exige) — la faire attendre ici rallongerait l'inscription pour rien.
  emailVerificationService.issueOnRegister(user);

  // Envoi OTP. Si Twilio est indisponible (503), le compte existe déjà : la
  // récupération se fait via /auth/resend-otp.
  const otp = await otpService.issue(user.phone);

  return {
    user_id: user.id,
    phone: user.phone,
    otp_sent: otp.otp_sent,
    otp_expires_at: otp.otp_expires_at,
  };
}

/**
 * POST /auth/verify-otp — valide l'OTP, passe phone_verified=true, émet les tokens.
 */
async function verifyOtp(phone, code, meta = {}) {
  await otpService.verify(phone, code); // lève OTP_INVALID / OTP_EXPIRED / OTP_TOO_MANY_ATTEMPTS

  const user = await userModel.findByPhone(phone);
  if (!user) throw new ApiError('USER_NOT_FOUND');

  const verified = await userModel.markPhoneVerified(user.id);
  await userModel.touchLastActive(user.id);

  return issueTokens(verified, meta);
}

/**
 * POST /auth/resend-otp — renvoie un OTP pour un compte existant (rate-limit 5/h).
 */
async function resendOtp(phone) {
  const user = await userModel.findByPhone(phone);
  if (!user) throw new ApiError('USER_NOT_FOUND');

  const otp = await otpService.issue(phone);
  return { otp_sent: otp.otp_sent, otp_expires_at: otp.otp_expires_at };
}

/**
 * POST /auth/login — email + mot de passe → tokens.
 */
async function login(email, password, meta = {}) {
  const user = await userModel.findByEmail(email);

  // Message identique que le compte existe ou non (anti énumération).
  if (!user || !user.password_hash) {
    throw new ApiError('AUTH_INVALID_CREDENTIALS');
  }
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    throw new ApiError('AUTH_INVALID_CREDENTIALS');
  }

  if (user.status === 'suspended' || user.status === 'banned') {
    throw new ApiError('ACCOUNT_SUSPENDED');
  }
  if (!user.phone_verified) {
    throw new ApiError('PHONE_NOT_VERIFIED');
  }

  await userModel.touchLastActive(user.id);
  return issueTokens(user, meta);
}

/**
 * POST /auth/refresh — renouvelle l'access token depuis un refresh valide et
 * non révoqué. Le refresh n'est pas tourné (le contrat ne renvoie qu'un access).
 * @returns {{ access_token, expires_in }}
 */
async function refresh(refreshToken) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch (err) {
    if (err && err.name === 'TokenExpiredError') {
      throw new ApiError('REFRESH_TOKEN_EXPIRED');
    }
    throw new ApiError('REFRESH_TOKEN_INVALID');
  }

  const { sub: userId, sid } = payload;
  if (!sid) throw new ApiError('REFRESH_TOKEN_INVALID');

  // Session présente dans l'allowlist ? (sinon révoquée / inconnue)
  const exists = await redis.get(refreshKey(userId, sid));
  if (!exists) throw new ApiError('REFRESH_TOKEN_INVALID');

  const user = await userModel.findById(userId);
  if (!user) throw new ApiError('REFRESH_TOKEN_INVALID');
  if (user.status === 'suspended' || user.status === 'banned') {
    throw new ApiError('ACCOUNT_SUSPENDED');
  }

  const accessToken = signAccessToken(user, sid);
  return {
    access_token: accessToken,
    expires_in: tokenTtlSeconds(accessToken) || 3600,
  };
}

/**
 * POST /auth/logout — révoque la session courante (sid de l'access token).
 * Idempotent : aucune erreur si la session est déjà absente.
 */
async function logout(userId, sid) {
  if (userId && sid) {
    await redis.del(refreshKey(userId, sid));
  }
}

/**
 * Liste les sessions actives (refresh tokens en allowlist Redis) de l'utilisateur.
 * Aucune donnée d'appareil n'est stockée → on expose le sid (masqué), l'expiration
 * (déduite du TTL) et un drapeau « session courante ».
 */
async function listSessions(userId, currentSid) {
  const pattern = refreshKey(userId, '*');
  const found = [];
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = next;
    for (const key of keys) {
      const sid = key.slice(key.lastIndexOf(':') + 1);
      // TTL restant → date d'expiration approximative de la session.
      // eslint-disable-next-line no-await-in-loop
      const [ttl, raw] = await Promise.all([redis.ttl(key), redis.get(key)]);
      // Les sessions ouvertes AVANT ce changement portent encore `'1'` :
      // JSON.parse échoue, on retombe sur un enregistrement vide et l'interface
      // affiche « Appareil inconnu ». Elles s'éteindront d'elles-mêmes à
      // l'expiration du refresh — pas de migration à écrire.
      let entry = {};
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') entry = parsed;
      } catch { /* ancienne valeur `'1'` — rien à lire */ }
      found.push({
        sid,
        masked: `${sid.slice(0, 8)}…`,
        current: sid === currentSid,
        expires_in_s: ttl > 0 ? ttl : null,
        device: entry.device || null,
        created_at: entry.at || null,
      });
    }
  } while (cursor !== '0');
  // Session courante en tête.
  found.sort((a, b) => (b.current ? 1 : 0) - (a.current ? 1 : 0));
  return found;
}

/** Révoque toutes les sessions de l'utilisateur SAUF la session courante. */
async function revokeOtherSessions(userId, currentSid) {
  const pattern = refreshKey(userId, '*');
  let cursor = '0';
  let revoked = 0;
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = next;
    for (const key of keys) {
      const sid = key.slice(key.lastIndexOf(':') + 1);
      if (sid !== currentSid) {
        // eslint-disable-next-line no-await-in-loop
        await redis.del(key);
        revoked += 1;
      }
    }
  } while (cursor !== '0');
  return { revoked };
}

/**
 * Coupe TOUTES les sessions d'un compte, y compris celle de l'appareil courant.
 * Utilisé par la réinitialisation de mot de passe : contrairement à un
 * changement volontaire (qui préserve la session en cours), une réinitialisation
 * signifie « j'ai peut-être été compromis » — aucun refresh token ne survit.
 */
function revokeAllSessions(userId) {
  return revokeOtherSessions(userId, null);
}

/**
 * Change le mot de passe d'un compte authentifié : vérifie le mot de passe
 * actuel, refuse un nouveau identique à l'ancien, puis stocke le hash bcrypt.
 *
 * Le compte étant déjà authentifié, un mot de passe *actuel* faux est une erreur
 * de saisie (400 INVALID_CURRENT_PASSWORD), pas un 401 : un 401 déclencherait le
 * refresh automatique du client mobile (retry parasite du token).
 *
 * Sécurité : après un changement réussi, on révoque les *autres* sessions refresh
 * de l'utilisateur (un ancien mot de passe volé ne doit plus donner accès), en
 * conservant la session courante (`currentSid`) pour ne pas déconnecter l'appelant
 * en plein flux.
 */
async function changePassword(userId, currentPassword, newPassword, currentSid) {
  const user = await userModel.findById(userId);
  if (!user || !user.password_hash) throw new ApiError('USER_NOT_FOUND');

  const match = await bcrypt.compare(currentPassword, user.password_hash);
  if (!match) throw new ApiError('INVALID_CURRENT_PASSWORD');

  if (await bcrypt.compare(newPassword, user.password_hash)) {
    throw new ApiError('VALIDATION_ERROR', { message: { fr: "Le nouveau mot de passe doit différer de l'ancien.", en: 'The new password must differ from the old one.' } });
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  await userModel.setPassword(userId, passwordHash);
  await revokeOtherSessions(userId, currentSid);
  return { changed: true };
}

module.exports = {
  register,
  verifyOtp,
  resendOtp,
  login,
  refresh,
  logout,
  listSessions,
  revokeOtherSessions,
  revokeAllSessions,
  changePassword,
  issueTokens,
};
