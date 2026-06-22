'use strict';

const ApiError = require('../utils/ApiError');
const { ROLE_RANK } = require('./requireRole');

/**
 * Contrôle d'accès admin par OPÉRATION (réf. spec §12 — matrice des rôles).
 *
 * À placer après `authenticate`. Plutôt que de répéter requireRole() partout,
 * chaque route déclare l'opération métier qu'elle réalise ; la table ci-dessous
 * fait foi pour le rôle minimum requis.
 *
 *   Lire questions / users / analytics .................... moderator
 *   Créer / modifier / approuver une question ............. moderator
 *   Importer des questions (lot) ......................... moderator
 *   Supprimer une question ............................... admin
 *   Push « force-sync » (retrait d'urgence multi-appareils) admin
 *   Gérer les users (suspend, ban, reset, delete) ........ admin
 *   Créer / lancer / annuler / payout tournoi ............ admin
 *   Gérer l'équipe admin, paramètres système, flags ...... super_admin
 */
const PERMISSIONS = {
  'questions:read': 'moderator',
  'questions:create': 'moderator',
  'questions:update': 'moderator',
  'questions:transition': 'moderator',
  'questions:import': 'moderator',
  'questions:delete': 'admin',
  'questions:force-sync': 'admin',

  'users:read': 'moderator',
  'users:manage': 'admin',
  'users:invite': 'admin',
  'users:role': 'super_admin',

  'sessions:read': 'admin',
  'leaderboard:read': 'moderator',

  'tournaments:read': 'moderator',
  'tournaments:manage': 'admin',

  'analytics:read': 'moderator',
  'dashboard:read': 'admin',

  // Finances : lecture/journal financier + validation manuelle des transactions
  // (réf. permissions admin « finances »). Minimum admin (moderator exclu).
  'transactions:read': 'admin',
  'transactions:manage': 'admin',

  'system:read': 'admin',
  'system:manage': 'super_admin',

  'settings:read': 'admin',
  'settings:manage': 'super_admin',

  'team:read': 'admin',
  'team:manage': 'super_admin',
};

/**
 * Exige le rôle minimum associé à `operation`. À utiliser après authenticate.
 * @param {string} operation clé de la table PERMISSIONS (ex. 'questions:delete')
 */
function requirePermission(operation) {
  const minRole = PERMISSIONS[operation];
  // Une opération inconnue est un bug de câblage → on refuse par défaut (fail-closed).
  const required = minRole ? ROLE_RANK[minRole] : Number.POSITIVE_INFINITY;

  return function check(req, res, next) {
    const current = ROLE_RANK[req.user?.role] ?? -1;
    if (current < required) {
      return next(new ApiError('FORBIDDEN'));
    }
    return next();
  };
}

module.exports = { requirePermission, PERMISSIONS };
