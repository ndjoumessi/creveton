'use strict';

const H = require('./helpers/integration');
const request = require('supertest');
const app = require('../src/app');

/**
 * Tests d'intégration des endpoints Finances (console admin §12) — Postgres réel.
 * Liste paginée par curseur, filtres, KPIs, série journalière, validate/reject,
 * export CSV, et garde-fou de rôle (admin minimum).
 */

let ready = false;
beforeAll(async () => { ready = await H.ensureReady(); });
afterAll(async () => { await H.teardown(); });
beforeEach(async () => { if (ready) await H.resetState(); });

const t = (name, fn) =>
  test(name, async () => {
    if (!ready) { console.warn(`[skip] ${name}`); return; }
    await fn();
  });

const API = '/api/v1';

/** Crée une transaction (valeurs par défaut raisonnables). */
async function createTx(userId, over = {}) {
  const { rows } = await H.db.query(
    `INSERT INTO transactions (user_id, type, amount, currency, provider, status, reference)
     VALUES ($1, $2, $3, 'XAF', $4, $5, $6) RETURNING *`,
    [
      userId,
      over.type || 'deposit',
      over.amount ?? 5000,
      over.provider ?? 'orange_money',
      over.status || 'success',
      over.reference ?? null,
    ]
  );
  return rows[0];
}

async function adminToken() {
  const admin = await H.createUser({ role: 'admin' });
  return H.tokenFor(admin);
}

t('GET /admin/transactions — liste paginée (20 items + next_cursor, page suivante)', async () => {
  const token = await adminToken();
  const player = await H.createUser({ role: 'player' });
  for (let i = 0; i < 25; i += 1) {
    await createTx(player.id, { amount: 1000 + i, reference: `CRV-TX-${i}` });
  }

  const first = await request(app)
    .get(`${API}/admin/transactions?limit=20`)
    .set('Authorization', `Bearer ${token}`);
  expect(first.status).toBe(200);
  expect(first.body.data).toHaveLength(20);
  expect(first.body.page).toMatchObject({ limit: 20, has_more: true });
  expect(first.body.page.next_cursor).toBeTruthy();
  // La vue admin expose bien email/nom (JOIN users) et la forme attendue.
  expect(first.body.data[0]).toHaveProperty('user_email');
  expect(first.body.data[0]).toHaveProperty('reference');

  const second = await request(app)
    .get(`${API}/admin/transactions?limit=20&cursor=${first.body.page.next_cursor}`)
    .set('Authorization', `Bearer ${token}`);
  expect(second.status).toBe(200);
  expect(second.body.data).toHaveLength(5);
  expect(second.body.page.has_more).toBe(false);
  expect(second.body.page.next_cursor).toBeNull();
});

t('GET /admin/transactions — filtres statut + type combinés', async () => {
  const token = await adminToken();
  const player = await H.createUser({ role: 'player' });
  await createTx(player.id, { type: 'withdraw', status: 'pending', amount: 12000 });
  await createTx(player.id, { type: 'withdraw', status: 'success', amount: 8000 });
  await createTx(player.id, { type: 'deposit', status: 'pending', amount: 5000 });

  const res = await request(app)
    .get(`${API}/admin/transactions?status=pending&type=withdraw`)
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(res.body.data).toHaveLength(1);
  expect(res.body.data[0]).toMatchObject({ type: 'withdraw', status: 'pending', amount: 12000 });
});

t('GET /admin/analytics/finances — KPIs calculés correctement', async () => {
  const token = await adminToken();
  const player = await H.createUser({ role: 'player' });
  await createTx(player.id, { type: 'deposit', status: 'success', amount: 5000 });
  await createTx(player.id, { type: 'deposit', status: 'success', amount: 10000 });
  await createTx(player.id, { type: 'withdraw', status: 'success', amount: 3000 });
  await createTx(player.id, { type: 'withdraw', status: 'success', amount: 1000 });
  await createTx(player.id, { type: 'payout', status: 'success', amount: 40000 });
  await createTx(player.id, { type: 'deposit', status: 'pending', amount: 2000 });
  await createTx(player.id, { type: 'deposit', status: 'failed', amount: 9999 });

  const res = await request(app)
    .get(`${API}/admin/analytics/finances`)
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(res.body.volume_total.amount).toBe(59000); // toutes les success
  expect(res.body.deposits.amount).toBe(15000);
  expect(res.body.withdrawals.amount).toBe(4000); // type='withdraw' uniquement (payout exclu)
  expect(res.body.pending).toEqual({ count: 1, amount: 2000 });
  // Pas de mois précédent → variation 100 % (nouveau volume).
  expect(res.body.volume_total.delta_pct).toBe(100);
});

t('GET /admin/analytics/finances/daily — 30 points, groupage par jour', async () => {
  const token = await adminToken();
  const player = await H.createUser({ role: 'player' });
  await createTx(player.id, { type: 'deposit', status: 'success', amount: 7000 });
  await createTx(player.id, { type: 'withdraw', status: 'success', amount: 2000 });

  const res = await request(app)
    .get(`${API}/admin/analytics/finances/daily?days=30`)
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(res.body.data).toHaveLength(30);
  // Le dernier point (aujourd'hui, Africa/Douala) agrège les tx du jour.
  const today = res.body.data[res.body.data.length - 1];
  expect(today.deposits).toBe(7000);
  expect(today.withdrawals).toBe(2000);
});

t('POST /admin/transactions/:id/validate — statut → success', async () => {
  const token = await adminToken();
  const player = await H.createUser({ role: 'player' });
  const tx = await createTx(player.id, { type: 'withdraw', status: 'pending', amount: 25000 });

  const res = await request(app)
    .post(`${API}/admin/transactions/${tx.id}/validate`)
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('success');

  const { rows } = await H.db.query('SELECT status, metadata FROM transactions WHERE id = $1', [tx.id]);
  expect(rows[0].status).toBe('success');
  expect(rows[0].metadata.admin_action.action).toBe('validate');
});

t('POST /admin/transactions/:id/reject — statut → failed (+ motif)', async () => {
  const token = await adminToken();
  const player = await H.createUser({ role: 'player' });
  const tx = await createTx(player.id, { type: 'withdraw', status: 'pending', amount: 15000 });

  const res = await request(app)
    .post(`${API}/admin/transactions/${tx.id}/reject`)
    .set('Authorization', `Bearer ${token}`)
    .send({ reason: 'KYC incomplet' });
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('failed');

  const { rows } = await H.db.query('SELECT status, metadata FROM transactions WHERE id = $1', [tx.id]);
  expect(rows[0].status).toBe('failed');
  expect(rows[0].metadata.admin_action).toMatchObject({ action: 'reject', reason: 'KYC incomplet' });
});

t('GET /admin/transactions/export — CSV bien formé, colonnes correctes', async () => {
  const token = await adminToken();
  const player = await H.createUser({ role: 'player' });
  const tx = await createTx(player.id, { type: 'deposit', status: 'success', amount: 5000, reference: 'CRV-TX-EXP' });

  const res = await request(app)
    .get(`${API}/admin/transactions/export`)
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toContain('text/csv');
  expect(res.headers['content-disposition']).toContain('attachment');
  const body = res.text.replace(/^\uFEFF/, '');
  const lines = body.trim().split('\r\n');
  expect(lines[0]).toBe('id,date,user_email,type,amount,currency,provider,status,reference');
  // La ligne de données contient l'id et la référence de la transaction.
  expect(body).toContain(tx.id);
  expect(body).toContain('CRV-TX-EXP');
});

t('Accès refusé sans rôle admin → 403 (moderator et player)', async () => {
  const moderator = await H.createUser({ role: 'moderator' });
  const player = await H.createUser({ role: 'player' });

  const modRes = await request(app)
    .get(`${API}/admin/transactions`)
    .set('Authorization', `Bearer ${H.tokenFor(moderator)}`);
  expect(modRes.status).toBe(403);

  const playerRes = await request(app)
    .get(`${API}/admin/analytics/finances`)
    .set('Authorization', `Bearer ${H.tokenFor(player)}`);
  expect(playerRes.status).toBe(403);
});
