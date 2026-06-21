'use strict';

process.env.NODE_ENV = 'test';

// Modèle mocké : pas de Postgres en test (les niveaux de détection sont validés
// contre un vrai pg_trgm dans tests/importDedup.test.js).
jest.mock('../src/models/question.model', () => ({
  findExactDuplicate: jest.fn().mockResolvedValue(null),
  findSimilar: jest.fn().mockResolvedValue([]),
  create: jest.fn().mockResolvedValue({ id: 'new-id', status: 'pending_review' }),
}));

const importService = require('../src/services/importService');
const questionModel = require('../src/models/question.model');

const HEADER =
  'question,option_a,option_b,option_c,option_d,correct,difficulty,category,explanation,language';
const csv = (...lines) => Buffer.from([HEADER, ...lines].join('\n'));

describe('importService.validateRow', () => {
  test('ligne valide → question normalisée + correct_index recalculé', () => {
    const r = importService.validateRow({
      question: 'Capitale du Cameroun ?',
      option_a: 'Douala',
      option_b: 'Yaoundé',
      option_c: 'Bafoussam',
      option_d: 'Garoua',
      correct: 'B',
      difficulty: 'beginner',
      category: 'geographie',
      explanation: 'Yaoundé est la capitale.',
      language: 'fr',
    });
    expect(r.ok).toBe(true);
    expect(r.question.correct_index).toBe(1);
    expect(r.question.options).toHaveLength(4);
    expect(r.question.options[1]).toEqual({ text: 'Yaoundé', is_correct: true });
    expect(r.question.source).toBe('import');
    expect(r.question.status).toBe('pending_review'); // jamais publié directement
  });

  test('lettre « correct » hors A–D → rejet', () => {
    const r = importService.validateRow({
      question: 'X ?', option_a: 'a', option_b: 'b', correct: 'Z',
      difficulty: 'beginner', category: 'sport',
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/correct/i);
  });

  test('thème inconnu → rejet', () => {
    const r = importService.validateRow({
      question: 'X ?', option_a: 'a', option_b: 'b', correct: 'A',
      difficulty: 'beginner', category: 'cuisine',
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/thème/i);
  });

  test('moins de 2 options → rejet', () => {
    const r = importService.validateRow({
      question: 'X ?', option_a: 'a', correct: 'A',
      difficulty: 'beginner', category: 'sport',
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/2 options/);
  });
});

describe('importService.importCsv', () => {
  beforeEach(() => {
    questionModel.findExactDuplicate.mockResolvedValue(null);
    questionModel.findSimilar.mockResolvedValue([]);
    questionModel.create.mockClear();
  });

  test('insère les lignes valides et rapporte les rejets avec n° de ligne', async () => {
    const buffer = csv(
      'Capitale du Cameroun ?,Douala,Yaoundé,Bafoussam,Garoua,B,beginner,geographie,exp,fr',
      'Question cassée,opt,,,,Z,beginner,sport,exp,fr' // correct invalide → rejet (ligne 3)
    );
    const report = await importService.importCsv(buffer, { createdBy: 'admin-1' });
    expect(report.total).toBe(2);
    expect(report.accepted).toBe(1);
    expect(report.inserted).toBe(1);
    expect(report.rejected).toBe(1);
    expect(report.warnings).toBe(0);
    expect(report.errors[0].row).toBe(3);
    expect(questionModel.create).toHaveBeenCalledTimes(1);
    expect(questionModel.create.mock.calls[0][0].created_by).toBe('admin-1');
  });

  test('doublon intra-lot (même texte) → 1 accepté, 1 rejeté', async () => {
    const row = 'Même question ?,Douala,Yaoundé,Bafoussam,Garoua,B,beginner,geographie,exp,fr';
    const report = await importService.importCsv(csv(row, row), { persist: false });
    expect(report.accepted).toBe(1);
    expect(report.rejected).toBe(1);
    expect(report.errors[0].issue).toMatch(/doublon dans le fichier/);
  });

  test('niveau 1 — doublon exact en base (options identiques) → rejet', async () => {
    questionModel.findExactDuplicate.mockResolvedValue({
      id: 'existing-uuid',
      text_fr: 'Déjà en base ?',
      options: [
        { text: 'Douala', is_correct: false },
        { text: 'Yaoundé', is_correct: true },
        { text: 'Bafoussam', is_correct: false },
        { text: 'Garoua', is_correct: false },
      ],
      correct_index: 1,
    });
    const report = await importService.importCsv(
      csv('Déjà en base ?,Douala,Yaoundé,Bafoussam,Garoua,B,beginner,geographie,exp,fr'),
      { persist: false }
    );
    expect(report.accepted).toBe(0);
    expect(report.rejected).toBe(1);
    expect(report.errors[0].issue).toBe('doublon exact');
    expect(report.errors[0].existing_id).toBe('existing-uuid');
  });

  test('niveau 3 — même texte, options modifiées → avertissement', async () => {
    questionModel.findExactDuplicate.mockResolvedValue({
      id: 'existing-uuid',
      text_fr: 'Déjà en base ?',
      options: [
        { text: 'Douala', is_correct: true }, // bonne réponse différente
        { text: 'Yaoundé', is_correct: false },
      ],
      correct_index: 0,
    });
    const report = await importService.importCsv(
      csv('Déjà en base ?,Douala,Yaoundé,Bafoussam,Garoua,B,beginner,geographie,exp,fr'),
      { persist: false }
    );
    expect(report.rejected).toBe(0);
    expect(report.warnings).toBe(1);
    expect(report.warnings_list[0].issue).toMatch(/options modifiées/);
    expect(report.warnings_list[0].similar_to).toBe('existing-uuid');
  });

  test('niveau 2 — similarité > 85% → rejet quasi-doublon', async () => {
    questionModel.findSimilar.mockResolvedValue([
      { id: 'sim-uuid', text_fr: 'Capitale du Cameroun ?', sim: 0.91 },
    ]);
    const report = await importService.importCsv(
      csv('La capitale du Cameroun ?,Douala,Yaoundé,Bafoussam,Garoua,B,beginner,geographie,exp,fr'),
      { persist: false }
    );
    expect(report.rejected).toBe(1);
    expect(report.errors[0].issue).toMatch(/similaire à 91%/);
    expect(report.errors[0].similarity).toBe(0.91);
  });

  test('niveau 2 — similarité 70–85% → avertissement (non inséré)', async () => {
    questionModel.findSimilar.mockResolvedValue([
      { id: 'sim-uuid', text_fr: 'Capitale du Cameroun ?', sim: 0.72 },
    ]);
    const report = await importService.importCsv(
      csv('Quelle ville est capitale du Cameroun ?,Douala,Yaoundé,Bafoussam,Garoua,B,beginner,geographie,exp,fr'),
      { persist: true }
    );
    expect(report.accepted).toBe(0);
    expect(report.warnings).toBe(1);
    expect(report.inserted).toBe(0);
    expect(report.warnings_list[0].similarity).toBe(0.72);
  });

  test('force=true → les avertissements (70–85%) sont insérés', async () => {
    questionModel.findSimilar.mockResolvedValue([
      { id: 'sim-uuid', text_fr: 'Capitale du Cameroun ?', sim: 0.72 },
    ]);
    const report = await importService.importCsv(
      csv('Quelle ville est capitale du Cameroun ?,Douala,Yaoundé,Bafoussam,Garoua,B,beginner,geographie,exp,fr'),
      { persist: true, force: true }
    );
    expect(report.warnings).toBe(1);
    expect(report.inserted).toBe(1);
    expect(questionModel.create).toHaveBeenCalledTimes(1);
  });
});
