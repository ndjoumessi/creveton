'use strict';

const H = require('./helpers/integration');
const request = require('supertest');
const app = require('../src/app');

/**
 * Filtre « ville » de la console admin.
 *
 * La ville est du TEXTE LIBRE : saisie hors liste à l'inscription, éditable au
 * profil. Deux conséquences qui se testent ici — la comparaison doit ignorer la
 * casse, et la liste déroulante doit venir de la base plutôt que de la page de
 * résultats affichée.
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

const withCity = (ville) => H.createUser({ ville });

// L'admin qui interroge ne doit PAS peser dans les résultats : `H.createUser`
// pose `ville: 'Douala'` par défaut, ce qui gonflait chaque décompte de un et
// faisait échouer les assertions — sur mes fixtures, pas sur le code.
const makeAdmin = () => H.createUser({ role: 'admin', ville: null });

t('le filtre ignore la casse', async () => {
  const admin = await makeAdmin();
  await withCity('Douala');
  await withCity('douala');
  await withCity('Yaoundé');

  const res = await request(app)
    .get('/api/v1/admin/users?ville=DOUALA')
    .set('Authorization', `Bearer ${H.tokenFor(admin)}`);

  expect(res.status).toBe(200);
  // Les deux graphies remontent — avant, « douala » restait invisible.
  expect(res.body.data).toHaveLength(2);
});

t('les villes distinctes viennent de la BASE, pas de la page affichée', async () => {
  const admin = await makeAdmin();
  // Plus d'une page (limite par défaut 20) pour prouver que la liste ne dépend
  // pas de ce qui est affiché.
  for (let i = 0; i < 22; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await withCity('Douala');
  }
  await withCity('Kribi'); // 23e : hors de la première page

  const res = await request(app)
    .get('/api/v1/admin/users/cities')
    .set('Authorization', `Bearer ${H.tokenFor(admin)}`);

  expect(res.status).toBe(200);
  const villes = res.body.data.map((r) => r.ville);
  expect(villes).toContain('Douala');
  expect(villes).toContain('Kribi');
  // Tri par effectif décroissant : la ville la plus peuplée en tête.
  expect(res.body.data[0].ville).toBe('Douala');
  expect(res.body.data[0].count).toBe(22);
});

t('les graphies d’une même ville sont regroupées, la plus fréquente l’emporte', async () => {
  const admin = await makeAdmin();
  await withCity('Douala');
  await withCity('Douala');
  await withCity('douala');

  const res = await request(app)
    .get('/api/v1/admin/users/cities')
    .set('Authorization', `Bearer ${H.tokenFor(admin)}`);

  const douala = res.body.data.filter((r) => r.ville.toLowerCase() === 'douala');
  expect(douala).toHaveLength(1); // une seule entrée, pas deux
  expect(douala[0].ville).toBe('Douala'); // la graphie majoritaire
  expect(douala[0].count).toBe(3); // tout le monde compté
});

t('les villes vides et les comptes supprimés sont exclus', async () => {
  const admin = await makeAdmin();
  await withCity('   '); // saisie blanche
  await withCity(null);
  const supprime = await withCity('Limbe');
  await H.db.query('UPDATE users SET deleted_at = now() WHERE id = $1', [supprime.id]);

  const res = await request(app)
    .get('/api/v1/admin/users/cities')
    .set('Authorization', `Bearer ${H.tokenFor(admin)}`);

  expect(res.body.data.map((r) => r.ville)).not.toContain('Limbe');
  expect(res.body.data.every((r) => r.ville.trim() !== '')).toBe(true);
});

t('« cities » n’est pas confondu avec un identifiant d’utilisateur', async () => {
  const admin = await makeAdmin();
  const res = await request(app)
    .get('/api/v1/admin/users/cities')
    .set('Authorization', `Bearer ${H.tokenFor(admin)}`);
  // Si la route était déclarée APRÈS `/:id`, Express passerait « cities » comme
  // id et la réponse serait un 404/500, pas une liste.
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body.data)).toBe(true);
});

t('un modérateur peut lire les villes, un joueur non', async () => {
  const moderator = await H.createUser({ role: 'moderator', ville: null });
  const player = await H.createUser({ role: 'player', ville: null });

  await request(app)
    .get('/api/v1/admin/users/cities')
    .set('Authorization', `Bearer ${H.tokenFor(moderator)}`)
    .expect(200);

  await request(app)
    .get('/api/v1/admin/users/cities')
    .set('Authorization', `Bearer ${H.tokenFor(player)}`)
    .expect(403);
});

// ─── Accents ───────────────────────────────────────────────────────────────
//
// `lower()` seul ne réglait que la casse. Le clavier d'un téléphone n'invite
// pas à composer les accents : « Yaounde » et « Yaoundé » arrivaient tous deux
// en base et la console les affichait comme deux villes, chacune avec son
// effectif partiel.

t('le filtre ignore les accents', async () => {
  const admin = await makeAdmin();
  await withCity('Yaoundé');
  await withCity('Yaounde');
  await withCity('YAOUNDE');
  await withCity('Douala');

  const res = await request(app)
    .get('/api/v1/admin/users?ville=yaounde')
    .set('Authorization', `Bearer ${H.tokenFor(admin)}`);

  expect(res.status).toBe(200);
  expect(res.body.data).toHaveLength(3);

  // Et dans l'autre sens : filtrer AVEC l'accent retrouve les saisies sans.
  const accentue = await request(app)
    .get('/api/v1/admin/users?ville=Yaound%C3%A9')
    .set('Authorization', `Bearer ${H.tokenFor(admin)}`);
  expect(accentue.body.data).toHaveLength(3);
});

t('les variantes accentuées ne font qu’une entrée, graphie majoritaire en tête', async () => {
  const admin = await makeAdmin();
  await withCity('Yaoundé');
  await withCity('Yaoundé');
  await withCity('Yaounde');

  const res = await request(app)
    .get('/api/v1/admin/users/cities')
    .set('Authorization', `Bearer ${H.tokenFor(admin)}`);

  const yde = res.body.data.filter((r) => /yaound/i.test(r.ville));
  expect(yde).toHaveLength(1);
  expect(yde[0].ville).toBe('Yaoundé'); // la plus fréquente
  expect(yde[0].count).toBe(3);
});

t('une FAUTE de frappe reste une entrée distincte', async () => {
  // Repli d'accent ≠ rapprochement approximatif. « Doula » n'est pas une
  // variante orthographique de « Douala », c'est une erreur — la fusionner
  // silencieusement finirait par confondre deux villes réellement distinctes.
  const admin = await makeAdmin();
  await withCity('Douala');
  await withCity('Doula');

  const res = await request(app)
    .get('/api/v1/admin/users/cities')
    .set('Authorization', `Bearer ${H.tokenFor(admin)}`);

  const villes = res.body.data.map((r) => r.ville);
  expect(villes).toContain('Douala');
  expect(villes).toContain('Doula');
});
