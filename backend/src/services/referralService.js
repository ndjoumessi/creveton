'use strict';

const ApiError = require('../utils/ApiError');
const env = require('../config/env');
const { redis } = require('../config/redis');
const userModel = require('../models/user.model');
const emailService = require('./emailService');

/**
 * Parrainage joueur → ami : envoi d'un email d'invitation contenant le code de
 * parrainage du joueur. Limite anti-abus : N emails / utilisateur / 24 h
 * (Redis INCR + EXPIRE, même schéma que otpService).
 */

const DAY_SEC = 24 * 3600;
const rlKey = (userId) => `referral_invite:${userId}`;

/**
 * @param {{ userId, email, lang? }} params
 * @returns {Promise<{ sent: true }>}
 * @throws ApiError USER_NOT_FOUND | EMAIL_ALREADY_USED | RATE_LIMITED | EMAIL_SEND_FAILED
 */
async function inviteFriend({ userId, email, lang = 'fr' }) {
  const inviter = await userModel.findById(userId);
  if (!inviter) throw new ApiError('USER_NOT_FOUND');

  // L'ami ne doit pas déjà avoir un compte.
  if (await userModel.findByEmail(email)) throw new ApiError('EMAIL_ALREADY_USED');

  // Limite quotidienne (compte les tentatives ; pose le TTL au premier appel).
  const count = await redis.incr(rlKey(userId));
  if (count === 1) await redis.expire(rlKey(userId), DAY_SEC);
  if (count > env.email.referralLimitPerDay) {
    throw new ApiError('RATE_LIMITED', {
      message: `Limite de ${env.email.referralLimitPerDay} invitations par jour atteinte.`,
    });
  }

  const result = await emailService.sendPlayerReferral({
    to: email,
    referrerName: inviter.name,
    referralCode: inviter.referral_code,
    lang,
  });
  if (!result.sent) throw new ApiError('EMAIL_SEND_FAILED');

  return { sent: true };
}

module.exports = { inviteFriend };
