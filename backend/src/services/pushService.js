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

// Push CIBLÉ via l'API HTTP d'Expo (https://docs.expo.dev/push-notifications/sending-notifications/).
// On utilise fetch (comme sendForceSync) plutôt que `expo-server-sdk` : ce dernier
// est ESM-only et incompatible avec le runner Jest CommonJS du projet. Même
// service de livraison, sans dépendance ni transform supplémentaire.
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_PUSH_CHUNK = 100; // limite Expo : 100 messages / requête.
const EXPO_TOKEN_RE = /^Expo(nent)?PushToken\[[^\]]+\]$/;

/** Vrai si `token` a le format d'un Expo Push Token (ExponentPushToken[...]). */
function isExpoPushToken(token) {
  return typeof token === 'string' && EXPO_TOKEN_RE.test(token);
}

/**
 * Envoie une notification push CIBLÉE à un ou plusieurs Expo Push Tokens.
 *
 * Contrairement à `sendForceSync` (broadcast FCM par topic, data-only), ici on
 * adresse des appareils précis (notification visible). Ne lève JAMAIS : les
 * erreurs sont seulement loggées → appel fire-and-forget sûr.
 *
 * @param {string|string[]} tokens  ExponentPushToken[...]
 * @param {object} payload
 * @param {string} payload.title
 * @param {string} payload.body
 * @param {object} [payload.data]   données pour le deep link (type, ids…)
 */
async function sendPush(tokens, { title, body, data = {} } = {}) {
  const list = (Array.isArray(tokens) ? tokens : [tokens]).filter(Boolean);
  const valid = list.filter(isExpoPushToken);
  if (!valid.length) return;

  const messages = valid.map((to) => ({
    to,
    title,
    body,
    data,
    sound: 'default',
    priority: 'high',
  }));

  try {
    for (let i = 0; i < messages.length; i += EXPO_PUSH_CHUNK) {
      const chunk = messages.slice(i, i + EXPO_PUSH_CHUNK);
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(chunk),
      });
      if (!res.ok) {
        logger.warn('Push HTTP non-OK', { status: res.status });
        continue;
      }
      const json = await res.json().catch(() => null);
      const receipts = (json && json.data) || [];
      receipts.forEach((r, idx) => {
        if (r.status === 'error') {
          logger.warn('Push échoué', { token: chunk[idx]?.to, error: r.message });
        }
      });
    }
  } catch (err) {
    logger.error('pushService.sendPush crash', { error: err.message });
  }
}

module.exports = { sendForceSync, sendPush, isExpoPushToken, FORCE_SYNC_TOPIC };
