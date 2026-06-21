'use strict';

const db = require('../config/database');
const questionModel = require('../models/question.model');

/**
 * Synthèse du tableau de bord admin (CDC §3.1) : KPIs + activité récente +
 * questions à modérer + statut système, agrégés en une seule réponse.
 */
async function getOverview() {
  const [counts, recent, pending, nowRes] = await Promise.all([
    db.query(
      `SELECT
         (SELECT count(*)::int FROM users           WHERE deleted_at IS NULL)                              AS total_users,
         (SELECT count(*)::int FROM game_sessions   WHERE played_at::date = CURRENT_DATE)                  AS games_today,
         (SELECT count(*)::int FROM questions       WHERE status = 'approved'       AND deleted_at IS NULL) AS active_questions,
         (SELECT count(*)::int FROM tournaments      WHERE status = 'open'           AND deleted_at IS NULL) AS open_tournaments,
         (SELECT count(*)::int FROM users           WHERE deleted_at IS NULL AND last_active_at >= now() - interval '5 minutes') AS online_now,
         (SELECT COALESCE(round(100.0 * sum(correct_count) / NULLIF(sum(question_count), 0))::int, 0)
            FROM game_sessions)                                                                            AS success_rate`
    ),
    db.query(
      `SELECT id, name, ville, created_at
         FROM users
        WHERE deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT 5`
    ),
    db.query(
      `SELECT *
         FROM questions
        WHERE status = 'pending_review' AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT 10`
    ),
    db.query('SELECT now() AS now'),
  ]);

  const c = counts.rows[0];
  return {
    kpis: {
      total_users: c.total_users,
      games_today: c.games_today,
      active_questions: c.active_questions,
      open_tournaments: c.open_tournaments,
      online_now: c.online_now,
      success_rate: c.success_rate,
    },
    recent_users: recent.rows,
    pending_questions: pending.rows.map((r) => questionModel.toAdminView(r)),
    system: {
      api: 'operational',
      db: 'operational',
      redis: 'operational',
      last_sync: nowRes.rows[0].now,
    },
  };
}

module.exports = { getOverview };
