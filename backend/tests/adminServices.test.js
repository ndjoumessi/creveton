'use strict';

process.env.NODE_ENV = 'test';

// --- mocks ---
jest.mock('../src/models/question.model', () => ({
  existsByNormalizedText: jest.fn().mockResolvedValue(false),
  create: jest.fn(),
  findByIdAny: jest.fn(),
  setStatus: jest.fn(),
  update: jest.fn(),
  toAdminView: (row) => row, // identité pour les assertions
}));
// env non mocké : tournaments.paid.enabled est false par défaut (.env).
jest.mock('../src/models/tournament.model', () => ({
  create: jest.fn(),
  findById: jest.fn(),
  countParticipants: jest.fn(),
  setStatus: jest.fn(),
  rankedParticipants: jest.fn(),
  setResult: jest.fn(),
  getClient: jest.fn(),
  toView: (row, n) => ({ id: row.id, status: row.status, registered_players: n }),
}));

const questionService = require('../src/services/questionService');
const questionModel = require('../src/models/question.model');
const tournamentService = require('../src/services/tournamentService');
const tournamentModel = require('../src/models/tournament.model');
const analyticsService = require('../src/services/analyticsService');

const opts = (correctFlags) => correctFlags.map((c, i) => ({ text: `opt${i}`, is_correct: c }));

describe('questionService.createByAdmin', () => {
  beforeEach(() => {
    questionModel.existsByNormalizedText.mockResolvedValue(false);
    questionModel.create.mockResolvedValue({ id: 'q1', status: 'draft', version: 1, correct_index: 1 });
  });

  test('exactly one correct → crée en statut draft, correct_index calculé', async () => {
    const q = await questionService.createByAdmin(
      { text_fr: 'Q ?', options: opts([false, true, false]), theme: 'sport', level: 'beginner' },
      'admin-1'
    );
    expect(questionModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'draft', correct_index: 1, created_by: 'admin-1' })
    );
    expect(q.status).toBe('draft');
  });

  test('zéro ou deux bonnes réponses → INVALID_CORRECT_OPTION_COUNT', async () => {
    await expect(
      questionService.createByAdmin({ text_fr: 'Q', options: opts([false, false]), theme: 'sport', level: 'beginner' }, 'a')
    ).rejects.toMatchObject({ code: 'INVALID_CORRECT_OPTION_COUNT', httpStatus: 422 });
    await expect(
      questionService.createByAdmin({ text_fr: 'Q', options: opts([true, true]), theme: 'sport', level: 'beginner' }, 'a')
    ).rejects.toMatchObject({ code: 'INVALID_CORRECT_OPTION_COUNT' });
  });

  test('doublon → DUPLICATE_QUESTION', async () => {
    questionModel.existsByNormalizedText.mockResolvedValue(true);
    await expect(
      questionService.createByAdmin({ text_fr: 'Q', options: opts([true, false]), theme: 'sport', level: 'beginner' }, 'a')
    ).rejects.toMatchObject({ code: 'DUPLICATE_QUESTION', httpStatus: 409 });
  });
});

describe('questionService.transitionStatus (workflow §12)', () => {
  test('draft → review autorisé', async () => {
    questionModel.findByIdAny.mockResolvedValue({ id: 'q1', status: 'draft' });
    questionModel.setStatus.mockResolvedValue({ id: 'q1', status: 'review' });
    const q = await questionService.transitionStatus('q1', 'review');
    expect(q.status).toBe('review');
  });

  test('draft → approved interdit (saut d’étape)', async () => {
    questionModel.findByIdAny.mockResolvedValue({ id: 'q1', status: 'draft' });
    await expect(questionService.transitionStatus('q1', 'approved')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(questionModel.setStatus).not.toHaveBeenCalled();
  });

  test('review → approved autorisé ; approved → archived autorisé', async () => {
    questionModel.findByIdAny.mockResolvedValue({ id: 'q1', status: 'review' });
    questionModel.setStatus.mockResolvedValue({ id: 'q1', status: 'approved' });
    expect((await questionService.transitionStatus('q1', 'approved')).status).toBe('approved');

    questionModel.findByIdAny.mockResolvedValue({ id: 'q1', status: 'approved' });
    questionModel.setStatus.mockResolvedValue({ id: 'q1', status: 'archived' });
    expect((await questionService.transitionStatus('q1', 'archived')).status).toBe('archived');
  });
});

describe('tournamentService — feature flag payant', () => {
  test('création payante bloquée quand flag off → FEATURE_DISABLED', async () => {
    await expect(
      tournamentService.create({ name: 'T', type: 'mini', entry_fee: 500, max_players: 8, theme: 'sport' }, 'admin')
    ).rejects.toMatchObject({ code: 'FEATURE_DISABLED', httpStatus: 403 });
    expect(tournamentModel.create).not.toHaveBeenCalled();
  });

  test('création gratuite autorisée', async () => {
    tournamentModel.create.mockResolvedValue({ id: 't1', status: 'scheduled' });
    const t = await tournamentService.create(
      { name: 'T', type: 'free', entry_fee: 0, max_players: 8, theme: 'sport' },
      'admin'
    );
    expect(t.id).toBe('t1');
  });

  test('start exige le minimum de joueurs', async () => {
    tournamentModel.findById.mockResolvedValue({ id: 't1', status: 'scheduled' });
    tournamentModel.countParticipants.mockResolvedValue(1);
    await expect(tournamentService.start('t1')).rejects.toMatchObject({ code: 'TOURNAMENT_NOT_OPEN' });
  });
});

describe('tournamentService.payout — répartition top 3', () => {
  test('répartit prize_pool 50/30/20 et passe en paid', async () => {
    tournamentModel.findById.mockResolvedValue({ id: 't1', status: 'running', prize_pool: 1000 });
    const fakeClient = {
      query: jest.fn((sql) => {
        if (/UPDATE tournaments/.test(sql)) return { rows: [{ id: 't1', status: 'paid' }] };
        return { rows: [] };
      }),
      release: jest.fn(),
    };
    tournamentModel.getClient.mockResolvedValue(fakeClient);
    tournamentModel.rankedParticipants.mockResolvedValue([
      { id: 'p1', user_id: 'u1', score: 90 },
      { id: 'p2', user_id: 'u2', score: 80 },
      { id: 'p3', user_id: 'u3', score: 70 },
      { id: 'p4', user_id: 'u4', score: 10 },
    ]);
    tournamentModel.setResult.mockResolvedValue();

    const res = await tournamentService.payout('t1');
    expect(res.results.map((r) => r.payout)).toEqual([500, 300, 200, 0]);
    expect(res.results.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
    expect(res.tournament.status).toBe('paid');
  });
});

describe('analyticsService.periodToDays', () => {
  test('parse jours/heures, défaut 30', () => {
    expect(analyticsService.periodToDays('30d')).toBe(30);
    expect(analyticsService.periodToDays('7d')).toBe(7);
    expect(analyticsService.periodToDays('48h')).toBe(2);
    expect(analyticsService.periodToDays('bidon')).toBe(30);
    expect(analyticsService.periodToDays(undefined)).toBe(30);
  });
});
