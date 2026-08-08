'use strict';

const { redis } = require('../config/redis');
const logger = require('../config/logger');
const env = require('../config/env');
const { JOBS, byName } = require('./index');
const { isDue, describe } = require('./schedule');
const lock = require('./lock');

/**
 * Moteur des tâches planifiées — tic à la minute, dans le processus API.
 *
 * ─ Pourquoi dans le processus et pas un service Railway dédié ─
 * Un service séparé avec `cronSchedule` est la réponse native de la plateforme,
 * mais c'est un cinquième service, un second mécanisme de déploiement et un coût
 * — pour quatre tâches courtes sur un projet de cette taille. Le risque
 * qu'invoque habituellement l'option séparée (plusieurs répliques → chaque tâche
 * s'exécute N fois) est neutralisé par le verrou Redis, pas par l'isolation.
 * Le point d'entrée `node src/jobs/run.js <nom>` existe dès maintenant : basculer
 * vers un service dédié ne demandera pas de réécriture.
 *
 * ⚠ Une condition : si le service Railway s'ENDORT quand il est inactif, ce
 * moteur ne se déclenche jamais et il faut passer au service cron. À vérifier
 * dans Railway → service `creveton` → Settings avant de s'y fier.
 *
 * ─ Un ordonnanceur muet est PIRE que pas d'ordonnanceur ─
 * Sans lui, on sait que `success_rate` est périmé. Avec lui, on le CROIT frais.
 * Chaque exécution laisse donc une trace lisible dans Redis (`jobs:last:<nom>`),
 * exposée par `GET /admin/jobs` : un opérateur doit pouvoir répondre à « le
 * recalcul a-t-il tourné cette nuit ? » sans ouvrir les logs de la plateforme.
 */

const TICK_MS = 60_000;
const lastKey = (name) => `jobs:last:${name}`;
// La trace survit largement à la cadence la plus lente (hebdomadaire) : sans TTL
// généreux, « jamais exécutée » et « exécutée il y a longtemps » seraient
// indiscernables sur le tableau de bord.
const LAST_TTL_SEC = 30 * 24 * 3600;

let timer = null;

async function readLast(name) {
  try {
    const raw = await redis.get(lastKey(name));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function writeLast(name, payload) {
  try {
    await redis.set(lastKey(name), JSON.stringify(payload), 'EX', LAST_TTL_SEC);
  } catch (err) {
    logger.warn("Trace d'exécution non enregistrée", { job: name, error: err.message });
  }
}

/**
 * Exécute une tâche, verrou compris. Ne jette jamais : une tâche qui échoue ne
 * doit ni interrompre les suivantes, ni faire tomber l'API qui l'héberge.
 *
 * @param {object} job
 * @param {{ force?: boolean }} opts  `force` = ignorer la cadence (CLI / admin).
 * @returns {Promise<{ ran: boolean, ok?: boolean, summary?: object, error?: string, reason?: string }>}
 */
async function runJob(job, { force = false } = {}) {
  const previous = await readLast(job.name);

  if (!force && !isDue(job.schedule, new Date(), previous?.startedAt ?? null)) {
    return { ran: false, reason: 'pas due' };
  }

  const runId = await lock.acquire(job.name, job.timeoutMs);
  if (!runId) {
    // Déjà en cours ailleurs (ou Redis muet) : on ne force pas. Les tâches sont
    // périodiques, le tic suivant réessaiera.
    return { ran: false, reason: 'verrou indisponible' };
  }

  const startedAt = Date.now();
  logger.info('Tâche planifiée démarrée', { job: job.name });

  try {
    const summary = await job.run();
    const finishedAt = Date.now();
    await writeLast(job.name, { startedAt, finishedAt, ok: true, summary: summary ?? null, error: null });
    logger.info('Tâche planifiée terminée', {
      job: job.name,
      duration_ms: finishedAt - startedAt,
      ...(summary || {}),
    });
    return { ran: true, ok: true, summary };
  } catch (err) {
    const finishedAt = Date.now();
    await writeLast(job.name, {
      startedAt,
      finishedAt,
      ok: false,
      summary: null,
      error: err.message,
    });
    logger.error('Tâche planifiée échouée', { job: job.name, error: err.message, stack: err.stack });
    return { ran: true, ok: false, error: err.message };
  } finally {
    await lock.release(job.name, runId);
  }
}

/** Un tic : passe les tâches en revue, exécute celles qui sont dues. */
async function tick() {
  for (const job of JOBS) {
    // Séquentiel et non `Promise.all` : deux batches lourds lancés ensemble sur
    // la même base ne vont pas plus vite, ils se gênent.
    await runJob(job);
  }
}

/**
 * Démarre le moteur. Inerte en test (`NODE_ENV=test`) : une suite qui
 * déclencherait des tâches de fond en parallèle deviendrait indéterministe.
 */
function start() {
  if (env.isTest || timer) return;
  logger.info('Ordonnanceur démarré', {
    jobs: JOBS.map((j) => `${j.name} (${describe(j.schedule)})`),
  });
  // `unref` : le tic ne doit pas empêcher le processus de s'arrêter proprement.
  timer = setInterval(() => {
    tick().catch((err) => logger.error('Tic de l’ordonnanceur en échec', { error: err.message }));
  }, TICK_MS);
  timer.unref();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

/** État des tâches pour `GET /admin/jobs`. */
async function status() {
  const rows = await Promise.all(
    JOBS.map(async (job) => ({
      name: job.name,
      schedule: describe(job.schedule),
      last: await readLast(job.name),
    }))
  );
  return rows;
}

module.exports = { start, stop, tick, runJob, status, byName };
