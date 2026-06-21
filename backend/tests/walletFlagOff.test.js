'use strict';

// Flag payant NON défini → false par défaut : tout le bloc wallet doit renvoyer
// 403 FEATURE_DISABLED (spec §11). Aucun accès base requis (le middleware
// featureFlag rejette avant le contrôleur).
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../src/app');
const { signAccessToken } = require('../src/utils/jwt');

const token = signAccessToken({ id: '00000000-0000-0000-0000-000000000001', role: 'player', level: 1 }, 'sid');
const auth = (r) => r.set('Authorization', `Bearer ${token}`);

describe('Wallet — flag tournaments.paid.enabled = false', () => {
  test('GET /wallet → 403 FEATURE_DISABLED', async () => {
    const r = await auth(request(app).get('/api/v1/wallet'));
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('FEATURE_DISABLED');
  });

  test('POST /wallet/recharge → 403 FEATURE_DISABLED', async () => {
    const r = await auth(request(app).post('/api/v1/wallet/recharge')).send({
      amount: 2000,
      provider: 'orange_money',
      phone: '+237690000000',
    });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('FEATURE_DISABLED');
  });

  test('GET /users/me/transactions → 403 FEATURE_DISABLED', async () => {
    const r = await auth(request(app).get('/api/v1/users/me/transactions'));
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('FEATURE_DISABLED');
  });
});
