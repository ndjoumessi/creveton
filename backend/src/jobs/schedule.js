'use strict';

/**
 * Cadences des tâches planifiées — descripteur minimal, sans dépendance.
 *
 * ─ Pourquoi pas node-cron / croner ─
 * Les cinq cadences du projet tiennent en trois formes : « toutes les N minutes »,
 * « chaque jour à H », « chaque semaine le jour J à H ». Vingt lignes suffisent,
 * et elles se testent sans horloge simulée. Si les besoins se compliquent
 * (jours ouvrés, minutes non rondes), `croner` est le remplacement direct :
 * seule cette fonction change.
 *
 * ─ Les heures sont en heure locale du CAMEROUN, pas en UTC ─
 * « recalcul nocturne » veut dire la nuit POUR LES JOUEURS. Exprimer les
 * cadences en UTC obligerait chaque lecteur à faire la conversion de tête, et la
 * première erreur mettrait le gros batch en pleine soirée de jeu. Le Cameroun
 * est à UTC+1 toute l'année (pas d'heure d'été), la conversion est donc une
 * simple addition — d'où la constante plutôt qu'une bibliothèque de fuseaux.
 */

const CAMEROON_UTC_OFFSET_HOURS = 1;

/** Heure/minute/jour « Cameroun » d'un instant donné. */
function localParts(date) {
  const shifted = new Date(date.getTime() + CAMEROON_UTC_OFFSET_HOURS * 3600 * 1000);
  return {
    minute: shifted.getUTCMinutes(),
    hour: shifted.getUTCHours(),
    weekday: shifted.getUTCDay(), // 0 = dimanche
  };
}

/**
 * La tâche est-elle due à cet instant ?
 *
 * `lastRunAt` protège du double déclenchement : le tic tourne à la minute, et
 * une tâche « chaque jour à 3 h » serait sinon lancée à chaque tic entre 3 h 00
 * et 3 h 00 : 59. On exige donc aussi qu'un intervalle minimal se soit écoulé.
 *
 * @param {{ everyMinutes?: number, dailyAt?: number, weeklyAt?: {weekday:number,hour:number} }} schedule
 * @param {Date} now
 * @param {number|null} lastRunAt  epoch ms de la dernière exécution réussie ou non
 */
function isDue(schedule, now, lastRunAt) {
  const since = lastRunAt ? now.getTime() - lastRunAt : Infinity;

  if (schedule.everyMinutes) {
    return since >= schedule.everyMinutes * 60_000;
  }

  const { hour, minute, weekday } = localParts(now);

  if (typeof schedule.dailyAt === 'number') {
    // Fenêtre de déclenchement : les 5 premières minutes de l'heure visée. Plus
    // large qu'une minute pile pour survivre à un tic manqué (redémarrage,
    // déploiement) sans attendre 24 h de plus.
    const inWindow = hour === schedule.dailyAt && minute < 5;
    return inWindow && since >= 6 * 3600_000;
  }

  if (schedule.weeklyAt) {
    const inWindow =
      weekday === schedule.weeklyAt.weekday &&
      hour === schedule.weeklyAt.hour &&
      minute < 5;
    return inWindow && since >= 24 * 3600_000;
  }

  return false;
}

/** Libellé lisible d'une cadence (exposé par GET /admin/jobs). */
function describe(schedule) {
  if (schedule.everyMinutes) return `toutes les ${schedule.everyMinutes} min`;
  if (typeof schedule.dailyAt === 'number') return `chaque jour à ${schedule.dailyAt}h (UTC+1)`;
  if (schedule.weeklyAt) {
    const days = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    return `chaque ${days[schedule.weeklyAt.weekday]} à ${schedule.weeklyAt.hour}h (UTC+1)`;
  }
  return 'jamais';
}

module.exports = { isDue, describe, localParts, CAMEROON_UTC_OFFSET_HOURS };
