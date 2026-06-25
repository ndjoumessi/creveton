'use strict';

const Joi = require('joi');
const { THEMES, LEVELS, QUESTION_TYPES, QUESTION_STATUSES, LANGS } = require('../utils/constants');

/** GET /questions?theme=&level=&count=&seed= */
const list = Joi.object({
  theme: Joi.string().valid(...THEMES).optional(),
  level: Joi.string().valid(...LEVELS).optional(),
  count: Joi.number().integer().min(1).max(20).default(10),
  // Seed partagé d'un challenge : garantit le même tirage aux deux joueurs.
  seed: Joi.string().max(64).optional(),
});

/** GET /questions/delta?since= */
// `since` reste une chaîne : la validation fine du format (et le code d'erreur
// INVALID_TIMESTAMP de la spec §5) sont gérés par deltaSync.parseSince.
const delta = Joi.object({
  since: Joi.string().required().messages({
    'any.required': 'Le paramètre « since » est requis.',
  }),
});

/** GET /questions/all?limit=&cursor= */
const all = Joi.object({
  limit: Joi.number().integer().min(1).max(200).default(200),
  cursor: Joi.string().optional(),
});

/** POST /admin/questions */
const adminCreate = Joi.object({
  text_fr: Joi.string().min(3).required(),
  text_en: Joi.string().allow(null, '').optional(),
  type: Joi.string().valid(...QUESTION_TYPES).default('mcq'),
  options: Joi.array()
    .items(
      Joi.object({
        text: Joi.string().required(),
        text_en: Joi.string().allow(null, '').optional(),
        is_correct: Joi.boolean().required(),
      })
    )
    .min(2)
    .max(6)
    .required(),
  theme: Joi.string().valid(...THEMES).required(),
  level: Joi.string().valid(...LEVELS).required(),
  explanation: Joi.string().allow(null, '').optional(),
  explanation_en: Joi.string().allow(null, '').optional(),
  tags: Joi.array().items(Joi.string()).default([]),
  language: Joi.string().valid(...LANGS).default('fr'),
  media_url: Joi.string().uri().allow(null, '').optional(),
  source: Joi.string().default('manual'),
});

/** PATCH /admin/questions/:id (champs partiels) */
const adminUpdate = adminCreate.fork(
  ['text_fr', 'options', 'theme', 'level'],
  (s) => s.optional()
).min(1);

/** POST /admin/questions/:id/transition */
const adminTransition = Joi.object({
  to: Joi.string().valid('pending_review', 'approved', 'rejected', 'archived').required(),
  reason: Joi.when('to', {
    is: 'rejected',
    then: Joi.string().min(3).required(),
    otherwise: Joi.string().optional(),
  }),
});

/** POST /admin/questions/force-sync */
const forceSync = Joi.object({
  question_ids: Joi.array().items(Joi.string().uuid()).min(1).required(),
});

/** GET /admin/questions — liste admin + filtres (tous statuts). */
const adminList = Joi.object({
  status: Joi.string().valid(...QUESTION_STATUSES).optional(),
  theme: Joi.string().valid(...THEMES).optional(),
  level: Joi.string().valid(...LEVELS).optional(),
  q: Joi.string().max(200).optional(),
  limit: Joi.number().integer().min(1).max(100).default(20),
  cursor: Joi.string().optional(),
});

/** POST /admin/questions/improve-text — correcteur IA */
const improveText = Joi.object({
  text: Joi.string().min(3).max(600).required(),
  lang: Joi.string().valid('fr', 'en').default('fr'),
  type: Joi.string().valid('statement', 'explanation').default('statement'),
  // 'correct' = correction orthographe/grammaire (défaut) ; 'translate' = traduit
  // le texte (FR→EN) selon `lang` cible.
  action: Joi.string().valid('correct', 'translate').default('correct'),
});

/** POST /admin/questions/:id/translate — traduction IA d'une question (FR↔EN) */
const translate = Joi.object({
  target_lang: Joi.string().valid('en', 'fr').required(),
});

module.exports = { list, delta, all, adminCreate, adminUpdate, adminTransition, forceSync, adminList, improveText, translate };
