'use strict';

process.env.NODE_ENV = 'test';

// --- Infra mockée : pas de Postgres / Redis en test ---
const fakeClient = {
  query: jest.fn(),
  release: jest.fn(),
};
jest.mock('../src/config/database', () => ({
  getClient: jest.fn(),
  query: jest.fn(),
  close: jest.fn(),
}));
jest.mock('../src/config/redis', () => ({
  redis: { set: jest.fn(), del: jest.fn().mockResolvedValue(1) },
}));
jest.mock('../src/models/question.model', () => ({ findSolutions: jest.fn() }));
jest.mock('../src/models/user.model', () => ({ creditSessionXp: jest.fn() }));
jest.mock('../src/services/leaderboardService', () => ({ recordScore: jest.fn().mockResolvedValue() }));

const db = require('../src/config/database');
const { redis } = require('../src/config/redis');
const questionModel = require('../src/models/question.model');
const userModel = require('../src/models/user.model');
const leaderboardService = require('../src/services/leaderboardService');
const gameService = require('../src/services/gameService');

describe('gameService.levelFromXp', () => {
  test('mappe l’XP au niveau 1–5 (seuils 0/200/500/1200/3000)', () => {
    expect(gameService.levelFromXp(0)).toBe(1);
    expect(gameService.levelFromXp(199)).toBe(1);
    expect(gameService.levelFromXp(200)).toBe(2);
    expect(gameService.levelFromXp(499)).toBe(2);
    expect(gameService.levelFromXp(500)).toBe(3);
    expect(gameService.levelFromXp(1199)).toBe(3);
    expect(gameService.levelFromXp(1200)).toBe(4);
    expect(gameService.levelFromXp(2999)).toBe(4);
    expect(gameService.levelFromXp(3000)).toBe(5);
    expect(gameService.levelFromXp(999999)).toBe(5);
  });
});

describe('gameService.submitSession', () => {
  const baseArgs = {
    userId: 'u1',
    mode: 'normal',
    theme: 'geographie',
    level: 'beginner',
    startedAt: '2026-06-21T10:00:00Z',
  };

  beforeEach(() => {
    redis.set.mockReset();
    redis.del.mockResolvedValue(1);
    db.getClient.mockReset();
    questionModel.findSolutions.mockReset();
    userModel.creditSessionXp.mockReset();
    leaderboardService.recordScore.mockReset().mockResolvedValue();
  });

  function wireHappyPath() {
    redis.set.mockResolvedValue('OK'); // verrou acquis
    fakeClient.query.mockImplementation((sql) => {
      if (/INSERT INTO game_sessions/.test(sql)) return { rows: [{ id: 'sess-1' }] };
      return { rows: [] }; // BEGIN / COMMIT
    });
    fakeClient.release.mockReset();
    db.getClient.mockResolvedValue(fakeClient);
    userModel.creditSessionXp.mockResolvedValue({ level_before: 2, level_after: 3, total_xp: 2500 });
  }

  test('recalcule serveur, persiste, crédite XP et renvoie le contrat §6', async () => {
    wireHappyPath();
    // 2 bonnes réponses rapides (≤5s) niveau beginner (base 50 +50% = 75 chacune)
    questionModel.findSolutions.mockResolvedValue(
      new Map([
        ['q1', { correct_index: 1, explanation: 'exp1' }],
        ['q2', { correct_index: 0, explanation: 'exp2' }],
      ])
    );
    const res = await gameService.submitSession({
      ...baseArgs,
      answers: [
        { question_id: 'q1', selected_index: 1, elapsed_ms: 3000, skipped: false },
        { question_id: 'q2', selected_index: 0, elapsed_ms: 4000, skipped: false },
      ],
    });

    expect(res.session_id).toBe('sess-1');
    expect(res.score).toBe(150); // 75 + 75
    expect(res.speed_bonus).toBe(50); // 25 + 25
    expect(res.correct_count).toBe(2);
    expect(res.level_before).toBe(2);
    expect(res.level_after).toBe(3);
    expect(res.review).toHaveLength(2);
    expect(res.review[0]).toMatchObject({ question_id: 'q1', correct_index: 1, is_correct: true });
    // classement mis à jour avec le score recalculé
    expect(leaderboardService.recordScore).toHaveBeenCalledWith({
      userId: 'u1',
      theme: 'geographie',
      score: 150,
    });
  });

  test('double soumission (verrou non acquis) → SESSION_ALREADY_SUBMITTED', async () => {
    redis.set.mockResolvedValue(null); // NX → déjà présent
    await expect(
      gameService.submitSession({ ...baseArgs, answers: [{ question_id: 'q1', selected_index: 0, elapsed_ms: 3000 }] })
    ).rejects.toMatchObject({ code: 'SESSION_ALREADY_SUBMITTED', httpStatus: 409 });
    expect(db.getClient).not.toHaveBeenCalled();
  });

  test('≥2 réponses < 1 s → CHEAT_DETECTED et verrou libéré', async () => {
    redis.set.mockResolvedValue('OK');
    questionModel.findSolutions.mockResolvedValue(
      new Map([
        ['q1', { correct_index: 0 }],
        ['q2', { correct_index: 0 }],
      ])
    );
    await expect(
      gameService.submitSession({
        ...baseArgs,
        answers: [
          { question_id: 'q1', selected_index: 0, elapsed_ms: 400, skipped: false },
          { question_id: 'q2', selected_index: 0, elapsed_ms: 700, skipped: false },
        ],
      })
    ).rejects.toMatchObject({ code: 'CHEAT_DETECTED', httpStatus: 422 });
    expect(db.getClient).not.toHaveBeenCalled(); // rien persisté
    expect(redis.del).toHaveBeenCalledWith('session:idem:u1:' + new Date(baseArgs.startedAt).getTime());
  });

  test('une seule réponse < 1 s n’est pas de la triche', async () => {
    wireHappyPath();
    questionModel.findSolutions.mockResolvedValue(new Map([['q1', { correct_index: 0 }]]));
    const res = await gameService.submitSession({
      ...baseArgs,
      answers: [{ question_id: 'q1', selected_index: 0, elapsed_ms: 500, skipped: false }],
    });
    expect(res.session_id).toBe('sess-1');
  });
});
