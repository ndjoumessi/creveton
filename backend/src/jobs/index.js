'use strict';

/**
 * Registre des tâches planifiées.
 *
 * ─ Les cadences vivent ICI, pas dans le tableau de bord Railway ─
 * Un `cronSchedule` de plateforme est invisible depuis le code : six mois plus
 * tard, personne ne sait pourquoi le batch tourne à 3 h, ni qu'il existe. Dans le
 * dépôt, la cadence passe en revue de code, se teste, et porte son commentaire.
 *
 * Ajouter une tâche = ajouter un fichier dans `tasks/` et une ligne ici. Chaque
 * tâche expose `{ name, schedule, timeoutMs, run() }` et doit être :
 *  · IDEMPOTENTE — le conteneur redémarre à chaque déploiement, une exécution
 *    coupée en deux sera relancée ;
 *  · BORNÉE — `timeoutMs` sert de TTL au verrou ; une tâche qui le dépasse perd
 *    son verrou et peut être reprise ailleurs.
 *
 * ─ Ce qui N'EST PAS ici, volontairement ─
 * La purge RGPD des comptes supprimés (`user.model.js` : « purge planifiée hors
 * scope »). Toutes les clés étrangères vers `users` sont en ON DELETE CASCADE :
 * un `DELETE` effacerait aussi `game_sessions`, donc RÉÉCRIRAIT les classements
 * et fausserait `success_rate`. La forme correcte est une ANONYMISATION (effacer
 * nom, email, téléphone, avatar, ville, âge, sexe, jeton push ; garder la ligne
 * et les parties), et la durée de rétention est un choix juridique, pas
 * technique. Livrer une purge approximative serait irréversible — elle attend un
 * arbitrage explicite.
 */

const successRate = require('./tasks/successRate');
const expireChallenges = require('./tasks/expireChallenges');
const tournamentLifecycle = require('./tasks/tournamentLifecycle');
const emailVerifyNudge = require('./tasks/emailVerifyNudge');

const JOBS = [successRate, expireChallenges, tournamentLifecycle, emailVerifyNudge];

const byName = (name) => JOBS.find((j) => j.name === name) || null;

module.exports = { JOBS, byName };
