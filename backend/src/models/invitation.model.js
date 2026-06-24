'use strict';

const db = require('../config/database');

/**
 * Accès aux données du journal d'audit des invitations équipe (admin_invitations).
 * Source de vérité pour LISTER les invitations (le token d'activation vit, lui,
 * en Redis — cf. teamService). Une ligne par invitation émise.
 */

const RETURN_COLS = `id, email, name, role, invited_by, invite_token, status,
                     email_sent, email_error, expires_at, accepted_at, created_at`;

/** Insère une invitation. @returns la ligne créée. */
async function create({ email, name, role, invited_by, invite_token, email_sent, email_error }) {
  const { rows } = await db.query(
    `INSERT INTO admin_invitations (email, name, role, invited_by, invite_token, email_sent, email_error)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${RETURN_COLS}`,
    [email, name ?? null, role, invited_by ?? null, invite_token, email_sent === true, email_error ?? null]
  );
  return rows[0];
}

/** Invitation par id (avec le nom de l'invitant pour l'affichage). */
async function findById(id) {
  const { rows } = await db.query(
    `SELECT i.*, u.name AS invited_by_name
       FROM admin_invitations i
       LEFT JOIN users u ON u.id = i.invited_by
      WHERE i.id = $1`,
    [id]
  );
  return rows[0] || null;
}

/**
 * Liste paginée (created_at DESC), filtrable par statut. Marque au passage en
 * `expired` les invitations `pending` dont l'échéance est dépassée (cohérence
 * d'affichage). @returns {{ data, page }}.
 */
async function list({ status = null, limit = 20, offset = 0 } = {}) {
  await db.query(
    `UPDATE admin_invitations SET status = 'expired'
      WHERE status = 'pending' AND expires_at < now()`
  );

  const where = [];
  const params = [];
  if (status) {
    params.push(status);
    where.push(`i.status = $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const totalRes = await db.query(
    `SELECT count(*)::int AS n FROM admin_invitations i ${whereSql}`,
    params
  );
  const total = totalRes.rows[0].n;

  params.push(limit, offset);
  const { rows } = await db.query(
    `SELECT i.id, i.email, i.name, i.role, i.invited_by, u.name AS invited_by_name,
            i.status, i.email_sent, i.email_error, i.expires_at, i.accepted_at, i.created_at
       FROM admin_invitations i
       LEFT JOIN users u ON u.id = i.invited_by
       ${whereSql}
      ORDER BY i.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return { data: rows, total };
}

/** Passe une invitation à `accepted` via son token (idempotent). */
async function markAccepted(token) {
  const { rows } = await db.query(
    `UPDATE admin_invitations
        SET status = 'accepted', accepted_at = now()
      WHERE invite_token = $1 AND status <> 'accepted'
      RETURNING id`,
    [token]
  );
  return rows[0] || null;
}

/** Marque une invitation comme expirée (par id). */
async function markExpired(id) {
  await db.query(`UPDATE admin_invitations SET status = 'expired' WHERE id = $1`, [id]);
}

/** Met à jour le statut d'envoi d'email (après un renvoi). */
async function setEmailStatus(id, sent, error) {
  const { rows } = await db.query(
    `UPDATE admin_invitations SET email_sent = $2, email_error = $3 WHERE id = $1 RETURNING id`,
    [id, sent === true, error ?? null]
  );
  return rows[0] || null;
}

module.exports = { create, findById, list, markAccepted, markExpired, setEmailStatus };
