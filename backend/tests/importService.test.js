'use strict';

process.env.NODE_ENV = 'test';

// Modèle mocké : pas de Postgres en test.
jest.mock('../src/models/question.model', () => ({
  existsByNormalizedText: jest.fn().mockResolvedValue(false),
  create: jest.fn().mockResolvedValue({ id: 'new-id', status: 'review' }),
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
    expect(r.question.status).toBe('review'); // jamais publié directement
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
    questionModel.existsByNormalizedText.mockResolvedValue(false);
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
    expect(report.rejected_rows[0].line).toBe(3);
    expect(questionModel.create).toHaveBeenCalledTimes(1);
    expect(questionModel.create.mock.calls[0][0].created_by).toBe('admin-1');
  });

  test('doublon intra-lot (même texte) → 1 accepté, 1 rejeté', async () => {
    const row = 'Même question ?,Douala,Yaoundé,Bafoussam,Garoua,B,beginner,geographie,exp,fr';
    const report = await importService.importCsv(csv(row, row), { persist: false });
    expect(report.accepted).toBe(1);
    expect(report.rejected).toBe(1);
    expect(report.rejected_rows[0].errors.join()).toMatch(/doublon dans le fichier/);
  });

  test('doublon déjà présent en base → rejet', async () => {
    questionModel.existsByNormalizedText.mockResolvedValue(true);
    const report = await importService.importCsv(
      csv('Déjà en base ?,Douala,Yaoundé,Bafoussam,Garoua,B,beginner,geographie,exp,fr'),
      { persist: false }
    );
    expect(report.accepted).toBe(0);
    expect(report.rejected).toBe(1);
    expect(report.rejected_rows[0].errors.join()).toMatch(/déjà présente/);
  });
});
