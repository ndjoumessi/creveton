'use strict';

const crypto = require('crypto');
const { redis } = require('../config/redis');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const otpChannel = require('./otpChannel');

/**
 * Gestion des OTP SMS (réf. spec §4).
 *  - code à 6 chiffres, expiration 10 min, 3 tentatives max
 *  - renvoi limité à 5/heure/numéro
 * Stockage dans Redis : hash { code, attempts } avec TTL.
 */

const otpKey = (phone) => `otp:${phone}`;
const resendKey = (phone) => `otp:resend:${phone}`;

function generateCode() {
  // 6 chiffres, cryptographiquement aléatoire.
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * Génère + envoie un OTP. Applique la limite de renvoi (5/h).
 *
 * `contact` est OPTIONNEL et ne sert qu'au repli : si ni WhatsApp ni SMS
 * n'aboutissent, `otpChannel` peut servir le code par email. Le rate-limit, le
 * stockage et la vérification restent indexés sur le NUMÉRO — c'est lui que le
 * code prouve, l'email n'est qu'un tuyau de secours.
 *
 * @param {string} phone
 * @param {{ email?: string, name?: string, lang?: string }} [contact]
 * @returns {{ otp_sent: boolean, otp_expires_at: string }}
 */
async function issue(phone, contact = {}) {
  const resends = await redis.incr(resendKey(phone));
  if (resends === 1) {
    await redis.expire(resendKey(phone), 3600);
  }
  if (resends > env.otp.resendLimitPerHour) {
    throw new ApiError('RATE_LIMITED', { message: { fr: "Trop d'envois d'OTP, réessayez plus tard.", en: 'Too many OTP sends, try again later.' } });
  }

  const code = generateCode();
  const ttlSec = env.otp.expiresMinutes * 60;
  await redis.hset(otpKey(phone), { code, attempts: 0 });
  await redis.expire(otpKey(phone), ttlSec);

  try {
    // Un seul point d'acheminement : `otpChannel` choisit WhatsApp, SMS ou
    // email selon ce qui est configuré et bascule au suivant en cas d'échec.
    await otpChannel.sendCode(
      { phone, email: contact.email, name: contact.name, lang: contact.lang },
      code
    );
  } catch {
    // Aucun canal n'a délivré : on nettoie l'OTP stocké et on remonte un 503.
    // Le code d'erreur n'est plus `SMS_PROVIDER_UNAVAILABLE` — il mentait dès
    // que le canal en échec n'était pas le SMS.
    await redis.del(otpKey(phone));
    throw new ApiError('OTP_DELIVERY_FAILED');
  }

  const expiresAt = new Date(Date.now() + ttlSec * 1000).toISOString();
  return { otp_sent: true, otp_expires_at: expiresAt };
}

/**
 * Vérifie un OTP. Lève l'ApiError approprié en cas d'échec.
 * @returns {boolean} true si valide
 */
async function verify(phone, code) {
  const key = otpKey(phone);
  const data = await redis.hgetall(key);

  if (!data || !data.code) {
    throw new ApiError('OTP_EXPIRED');
  }

  const attempts = parseInt(data.attempts, 10) || 0;
  if (attempts >= env.otp.maxAttempts) {
    throw new ApiError('OTP_TOO_MANY_ATTEMPTS');
  }

  if (data.code !== code) {
    await redis.hincrby(key, 'attempts', 1);
    throw new ApiError('OTP_INVALID');
  }

  await redis.del(key);
  return true;
}

module.exports = { issue, verify, generateCode };
