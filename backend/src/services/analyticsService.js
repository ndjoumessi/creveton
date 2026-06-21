'use strict';

const db = require('../config/database');
const { TOURNAMENT_TYPES } = require('../utils/constants');

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

  const [active, signups, retention, revenue, tournaments, transactions, byType] = await Promise.all([
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
    tournaments_run: tournaments.rows[0].run,
    transactions: {
      total: transactions.rows[0].total,
      pending: transactions.rows[0].pending,
    },
    by_type: byTypeMap,
  };
}

module.exports = { getAnalytics, periodToDays };
