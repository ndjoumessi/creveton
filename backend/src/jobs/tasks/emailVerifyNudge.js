'use strict';

const db = require('../../config/database');
const pushService = require('../../services/pushService');
const logger = require('../../config/logger');
const { CAMEROON_UTC_OFFSET_HOURS } = require('../schedule');

/**
 * Relance push « confirme ton adresse email ».
 *
 * Complète le bandeau d'accueil (`mobile/src/components/EmailNudge.js`), qui ne
 * touche que les joueurs qui ouvrent l'app. Celle-ci va chercher ceux qui ne
 * l'ouvrent plus — ce sont précisément ceux qui découvriront le problème le jour
 * où ils auront perdu leur mot de passe.
 *
 * ─ Retenue ─
 * · 3 jours de grâce après l'inscription : le bandeau suffit au début, et
 *   pousser une notification à quelqu'un qui vient de s'inscrire est agressif ;
 * · 7 jours entre deux relances ;
 * · PLAFOND de 3 relances à vie. Au-delà, le bandeau reste, la notification
 *   s'arrête : passé trois rappels, insister n'informe plus, ça harcèle ;
 * · 18 h heure du Cameroun — la tâche ne s'exécute qu'à cette heure-là, donc
 *   jamais de notification en pleine nuit.
 *
 * ─ Idempotence ─
 * Le compteur est incrémenté DANS la requête de sélection (`UPDATE … RETURNING`),
 * pas après l'envoi : une coupure entre les deux relancerait sinon tout le lot au
 * tic suivant. On préfère une relance perdue à une relance doublée.
 */

const GRACE_DAYS = 3;
const COOLDOWN_DAYS = 7;
const MAX_NUDGES = 3;
const BATCH = 500;

// Fenêtre d'envoi : 18 h heure locale. Le tic tourne à la minute, la tâche
// s'auto-limite ici plutôt que via `dailyAt` pour rester lisible avec le reste
// des conditions (la cadence, elle, dit simplement « une fois par jour »).
const SEND_HOUR_LOCAL = 18;

function localHour(now = new Date()) {
  return new Date(now.getTime() + CAMEROON_UTC_OFFSET_HOURS * 3600 * 1000).getUTCHours();
}

module.exports = {
  name: 'email-verify-nudge',
  schedule: { dailyAt: SEND_HOUR_LOCAL },
  timeoutMs: 5 * 60_000,
  /**
   * @param {{ now?: Date }} opts  `now` est injectable UNIQUEMENT pour les tests :
   *   sans ça, la garde horaire ne serait vérifiable qu'entre 18 h et 19 h, et le
   *   test ne prouverait rien les 23 autres heures. Le moteur appelle `run()` sans
   *   argument, la valeur par défaut vaut donc en production.
   */
  async run({ now = new Date() } = {}) {
    // Double garde : la cadence vise déjà 18 h, mais un rattrapage après panne
    // ne doit pas réveiller les joueurs à 4 h du matin.
    const hour = localHour(now);
    if (hour !== SEND_HOUR_LOCAL) {
      return { skipped: 'hors fenêtre', hour };
    }

    // Sélection ET marquage dans la même requête : voir la note d'idempotence.
    const { rows } = await db.query(
      `WITH cible AS (
         SELECT id
           FROM users
          WHERE email_verified = false
            AND email IS NOT NULL
            AND push_token IS NOT NULL
            AND deleted_at IS NULL
            AND status = 'active'
            AND created_at < now() - ($1 || ' days')::interval
            AND email_nudge_count < $3
            AND (email_nudged_at IS NULL
                 OR email_nudged_at < now() - ($2 || ' days')::interval)
          ORDER BY email_nudged_at NULLS FIRST
          LIMIT $4
          FOR UPDATE SKIP LOCKED
       )
       UPDATE users u
          SET email_nudged_at = now(),
              email_nudge_count = u.email_nudge_count + 1
         FROM cible
        WHERE u.id = cible.id
       RETURNING u.id, u.push_token, u.lang`,
      [GRACE_DAYS, COOLDOWN_DAYS, MAX_NUDGES, BATCH]
    );

    if (!rows.length) return { nudged: 0 };

    // Deux envois groupés (un par langue) : `sendPush` accepte une liste de
    // jetons pour un même message et découpe en lots côté Expo.
    const byLang = { fr: [], en: [] };
    for (const r of rows) byLang[r.lang === 'en' ? 'en' : 'fr'].push(r.push_token);

    const COPY = {
      fr: {
        title: 'Confirme ton adresse email',
        body: 'Sans elle, impossible de récupérer ton compte si tu oublies ton mot de passe.',
      },
      en: {
        title: 'Confirm your email address',
        body: "Without it, we can't get you back into your account if you forget your password.",
      },
    };

    for (const [lang, tokens] of Object.entries(byLang)) {
      if (!tokens.length) continue;
      // `sendPush` ne jette pas (journalise en interne) ; on n'annule donc rien
      // en cas d'échec partiel — les jetons morts sont le cas courant.
      await pushService.sendPush(tokens, {
        ...COPY[lang],
        data: { type: 'email_verify' },
      });
    }

    logger.info('Relances de vérification email envoyées', {
      total: rows.length,
      fr: byLang.fr.length,
      en: byLang.en.length,
    });

    return { nudged: rows.length, fr: byLang.fr.length, en: byLang.en.length };
  },
};
