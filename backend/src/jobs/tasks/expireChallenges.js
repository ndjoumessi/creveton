'use strict';

const db = require('../../config/database');
const { CHALLENGE_TTL_MS } = require('../../services/challengeService');

/**
 * Ferme les défis dépassés (24 h pour jouer).
 *
 * `challengeService.isExpired()` calcule l'expiration À LA LECTURE : un défi
 * périmé refuse bien d'être accepté ou joué, mais sa ligne reste `pending` pour
 * l'éternité. Conséquences visibles côté joueur : l'onglet « Envoyés » liste des
 * duels morts, et la pastille « N actifs » de l'écran Défis les compte — juste
 * après qu'on ait corrigé ce compteur pour une autre raison.
 *
 * Le statut `expired` existe déjà dans la contrainte CHECK (migration 006) : il
 * était prévu, simplement jamais écrit.
 *
 * Le seuil est celui du service, importé et non recopié — deux définitions du
 * même délai finiraient par diverger, et l'écart produirait des défis « morts à
 * la lecture mais vivants en base », ou l'inverse.
 *
 * Idempotent : la clause `WHERE status IN (...)` exclut d'office les défis déjà
 * clos (`completed`, `declined`, `cancelled`, `expired`).
 */

// Dérivé du service, jamais recopié (cf. commentaire ci-dessus).
const TTL_HOURS = CHALLENGE_TTL_MS / 3600_000;

module.exports = {
  name: 'expire-challenges',
  schedule: { everyMinutes: 60 },
  timeoutMs: 60_000,
  async run() {
    const { rowCount } = await db.query(
      `UPDATE challenges
          SET status = 'expired'
        WHERE status IN ('pending', 'accepted', 'active')
          AND created_at < now() - ($1 || ' hours')::interval`,
      [TTL_HOURS]
    );
    return { expired: rowCount };
  },
};
