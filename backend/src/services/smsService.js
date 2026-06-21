'use strict';

const env = require('../config/env');
const logger = require('../config/logger');

/**
 * Envoi de SMS via Twilio (OTP, notifications).
 * Le client n'est instancié que si les identifiants sont présents ; en dev
 * sans credentials, on log le message au lieu de l'envoyer (mode simulation).
 */

let client = null;
function getClient() {
  if (client) return client;
  if (!env.twilio.accountSid || !env.twilio.authToken) return null;
  // Chargement paresseux pour ne pas exiger le SDK quand non configuré.
  const twilio = require('twilio');
  client = twilio(env.twilio.accountSid, env.twilio.authToken);
  return client;
}

/**
 * Envoie un SMS brut.
 * @param {string} to    numéro destinataire (+237…)
 * @param {string} body  contenu
 */
async function sendSms(to, body) {
  const c = getClient();
  if (!c) {
    logger.warn('SMS simulé (Twilio non configuré)', { to, body });
    return { simulated: true };
  }
  return c.messages.create({ to, from: env.twilio.fromNumber, body });
}

module.exports = { sendSms };
