'use strict';

// Flag payant ON + secret webhook — DOIVENT être posés avant le chargement de
// la config (helper → db → env).
process.env.FEATURE_TOURNAMENTS_PAID_ENABLED = 'true';
process.env.MTN_MOMO_WEBHOOK_SECRET = 'whsec-mtn-test';

const H = require('./helpers/integration');
const request = require('supertest');
const app = require('../src/app');
const hmac = require('../src/utils/hmac');

/**
 * Tests d'intégration Wallet + Webhooks paiement (spec §11/§14) — recharge,
 * idempotence, transactions, webhook signé HMAC → crédit wallet.
 */

const SECRET = 'whsec-mtn-test';

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
    if (!ready) return;
    await fn();
  });

async function actor() {
  const user = await H.createUser({ role: 'player', phone: '+237690000010' });
  return { user, token: H.tokenFor(user) };
}

/** Envoie un webhook signé (corps brut = chaîne signée). */
function postWebhook(provider, bodyObj, { secret = SECRET, signature } = {}) {
  const payload = JSON.stringify(bodyObj);
  const sig = signature ?? hmac.sign(payload, secret);
  return request(app)
    .post(`/api/v1/webhooks/payments/${provider}`)
    .set('Content-Type', 'application/json')
    .set('X-Signature', sig)
    .send(payload);
}

t('GET /wallet → solde initial 0 / XAF / pending 0', async () => {
  const { token } = await actor();
  const r = await request(app).get('/api/v1/wallet').set('Authorization', `Bearer ${token}`);
  expect(r.status).toBe(200);
  expect(r.body).toEqual({ balance: 0, currency: 'XAF', pending: 0 });
});

t('POST /wallet/recharge → 202 pending + reference', async () => {
  const { token } = await actor();
  const r = await request(app)
    .post('/api/v1/wallet/recharge')
    .set('Authorization', `Bearer ${token}`)
    .send({ amount: 2000, provider: 'mtn_momo', phone: '+237690000010' });
  expect(r.status).toBe(202);
  expect(r.body).toMatchObject({ status: 'pending', amount: 2000, provider: 'mtn_momo', ussd_prompt_sent: true });
  expect(r.body.reference).toMatch(/^CRV-TX-/);
  expect(r.body.transaction_id).toBeDefined();
});

t('recharge idempotente (Idempotency-Key) → une seule transaction', async () => {
  const { user, token } = await actor();
  const send = () =>
    request(app)
      .post('/api/v1/wallet/recharge')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'idem-123')
      .send({ amount: 1500, provider: 'mtn_momo', phone: '+237690000010' });
  const a = await send();
  const b = await send();
  expect(a.body.transaction_id).toBe(b.body.transaction_id);
  const { rows } = await H.db.query('SELECT count(*)::int AS n FROM transactions WHERE user_id = $1', [user.id]);
  expect(rows[0].n).toBe(1);
});

t('pending reflète la recharge en attente ; transactions list la renvoie', async () => {
  const { token } = await actor();
  await request(app)
    .post('/api/v1/wallet/recharge')
    .set('Authorization', `Bearer ${token}`)
    .send({ amount: 3000, provider: 'mtn_momo', phone: '+237690000010' });

  const w = await request(app).get('/api/v1/wallet').set('Authorization', `Bearer ${token}`);
  expect(w.body.pending).toBe(3000);

  const txs = await request(app).get('/api/v1/users/me/transactions').set('Authorization', `Bearer ${token}`);
  expect(txs.status).toBe(200);
  expect(txs.body.data).toHaveLength(1);
  expect(txs.body.data[0]).toMatchObject({ amount: 3000, status: 'pending', type: 'deposit' });
});

t('webhook signé success → crédite le wallet, transaction success, pending 0', async () => {
  const { token } = await actor();
  const rc = await request(app)
    .post('/api/v1/wallet/recharge')
    .set('Authorization', `Bearer ${token}`)
    .send({ amount: 2000, provider: 'mtn_momo', phone: '+237690000010' });
  const reference = rc.body.reference;

  const wh = await postWebhook('mtn_momo', { reference, status: 'success', amount: 2000, provider: 'mtn_momo' });
  expect(wh.status).toBe(200);
  expect(wh.body).toMatchObject({ received: true, credited: true });

  const w = await request(app).get('/api/v1/wallet').set('Authorization', `Bearer ${token}`);
  expect(w.body.balance).toBe(2000);
  expect(w.body.pending).toBe(0);
});

t('webhook signature invalide → 401, aucun crédit', async () => {
  const { token } = await actor();
  const rc = await request(app)
    .post('/api/v1/wallet/recharge')
    .set('Authorization', `Bearer ${token}`)
    .send({ amount: 2000, provider: 'mtn_momo', phone: '+237690000010' });

  const wh = await postWebhook(
    'mtn_momo',
    { reference: rc.body.reference, status: 'success', amount: 2000 },
    { signature: 'deadbeef' }
  );
  expect(wh.status).toBe(401);
  expect(wh.body.error.code).toBe('TOKEN_INVALID');

  const w = await request(app).get('/api/v1/wallet').set('Authorization', `Bearer ${token}`);
  expect(w.body.balance).toBe(0); // pas crédité
});

t('webhook rejoué (idempotence par reference) → pas de double crédit', async () => {
  const { token } = await actor();
  const rc = await request(app)
    .post('/api/v1/wallet/recharge')
    .set('Authorization', `Bearer ${token}`)
    .send({ amount: 2000, provider: 'mtn_momo', phone: '+237690000010' });
  const body = { reference: rc.body.reference, status: 'success', amount: 2000 };

  await postWebhook('mtn_momo', body); // 1er → crédite
  const replay = await postWebhook('mtn_momo', body); // 2e → idempotent
  expect(replay.body).toMatchObject({ received: true, idempotent: true });

  const w = await request(app).get('/api/v1/wallet').set('Authorization', `Bearer ${token}`);
  expect(w.body.balance).toBe(2000); // crédité une seule fois
});

t('webhook montant incohérent → marqué failed, pas de crédit', async () => {
  const { token } = await actor();
  const rc = await request(app)
    .post('/api/v1/wallet/recharge')
    .set('Authorization', `Bearer ${token}`)
    .send({ amount: 2000, provider: 'mtn_momo', phone: '+237690000010' });

  const wh = await postWebhook('mtn_momo', { reference: rc.body.reference, status: 'success', amount: 9999 });
  expect(wh.body).toMatchObject({ received: true, amount_mismatch: true });

  const w = await request(app).get('/api/v1/wallet').set('Authorization', `Bearer ${token}`);
  expect(w.body.balance).toBe(0);
});

t('webhook provider inconnu → 404', async () => {
  const wh = await postWebhook('paypal', { reference: 'x', status: 'success', amount: 1 });
  expect(wh.status).toBe(404);
});
