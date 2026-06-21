'use strict';

/**
 * Détection de doublons multi-niveaux à l'import — tests d'INTÉGRATION.
 * Valide le pipeline complet contre un vrai Postgres + pg_trgm (migration 009) :
 *   - niveau 1 (hash exact), niveau 2 (similarité trigramme), rapport enrichi.
 * S'auto-désactive proprement si l'infra est absente (cf. helpers/integration).
 */

const {
  db,
  ensureReady,
  resetState,
  teardown,
  createApprovedQuestion,
} = require('./helpers/integration');

const importService = require('../src/services/importService');

const HEADER =
  'question,option_a,option_b,option_c,option_d,correct,difficulty,category,explanation,language';
const row = (q) => `${q},Douala,Yaoundé,Bafoussam,Garoua,B,beginner,geographie,exp,fr`;
const csv = (...lines) => Buffer.from([HEADER, ...lines].join('\n'));

// Options IDENTIQUES à celles produites par `row()` ci-dessus (Douala/Yaoundé/
// Bafoussam/Garoua, bonne réponse = Yaoundé). Nécessaire pour qu'un même texte
// soit un « doublon exact » (niveau 1) et non un « options modifiées » (niveau 3).
const STD_OPTS = [
  { text: 'Douala', is_correct: false },
  { text: 'Yaoundé', is_correct: true },
  { text: 'Bafoussam', is_correct: false },
  { text: 'Garoua', is_correct: false },
];
const seedSame = (text_fr) => createApprovedQuestion({ text_fr, options: STD_OPTS, correct_index: 1 });

let ready = false;
beforeAll(async () => {
  ready = await ensureReady();
});
afterAll(async () => {
  if (ready) await teardown();
});
beforeEach(async () => {
  if (ready) await resetState();
});

// `ready` n'est connu qu'après beforeAll : on garde la décision de skip DANS le
// corps du test (sinon elle serait figée à la collecte, avant beforeAll).
const t = (name, fn) =>
  test(name, async () => {
    if (!ready) { console.warn(`[skip] ${name}`); return; }
    await fn();
  });

describe('import — détection de doublons multi-niveaux (pg_trgm réel)', () => {
  t('niveau 1 — doublon exact (texte identique) → rejeté', async () => {
    await seedSame('Quelle est la capitale du Cameroun ?');
    const report = await importService.importCsv(
      csv(row('Quelle est la capitale du Cameroun ?')),
      { persist: false }
    );
    expect(report.accepted).toBe(0);
    expect(report.rejected).toBe(1);
    expect(report.errors[0].issue).toBe('doublon exact');
    expect(report.errors[0].existing_id).toBeTruthy();
  });

  t('niveau 1 robuste — casse/espaces différents → toujours doublon exact', async () => {
    await seedSame('Quelle est la capitale du Cameroun ?');
    const report = await importService.importCsv(
      csv(row('  QUELLE   est la  Capitale du CAMEROUN ?  ')),
      { persist: false }
    );
    expect(report.rejected).toBe(1);
    expect(report.errors[0].issue).toBe('doublon exact');
  });

  t('niveau 2 — quasi-doublon (>85%) → rejeté avec similar_to', async () => {
    const existing = await createApprovedQuestion({
      text_fr: 'Quelle est la capitale politique du Cameroun ?',
    });
    // Une lettre de différence (ponctuation collée) : pas un doublon exact, mais
    // similarité trigramme très élevée → rejet automatique « quasi-doublon ».
    const report = await importService.importCsv(
      csv(row('Quelle est la capitale politique du Cameroun?')),
      { persist: false }
    );
    expect(report.rejected).toBe(1);
    expect(report.errors[0].issue).toMatch(/similaire à \d+%/);
    expect(report.errors[0].similar_to).toBe(existing.id);
    expect(report.errors[0].similarity).toBeGreaterThan(0.85);
  });

  t('question réellement nouvelle → acceptée et insérée (hash stocké)', async () => {
    await seedSame('Quelle est la capitale du Cameroun ?');
    const report = await importService.importCsv(
      csv(row('Quel fleuve traverse la ville de Garoua ?')),
      { persist: true }
    );
    expect(report.accepted).toBe(1);
    expect(report.rejected).toBe(0);
    expect(report.warnings).toBe(0);
    expect(report.inserted).toBe(1);
    // Le hash a bien été calculé en base à l'insertion (niveau 1 désormais opérant).
    const { rows } = await db.query(
      `SELECT text_hash FROM questions WHERE text_fr = 'Quel fleuve traverse la ville de Garoua ?'`
    );
    expect(rows[0].text_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  t('import mixte (nouvelles + doublons) → rapport cohérent', async () => {
    await seedSame('Capitale économique du Cameroun ?');
    const report = await importService.importCsv(
      csv(
        row('Capitale économique du Cameroun ?'), // doublon exact → rejet
        row('Combien de régions compte le Cameroun ?'), // nouvelle → acceptée
        row('Quelle est la monnaie du Cameroun ?') // nouvelle → acceptée
      ),
      { persist: true }
    );
    expect(report.total).toBe(3);
    expect(report.accepted).toBe(2);
    expect(report.rejected).toBe(1);
    expect(report.accepted + report.rejected + report.warnings).toBe(report.total);
  });
});
