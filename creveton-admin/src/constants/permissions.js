// Modèle de permissions de la console (RBAC) — partagé entre Équipe & Rôles.
// Les permissions sont basées sur le RÔLE (miroir de backend admin.middleware).
// Stockage éditable côté backend dans app_settings (clé role_permissions).

export const ACTIONS = ['read', 'create', 'update', 'delete'];

export const MODULES = [
  { key: 'dashboard', labelKey: 'roles.modules.dashboard' },
  { key: 'questions', labelKey: 'roles.modules.questions' },
  { key: 'users', labelKey: 'roles.modules.users' },
  { key: 'tournaments', labelKey: 'roles.modules.tournaments' },
  { key: 'sessions', labelKey: 'roles.modules.sessions' },
  { key: 'leaderboard', labelKey: 'roles.modules.leaderboard' },
  { key: 'team', labelKey: 'roles.modules.team' },
  { key: 'settings', labelKey: 'roles.modules.settings' },
  { key: 'finances', labelKey: 'roles.modules.finances' },
];

// Actions applicables par module ('—' pour les non applicables).
export const MODULE_ACTIONS = {
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

export const isApplicable = (moduleKey, action) => (MODULE_ACTIONS[moduleKey] || []).includes(action);

// Rôles système (non modifiables) vs configurables.
export const SYSTEM_ROLES = ['super_admin', 'player'];
export const ROLE_ORDER = ['super_admin', 'admin', 'moderator', 'player'];

export const ROLE_META = {
  super_admin: { icon: '👑', tone: 'gold' },
  admin: { icon: '🛡️', tone: 'green' },
  moderator: { icon: '✏️', tone: 'blue' },
  player: { icon: '🎮', tone: 'gray' },
};

const ALL = (mod) => Object.fromEntries((MODULE_ACTIONS[mod] || []).map((a) => [a, true]));
const allModules = () => Object.fromEntries(MODULES.map((m) => [m.key, ALL(m.key)]));

// Matrices par défaut (miroir des permissions backend par rôle).
export const DEFAULT_ROLE_PERMISSIONS = {
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

// Modules accessibles (au moins 'read') pour un matrice donnée — utilisé par les pills.
export function accessibleModules(matrix) {
  return MODULES.filter((m) => matrix?.[m.key]?.read).map((m) => m.key);
}
export function deniedModules(matrix) {
  return MODULES.filter((m) => !matrix?.[m.key]?.read).map((m) => m.key);
}

export default { ACTIONS, MODULES, MODULE_ACTIONS, isApplicable, SYSTEM_ROLES, ROLE_ORDER, ROLE_META, DEFAULT_ROLE_PERMISSIONS, accessibleModules, deniedModules };
