'use strict';

const db = require('../../config/database');
const logger = require('../../config/logger');
const tournamentService = require('../../services/tournamentService');

/**
 * Cycle de vie des tournois planifiés.
 *
 * Constaté sur staging : deux tournois datés du 30 juin et du 2 juillet étaient
 * encore affichés « À venir · Indisponible » le 8 août. Rien ne fait avancer un
 * tournoi dans le temps — `scheduled → open` n'a aucun déclencheur, et
 * `tournamentService.start()` n'est atteignable que par
 * `POST /admin/tournaments/:id/start`, actionné par un humain.
 *
 * ─ Ce que cette tâche fait, et surtout ce qu'elle NE fait PAS ─
 * Elle OUVRE les inscriptions (`scheduled → open`) à l'approche de l'heure de
 * départ. C'est mécanique et sans conséquence : un tournoi ouvert attend des
 * inscrits.
 *
 * Elle ne DÉMARRE rien. `start()` vérifie `MIN_PLAYERS_TO_START` et ouvre une
 * manche temps réel via socket : l'automatiser reviendrait à accepter qu'une
 * manche se lance sans personne devant. C'est une décision produit, pas une
 * mécanique — elle reste à un humain jusqu'à arbitrage.
 *
 * Elle EXPIRE en revanche les tournois morts — décision produit prise le
 * 2026-08-09. Un tournoi « ouvert » depuis cinq semaines avec zéro inscrit
 * n'attend plus personne : il gonflait le KPI « Tournois ouverts » du tableau
 * de bord, qui annonçait 2 pendant que « Prochains tournois » disait « Aucun
 * tournoi à venir ». Deux conditions, toutes deux nécessaires :
 *
 *   1. moins de `MIN_PLAYERS_TO_START` inscrits. Au-delà, le tournoi POURRAIT
 *      encore démarrer : l'annuler détruirait des inscriptions réelles pour
 *      corriger un oubli humain. Celui-là reste signalé, pas expiré.
 *   2. `entry_fee = 0`. Une tâche automatique n'annule pas ce à quoi de
 *      l'argent est attaché tant que le remboursement est un COMMENTAIRE dans
 *      `tournamentService.cancel` et pas du code. Les tournois payants restent
 *      signalés jusqu'à ce que ce chemin existe.
 *
 * L'annulation passe par `tournamentService.cancel()` plutôt que par un UPDATE
 * local : le jour où les remboursements sont implémentés, la tâche en hérite
 * sans qu'on y pense.
 *
 * Ce qui reste en retard après ce tri est SIGNALÉ au journal — un tournoi
 * oublié doit apparaître quelque part.
 *
 * Idempotent : `cancel()` refuse un tournoi déjà annulé, et les tournois
 * expirés sortent d'eux-mêmes du périmètre de la requête au passage suivant.
 */

// Les inscriptions s'ouvrent 24 h avant le départ : assez tôt pour que les
// joueurs voient le tournoi arriver, assez tard pour qu'il ne traîne pas des
// semaines en tête de liste.
const OPEN_LEAD_HOURS = 24;

// Au-delà, un tournoi jamais lancé n'est plus « imminent » mais oublié.
const OVERDUE_HOURS = 2;

// Et au-delà de celui-ci, il est mort. Bien plus large que le signalement :
// démarrer un tournoi avec quelques heures de retard est une négligence
// rattrapable, l'expirer ne l'est pas.
const EXPIRE_AFTER_HOURS = 24;

module.exports = {
  name: 'tournament-lifecycle',
  schedule: { everyMinutes: 15 },
  timeoutMs: 60_000,
  async run() {
    const opened = await db.query(
      `UPDATE tournaments
          SET status = 'open'
        WHERE status = 'scheduled'
          AND deleted_at IS NULL
          AND starts_at IS NOT NULL
          AND starts_at <= now() + ($1 || ' hours')::interval
        RETURNING id, name`,
      [OPEN_LEAD_HOURS]
    );

    // Tournois morts : trop tard, gratuits, et sous le minimum de joueurs.
    const dead = await db.query(
      `SELECT t.id, t.name, t.starts_at
         FROM tournaments t
        WHERE t.status IN ('scheduled', 'open')
          AND t.deleted_at IS NULL
          AND t.starts_at IS NOT NULL
          AND t.starts_at < now() - ($1 || ' hours')::interval
          AND COALESCE(t.entry_fee, 0) = 0
          AND (SELECT count(*) FROM tournament_participants p WHERE p.tournament_id = t.id) < $2`,
      [EXPIRE_AFTER_HOURS, tournamentService.MIN_PLAYERS_TO_START]
    );

    const expired = [];
    for (const row of dead.rows) {
      try {
        await tournamentService.cancel(row.id);
        expired.push(row.id);
      } catch (err) {
        // Un échec ne doit pas emporter les suivants : le passage d'après
        // reprendra celui-ci, il reste dans le périmètre de la requête.
        logger.error('Expiration de tournoi échouée', { id: row.id, error: err.message });
      }
    }

    if (expired.length > 0) {
      logger.info('Tournois expirés : départ dépassé, gratuits, sous le minimum de joueurs', {
        count: expired.length,
        tournaments: dead.rows
          .filter((r) => expired.includes(r.id))
          .map((r) => ({ id: r.id, name: r.name, starts_at: r.starts_at })),
      });
    }

    // Ce qui reste en retard APRÈS expiration : les payants, et ceux qui ont
    // assez de joueurs pour démarrer. Ceux-là attendent une main humaine.
    const overdue = await db.query(
      `SELECT id, name, starts_at
         FROM tournaments
        WHERE status IN ('scheduled', 'open')
          AND deleted_at IS NULL
          AND starts_at IS NOT NULL
          AND starts_at < now() - ($1 || ' hours')::interval`,
      [OVERDUE_HOURS]
    );

    if (overdue.rowCount > 0) {
      logger.warn('Tournois en retard : heure de départ dépassée, jamais lancés', {
        count: overdue.rowCount,
        tournaments: overdue.rows.map((r) => ({ id: r.id, name: r.name, starts_at: r.starts_at })),
      });
    }

    return { opened: opened.rowCount, expired: expired.length, overdue: overdue.rowCount };
  },
};
