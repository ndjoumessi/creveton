'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const ApiError = require('../utils/ApiError');
const teamModel = require('../models/team.model');
const userModel = require('../models/user.model');
const settingsModel = require('../models/settings.model');

/**
 * Logique métier « Équipe & Rôles » (console §Équipe).
 *
 * Les permissions par rôle sont une matrice { [module]: { [action]: bool } }
 * persistée dans app_settings (clé `role_permissions`). En l'absence de valeur
 * stockée pour un rôle, on retombe sur la matrice DEFAULT ci-dessous, miroir de
 * `creveton-admin/src/constants/permissions.js`.
 */

const BCRYPT_COST = 12;
const PERMISSIONS_KEY = 'role_permissions';

const ROLE_LIST = ['super_admin', 'admin', 'moderator', 'player'];
const SYSTEM_ROLES = ['super_admin', 'player'];

const MODULE_ACTIONS = {
  dashboard: ['read'],
  questions: ['read', 'create', 'update', 'delete'],
  users: ['read', 'create', 'update', 'delete'],
  tournaments: ['read', 'create', 'update', 'delete'],
  sessions: ['read'],
  leaderboard: ['read'],
  team: ['read', 'create', 'update', 'delete'],
  settings: ['read', 'update'],
  finances: ['read'],
};

const MODULES = Object.keys(MODULE_ACTIONS);

/** Matrice « tout autorisé » (uniquement les actions applicables par module). */
function allModules() {
  return Object.fromEntries(
    MODULES.map((m) => [m, Object.fromEntries(MODULE_ACTIONS[m].map((a) => [a, true]))])
  );
}

const DEFAULT_ROLE_PERMISSIONS = {
  super_admin: allModules(),
  admin: {
    dashboard: { read: true },
    questions: { read: true, create: true, update: true, delete: false },
    users: { read: true, create: false, update: true, delete: false },
    tournaments: { read: true, create: true, update: true, delete: false },
    sessions: { read: true },
    leaderboard: { read: true },
    team: { read: false, create: false, update: false, delete: false },
    settings: { read: false, update: false },
    finances: { read: true },
  },
  moderator: {
    dashboard: { read: true },
    questions: { read: true, create: true, update: true, delete: false },
    users: { read: false, create: false, update: false, delete: false },
    tournaments: { read: true, create: true, update: true, delete: false },
    sessions: { read: true },
    leaderboard: { read: true },
    team: { read: false, create: false, update: false, delete: false },
    settings: { read: false, update: false },
    finances: { read: false },
  },
  player: {},
};

/** Mot de passe temporaire conforme à la politique (≥8, 1 majuscule, 1 chiffre). */
function generateTempPassword() {
  return `Crv${crypto.randomBytes(5).toString('hex')}1A`;
}

/** Téléphone synthétique unique (colonne NOT NULL UNIQUE) pour un compte invité. */
function syntheticPhone() {
  return `+237${crypto.randomInt(600000000, 699999999)}`;
}

// ---------------------------------------------------------------------------
// Membres
// ---------------------------------------------------------------------------

/** GET /admin/team — liste des membres + nombre d'évènements d'audit. */
async function listMembers() {
  const rows = await teamModel.listMembers();
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    ville: r.ville ?? null,
    role: r.role,
    status: r.status,
    last_active_at: r.last_active_at ?? null,
    created_at: r.created_at,
    activity_count: r.activity_count ?? 0,
  }));
}

/** GET /admin/team/stats — décompte par rôle élevé. */
async function memberStats() {
  return teamModel.memberStats();
}

/** GET /admin/team/:id/activity — 20 derniers évènements d'audit du membre. */
async function memberActivity(id) {
  const user = await userModel.findById(id);
  if (!user) throw new ApiError('USER_NOT_FOUND');
  const events = await teamModel.memberActivity(id);
  return { events };
}

/**
 * POST /admin/team/invite — crée un compte modérateur/admin avec mot de passe
 * temporaire (réutilise userModel.createInvited). super_admin non invitable
 * (verrouillé par le validateur). Réessaie sur collision de téléphone synthétique.
 */
async function invite({ email, name, role }) {
  if (await userModel.findByEmail(email)) throw new ApiError('EMAIL_ALREADY_USED');

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_COST);
  const referralCode = await userModel.generateUniqueReferralCode();

  let user;
  for (let attempt = 0; attempt < 3 && !user; attempt += 1) {
    try {
      user = await userModel.createInvited({
        name,
        email,
        role,
        password_hash: passwordHash,
        phone: syntheticPhone(),
        referral_code: referralCode,
      });
    } catch (err) {
      if (err && err.code === '23505') {
        if (String(err.constraint || err.detail).includes('email')) throw new ApiError('EMAIL_ALREADY_USED');
        if (attempt === 2) throw err;
      } else {
        throw err;
      }
    }
  }

  return { id: user.id, email: user.email, name: user.name, role: user.role, temporary_password: tempPassword };
}

/** PATCH /admin/team/:id/role — change le rôle (réutilise userModel.setRole). */
async function setRole(id, role) {
  const updated = await userModel.setRole(id, role);
  if (!updated) throw new ApiError('USER_NOT_FOUND');
  return { id: updated.id, role: updated.role };
}

/** DELETE /admin/team/:id — soft delete RGPD (réutilise userModel.softDelete). */
async function remove(id) {
  const deleted = await userModel.softDelete(id);
  if (!deleted) throw new ApiError('USER_NOT_FOUND');
  return deleted;
}

// ---------------------------------------------------------------------------
// Rôles & permissions
// ---------------------------------------------------------------------------

/** Matrice de permissions effective d'un rôle (stockée sinon DEFAULT). */
function effectiveMatrix(role, stored) {
  const fromStore = stored && stored[role];
  return fromStore && typeof fromStore === 'object' ? fromStore : (DEFAULT_ROLE_PERMISSIONS[role] || {});
}

/** GET /admin/team/roles — un descripteur par rôle (membres, système, permissions). */
async function listRoles() {
  const [counts, stored] = await Promise.all([
    teamModel.countByRole(),
    settingsModel.get(PERMISSIONS_KEY),
  ]);
  const roles = ROLE_LIST.map((role) => ({
    role,
    members: counts[role] ?? 0,
    system: SYSTEM_ROLES.includes(role),
    permissions: effectiveMatrix(role, stored),
  }));
  return { roles };
}

/**
 * PATCH /admin/team/roles/:role/permissions — fusionne la matrice fournie dans
 * app_settings['role_permissions'][role]. Refuse les rôles système.
 */
async function setRolePermissions(role, permissions, actorId) {
  if (!ROLE_LIST.includes(role)) {
    throw new ApiError('VALIDATION_ERROR', { message: `Rôle inconnu : ${role}.` });
  }
  if (SYSTEM_ROLES.includes(role)) {
    throw new ApiError('VALIDATION_ERROR', { message: `Le rôle ${role} est un rôle système non modifiable.` });
  }
  const stored = (await settingsModel.get(PERMISSIONS_KEY)) || {};
  const next = { ...stored, [role]: permissions };
  await settingsModel.set(PERMISSIONS_KEY, next, actorId);
  return listRoles();
}

module.exports = {
  DEFAULT_ROLE_PERMISSIONS,
  MODULE_ACTIONS,
  SYSTEM_ROLES,
  ROLE_LIST,
  listMembers,
  memberStats,
  memberActivity,
  invite,
  setRole,
  remove,
  listRoles,
  setRolePermissions,
};
