'use strict';

process.env.NODE_ENV = 'test';

jest.mock('../src/models/question.model', () => ({
  pickRandom: jest.fn(),
  recentQuestionIds: jest.fn().mockResolvedValue([]),
  serverNow: jest.fn(),
  changedSince: jest.fn(),
  deletedSince: jest.fn(),
  listAllApproved: jest.fn(),
  existsByNormalizedText: jest.fn(),
  // projection réaliste (mais simplifiée) pour les assertions
  toPlayerView: (row) => ({ id: row.id, text: row.text_fr, version: row.version }),
}));

const questionService = require('../src/services/questionService');
const questionModel = require('../src/models/question.model');

const ROW = (id) => ({ id, text_fr: `Q${id}`, version: 1 });

describe('questionService.hashText / normalizeText', () => {
  test('normalise casse + espaces, hash stable', () => {
    expect(questionService.normalizeText('  Le   Cameroun  ')).toBe('le cameroun');
    const a = questionService.hashText('Le Cameroun');
    const b = questionService.hashText('le   cameroun');
    expect(a).toBe(b); // insensible casse/espaces
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('questionService.getQuestionSet', () => {
  test('challenge (seed fourni) : pas d’anti-répétition, seed conservé', async () => {
    questionModel.pickRandom.mockResolvedValue([ROW('a'), ROW('b')]);
    const res = await questionService.getQuestionSet({
      userId: 'u1', theme: 'sport', level: 'beginner', count: 2, seed: 'abc123',
    });
    expect(res.seed).toBe('abc123');
    expect(res.data.map((q) => q.id)).toEqual(['a', 'b']);
    // pas d'appel à recentQuestionIds en mode challenge
    expect(questionModel.recentQuestionIds).not.toHaveBeenCalled();
    expect(questionModel.pickRandom).toHaveBeenCalledWith(
      expect.objectContaining({ seed: 'abc123', excludeIds: [] })
    );
  });

  test('solo : génère un seed et exclut les questions récentes', async () => {
    questionModel.recentQuestionIds.mockResolvedValue(['x', 'y']);
    questionModel.pickRandom.mockResolvedValue([ROW('a'), ROW('b'), ROW('c')]);
    const res = await questionService.getQuestionSet({
      userId: 'u1', count: 3,
    });
    expect(res.seed).toMatch(/^[a-f0-9]{6}$/); // seed généré
    expect(questionModel.recentQuestionIds).toHaveBeenCalledWith('u1', 3);
    expect(questionModel.pickRandom.mock.calls[0][0].excludeIds).toEqual(['x', 'y']);
  });

  test('pool vide → NO_QUESTIONS_AVAILABLE', async () => {
    questionModel.recentQuestionIds.mockResolvedValue([]);
    questionModel.pickRandom.mockResolvedValue([]);
    await expect(questionService.getQuestionSet({ userId: 'u1', count: 5 })).rejects.toMatchObject({
      code: 'NO_QUESTIONS_AVAILABLE',
      httpStatus: 404,
    });
  });

  test('jamais de correct_index/explanation dans la sortie', async () => {
    questionModel.pickRandom.mockResolvedValue([ROW('a')]);
    const res = await questionService.getQuestionSet({ userId: 'u1', count: 1, seed: 's' });
    const q = res.data[0];
    expect(q).not.toHaveProperty('correct_index');
    expect(q).not.toHaveProperty('explanation');
  });
});

describe('questionService.getDelta', () => {
  test('since invalide → INVALID_TIMESTAMP', async () => {
    await expect(questionService.getDelta('pas-une-date')).rejects.toMatchObject({
      code: 'INVALID_TIMESTAMP',
    });
  });

  test('assemble new/updated/deleted_ids/synced_at', async () => {
    const syncedAt = new Date('2026-06-21T10:00:00Z');
    questionModel.serverNow.mockResolvedValue(syncedAt);
    questionModel.changedSince.mockResolvedValue([
      { id: 'new1', text_fr: 'N', version: 1, created_at: '2026-06-01T00:00:00Z' }, // > since → new
      { id: 'upd1', text_fr: 'U', version: 4, created_at: '2026-01-01T00:00:00Z' }, // <= since → updated
    ]);
    questionModel.deletedSince.mockResolvedValue(['del1', 'del2']);

    const res = await questionService.getDelta('2026-05-20T10:00:00Z');
    expect(res.new.map((q) => q.id)).toEqual(['new1']);
    expect(res.updated.map((q) => q.id)).toEqual(['upd1']);
    expect(res.deleted_ids).toEqual(['del1', 'del2']);
    expect(res.synced_at).toBe('2026-06-21T10:00:00.000Z');
  });
});

describe('questionService.getAll', () => {
  test('renvoie data + page + synced_at (snapshot paginé)', async () => {
    questionModel.serverNow.mockResolvedValue(new Date('2026-06-21T10:00:00Z'));
    questionModel.listAllApproved.mockResolvedValue({
      rows: [ROW('a'), ROW('b')],
      hasMore: true,
      nextCursor: 'b',
    });
    const res = await questionService.getAll({ limit: 2, cursor: null });
    expect(res.data.map((q) => q.id)).toEqual(['a', 'b']);
    expect(res.page).toEqual({ limit: 2, next_cursor: 'b', has_more: true });
    expect(res.synced_at).toBe('2026-06-21T10:00:00.000Z');
  });
});
