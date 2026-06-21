'use strict';

const env = require('../config/env');
const logger = require('../config/logger');

/**
 * Notifications push Firebase Cloud Messaging (réf. spec §14).
 *
 * Cas d'usage principal : « push silencieux » force_sync (retrait d'urgence
 * d'une question en < 30 s, spec §12/§14). Message DATA-ONLY (pas de notif
 * visible) envoyé à un topic FCM auquel les apps s'abonnent — pas besoin de
 * registre de tokens par appareil.
 *
 * Sans clé FCM configurée (dev/test), on simule l'envoi (log) au lieu d'appeler
 * le réseau — même approche que smsService.
 */

const FCM_ENDPOINT = 'https://fcm.googleapis.com/fcm/send';
const FORCE_SYNC_TOPIC = '/topics/all_devices';

/**
 * Envoie un push silencieux `force_sync` ordonnant aux apps de re-synchroniser
 * (et retirer du cache) les questions visées.
 *
 * @param {string[]} questionIds  IDs à retirer/rafraîchir côté client.
 * @returns {Promise<{ pushed: boolean, simulated?: boolean }>}
 */
async function sendForceSync(questionIds) {
  const payload = {
    to: FORCE_SYNC_TOPIC,
    priority: 'high',
    // Data-only : pas de clé `notification` → silencieux (réveille l'app).
    content_available: true,
    data: {
      type: 'force_sync',
      question_ids: questionIds,
    },
  };

  if (!env.push.fcmServerKey) {
    logger.warn('Push simulé (FCM non configuré)', { type: 'force_sync', count: questionIds.length });
    return { pushed: true, simulated: true };
  }

  try {
    const res = await fetch(FCM_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `key=${env.push.fcmServerKey}`,
        'Content-Type': 'application/json',
      },
      // FCM topic payload exige des valeurs `data` en chaînes.
      body: JSON.stringify({ ...payload, data: { type: 'force_sync', question_ids: JSON.stringify(questionIds) } }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`FCM ${res.status}: ${text}`);
    }
    return { pushed: true };
  } catch (err) {
    logger.error('Échec push FCM force_sync', { error: err.message });
    return { pushed: false };
  }
}

module.exports = { sendForceSync, FORCE_SYNC_TOPIC };
