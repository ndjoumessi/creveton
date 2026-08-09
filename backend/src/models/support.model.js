'use strict';

const db = require('../config/database');

/**
 * Couche d'accès aux données « support » (migrations 021–023) :
 * tickets, ticket_messages, question_reports. SQL pur via db.query().
 * Pagination par offset (page/limit) + total via count(*) OVER().
 */

const TICKET_COLUMNS =
  'id, player_id, status, priority, type, subject, assigned_to, resolved_at, created_at, updated_at';
const MESSAGE_COLUMNS = 'id, ticket_id, sender_id, sender_role, body, created_at';

/** Retire la colonne d'agrégat technique `total_count` d'une ligne. */
function stripTotal(row) {
  const out = { ...row };
  delete out.total_count;
  return out;
}

// ── Tickets ──────────────────────────────────────────────────────────────────

async function listTickets({
  status = null,
  priority = null,
  type = null,
  assigned_to = null,
  page = 1,
  limit = 20,
} = {}) {
  const params = [];
  const clauses = [];
  if (status) { params.push(status); clauses.push(`status = $${params.length}`); }
  if (priority) { params.push(priority); clauses.push(`priority = $${params.length}`); }
  if (type) { params.push(type); clauses.push(`type = $${params.length}`); }
  if (assigned_to) { params.push(assigned_to); clauses.push(`assigned_to = $${params.length}`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const offset = Math.max(0, (page - 1) * limit);
  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const { rows } = await db.query(
    `SELECT ${TICKET_COLUMNS}, count(*) OVER() AS total_count
       FROM tickets ${where}
       ORDER BY created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );
  const total = rows.length ? Number(rows[0].total_count) : 0;
  return { tickets: rows.map(stripTotal), total };
}

async function getTicket(id) {
  const { rows } = await db.query(
    `SELECT ${TICKET_COLUMNS} FROM tickets WHERE id = $1`,
    [id]
  );
  const ticket = rows[0];
  if (!ticket) return null;
  const { rows: messages } = await db.query(
    `SELECT ${MESSAGE_COLUMNS} FROM ticket_messages
      WHERE ticket_id = $1 ORDER BY created_at ASC, id ASC`,
    [id]
  );
  return { ...ticket, messages };
}

async function createTicket({ player_id, type = 'other', subject, priority = 'normal' }) {
  const { rows } = await db.query(
    `INSERT INTO tickets (player_id, type, subject, priority)
       VALUES ($1, $2, $3, $4)
       RETURNING ${TICKET_COLUMNS}`,
    [player_id, type, subject, priority]
  );
  return rows[0];
}

/** Change le statut ; renseigne resolved_at quand on passe à resolved/closed.
 *  Le flag « résolu » est calculé en JS et passé en $3 (booléen) : sinon $2
 *  serait utilisé à la fois en `status = $2` (varchar) et dans un `IN (...)`
 *  (text), ce que Postgres refuse (« inconsistent types deduced for $2 »). */
async function updateTicketStatus(id, status) {
  const markResolved = status === 'resolved' || status === 'closed';
  const { rows } = await db.query(
    `UPDATE tickets
        SET status = $2,
            resolved_at = CASE WHEN $3 THEN now() ELSE resolved_at END,
            updated_at = now()
      WHERE id = $1
      RETURNING ${TICKET_COLUMNS}`,
    [id, status, markResolved]
  );
  return rows[0] || null;
}

async function assignTicket(id, assigned_to) {
  const { rows } = await db.query(
    `UPDATE tickets SET assigned_to = $2, updated_at = now()
      WHERE id = $1
      RETURNING ${TICKET_COLUMNS}`,
    [id, assigned_to]
  );
  return rows[0] || null;
}

// ── Ticket messages ──────────────────────────────────────────────────────────

/** Ajoute un message et touche `updated_at` du ticket parent. */
async function addMessage({ ticket_id, sender_id = null, sender_role = 'player', body }) {
  const { rows } = await db.query(
    `INSERT INTO ticket_messages (ticket_id, sender_id, sender_role, body)
       VALUES ($1, $2, $3, $4)
       RETURNING ${MESSAGE_COLUMNS}`,
    [ticket_id, sender_id, sender_role, body]
  );
  await db.query('UPDATE tickets SET updated_at = now() WHERE id = $1', [ticket_id]);
  return rows[0];
}

// ── Question reports ─────────────────────────────────────────────────────────

async function listReports({ status = null, page = 1, limit = 20 } = {}) {
  const params = [];
  const clauses = [];
  if (status) { params.push(status); clauses.push(`r.status = $${params.length}`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const offset = Math.max(0, (page - 1) * limit);
  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const { rows } = await db.query(
    `SELECT r.id, r.question_id, r.reported_by, r.reason, r.status, r.created_at,
            q.text_fr AS question_text, u.name AS reporter_name,
            count(*) OVER() AS total_count
       FROM question_reports r
       LEFT JOIN questions q ON q.id = r.question_id
       LEFT JOIN users u ON u.id = r.reported_by
       ${where}
       ORDER BY r.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );
  const total = rows.length ? Number(rows[0].total_count) : 0;
  return { reports: rows.map(stripTotal), total };
}

/**
 * Synthèse d'agrégats des signalements pour le tableau de bord modération :
 *  - `by_reason` : nombre de signalements par motif (wrong_answer, typo, …) ;
 *  - `by_status` : nombre par état de traitement (pending, ignored, resolved) ;
 *  - `top_questions` : questions les plus signalées (question_id + libellé FR +
 *    total de signalements + signalements encore en attente), triées « pending
 *    first » (les plus urgentes à traiter d'abord) ;
 *  - `total` : nombre total de signalements.
 * `limit` borne uniquement `top_questions`. Agrégats calculés en SQL (GROUP BY /
 * COUNT / FILTER), exécutés en parallèle.
 */
async function getReportsSummary({ limit = 5 } = {}) {
  const [byReason, byStatus, topQuestions, totals] = await Promise.all([
    db.query(
      `SELECT reason, count(*)::int AS count
         FROM question_reports
        GROUP BY reason
        ORDER BY count DESC, reason ASC`
    ),
    db.query(
      `SELECT status, count(*)::int AS count
         FROM question_reports
        GROUP BY status
        ORDER BY count DESC, status ASC`
    ),
    db.query(
      `SELECT r.question_id,
              q.text_fr AS question_text,
              count(*)::int AS report_count,
              count(*) FILTER (WHERE r.status = 'pending')::int AS pending_count
         FROM question_reports r
         LEFT JOIN questions q ON q.id = r.question_id
        GROUP BY r.question_id, q.text_fr
        ORDER BY pending_count DESC, report_count DESC, max(r.created_at) DESC
        LIMIT $1`,
      [limit]
    ),
    db.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE status = 'pending')::int AS pending
         FROM question_reports`
    ),
  ]);

  return {
    by_reason: byReason.rows,
    by_status: byStatus.rows,
    top_questions: topQuestions.rows,
    total: totals.rows[0].total,
    pending: totals.rows[0].pending,
  };
}

async function updateReportStatus(id, status) {
  const { rows } = await db.query(
    `UPDATE question_reports SET status = $2 WHERE id = $1
      RETURNING id, question_id, reported_by, reason, status, created_at`,
    [id, status]
  );
  return rows[0] || null;
}

// ── KPIs (dashboard SupportPage) ─────────────────────────────────────────────

async function getSupportKpis() {
  const { rows } = await db.query(
    `SELECT
       count(*) FILTER (WHERE status = 'open')::int AS open,
       count(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
       count(*) FILTER (
         WHERE status IN ('resolved', 'closed') AND resolved_at::date = CURRENT_DATE
       )::int AS resolved_today,
       COALESCE(
         round(avg(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 60.0)
           FILTER (WHERE resolved_at IS NOT NULL)),
         0
       )::int AS avg_resolution_min
     FROM tickets`
  );
  return rows[0];
}


/**
 * Détection de triche par ÉCART STATISTIQUE (§ anti-triche).
 *
 * Le contrôle existant ne voit que la vitesse : au moins trois réponses sous
 * 500 ms. Il n'attrape pas quelqu'un qui LIT les solutions et répond
 * tranquillement — or ce cas reste possible pour les questions déjà jouées,
 * dont la solution vit dans le cache du téléphone (cf. `patchQuestionSolution`).
 *
 * Le signal est ailleurs : un tel joueur réussit aussi les questions que tout
 * le monde rate. On compare donc le nombre de bonnes réponses OBSERVÉ à celui
 * ATTENDU pour un joueur moyen — la somme des `success_rate` des questions
 * qu'il a effectivement reçues, pas une moyenne globale.
 *
 * Sous l'hypothèse « joueur moyen », le nombre de réussites suit une binomiale
 * de Poisson : espérance `Σ p`, variance `Σ p(1−p)`. L'écart réduit
 * `(observé − Σp) / √(Σp(1−p))` mesure donc l'invraisemblance en écarts-types,
 * ce qu'un simple pourcentage ne saurait faire — réussir 9/10 sur des questions
 * faciles n'a rien de suspect, sur des questions ratées par tous, si.
 *
 * ⚠️ Trois limites, à garder en tête avant de conclure quoi que ce soit :
 *  · `success_rate` inclut les tentatives DU JOUEUR LUI-MÊME. Un gros joueur
 *    tire donc la moyenne vers lui et son écart s'en trouve SOUS-estimé. Le
 *    biais va dans le sens prudent, mais il existe.
 *  · Il faut du volume. Sous quelques centaines de réponses, `success_rate`
 *    n'est qu'un bruit et l'écart ne vaut rien — d'où le seuil `minAnswers`.
 *  · Un très bon joueur produit le même signal qu'un tricheur. C'est un
 *    SIGNALEMENT destiné à un humain, jamais une sanction automatique.
 */
async function detectAnomalies({ days = 30, minAnswers = 30, minZ = 4 } = {}) {
  const { rows } = await db.query(
    `WITH attempts AS (
       SELECT gs.user_id,
              gs.id AS session_id,
              COALESCE((a->>'is_correct')::boolean, false) AS is_correct,
              q.success_rate AS p
         FROM game_sessions gs
         CROSS JOIN LATERAL jsonb_array_elements(gs.answers) AS a
         JOIN questions q ON q.id = (a->>'question_id')::uuid
        WHERE q.success_rate IS NOT NULL
          AND gs.played_at >= now() - ($1 || ' days')::interval
     ),
     agg AS (
       SELECT user_id,
              count(DISTINCT session_id)::int                      AS sessions,
              count(*)::int                                        AS answers,
              sum(CASE WHEN is_correct THEN 1 ELSE 0 END)::int     AS observed,
              sum(p)::float                                        AS expected,
              sum(p * (1 - p))::float                              AS variance
         FROM attempts
        GROUP BY user_id
       HAVING count(*) >= $2
     )
     SELECT a.user_id, u.name, u.email, u.status,
            a.sessions, a.answers, a.observed,
            round(a.expected::numeric, 1)::float AS expected,
            CASE WHEN a.variance > 0
                 THEN round(((a.observed - a.expected) / sqrt(a.variance))::numeric, 2)::float
                 ELSE NULL END AS z
       FROM agg a
       JOIN users u ON u.id = a.user_id
      WHERE u.deleted_at IS NULL
        AND a.variance > 0
        AND (a.observed - a.expected) / sqrt(a.variance) >= $3
      ORDER BY z DESC`,
    [days, minAnswers, minZ]
  );
  return rows;
}

module.exports = {
  detectAnomalies,
  listTickets,
  getTicket,
  createTicket,
  updateTicketStatus,
  assignTicket,
  addMessage,
  listReports,
  getReportsSummary,
  updateReportStatus,
  getSupportKpis,
};
