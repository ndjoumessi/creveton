'use strict';

process.env.NODE_ENV = 'test';

const hmac = require('../src/utils/hmac');

describe('utils/hmac', () => {
  const secret = 'whsec-test';
  const payload = JSON.stringify({ reference: 'CRV-TX-1', status: 'success', amount: 2000 });

  test('verify accepte une signature correcte', () => {
    const sig = hmac.sign(payload, secret);
    expect(hmac.verify(payload, sig, secret)).toBe(true);
  });

  test('verify rejette une mauvaise signature / un mauvais secret', () => {
    const sig = hmac.sign(payload, secret);
    expect(hmac.verify(payload, sig, 'autre-secret')).toBe(false);
    expect(hmac.verify(payload, 'deadbeef', secret)).toBe(false);
    expect(hmac.verify(`${payload} `, sig, secret)).toBe(false); // payload altéré
  });

  test('verify rejette signature/secret manquants', () => {
    expect(hmac.verify(payload, '', secret)).toBe(false);
    expect(hmac.verify(payload, hmac.sign(payload, secret), '')).toBe(false);
  });
});
