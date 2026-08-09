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

// 10b — synthèse des signalements (agrégats par motif / statut / top questions).
t('GET /support/reports/summary : 200 (moderator) — agrégats par motif/statut + top', async () => {
  const { player, moderator, admin, modAuth } = await actors();
  const q1 = await H.createApprovedQuestion();
  const q2 = await H.createApprovedQuestion();
  // q1 : 3 signalements (2 wrong_answer pending, 1 typo resolved).
  await makeReport(q1.id, player.id, { reason: 'wrong_answer', status: 'pending' });
  await makeReport(q1.id, moderator.id, { reason: 'wrong_answer', status: 'pending' });
  await makeReport(q1.id, admin.id, { reason: 'typo', status: 'resolved' });
  // q2 : 1 signalement (offensive, ignored).
  await makeReport(q2.id, player.id, { reason: 'offensive', status: 'ignored' });

  const r = await request(app).get(`${P}/reports/summary`).set('Authorization', modAuth);
  expect(r.status).toBe(200);

  // Total.
  expect(r.body.total).toBe(4);
  expect(r.body.pending).toBe(2);

  // Par motif.
  const reasonMap = Object.fromEntries(r.body.by_reason.map((x) => [x.reason, x.count]));
  expect(reasonMap.wrong_answer).toBe(2);
  expect(reasonMap.typo).toBe(1);
  expect(reasonMap.offensive).toBe(1);

  // Par statut.
  const statusMap = Object.fromEntries(r.body.by_status.map((x) => [x.status, x.count]));
  expect(statusMap.pending).toBe(2);
  expect(statusMap.resolved).toBe(1);
  expect(statusMap.ignored).toBe(1);

  // Top questions : q1 en tête (pending_count le plus élevé), avec libellé.
  expect(Array.isArray(r.body.top_questions)).toBe(true);
  expect(r.body.top_questions.length).toBe(2);
  const top = r.body.top_questions[0];
  expect(top.question_id).toBe(q1.id);
  expect(top.report_count).toBe(3);
  expect(top.pending_count).toBe(2);
  expect(top.question_text).toBe(q1.text_fr);
});

// 10c — la limite borne le top questions.
t('GET /support/reports/summary?limit=1 : 200 — top_questions borné à 1', async () => {
  const { player, moderator, modAuth } = await actors();
  const q1 = await H.createApprovedQuestion();
  const q2 = await H.createApprovedQuestion();
  await makeReport(q1.id, player.id, { reason: 'wrong_answer', status: 'pending' });
  await makeReport(q2.id, moderator.id, { reason: 'typo', status: 'pending' });

  const r = await request(app).get(`${P}/reports/summary?limit=1`).set('Authorization', modAuth);
  expect(r.status).toBe(200);
  expect(r.body.total).toBe(2);
  expect(r.body.top_questions.length).toBe(1);
});

// 10d — RBAC : player refusé.
t('GET /support/reports/summary : 403 si player (pas moderator)', async () => {
  const { playerAuth } = await actors();
  const r = await request(app).get(`${P}/reports/summary`).set('Authorization', playerAuth);
  expect(r.status).toBe(403);
  expect(r.body.error.code).toBe('FORBIDDEN');
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

// ── Anti-triche statistique ────────────────────────────────────────────────
//
// Le contrôle existant ne voit que la VITESSE (≥ 3 réponses sous 500 ms). Il
// n'attrape pas quelqu'un qui lit les solutions et répond tranquillement. Le
// signal est ailleurs : ce joueur réussit aussi les questions que tout le monde
// rate. On compare donc l'observé à l'ATTENDU — la somme des `success_rate` des
// questions réellement servies.

/** Crée `n` questions approuvées de taux de réussite `rate`. */
async function questionsWithRate(rate, n) {
  const ids = [];
  for (let i = 0; i < n; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const q = await H.createApprovedQuestion({ status: 'approved' });
    // eslint-disable-next-line no-await-in-loop
    await H.db.query('UPDATE questions SET success_rate = $1 WHERE id = $2', [rate, q.id]);
    ids.push(q.id);
  }
  return ids;
}

/** Une partie où `correct` des `ids` sont réussies. */
async function playSession(userId, ids, correct) {
  const answers = ids.map((id, i) => ({ question_id: id, selected_index: 0, elapsed_ms: 9000, is_correct: i < correct }));
  await H.db.query(
    `INSERT INTO game_sessions (user_id, score, correct_count, question_count, answers)
     VALUES ($1, 100, $2, $3, $4::jsonb)`,
    [userId, correct, ids.length, JSON.stringify(answers)]
  );
}

t('un joueur qui réussit ce que tout le monde rate est signalé', async () => {
  const admin = await H.createUser({ role: 'admin' });
  const tricheur = await H.createUser({ role: 'player' });
  // 40 questions ratées par 90 % des joueurs… toutes réussies.
  const dures = await questionsWithRate(0.1, 40);
  await playSession(tricheur.id, dures, 40);

  const r = await request(app)
    .get('/api/v1/admin/support/anticheat')
    .set('Authorization', `Bearer ${H.tokenFor(admin)}`);

  expect(r.status).toBe(200);
  const flag = r.body.data.find((x) => x.user_id === tricheur.id);
  expect(flag).toBeDefined();
  expect(flag.observed).toBe(40);
  expect(flag.expected).toBeCloseTo(4, 0); // 40 × 0,1
  expect(flag.z).toBeGreaterThan(4);
});

t('un score élevé sur des questions FACILES n’est pas suspect', async () => {
  // Le cœur de la mesure : 100 % de réussite n'est anormal que rapporté à la
  // difficulté. Un pourcentage brut aurait signalé ce joueur-ci aussi.
  const admin = await H.createUser({ role: 'admin' });
  const bon = await H.createUser({ role: 'player' });
  const faciles = await questionsWithRate(0.95, 40);
  await playSession(bon.id, faciles, 40);

  const r = await request(app)
    .get('/api/v1/admin/support/anticheat')
    .set('Authorization', `Bearer ${H.tokenFor(admin)}`);

  expect(r.body.data.find((x) => x.user_id === bon.id)).toBeUndefined();
});

t('sous le volume minimal, aucun signalement', async () => {
  const admin = await H.createUser({ role: 'admin' });
  const joueur = await H.createUser({ role: 'player' });
  const dures = await questionsWithRate(0.1, 10); // 10 < minAnswers (30)
  await playSession(joueur.id, dures, 10);

  const r = await request(app)
    .get('/api/v1/admin/support/anticheat')
    .set('Authorization', `Bearer ${H.tokenFor(admin)}`);

  // Sans volume, `success_rate` n'est que du bruit : mieux vaut ne rien dire.
  expect(r.body.data.find((x) => x.user_id === joueur.id)).toBeUndefined();
});

t('les questions sans taux calculé sont ignorées, pas comptées à zéro', async () => {
  // `success_rate` NULL = jamais recalculé, pas « personne ne réussit ». Les
  // compter comme 0 ferait exploser l'écart de tout le monde.
  const admin = await H.createUser({ role: 'admin' });
  const joueur = await H.createUser({ role: 'player' });
  const ids = [];
  for (let i = 0; i < 40; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const q = await H.createApprovedQuestion({ status: 'approved' });
    ids.push(q.id); // success_rate reste NULL
  }
  await playSession(joueur.id, ids, 40);

  const r = await request(app)
    .get('/api/v1/admin/support/anticheat')
    .set('Authorization', `Bearer ${H.tokenFor(admin)}`);

  expect(r.body.data.find((x) => x.user_id === joueur.id)).toBeUndefined();
});

t('un modérateur peut lire les signalements, un joueur non', async () => {
  const moderator = await H.createUser({ role: 'moderator' });
  const player = await H.createUser({ role: 'player' });
  await request(app).get('/api/v1/admin/support/anticheat')
    .set('Authorization', `Bearer ${H.tokenFor(moderator)}`).expect(200);
  await request(app).get('/api/v1/admin/support/anticheat')
    .set('Authorization', `Bearer ${H.tokenFor(player)}`).expect(403);
});
