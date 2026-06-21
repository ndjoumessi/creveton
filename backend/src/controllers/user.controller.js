'use strict';

const notImplemented = require('../utils/notImplemented');

/** Contrôleurs Profil & utilisateur (spec §10). */
module.exports = {
  // GET /users/me
  me: notImplemented('GET /users/me'),
  // PATCH /users/me
  updateMe: notImplemented('PATCH /users/me'),
  // GET /users/me/history
  history: notImplemented('GET /users/me/history'),
  // GET /users/me/transactions (flag)
  transactions: notImplemented('GET /users/me/transactions'),
};
