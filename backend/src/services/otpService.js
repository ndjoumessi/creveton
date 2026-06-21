'use strict';

const crypto = require('crypto');
const { redis } = require('../config/redis');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const smsService = require('./smsService');

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
 * @returns {{ otp_sent: boolean, otp_expires_at: string }}
 */
async function issue(phone) {
  const resends = await redis.incr(resendKey(phone));
  if (resends === 1) {
    await redis.expire(resendKey(phone), 3600);
  }
  if (resends > env.otp.resendLimitPerHour) {
    throw new ApiError('RATE_LIMITED', { message: "Trop d'envois d'OTP, réessayez plus tard." });
  }

  const code = generateCode();
  const ttlSec = env.otp.expiresMinutes * 60;
  await redis.hset(otpKey(phone), { code, attempts: 0 });
  await redis.expire(otpKey(phone), ttlSec);

  try {
    await smsService.sendSms(
      phone,
      `Votre code Creveton est : ${code} (valable ${env.otp.expiresMinutes} min).`
    );
  } catch {
    // Échec du prestataire SMS : on n'a pas pu délivrer le code, on nettoie
    // l'OTP stocké et on remonte un 503 (spec §4 / §16 SMS_PROVIDER_UNAVAILABLE).
    await redis.del(otpKey(phone));
    throw new ApiError('SMS_PROVIDER_UNAVAILABLE');
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
