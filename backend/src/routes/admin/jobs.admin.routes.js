'use strict';

const express = require('express');
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const { ok } = require('../../utils/response');
const { requirePermission } = require('../../middlewares/admin.middleware');
const jobs = require('../../jobs/runner');

const router = express.Router();

/**
 * Observation des tâches planifiées.
 *
 * Sans cet endpoint, un ordonnanceur muet est pire que pas d'ordonnanceur : on
 * croirait `success_rate` frais alors que le tic est mort depuis trois semaines.
 * Ici, un opérateur voit d'un coup d'œil la dernière exécution de chaque tâche,
 * son résultat et son erreur éventuelle.
 */

/** GET /admin/jobs → [{ name, schedule, last: { startedAt, finishedAt, ok, summary, error } }] */
router.get(
  '/',
  requirePermission('jobs:read'),
  asyncHandler(async (req, res) => ok(res, { data: await jobs.status() }))
);

/**
 * POST /admin/jobs/:name/run — relance immédiate (super_admin).
 * Ignore la cadence mais pas le verrou : si la tâche tourne déjà, on refuse au
 * lieu de la doubler.
 */
router.post(
  '/:name/run',
  requirePermission('jobs:run'),
  asyncHandler(async (req, res) => {
    const job = jobs.byName(req.params.name);
    if (!job) throw new ApiError('JOB_NOT_FOUND', { message: { fr: `Tâche inconnue : ${req.params.name}`, en: `Unknown job: ${req.params.name}` } });

    const result = await jobs.runJob(job, { force: true });
    if (!result.ran) {
      throw new ApiError('JOB_ALREADY_RUNNING', {
        message: { fr: `Tâche non lancée (${result.reason}) — elle tourne probablement déjà.`, en: `Job not started (${result.reason}) — it is probably already running.` },
      });
    }
    return ok(res, { name: job.name, ok: result.ok, summary: result.summary ?? null, error: result.error ?? null });
  })
);

module.exports = router;
