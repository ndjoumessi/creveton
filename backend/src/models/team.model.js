'use strict';

const db = require('../config/database');

/**
 * Accès aux données « Équipe & Rôles » (console §Équipe). Les membres sont les
 * comptes à rôle élevé (moderator/admin/super_admin), non soft-deletés.
 */

const TEAM_ROLES = ['moderator', 'admin', 'super_admin'];

/**
 * Liste des membres de l'équipe avec leur nombre d'évènements d'audit
 * (question_events.actor_id) — sous-requête corrélée pour éviter le N+1.
 */
async function listMembers() {
  const { rows } = await db.query(
    `SELECT u.id, u.name, u.email, u.phone, u.ville, u.role, u.status,
            u.last_active_at, u.created_at,
            (SELECT count(*)::int FROM question_events e WHERE e.actor_id = u.id) AS activity_count
       FROM users u
      WHERE u.role IN ('moderator', 'admin', 'super_admin')
        AND u.deleted_at IS NULL
      ORDER BY u.created_at`
  );
  return rows;
}

/** Décompte des membres par rôle élevé. */
async function memberStats() {
  const { rows } = await db.query(
    `SELECT
        count(*) FILTER (WHERE role IN ('moderator', 'admin', 'super_admin'))::int AS total,
        count(*) FILTER (WHERE role = 'super_admin')::int AS super_admins,
        count(*) FILTER (WHERE role = 'admin')::int AS admins,
        count(*) FILTER (WHERE role = 'moderator')::int AS moderators
       FROM users
      WHERE deleted_at IS NULL`
  );
  return rows[0];
}

/** Nombre de comptes (non soft-deletés) par rôle → { [role]: count }. */
async function countByRole() {
  const { rows } = await db.query(
    `SELECT role, count(*)::int AS n FROM users WHERE deleted_at IS NULL GROUP BY role`
  );
  return Object.fromEntries(rows.map((r) => [r.role, r.n]));
}

/**
 * Activité récente d'un membre (20 derniers évènements d'audit), avec le texte
 * de la question concernée.
 */
async function memberActivity(id) {
  const { rows } = await db.query(
    `SELECT e.id, e.event, e.reason, e.meta, e.created_at,
            q.text_fr AS question_text
       FROM question_events e
       LEFT JOIN questions q ON q.id = e.question_id
      WHERE e.actor_id = $1
      ORDER BY e.created_at DESC
      LIMIT 20`,
    [id]
  );
  return rows.map((r) => ({
    id: r.id,
    event: r.event,
    reason: r.reason ?? null,
    meta: r.meta || {},
    created_at: r.created_at,
    question_text: r.question_text ?? null,
  }));
}

module.exports = { TEAM_ROLES, listMembers, memberStats, countByRole, memberActivity };
