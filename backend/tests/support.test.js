'use strict';

const H = require('./helpers/integration');
const request = require('supertest');
const app = require('../src/app');

/**
 * Tests d'intégration Support (spec §12) — tickets, fil de messages, statut,
 * assignation, signalements de questions, KPIs, RBAC — Postgres + Redis réels.
 *
 * Nettoyage : resetState() (beforeEach) TRUNCATE … users/questions … CASCADE,
 * ce qui purge aussi tickets / ticket_messages / question_reports (FK CASCADE).
 */

let ready = false;
beforeAll(async () => {
  ready = await H.ensureReady();
});
afterAll(async () => {
  await H.teardown();
});
beforeEach(async () => {
  if (ready) await H.resetState();
});

const t = (name, fn) =>
  test(name, async () => {
    if (!ready) {
      console.warn(`[skip] ${name}`);
      return;
    }
    await fn();
  });

const P = '/api/v1/admin/support';
// UUID v4 valide mais inexistant (passe la validation Joi, doit donner 404).
const UNKNOWN_ID = '7b5e2c1a-3d4f-4a6b-8c9d-0e1f2a3b4c5d';

async function actors() {
  const player = await H.createUser({ role: 'player', phone: '+237690000020' });
  const moderator = await H.createUser({ role: 'moderator', phone: '+237690000021' });
  const admin = await H.createUser({ role: 'admin', phone: '+237690000022' });
  return {
    player,
    moderator,
    admin,
    playerAuth: `Bearer ${H.tokenFor(player)}`,
    modAuth: `Bearer ${H.tokenFor(moderator)}`,
    adminAuth: `Bearer ${H.tokenFor(admin)}`,
  };
}

/** Insère un ticket directement (setup rapide). */
async function makeTicket(playerId, over = {}) {
  const { rows } = await H.db.query(
    `INSERT INTO tickets (player_id, type, subject, priority, status)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [playerId, over.type || 'account', over.subject || 'Sujet test', over.priority || 'normal', over.status || 'open']
  );
  return rows[0];
}

/** Insère un signalement de question (setup rapide). */
async function makeReport(questionId, reporterId, over = {}) {
  const { rows } = await H.db.query(
    `INSERT INTO question_reports (question_id, reported_by, reason, status)
       VALUES ($1, $2, $3, $4) RETURNING *`,
    [questionId, reporterId, over.reason || 'wrong_answer', over.status || 'pending']
  );
  return rows[0];
}

// 1
t('GET /support/kpis : 200 (moderator) avec les 4 indicateurs', async () => {
  const { modAuth } = await actors();
  const r = await request(app).get(`${P}/kpis`).set('Authorization', modAuth);
  expect(r.status).toBe(200);
  expect(r.body).toHaveProperty('open');
  expect(r.body).toHaveProperty('in_progress');
  expect(r.body).toHaveProperty('resolved_today');
  expect(r.body).toHaveProperty('avg_resolution_min');
});

// 2
t('POST /support/tickets : 201 (admin) — ticket créé en open', async () => {
  const { admin, adminAuth } = await actors();
  const r = await request(app)
    .post(`${P}/tickets`)
    .set('Authorization', adminAuth)
    .send({ player_id: admin.id, type: 'account', subject: 'Compte bloqué', priority: 'urgent' });
  expect(r.status).toBe(201);
  expect(r.body.id).toBeDefined();
  expect(r.body.status).toBe('open');
  expect(r.body.priority).toBe('urgent');
});

// 3
t('GET /support/tickets : 200 (moderator) liste + total', async () => {
  const { player, modAuth } = await actors();
  await makeTicket(player.id);
  await makeTicket(player.id, { type: 'bug', subject: 'Chrono' });
  const r = await request(app).get(`${P}/tickets`).set('Authorization', modAuth);
  expect(r.status).toBe(200);
  expect(Array.isArray(r.body.data)).toBe(true);
  expect(r.body.data.length).toBe(2);
  expect(r.body.total).toBe(2);
});

// 4
t('GET /support/tickets/:id : 200 (moderator) + messages[]', async () => {
  const { player, modAuth } = await actors();
  const ticket = await makeTicket(player.id);
  const r = await request(app).get(`${P}/tickets/${ticket.id}`).set('Authorization', modAuth);
  expect(r.status).toBe(200);
  expect(r.body.id).toBe(ticket.id);
  expect(Array.isArray(r.body.messages)).toBe(true);
});

// 5
t('POST /support/tickets/:id/reply : 200 (admin) — message ajouté, open → in_progress', async () => {
  const { player, adminAuth } = await actors();
  const ticket = await makeTicket(player.id, { status: 'open' });
  const r = await request(app)
    .post(`${P}/tickets/${ticket.id}/reply`)
    .set('Authorization', adminAuth)
    .send({ body: 'Bonjour, nous regardons votre problème.' });
  expect(r.status).toBe(200);
  expect(r.body.messages.length).toBe(1);
  expect(r.body.messages[0].sender_role).toBe('admin');
  expect(r.body.status).toBe('in_progress');
});

// 6
t('POST /support/tickets/:id/reply { resolve:true } : status → resolved', async () => {
  const { player, adminAuth } = await actors();
  const ticket = await makeTicket(player.id, { status: 'open' });
  const r = await request(app)
    .post(`${P}/tickets/${ticket.id}/reply`)
    .set('Authorization', adminAuth)
    .send({ body: 'Résolu, bonne journée.', resolve: true });
  expect(r.status).toBe(200);
  expect(r.body.status).toBe('resolved');
  expect(r.body.resolved_at).not.toBeNull();
});

// 7
t('PATCH /support/tickets/:id/status : 200 (admin)', async () => {
  const { player, adminAuth } = await actors();
  const ticket = await makeTicket(player.id);
  const r = await request(app)
    .patch(`${P}/tickets/${ticket.id}/status`)
    .set('Authorization', adminAuth)
    .send({ status: 'in_progress' });
  expect(r.status).toBe(200);
  expect(r.body.status).toBe('in_progress');
});

// 8
t('PATCH /support/tickets/:id/assign : 200 (admin)', async () => {
  const { player, admin, adminAuth } = await actors();
  const ticket = await makeTicket(player.id);
  const r = await request(app)
    .patch(`${P}/tickets/${ticket.id}/assign`)
    .set('Authorization', adminAuth)
    .send({ assigned_to: admin.id });
  expect(r.status).toBe(200);
  expect(r.body.assigned_to).toBe(admin.id);
});

// 9
t('GET /support/reports : 200 (moderator)', async () => {
  const { player, modAuth } = await actors();
  const q = await H.createApprovedQuestion();
  await makeReport(q.id, player.id);
  const r = await request(app).get(`${P}/reports`).set('Authorization', modAuth);
  expect(r.status).toBe(200);
  expect(Array.isArray(r.body.data)).toBe(true);
  expect(r.body.data.length).toBe(1);
  expect(r.body.data[0].question_id).toBe(q.id);
});

// 10
t('PATCH /support/reports/:id/status : 200 (admin)', async () => {
  const { player, adminAuth } = await actors();
  const q = await H.createApprovedQuestion();
  const report = await makeReport(q.id, player.id);
  const r = await request(app)
    .patch(`${P}/reports/${report.id}/status`)
    .set('Authorization', adminAuth)
    .send({ status: 'resolved' });
  expect(r.status).toBe(200);
  expect(r.body.status).toBe('resolved');
});

// 11
t('GET /support/tickets : 403 si player (pas moderator)', async () => {
  const { playerAuth } = await actors();
  const r = await request(app).get(`${P}/tickets`).set('Authorization', playerAuth);
  expect(r.status).toBe(403);
  expect(r.body.error.code).toBe('FORBIDDEN');
});

// 12
t('GET /support/tickets/:id : 404 si id inconnu', async () => {
  const { modAuth } = await actors();
  const r = await request(app).get(`${P}/tickets/${UNKNOWN_ID}`).set('Authorization', modAuth);
  expect(r.status).toBe(404);
  expect(r.body.error.code).toBe('NOT_FOUND');
});
