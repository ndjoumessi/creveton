'use strict';

const ApiError = require('../utils/ApiError');

/** Capture toute route non déclarée et la transforme en 404 normalisé. */
module.exports = function notFound(req, res, next) {
  next(new ApiError('NOT_FOUND', { message: `Route introuvable : ${req.method} ${req.originalUrl}` }));
};
