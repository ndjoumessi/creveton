'use strict';

/**
 * Socle des tests d'intégration (Postgres + Redis réels).
 *
 * Les variables d'environnement sont posées AU CHARGEMENT de ce module, donc
 * AVANT le require de src/app (qui lit la config). En CI, les services tournent
 * en localhost ; en local sans infra, les suites s'auto-désactivent (skip) —
 * sauf si REQUIRE_INTEGRATION=1 (CI) où l'absence d'infra fait échouer le build.
 */

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/creveton_test';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const db = require('../../src/config/database');
const { redis } = require('../../src/config/redis');
const { migrate } = require('../../src/models/migrate');
const { signAccessToken } = require('../../src/utils/jwt');

const REQUIRE = process.env.REQUIRE_INTEGRATION === '1';

/** Vérifie l'accès à l'infra et applique les migrations. @returns {boolean} prêt. */
async function ensureReady() {
  try {
    await db.ping();
    await redis.connect().catch(() => {}); // ioredis lazyConnect
    await redis.ping();
    await migrate();
    return true;
  } catch (err) {
    if (REQUIRE) throw err; // CI : pas d'infra = échec explicite
    console.warn(`[integration] infra indisponible, suite ignorée : ${err.message}`);
    return false;
  }
}

/** Remet la base et Redis à zéro entre les tests (isolation). */
async function resetState() {
  await db.query(
    `TRUNCATE TABLE users, questions, game_sessions, tournaments,
       tournament_participants, transactions RESTART IDENTITY CASCADE`
  );
  await redis.flushdb();
}

/** Ferme proprement les connexions de la suite. */
async function teardown() {
  await db.close().catch(() => {});
  await redis.quit().catch(() => {});
}

/** Insère un utilisateur (valeurs par défaut raisonnables) et le renvoie. */
async function createUser(over = {}) {
  const u = {
    name: 'Test User',
    phone: `+23769${Math.floor(100000 + Math.random() * 899999)}`,
    role: 'player',
    phone_verified: true,
    status: 'active',
    ville: 'Douala',
    total_xp: 0,
    level: 1,
    referral_code: `CREV-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    ...over,
  };
  const { rows } = await db.query(
    `INSERT INTO users (name, phone, role, phone_verified, status, ville, total_xp, level, referral_code)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [u.name, u.phone, u.role, u.phone_verified, u.status, u.ville, u.total_xp, u.level, u.referral_code]
  );
  return rows[0];
}

/** Jeton d'accès Bearer pour un utilisateur. */
function tokenFor(user, sid = 'sid-test') {
  return signAccessToken({ id: user.id, role: user.role, level: user.level }, sid);
}

/** Insère une question APPROUVÉE (visible joueur) avec solution connue. */
async function createApprovedQuestion(over = {}) {
  const q = {
    text_fr: `Question ${Math.random().toString(36).slice(2, 8)} ?`,
    options: [
      { text: 'A', is_correct: false },
      { text: 'B', is_correct: true },
    ],
    correct_index: 1,
    theme: 'geographie',
    level: 'beginner',
    explanation: 'Explication.',
    status: 'approved',
    ...over,
  };
  const { rows } = await db.query(
    `INSERT INTO questions (text_fr, type, options, correct_index, theme, level, explanation, status)
     VALUES ($1,'mcq',$2::jsonb,$3,$4,$5,$6,$7) RETURNING *`,
    [q.text_fr, JSON.stringify(q.options), q.correct_index, q.theme, q.level, q.explanation, q.status]
  );
  return rows[0];
}

module.exports = {
  db,
  redis,
  ensureReady,
  resetState,
  teardown,
  createUser,
  tokenFor,
  createApprovedQuestion,
};
