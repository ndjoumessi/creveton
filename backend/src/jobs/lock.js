'use strict';

const crypto = require('crypto');
const { redis } = require('../config/redis');
const logger = require('../config/logger');

/**
 * Verrou distribué Redis pour les tâches planifiées.
 *
 * ─ Pourquoi un verrou alors qu'il n'y a qu'une réplique ─
 * `numReplicas: 1` sur Railway aujourd'hui, oui. Mais c'est un réglage de
 * tableau de bord : passer à 2 est un clic, et sans verrou ce clic transformerait
 * « recalculer success_rate » en « le recalculer deux fois en concurrence ». Une
 * propriété de correction ne doit pas dépendre d'un interrupteur d'interface.
 *
 * ─ Libération par COMPARAISON, jamais par DEL sec ─
 * Le verrou porte un identifiant d'exécution unique et expire tout seul (PX). Si
 * une tâche dépasse son TTL, le verrou tombe et un autre processus peut le
 * reprendre : un `DEL` aveugle au retour de la première libérerait alors le
 * verrou de la SECONDE. On ne supprime donc que si la valeur est toujours la
 * nôtre — comparaison et suppression dans le même script Lua, sinon la
 * vérification et la suppression ne sont pas atomiques.
 */

const RELEASE_LUA = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0
`;

const lockKey = (name) => `jobs:lock:${name}`;

/**
 * Tente de prendre le verrou.
 * @returns {Promise<string|null>} identifiant d'exécution, ou null si déjà pris.
 */
async function acquire(name, ttlMs) {
  const runId = crypto.randomUUID();
  try {
    const res = await redis.set(lockKey(name), runId, 'PX', ttlMs, 'NX');
    return res === 'OK' ? runId : null;
  } catch (err) {
    // Redis indisponible : on NE prend PAS le verrou. Exécuter sans garantie
    // d'unicité serait pire que sauter un tour — les tâches sont périodiques,
    // le prochain tic réessaiera.
    logger.warn('Verrou de tâche indisponible (Redis)', { job: name, error: err.message });
    return null;
  }
}

/** Libère le verrou si — et seulement si — il nous appartient encore. */
async function release(name, runId) {
  try {
    await redis.eval(RELEASE_LUA, 1, lockKey(name), runId);
  } catch (err) {
    logger.warn('Libération du verrou impossible', { job: name, error: err.message });
  }
}

module.exports = { acquire, release };
