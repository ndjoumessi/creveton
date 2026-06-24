'use strict';

process.env.NODE_ENV = 'test';

jest.mock('../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../src/config/redis', () => {
  const redis = {
    pipeline: jest.fn(),
    zcard: jest.fn(),
    zrevrange: jest.fn(),
    zrevrank: jest.fn(),
    zscore: jest.fn(),
  };
  return { redis };
});
jest.mock('../src/models/user.model', () => ({ findManyByIds: jest.fn(), findById: jest.fn() }));

const { redis } = require('../src/config/redis');
const userModel = require('../src/models/user.model');
const leaderboardService = require('../src/services/leaderboardService');

describe('leaderboardService period keys', () => {
  test('resolveKey mappe chaque scope', () => {
    expect(leaderboardService.resolveKey('global').key).toBe('lb:global');
    expect(leaderboardService.resolveKey('theme', 'sport').key).toBe('lb:theme:sport');
    expect(leaderboardService.resolveKey('weekly').key).toMatch(/^lb:weekly:\d{4}-W\d{2}$/);
    expect(leaderboardService.resolveKey('monthly').key).toMatch(/^lb:monthly:\d{4}-\d{2}$/);
  });

  test('monthKey / isoWeekKey formatent en UTC', () => {
    expect(leaderboardService.monthKey(new Date('2026-06-21T10:00:00Z'))).toBe('2026-06');
    expect(leaderboardService.isoWeekKey(new Date('2026-06-21T10:00:00Z'))).toMatch(/^2026-W\d{2}$/);
  });
});

describe('leaderboardService.getLeaderboard', () => {
  beforeEach(() => {
    Object.values(redis).forEach((fn) => fn.mockReset && fn.mockReset());
    userModel.findManyByIds.mockReset();
  });

  test('assemble data classée + me + pagination', async () => {
    redis.zcard.mockResolvedValue(50); // cache chaud, 50 joueurs
    // ZREVRANGE WITHSCORES → tableau plat [member, score, ...]
    redis.zrevrange.mockResolvedValue(['userA', '41200', 'userB', '38900']);
    redis.zrevrank.mockResolvedValue(141); // moi 142e
    redis.zscore.mockResolvedValue('8450');
    userModel.findManyByIds.mockResolvedValue([
      { id: 'userA', name: 'Junior K.', level: 5, ville: 'Douala', avatar_url: 'https://cdn/x.jpg' },
      { id: 'userB', name: 'Awa M.', level: 4, ville: 'Yaoundé' },
    ]);
    userModel.findById.mockResolvedValue({ level: 3 });

    const res = await leaderboardService.getLeaderboard({
      scope: 'global',
      limit: 2,
      cursor: null,
      meUserId: 'me',
    });

    expect(res.data).toEqual([
      { rank: 1, user_id: 'userA', name: 'Junior K.', level: 5, score: 41200, ville: 'Douala', avatar_url: 'https://cdn/x.jpg' },
      { rank: 2, user_id: 'userB', name: 'Awa M.', level: 4, score: 38900, ville: 'Yaoundé', avatar_url: null },
    ]);
    expect(res.me).toEqual({ rank: 142, score: 8450, level: 3 });
    expect(res.page).toEqual({ limit: 2, next_cursor: '2', has_more: true });
  });

  test('curseur = offset de rang ; dernière page → has_more false', async () => {
    redis.zcard.mockResolvedValue(5);
    redis.zrevrange.mockResolvedValue(['userC', '100']);
    redis.zrevrank.mockResolvedValue(null); // moi absent du classement
    redis.zscore.mockResolvedValue(null);
    userModel.findManyByIds.mockResolvedValue([{ id: 'userC', name: 'C', level: 1, ville: null }]);

    const res = await leaderboardService.getLeaderboard({
      scope: 'global',
      limit: 20,
      cursor: '4',
      meUserId: 'me',
    });
    expect(res.data[0].rank).toBe(5); // offset 4 + 1
    expect(res.me).toBeNull();
    expect(res.page.has_more).toBe(false);
    expect(res.page.next_cursor).toBeNull();
  });

  test('cache froid (zcard 0) → reconstruit depuis la base', async () => {
    const db = require('../src/config/database');
    // 1er zcard = 0 (froid), 2e zcard = total après rebuild
    redis.zcard.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    const pipeline = { zadd: jest.fn().mockReturnThis(), expire: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue([]) };
    redis.pipeline.mockReturnValue(pipeline);
    db.query.mockResolvedValue({ rows: [{ user_id: 'userZ', total: 999 }] });
    redis.zrevrange.mockResolvedValue(['userZ', '999']);
    redis.zrevrank.mockResolvedValue(0);
    redis.zscore.mockResolvedValue('999');
    userModel.findManyByIds.mockResolvedValue([{ id: 'userZ', name: 'Z', level: 2, ville: 'Bafoussam' }]);

    const res = await leaderboardService.getLeaderboard({ scope: 'global', limit: 20, meUserId: 'userZ' });
    expect(db.query).toHaveBeenCalled(); // rebuild depuis game_sessions
    expect(pipeline.zadd).toHaveBeenCalledWith('lb:global', 999, 'userZ');
    expect(res.data[0]).toMatchObject({ user_id: 'userZ', score: 999, rank: 1 });
  });
});
