'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');
const settingsService = require('../../services/settingsService');
const questionService = require('../../services/questionService');
const db = require('../../config/database');

/** Console §Paramètres : feature flags, état système, intégrations, maintenance, exports. */

/** GET /admin/settings/flags */
const getFlags = asyncHandler(async (req, res) => {
  return ok(res, { flags: await settingsService.getFlags() });
});

/** PATCH /admin/settings/flags/:key  body { enabled } */
const patchFlag = asyncHandler(async (req, res) => {
  const flags = await settingsService.setFlag(req.params.key, req.body.enabled, req.user.id);
  return ok(res, { flags });
});

/** GET /admin/settings/system */
const system = asyncHandler(async (req, res) => {
  return ok(res, await settingsService.getSystemMetrics());
});

/** GET /admin/settings/integrations */
const integrations = asyncHandler(async (req, res) => {
  return ok(res, { integrations: settingsService.getIntegrations() });
});

/** POST /admin/settings/system/recompute-success-rates */
const recomputeSuccessRates = asyncHandler(async (req, res) => {
  const result = await questionService.recomputeSuccessRates();
  return ok(res, result);
});

/** POST /admin/settings/system/recompute-xp — recalcule le niveau (1–5) en SQL. */
const recomputeXp = asyncHandler(async (req, res) => {
  const result = await db.query(
    `UPDATE users SET level = CASE
        WHEN total_xp >= 3000 THEN 5
        WHEN total_xp >= 1200 THEN 4
        WHEN total_xp >= 500  THEN 3
        WHEN total_xp >= 200  THEN 2
        ELSE 1 END
      WHERE deleted_at IS NULL AND level <> CASE
        WHEN total_xp >= 3000 THEN 5
        WHEN total_xp >= 1200 THEN 4
        WHEN total_xp >= 500  THEN 3
        WHEN total_xp >= 200  THEN 2
        ELSE 1 END`
  );
  return ok(res, { updated: result.rowCount });
});

/** GET /admin/settings/exports/questions — toutes les questions en JSON (download). */
const exportQuestions = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, text_fr, text_en, type, options, correct_index, theme, level,
            explanation, status, version, success_rate, created_at, updated_at
       FROM questions WHERE deleted_at IS NULL ORDER BY created_at`
  );
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="questions-creveton.json"');
  return res.status(200).send(JSON.stringify({ exported_at: new Date().toISOString(), count: rows.length, questions: rows }, null, 2));
});

/** GET /admin/settings/exports/users — tous les utilisateurs en CSV (download). */
const exportUsers = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, name, email, phone, ville, age, sexe, lang, total_xp, level, role,
            created_at, last_active_at
       FROM users WHERE deleted_at IS NULL ORDER BY created_at`
  );
  const headers = ['id', 'name', 'email', 'phone', 'ville', 'age', 'sexe', 'lang', 'total_xp', 'level', 'role', 'created_at', 'last_active_at'];
  const cell = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => cell(r[h])).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="utilisateurs-creveton.csv"');
  return res.status(200).send(csv);
});

module.exports = {
  getFlags, patchFlag, system, integrations,
  recomputeSuccessRates, recomputeXp, exportQuestions, exportUsers,
};
