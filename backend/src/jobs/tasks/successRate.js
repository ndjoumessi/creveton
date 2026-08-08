'use strict';

const questionService = require('../../services/questionService');

/**
 * Recalcul du taux de réussite par question (CDC §4.2).
 *
 * Le batch existait déjà, écrit et lançable à la main
 * (`node src/services/questionService.js`) — il n'avait jamais été planifié.
 * `questionModel.update` remet pourtant `success_rate = NULL` dès qu'une solution
 * change, EN COMPTANT sur ce recalcul : sans lui, le champ restait nul pour
 * toujours. Les consommateurs (stats admin, liste des questions les plus ratées)
 * filtrent tous `WHERE success_rate IS NOT NULL` — ils ne se trompaient donc pas,
 * ils SOUS-DÉCLARAIENT en silence, ce qui est plus difficile à repérer.
 *
 * Nuit profonde : la requête déroule toutes les réponses de toutes les parties
 * (`jsonb_array_elements` en LATERAL). À 3 h, personne ne joue.
 *
 * Idempotent : recalcul complet à partir des sessions, jamais un incrément.
 */
module.exports = {
  name: 'success-rate',
  schedule: { dailyAt: 3 },
  // Généreux : le coût croît avec l'historique, et une coupure au milieu n'est
  // pas grave (le prochain passage recalcule tout de toute façon).
  timeoutMs: 15 * 60_000,
  async run() {
    const res = await questionService.recomputeSuccessRates();
    return { updated: res?.updated ?? null };
  },
};
