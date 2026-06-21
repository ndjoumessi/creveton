'use strict';

process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../src/app');

describe('App — câblage des routes & middlewares', () => {
  test('GET / (préfixe v1) renvoie les infos d’API', async () => {
    const res = await request(app).get('/api/v1');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Creveton API', version: 'v1' });
  });

  test('route inconnue → 404 NOT_FOUND normalisé', async () => {
    const res = await request(app).get('/api/v1/inexistant');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.request_id).toBeDefined();
  });

  test('route protégée sans token → 401 TOKEN_MISSING', async () => {
    const res = await request(app).get('/api/v1/users/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_MISSING');
  });

  test('validation : register avec corps vide → 400 VALIDATION_ERROR', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(res.body.error.details)).toBe(true);
  });

  test('corps JSON malformé → 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('validation : register avec email invalide → 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Awa Mballa',
        email: 'pas-un-email',
        phone: '+237690000000',
        password: 'MotDePasse1',
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('validation : verify-otp avec code non numérique → 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ phone: '+237690000000', code: 'abcdef' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
