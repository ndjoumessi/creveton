'use strict';

const db = require('../../config/database');
const logger = require('../../config/logger');

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
 * Elle SIGNALE en revanche les tournois en retard (heure de départ dépassée,
 * toujours pas lancés) : sans ça, le silence actuel se prolongerait, simplement
 * mieux rangé. Le signalement passe par le journal — un tournoi oublié doit
 * apparaître quelque part.
 *
 * Idempotent : les deux requêtes sont des `UPDATE … WHERE status = …`.
 */

// Les inscriptions s'ouvrent 24 h avant le départ : assez tôt pour que les
// joueurs voient le tournoi arriver, assez tard pour qu'il ne traîne pas des
// semaines en tête de liste.
const OPEN_LEAD_HOURS = 24;

// Au-delà, un tournoi jamais lancé n'est plus « imminent » mais oublié.
const OVERDUE_HOURS = 2;

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

    return { opened: opened.rowCount, overdue: overdue.rowCount };
  },
};
