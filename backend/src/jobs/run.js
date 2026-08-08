'use strict';

/**
 * Lancement manuel d'une tâche : `node src/jobs/run.js <nom>`.
 *
 * Trois usages :
 *  · exploitation — relancer un batch après incident sans attendre la nuit ;
 *  · développement — vérifier une tâche sans manipuler l'horloge ;
 *  · migration — si l'API passe un jour à un service Railway dédié avec
 *    `cronSchedule`, c'est CE point d'entrée que la plateforme appellera. Il
 *    existe dès maintenant pour que la bascule ne demande aucune réécriture.
 *
 * Ignore la cadence (`force`) mais PAS le verrou : un lancement manuel pendant
 * que la tâche tourne déjà doit échouer proprement, pas s'exécuter en double.
 */

const logger = require('../config/logger');
const db = require('../config/database');
const redisClient = require('../config/redis');
const { JOBS, byName } = require('./index');
const { runJob } = require('./runner');

async function main() {
  const name = process.argv[2];

  if (!name) {
    process.stdout.write(`Usage : node src/jobs/run.js <nom>\n\nTâches :\n${JOBS.map((j) => `  ${j.name}`).join('\n')}\n`);
    process.exit(1);
  }

  const job = byName(name);
  if (!job) {
    process.stderr.write(`Tâche inconnue : « ${name} ». Connues : ${JOBS.map((j) => j.name).join(', ')}\n`);
    process.exit(1);
  }

  await redisClient.connect().catch(() => {});
  const res = await runJob(job, { force: true });

  if (!res.ran) {
    logger.warn('Tâche non exécutée', { job: name, reason: res.reason });
  }
  // Code de sortie explicite : un cron de plateforme (ou un opérateur) doit
  // distinguer « a tourné » de « a échoué ».
  return res.ran && res.ok ? 0 : 1;
}

main()
  .then(async (code) => {
    await Promise.allSettled([db.close(), redisClient.close()]);
    process.exit(code);
  })
  .catch(async (err) => {
    logger.error('Lancement manuel en échec', { error: err.message, stack: err.stack });
    await Promise.allSettled([db.close(), redisClient.close()]);
    process.exit(1);
  });
