'use strict';

const db = require('../config/database');
const { TOURNAMENT_TYPES, THEMES, LEVELS, GAME_MODES, TRANSACTION_TYPES } = require('../utils/constants');

/**
 * Agrégats analytics pour la console admin (réf. spec §12, CDC §3.8).
 *
 * Lecture seule sur la base. Au lancement (flag payant false), revenus et
 * transactions sont à 0 — cohérent avec le MVP gratuit.
 */

/** Parse '30d' | '7d' | '24h' → nombre de jours (défaut 30). */
function periodToDays(period) {
  if (!period) return 30;
  const m = /^(\d+)\s*([dh])$/i.exec(String(period).trim());
  if (!m) return 30;
  const n = parseInt(m[1], 10);
  return m[2].toLowerCase() === 'h' ? Math.max(1, Math.round(n / 24)) : n;
}

function ratio(num, den) {
  return den > 0 ? Number((num / den).toFixed(3)) : 0;
}

/**
 * GET /admin/analytics — calcule les indicateurs sur la période demandée.
 * @param {object} opts
 * @param {string} [opts.period='30d']
 * @returns {Promise<object>} contrat §12.
 */
async function getAnalytics({ period = '30d' } = {}) {
  const days = periodToDays(period);

  const [active, signups, retention, revenue, tournaments, transactions, byType, daily] = await Promise.all([
    // DAU (24 h) & MAU (30 j) — sur last_active_at.
    db.query(
      `SELECT
         count(*) FILTER (WHERE last_active_at >= now() - interval '1 day')::int  AS dau,
         count(*) FILTER (WHERE last_active_at >= now() - interval '30 days')::int AS mau
       FROM users WHERE deleted_at IS NULL`
    ),
    // Nouveaux inscrits sur la période + taux d'activation (OTP validé).
    db.query(
      `SELECT
         count(*)::int AS new_signups,
         count(*) FILTER (WHERE phone_verified)::int AS activated
       FROM users
       WHERE deleted_at IS NULL AND created_at >= now() - ($1 || ' days')::interval`,
      [days]
    ),
    // Rétention de cohorte (approx) : revenu·e après J1/J7/J30.
    db.query(
      `SELECT
         count(*)::float AS cohort,
         count(*) FILTER (WHERE last_active_at >= created_at + interval '1 day')::float  AS d1,
         count(*) FILTER (WHERE last_active_at >= created_at + interval '7 days')::float  AS d7,
         count(*) FILTER (WHERE last_active_at >= created_at + interval '30 days')::float AS d30
       FROM users
       WHERE deleted_at IS NULL AND created_at >= now() - ($1 || ' days')::interval`,
      [days]
    ),
    // Revenus FCFA = frais d'inscription encaissés (transactions réussies).
    db.query(
      `SELECT COALESCE(sum(amount), 0)::bigint AS revenue
         FROM transactions
        WHERE type = 'entry_fee' AND status = 'success'
          AND created_at >= now() - ($1 || ' days')::interval`,
      [days]
    ),
    db.query(
      `SELECT count(*)::int AS run
         FROM tournaments
        WHERE status IN ('running', 'closed', 'paid')
          AND created_at >= now() - ($1 || ' days')::interval`,
      [days]
    ),
    db.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE status = 'pending')::int AS pending
         FROM transactions
        WHERE created_at >= now() - ($1 || ' days')::interval`,
      [days]
    ),
    // Volume par type de tournoi.
    db.query(
      `SELECT type, count(*)::int AS n
         FROM tournaments
        WHERE created_at >= now() - ($1 || ' days')::interval
        GROUP BY type`,
      [days]
    ),
    // Série journalière inscriptions vs parties (graphe d'activité du dashboard).
    // generate_series garantit une ligne par jour, même à 0.
    db.query(
      `WITH d AS (
         SELECT generate_series(CURRENT_DATE - ($1::int - 1), CURRENT_DATE, interval '1 day')::date AS day
       )
       SELECT d.day AS date,
              (SELECT count(*)::int FROM users u
                WHERE u.deleted_at IS NULL AND u.created_at::date = d.day) AS signups,
              (SELECT count(*)::int FROM game_sessions g
                WHERE g.played_at::date = d.day) AS games
         FROM d ORDER BY d.day`,
      [days]
    ),
  ]);

  const { dau, mau } = active.rows[0];
  const { new_signups: newSignups, activated } = signups.rows[0];
  const r = retention.rows[0];

  const byTypeMap = Object.fromEntries(TOURNAMENT_TYPES.map((t) => [t, 0]));
  for (const row of byType.rows) {
    if (row.type in byTypeMap) byTypeMap[row.type] = row.n;
  }

  return {
    period: `${days}d`,
    dau,
    mau,
    dau_mau_ratio: ratio(dau, mau),
    new_signups: newSignups,
    activation_rate: ratio(activated, newSignups),
    retention: {
      d1: ratio(r.d1, r.cohort),
      d7: ratio(r.d7, r.cohort),
      d30: ratio(r.d30, r.cohort),
    },
    revenue_fcfa: Number(revenue.rows[0].revenue),
    daily: daily.rows.map((d) => ({
      date: d.date,
      signups: d.signups,
      games: d.games,
    })),
    tournaments_run: tournaments.rows[0].run,
    transactions: {
      total: transactions.rows[0].total,
      pending: transactions.rows[0].pending,
    },
    by_type: byTypeMap,
  };
}

// ════════════════════════════════════════════════════════════════════════
// Rapports détaillés (GROUP BY) — plage de dates [from, to).
// ════════════════════════════════════════════════════════════════════════

// Colonnes de regroupement autorisées pour les rapports « sessions » et
// l'ensemble canonique des catégories associé (back-fill à 0 des lignes
// absentes, comme by_type/pool_by_theme ailleurs). Whitelist stricte : la clé
// `group_by` est validée par Joi ET re-vérifiée ici avant interpolation SQL —
// jamais de texte libre injecté dans la requête.
const GROUP_DIMENSIONS = {
  theme: { column: 'theme', categories: THEMES },
  level: { column: 'level', categories: LEVELS },
  mode: { column: 'mode', categories: GAME_MODES },
};

/**
 * Résout une plage [from, to). Défaut : 30 derniers jours jusqu'à maintenant.
 * `to` est exclusif ; on borne `from < to` (sinon on retombe sur 30 j).
 * @returns {{ from: Date, to: Date }}
 */
function resolveRange({ from, to } = {}) {
  const end = to ? new Date(to) : new Date();
  let start = from ? new Date(from) : new Date(end.getTime() - 30 * 24 * 3600 * 1000);
  if (start >= end) start = new Date(end.getTime() - 30 * 24 * 3600 * 1000);
  return { from: start, to: end };
}

/**
 * GET /admin/analytics/reports/sessions — parties agrégées par thème|niveau|mode
 * sur [from, to). Catégories canoniques back-fillées à 0 ; les parties à `theme`
 * NULL (thèmes mixtes) forment un bucket « (mixte) » quand elles existent.
 * @param {object} opts
 * @param {'theme'|'level'|'mode'} opts.group_by
 * @param {string|Date} [opts.from]
 * @param {string|Date} [opts.to]
 */
async function sessionsReport({ group_by: groupBy, from, to } = {}) {
  const dim = GROUP_DIMENSIONS[groupBy];
  if (!dim) throw new Error(`group_by non supporté: ${groupBy}`);
  const range = resolveRange({ from, to });

  const { rows } = await db.query(
    `SELECT COALESCE(${dim.column}, '(mixte)') AS key,
            count(*)::int                         AS sessions,
            count(DISTINCT user_id)::int          AS players,
            COALESCE(round(avg(score))::int, 0)   AS avg_score,
            COALESCE(sum(xp_earned), 0)::bigint   AS xp,
            CASE WHEN sum(question_count) > 0
                 THEN round(100.0 * sum(correct_count) / sum(question_count))::int
                 ELSE 0 END                       AS success_rate
       FROM game_sessions
      WHERE played_at >= $1 AND played_at < $2
      GROUP BY ${dim.column}`,
    [range.from, range.to]
  );

  const zero = (key) => ({ key, sessions: 0, players: 0, avg_score: 0, xp: 0, success_rate: 0 });
  const map = new Map(dim.categories.map((k) => [k, zero(k)]));
  let totalSessions = 0;
  let totalXp = 0;
  for (const row of rows) {
    const entry = {
      key: row.key,
      sessions: row.sessions,
      players: row.players,
      avg_score: row.avg_score,
      xp: Number(row.xp),
      success_rate: row.success_rate,
    };
    map.set(row.key, entry); // écrase le zéro ; ajoute « (mixte) » / clé hors set
    totalSessions += entry.sessions;
    totalXp += entry.xp;
  }

  return {
    group_by: groupBy,
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    rows: [...map.values()].sort((a, b) => b.sessions - a.sessions),
    totals: { sessions: totalSessions, xp: totalXp },
  };
}

/**
 * GET /admin/analytics/reports/revenue — transactions agrégées par type sur
 * [from, to). Montants encaissés = status 'success'. Types canoniques
 * back-fillés à 0.
 * @param {object} opts
 * @param {string|Date} [opts.from]
 * @param {string|Date} [opts.to]
 */
async function revenueReport({ from, to } = {}) {
  const range = resolveRange({ from, to });

  const { rows } = await db.query(
    `SELECT type,
            count(*)::int                                              AS count,
            count(*) FILTER (WHERE status = 'success')::int            AS success_count,
            COALESCE(sum(amount) FILTER (WHERE status = 'success'), 0)::bigint AS total_success,
            count(*) FILTER (WHERE status = 'pending')::int            AS pending
       FROM transactions
      WHERE created_at >= $1 AND created_at < $2
      GROUP BY type`,
    [range.from, range.to]
  );

  const zero = (type) => ({ type, count: 0, success_count: 0, total_success: 0, pending: 0 });
  const map = new Map(TRANSACTION_TYPES.map((t) => [t, zero(t)]));
  let totalCount = 0;
  let totalSuccess = 0;
  for (const row of rows) {
    const entry = {
      type: row.type,
      count: row.count,
      success_count: row.success_count,
      total_success: Number(row.total_success),
      pending: row.pending,
    };
    if (map.has(row.type)) map.set(row.type, entry);
    totalCount += entry.count;
    totalSuccess += entry.total_success;
  }

  return {
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    rows: [...map.values()],
    totals: { count: totalCount, total_success: totalSuccess },
  };
}

module.exports = { getAnalytics, periodToDays, sessionsReport, revenueReport, resolveRange };
