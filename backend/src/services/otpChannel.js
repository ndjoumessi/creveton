'use strict';

const env = require('../config/env');
const logger = require('../config/logger');
const smsService = require('./smsService');
const whatsappService = require('./whatsappService');
const emailService = require('./emailService');

/**
 * Acheminement d'un code OTP : choisit un canal, bascule sur le suivant en cas
 * d'échec.
 *
 * `otpService` appelait `smsService.sendSms` en dur. Le SMS vers un +237 est le
 * poste le plus cher de l'inscription et il n'existe aucune offre gratuite
 * crédible ; on veut donc pouvoir servir WhatsApp d'abord et garder le SMS en
 * secours, sans toucher à la logique OTP (génération, TTL, tentatives), qui
 * reste entièrement dans `otpService`.
 *
 * ─ Ordre ─
 * `OTP_CHANNELS` (défaut « whatsapp,sms,email »). Un canal NON CONFIGURÉ est
 * sauté sans bruit : c'est ce qui permet de déployer WhatsApp progressivement —
 * tant que ses variables sont absentes, on retombe sur le SMS d'aujourd'hui.
 *
 * ─ Repli ─
 * On tente les canaux dans l'ordre et le PREMIER succès gagne. Un échec est
 * journalisé puis on passe au suivant ; si tous échouent, on lève, et
 * `otpService` nettoie le code stocké avant de renvoyer 503.
 *
 * ─ Pourquoi l'email en dernier et pas en premier ─
 * Il est gratuit, mais l'adresse est facultative à l'inscription (beaucoup de
 * joueurs n'en saisissent pas) et elle n'est pas vérifiée à ce stade : elle ne
 * peut donc pas être le canal principal d'un code qui prouve un NUMÉRO.
 */

const DEFAULT_ORDER = ['whatsapp', 'sms', 'email'];

/**
 * Un canal : sait dire s'il est configuré, s'il peut atteindre la cible, et
 * envoyer. Aucun ne connaît les autres.
 */
const CHANNELS = {
  whatsapp: {
    isConfigured: () => whatsappService.isConfigured(),
    canReach: (target) => Boolean(target.phone),
    send: (target, code) => whatsappService.sendAuthCode(target.phone, code),
  },
  sms: {
    // `smsService` simule quand Twilio manque ; on veut que le canal se déclare
    // non configuré dans ce cas, sinon il « réussirait » sans rien envoyer et
    // bloquerait le repli.
    isConfigured: () => Boolean(env.twilio.accountSid && env.twilio.authToken),
    canReach: (target) => Boolean(target.phone),
    send: (target, code) =>
      smsService.sendSms(
        target.phone,
        `Votre code Creveton est : ${code} (valable ${env.otp.expiresMinutes} min).`
      ),
  },
  email: {
    // `!env.isTest` : `emailService.send` court-circuite en test et renvoie
    // `{ sent:false, skipped:true }` pour ne jamais toucher le réseau. Sans
    // cette garde, le canal se croyait configuré, « échouait », et l'inscription
    // remontait un 503 dans toute la suite d'intégration — alors que rien
    // n'était cassé. Un envoi DÉLIBÉRÉMENT non fait n'est pas une panne.
    isConfigured: () => Boolean(env.email.apiKey) && !env.isTest,
    canReach: (target) => Boolean(target.email),
    send: (target, code) =>
      emailService
        .sendOtpCode({
          to: target.email,
          name: target.name,
          code,
          expiresMinutes: env.otp.expiresMinutes,
          lang: target.lang || 'fr',
        })
        // `emailService` ne jette jamais : il renvoie `{ sent:false }`. On
        // convertit en exception pour que le repli fonctionne comme ailleurs.
        .then((r) => {
          if (!r.sent) throw new Error(r.error || 'email non envoyé');
          return r;
        }),
  },
};

/** Ordre demandé, filtré des noms inconnus (une faute de frappe ne casse rien). */
function orderedNames() {
  const raw = String(env.otp.channels || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const names = raw.length ? raw : DEFAULT_ORDER;
  return names.filter((n) => CHANNELS[n]);
}

/**
 * Envoie `code` à `target` par le premier canal disponible.
 * @param {{ phone?: string, email?: string, name?: string, lang?: string }} target
 * @param {string} code
 * @returns {Promise<{ channel: string, simulated?: boolean }>}
 * @throws {Error} si aucun canal n'a pu délivrer.
 */
async function sendCode(target, code) {
  const names = orderedNames();
  const skipped = [];
  const failures = [];

  for (const name of names) {
    const ch = CHANNELS[name];
    if (!ch.isConfigured()) { skipped.push(`${name}:non-configuré`); continue; }
    if (!ch.canReach(target)) { skipped.push(`${name}:injoignable`); continue; }
    try {
      // Séquentiel à dessein : on ne veut PAS envoyer le même code par
      // plusieurs canaux à la fois. Un OTP livré deux fois double la surface
      // d'interception et facture deux envois.
      const res = await ch.send(target, code);
      logger.info('OTP délivré', { channel: name, skipped });
      return { channel: name, simulated: Boolean(res && res.simulated) };
    } catch (err) {
      failures.push(`${name}:${err.message}`);
      logger.warn('Canal OTP en échec, repli', { channel: name, error: err.message });
    }
  }

  // Aucun canal configuré du tout : en développement on ne veut pas bloquer
  // l'inscription. `smsService` journalisait déjà le code dans ce cas ; on
  // conserve ce comportement, explicitement, hors production.
  if (!failures.length && !env.isProd) {
    logger.warn('Aucun canal OTP configuré — code simulé', { code, skipped });
    return { channel: 'simulated', simulated: true };
  }

  throw new Error(`aucun canal OTP disponible (${[...failures, ...skipped].join(', ') || 'aucun'})`);
}

module.exports = { sendCode, orderedNames, CHANNELS };
