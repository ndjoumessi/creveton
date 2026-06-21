'use strict';

const notImplemented = require('../utils/notImplemented');

/** Contrôleurs Wallet & paiements (spec §11) — derrière le flag payant. */
module.exports = {
  // GET /wallet
  get: notImplemented('GET /wallet'),
  // POST /wallet/recharge (Idempotency-Key)
  recharge: notImplemented('POST /wallet/recharge'),
};
