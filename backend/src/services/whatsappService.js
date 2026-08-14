'use strict';

const env = require('../config/env');
const logger = require('../config/logger');

/**
 * Envoi WhatsApp via l'API Cloud de Meta (canal OTP privilégié).
 *
 * Pourquoi WhatsApp AVANT le SMS : au Cameroun, la pénétration de WhatsApp est
 * massive chez les 12–30 ans visés par Creveton, et une vérification y coûte un
 * ordre de grandeur de moins qu'un SMS vers un +237 — le poste le plus cher du
 * parcours d'inscription. Le message arrive dans une application déjà ouverte,
 * pas dans un fil de SMS ignoré.
 *
 * Mêmes conventions que `smsService` : client paresseux, mode SIMULÉ quand la
 * configuration manque (on journalise au lieu d'envoyer), jamais d'exception
 * silencieuse — l'appelant (`otpChannel`) décide du repli.
 *
 * Aucune dépendance ajoutée : Node 20 fournit `fetch` nativement.
 *
 * ─ Le message doit être un TEMPLATE, pas du texte libre ─
 * Hors fenêtre de service de 24 h, Meta n'accepte que des modèles pré-approuvés.
 * Pour un OTP, c'est un template de catégorie `AUTHENTICATION` : son corps porte
 * un unique paramètre (le code) et il embarque un bouton « copier le code ».
 * D'où `components` ci-dessous, qui répète le code dans le bouton — c'est le
 * contrat de Meta pour cette catégorie, pas une redondance de notre fait.
 */

const TIMEOUT_MS = 8000;

function isConfigured() {
  return Boolean(env.whatsapp.token && env.whatsapp.phoneNumberId);
}

/**
 * Meta attend un numéro SANS `+` ni séparateur (E.164 « nu »).
 * Nos numéros sont stockés au format `+237…`.
 */
function normalize(phone) {
  return String(phone || '').replace(/[^\d]/g, '');
}

/** Langue « nue » : « en_US » → « en », « fr-FR » → « fr », « » → « ». */
function baseLang(value) {
  return String(value || '').trim().toLowerCase().split(/[-_]/)[0];
}

/**
 * Traduction du modèle à employer pour ce joueur.
 *
 * Le code partait jusqu'ici TOUJOURS dans `WHATSAPP_TEMPLATE_LANG`, quelle que
 * soit la langue du compte : un joueur anglophone recevait un OTP français.
 *
 * La résolution est délibérément CONSERVATRICE — on ne retient la langue du
 * joueur que si une traduction correspondante est déclarée approuvée
 * (`WHATSAPP_TEMPLATE_LANGS`). Deviner coûterait cher : Meta refuse un modèle
 * dans une langue non approuvée, `otpChannel` basculerait sur le canal suivant,
 * et le joueur n'aurait pas de code du tout. Un OTP dans la mauvaise langue
 * reste lisible ; un OTP jamais reçu, non.
 *
 * La comparaison se fait sur la langue nue : une traduction déclarée « en_US »
 * couvre donc un compte en « en ».
 *
 * @param {string} [userLang] langue du compte (« fr » | « en »)
 * @returns {string} code de langue à envoyer à Meta
 */
function resolveTemplateLang(userLang) {
  const wanted = baseLang(userLang);
  if (!wanted) return env.whatsapp.templateLang;
  const approved = env.whatsapp.templateLangs.find((code) => baseLang(code) === wanted);
  return approved || env.whatsapp.templateLang;
}

/**
 * Envoie un code d'authentification.
 * @param {string} to        numéro destinataire (+237…)
 * @param {string} code      code à 6 chiffres
 * @param {string} [userLang] langue du compte — voir `resolveTemplateLang`
 * @returns {Promise<{ simulated?: boolean, id?: string }>}
 * @throws en cas d'échec réseau ou de refus de Meta — `otpChannel` bascule alors
 *         sur le canal suivant.
 */
async function sendAuthCode(to, code, userLang) {
  if (!isConfigured()) {
    logger.warn('WhatsApp simulé (non configuré)', { to, code: '******' });
    return { simulated: true };
  }

  const url = `https://graph.facebook.com/${env.whatsapp.apiVersion}/${env.whatsapp.phoneNumberId}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to: normalize(to),
    type: 'template',
    template: {
      name: env.whatsapp.templateName,
      language: { code: resolveTemplateLang(userLang) },
      components: [
        { type: 'body', parameters: [{ type: 'text', text: code }] },
        {
          // Bouton « copier le code » : imposé par la catégorie AUTHENTICATION.
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [{ type: 'text', text: code }],
        },
      ],
    },
  };

  // `AbortSignal.timeout` plutôt qu'une course de promesses : le socket est
  // réellement coupé, on ne laisse pas une requête vivre après notre abandon.
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.whatsapp.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    // On lit le corps pour journaliser le motif de Meta (template non approuvé,
    // numéro invalide, jeton expiré…) : sans lui, un échec est indébogable.
    let detail = '';
    try {
      detail = JSON.stringify(await res.json()).slice(0, 300);
    } catch {
      /* corps illisible : le statut suffira */
    }
    throw new Error(`WhatsApp ${res.status} ${detail}`);
  }

  const data = await res.json().catch(() => ({}));
  return { id: data?.messages?.[0]?.id || null };
}

module.exports = { sendAuthCode, isConfigured, resolveTemplateLang };
