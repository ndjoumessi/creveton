'use strict';

const db = require('../config/database');
const questionModel = require('../models/question.model');
const tournamentModel = require('../models/tournament.model');
const { THEMES } = require('../utils/constants');

/**
 * Synthèse du tableau de bord admin (CDC §3.1) : KPIs + activité récente +
 * questions à modérer + santé du contenu + prochains tournois + statut système,
 * agrégés en une seule réponse.
 */
async function getOverview() {
  const [counts, recent, pending, health, pool, upcoming, nowRes] = await Promise.all([
    db.query(
      `SELECT
         (SELECT count(*)::int FROM users           WHERE deleted_at IS NULL)                              AS total_users,
         (SELECT count(*)::int FROM game_sessions   WHERE played_at::date = CURRENT_DATE)                  AS games_today,
         (SELECT count(*)::int FROM questions       WHERE status = 'approved'       AND deleted_at IS NULL) AS active_questions,
         (SELECT count(*)::int FROM tournaments      WHERE status = 'open'           AND deleted_at IS NULL) AS open_tournaments,
         (SELECT count(*)::int FROM users           WHERE deleted_at IS NULL AND last_active_at >= now() - interval '5 minutes') AS online_now,
         (SELECT COALESCE(round(100.0 * sum(correct_count) / NULLIF(sum(question_count), 0))::int, 0)
            FROM game_sessions)                                                                            AS success_rate,
         (SELECT COALESCE(round(avg(score))::int, 0) FROM game_sessions)                                  AS avg_score,
         (SELECT COALESCE(sum(xp_earned), 0)::bigint FROM game_sessions)                                  AS xp_distributed`
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
    // Santé du contenu : la nuit, success_rate n'est calculé QUE pour les
    // questions effectivement posées → IS NULL = « jamais posée ».
    db.query(
      `SELECT
         count(*) FILTER (WHERE success_rate IS NULL)              ::int AS never_asked,
         count(*) FILTER (WHERE success_rate IS NOT NULL
                            AND success_rate < 0.30)               ::int AS too_hard,
         count(*) FILTER (WHERE success_rate > 0.80)               ::int AS too_easy
         FROM questions
        WHERE status = 'approved' AND deleted_at IS NULL`
    ),
    // Pool de questions approuvées par thème (barres de répartition).
    db.query(
      `SELECT theme, count(*)::int AS n
         FROM questions
        WHERE status = 'approved' AND deleted_at IS NULL
        GROUP BY theme`
    ),
    // Tournois programmés/ouverts démarrant dans les 7 prochains jours.
    db.query(
      `SELECT t.*,
              (SELECT count(*)::int FROM tournament_participants p WHERE p.tournament_id = t.id) AS registered_players
         FROM tournaments t
        WHERE t.deleted_at IS NULL
          AND t.status IN ('scheduled', 'open')
          AND t.starts_at IS NOT NULL
          AND t.starts_at >= now()
          AND t.starts_at <= now() + interval '7 days'
        ORDER BY t.starts_at ASC
        LIMIT 6`
    ),
    db.query('SELECT now() AS now'),
  ]);

  const c = counts.rows[0];
  const h = health.rows[0];

  // Pool par thème : toujours les 6 thèmes (0 si absent), ordre canonique.
  const poolMap = Object.fromEntries(THEMES.map((t) => [t, 0]));
  for (const row of pool.rows) {
    if (row.theme in poolMap) poolMap[row.theme] = row.n;
  }

  return {
    kpis: {
      total_users: c.total_users,
      games_today: c.games_today,
      active_questions: c.active_questions,
      open_tournaments: c.open_tournaments,
      online_now: c.online_now,
      success_rate: c.success_rate,
      avg_score: c.avg_score,
      xp_distributed: Number(c.xp_distributed),
    },
    recent_users: recent.rows,
    pending_questions: pending.rows.map((r) => questionModel.toAdminView(r)),
    content_health: {
      never_asked: h.never_asked,
      too_hard: h.too_hard,
      too_easy: h.too_easy,
      pool_by_theme: THEMES.map((theme) => ({ theme, count: poolMap[theme] })),
    },
    upcoming_tournaments: upcoming.rows.map((r) =>
      tournamentModel.toView(r, r.registered_players)
    ),
    system: {
      api: 'operational',
      db: 'operational',
      redis: 'operational',
      last_sync: nowRes.rows[0].now,
    },
  };
}

module.exports = { getOverview };
