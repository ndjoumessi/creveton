'use strict';

const Joi = require('joi');
const { SEXES, LANGS, PHONE_REGEX } = require('../utils/constants');

const phone = Joi.string().pattern(PHONE_REGEX).messages({
  'string.pattern.base': 'Le numéro doit être au format +237XXXXXXXXX.',
});

const password = Joi.string()
  .min(8)
  .pattern(/[A-Z]/, 'majuscule')
  .pattern(/\d/, 'chiffre')
  .messages({
    'string.min': 'Le mot de passe doit faire au moins 8 caractères.',
    'string.pattern.name': 'Le mot de passe doit contenir au moins une {#name}.',
  });

const register = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().required(),
  phone: phone.required(),
  password: password.required(),
  ville: Joi.string().max(100).optional(),
  age: Joi.number().integer().min(6).max(99).optional(),
  sexe: Joi.string().valid(...SEXES).optional(),
  lang: Joi.string().valid(...LANGS).default('fr'),
  referral_code: Joi.string().max(32).optional(),
});

const verifyOtp = Joi.object({
  phone: phone.required(),
  code: Joi.string().length(6).pattern(/^\d{6}$/).required(),
});

const resendOtp = Joi.object({
  phone: phone.required(),
});

const login = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

const refresh = Joi.object({
  refresh_token: Joi.string().required(),
});

module.exports = { register, verifyOtp, resendOtp, login, refresh };
