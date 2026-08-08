'use strict';

const H = require('./helpers/integration');
const request = require('supertest');
const app = require('../src/app');
const ERROR_CODES = require('../src/utils/errorCodes');
const { messageFor, SUPPORTED_LANGS } = require('../src/utils/errorCodes');
const ApiError = require('../src/utils/ApiError');
const { langOf } = require('../src/utils/lang');

/**
 * Internationalisation des erreurs serveur.
 *
 * Le garde-fou qui compte est le premier : il refuse un code ajouté sans sa
 * traduction. Sans lui, l'oubli ne se découvre qu'en production, sur l'écran
 * d'un joueur anglophone — c'est exactement ainsi que le catalogue est resté
 * monolingue pendant toute la vie du projet.
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

// ── Complétude du catalogue (pur) ──────────────────────────────────────────

// Le module exporte aussi `messageFor`, `SUPPORTED_LANGS` (un TABLEAU, donc
// `typeof 'object'`) et `DEFAULT_LANG` : on ne garde que les codes, reconnus à
// leur convention de nommage.
const CODES = Object.keys(ERROR_CODES).filter((k) => /^[A-Z][A-Z0-9_]*$/.test(k) && k !== 'SUPPORTED_LANGS' && k !== 'DEFAULT_LANG');

test('chaque code porte un statut HTTP et TOUTES les langues', () => {
  const incomplets = CODES.filter(
    (code) =>
      typeof ERROR_CODES[code].http !== 'number' ||
      SUPPORTED_LANGS.some((l) => typeof ERROR_CODES[code][l] !== 'string' || !ERROR_CODES[code][l].trim())
  );
  expect(incomplets).toEqual([]);
  // Filet : si le catalogue rétrécit brutalement, on veut le savoir.
  expect(CODES.length).toBeGreaterThan(50);
});

test('aucune traduction anglaise laissée identique au français', () => {
  // Certaines coïncidences sont légitimes (un mot commun) : on ne signale que
  // les chaînes accentuées, marqueur d'un français recopié tel quel.
  const suspects = CODES.filter(
    (code) => ERROR_CODES[code].en === ERROR_CODES[code].fr && /[éèêàçùûôî]/i.test(ERROR_CODES[code].fr)
  );
  expect(suspects).toEqual([]);
});

test('messageFor retombe sur le français, puis sur le code', () => {
  expect(messageFor('USER_NOT_FOUND', 'en')).toBe('User not found.');
  expect(messageFor('USER_NOT_FOUND', 'fr')).toBe('Utilisateur introuvable.');
  // Langue non servie → repli français, jamais `undefined`.
  expect(messageFor('USER_NOT_FOUND', 'de')).toBe('Utilisateur introuvable.');
  // Code inconnu → le code lui-même, exploitable dans un journal.
  expect(messageFor('NAWAK', 'en')).toBe('NAWAK');
});

// ── Négociation de langue (pur) ────────────────────────────────────────────

const fakeReq = (header, user) => ({ get: () => header, user });

test('langOf : en-tête, sinon français', () => {
  expect(langOf(fakeReq('en'))).toBe('en');
  expect(langOf(fakeReq('fr'))).toBe('fr');
  // Sous-tags régionaux et listes pondérées : seul le préfixe compte.
  expect(langOf(fakeReq('en-GB'))).toBe('en');
  expect(langOf(fakeReq('en-US,en;q=0.9,fr;q=0.8'))).toBe('en');
  // Première langue SERVIE de la liste, pas la première tout court.
  expect(langOf(fakeReq('de-DE,de;q=0.9,en;q=0.7'))).toBe('en');
  // Pas de repli sur le profil : le JWT ne porte pas la langue (cf. utils/lang.js).
  expect(langOf(fakeReq(null, { lang: 'en' }))).toBe('fr');
  // Rien d'exploitable → français.
  expect(langOf(fakeReq('de'))).toBe('fr');
  expect(langOf(fakeReq(null))).toBe('fr');
});

// ── ApiError ───────────────────────────────────────────────────────────────

test('ApiError : le message n’est plus figé à la construction', () => {
  const e = new ApiError('USER_NOT_FOUND');
  expect(e.localize('fr')).toBe('Utilisateur introuvable.');
  expect(e.localize('en')).toBe('User not found.');
  // `.message` (Error) reste français : journaux et Sentry, langue de l'équipe.
  expect(e.message).toBe('Utilisateur introuvable.');
});

test('ApiError : surcharge bilingue et surcharge monolingue', () => {
  const bi = new ApiError('VALIDATION_ERROR', { message: { fr: 'Trop court.', en: 'Too short.' } });
  expect(bi.localize('fr')).toBe('Trop court.');
  expect(bi.localize('en')).toBe('Too short.');

  // Forme chaîne = choix explicite de ne pas traduire (webhooks, diagnostic).
  const mono = new ApiError('VALIDATION_ERROR', { message: 'Signature invalide.' });
  expect(mono.localize('en')).toBe('Signature invalide.');
});

// ── Bout en bout ───────────────────────────────────────────────────────────

t('un identifiant refusé répond dans la langue demandée', async () => {
  const post = (lang) =>
    request(app)
      .post('/api/v1/auth/login')
      .set('Accept-Language', lang)
      .send({ email: 'inconnu@example.cm', password: 'MotDePasse1' });

  const fr = await post('fr');
  expect(fr.status).toBe(401);
  expect(fr.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
  expect(fr.body.error.message).toBe('Email ou mot de passe incorrect.');

  const en = await post('en');
  expect(en.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
  expect(en.body.error.message).toBe('Incorrect email or password.');
});

t('sans en-tête, la réponse reste française', async () => {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'inconnu@example.cm', password: 'MotDePasse1' });
  expect(res.body.error.message).toBe('Email ou mot de passe incorrect.');
});

t('une surcharge contextuelle est traduite elle aussi', async () => {
  // « Ce défi est destiné à un autre joueur. » — message levé dans le service,
  // pas tiré du catalogue : c'est la moitié la plus facile à oublier.
  const a = await H.createUser();
  const b = await H.createUser();
  const c = await H.createUser();
  const { rows } = await H.db.query(
    `INSERT INTO challenges (challenger_id, opponent_id, theme, level, status)
     VALUES ($1,$2,'culture','beginner','pending') RETURNING id`,
    [a.id, b.id]
  );

  const res = await request(app)
    .post(`/api/v1/challenges/${rows[0].id}/accept`)
    .set('Accept-Language', 'en')
    .set('Authorization', `Bearer ${H.tokenFor(c)}`);

  expect(res.status).toBe(403);
  expect(res.body.error.message).toBe('This duel is meant for another player.');
});

t('404 de route : le gabarit est traduit, la valeur interpolée conservée', async () => {
  const res = await request(app).get('/api/v1/nawak').set('Accept-Language', 'en');
  expect(res.status).toBe(404);
  expect(res.body.error.message).toBe('Route not found: GET /api/v1/nawak');
});

t('une route authentifiée est traduite comme les autres', async () => {
  const user = await H.createUser({ role: 'player' });

  const res = await request(app)
    .get('/api/v1/admin/jobs')
    .set('Accept-Language', 'en')
    .set('Authorization', `Bearer ${H.tokenFor(user)}`);

  expect(res.status).toBe(403);
  expect(res.body.error.message).toBe('Insufficient role.');
});
