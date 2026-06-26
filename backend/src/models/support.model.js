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

module.exports = {
  listTickets,
  getTicket,
  createTicket,
  updateTicketStatus,
  assignTicket,
  addMessage,
  listReports,
  updateReportStatus,
  getSupportKpis,
};
