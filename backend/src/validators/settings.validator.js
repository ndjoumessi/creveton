'use strict';

const Joi = require('joi');

/** PATCH /admin/settings/flags/:key */
const patchFlag = Joi.object({
  enabled: Joi.boolean().required(),
});

module.exports = { patchFlag };
