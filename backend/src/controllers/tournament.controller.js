'use strict';

const notImplemented = require('../utils/notImplemented');

/**
 * Contrôleurs Tournois (spec §8).
 * join est derrière le flag tournaments.paid.enabled pour les tournois payants.
 */
module.exports = {
  // GET /tournaments?status=&type=
  list: notImplemented('GET /tournaments'),
  // GET /tournaments/:id
  get: notImplemented('GET /tournaments/:id'),
  // POST /tournaments/:id/join (flag)
  join: notImplemented('POST /tournaments/:id/join'),
};
