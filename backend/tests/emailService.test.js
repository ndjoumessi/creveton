'use strict';

// Test unitaire HERMÉTIQUE du rendu HTML des emails (anti HTML-injection).
// On mocke `resend` (capture du payload, aucun appel réseau) et `env` (isTest:false
// pour franchir le garde-fou hermétique, + config email factice). Aucun Postgres/Redis.

const mockSend = jest.fn(async () => ({ data: { id: 'email_x' }, error: null }));

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockSend } })),
}));

jest.mock('../src/config/env', () => ({
  isProd: false,
  isTest: false,
  email: {
    apiKey: 're_dummy_key',
    from: 'Creveton <noreply@creveton.cm>',
    adminUrl: 'https://admin.creveton.cm',
    appDeepLinkUrl: 'https://creveton.cm',
    referralLimitPerDay: 10,
  },
}));

const emailService = require('../src/services/emailService');

beforeEach(() => mockSend.mockClear());

const lastPayload = () => mockSend.mock.calls[mockSend.mock.calls.length - 1][0];

test('referral — le nom du parrain (contrôlé côté client) est échappé dans le HTML', async () => {
  const res = await emailService.sendPlayerReferral({
    to: 'friend@example.com',
    referrerName: '<img src=x onerror=alert(1)>',
    referralCode: 'CREV-AB12',
    lang: 'fr',
  });
  expect(res.sent).toBe(true);
  const { html, subject } = lastPayload();
  expect(html).not.toContain('<img src=x');           // pas de balise injectée
  expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  // Le sujet est du texte simple (pas du HTML) : la valeur brute y est acceptable.
  expect(subject).toContain('<img src=x onerror=alert(1)>');
});

test('referral — pas de double échappement (& reste &amp; une seule fois)', async () => {
  await emailService.sendPlayerReferral({
    to: 'friend@example.com',
    referrerName: 'Tom & Jerry',
    referralCode: 'CREV-CD34',
    lang: 'en',
  });
  const { html } = lastPayload();
  expect(html).toContain('Tom &amp; Jerry');
  expect(html).not.toContain('&amp;amp;');
});

test('team invite — inviter/invitee échappés ; preheader non doublement échappé', async () => {
  await emailService.sendTeamInvitation({
    to: 'mod@example.com',
    inviteeName: '<b>Bob</b>',
    inviterName: '<script>steal()</script>',
    role: 'admin',
    inviteUrl: 'https://admin.creveton.cm/accept-invite?token=abc-123',
    lang: 'en',
  });
  const { html } = lastPayload();
  expect(html).toContain('&lt;script&gt;steal()&lt;/script&gt;');
  expect(html).toContain('&lt;b&gt;Bob&lt;/b&gt;');
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('<b>Bob');
});

test('safeUrl — un schéma non http(s) dans le CTA est neutralisé en "#"', async () => {
  await emailService.sendTeamInvitation({
    to: 'mod@example.com',
    inviteeName: 'X',
    inviterName: 'Y',
    role: 'moderator',
    inviteUrl: 'javascript:alert(document.cookie)',
    lang: 'en',
  });
  const { html } = lastPayload();
  expect(html).not.toContain('javascript:alert');
  expect(html).toContain('href="#"');
});

test('safeUrl — une URL https légitime est préservée', async () => {
  await emailService.sendTeamInvitation({
    to: 'mod@example.com',
    inviteeName: 'X',
    inviterName: 'Y',
    role: 'admin',
    inviteUrl: 'https://admin.creveton.cm/accept-invite?token=abc-123',
    lang: 'fr',
  });
  const { html } = lastPayload();
  expect(html).toContain('href="https://admin.creveton.cm/accept-invite?token=abc-123"');
});
