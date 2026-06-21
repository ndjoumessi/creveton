'use strict';

process.env.NODE_ENV = 'test';

const deltaSync = require('../src/utils/deltaSync');

describe('deltaSync.parseSince', () => {
  test('ISO valide → Date', () => {
    const d = deltaSync.parseSince('2026-05-20T10:00:00Z');
    expect(d).toBeInstanceOf(Date);
    expect(d.toISOString()).toBe('2026-05-20T10:00:00.000Z');
  });

  test('valeur absente → INVALID_TIMESTAMP', () => {
    expect(() => deltaSync.parseSince(undefined)).toThrow();
    try {
      deltaSync.parseSince('');
    } catch (e) {
      expect(e.code).toBe('INVALID_TIMESTAMP');
      expect(e.httpStatus).toBe(400);
    }
  });

  test('format invalide → INVALID_TIMESTAMP', () => {
    try {
      deltaSync.parseSince('pas-une-date');
    } catch (e) {
      expect(e.code).toBe('INVALID_TIMESTAMP');
    }
  });
});

describe('deltaSync.splitNewUpdated', () => {
  const since = new Date('2026-05-20T10:00:00Z');
  const project = (r) => ({ id: r.id });

  test('created_at > since → new ; sinon → updated', () => {
    const rows = [
      { id: 'a', created_at: '2026-05-21T00:00:00Z' }, // après → new
      { id: 'b', created_at: '2026-05-01T00:00:00Z' }, // avant → updated
    ];
    const { new: fresh, updated } = deltaSync.splitNewUpdated(rows, since, project);
    expect(fresh).toEqual([{ id: 'a' }]);
    expect(updated).toEqual([{ id: 'b' }]);
  });
});

describe('deltaSync.buildDeltaResponse', () => {
  test('assemble new/updated/deleted_ids/synced_at', () => {
    const res = deltaSync.buildDeltaResponse({
      rows: [{ id: 'a', created_at: '2026-06-01T00:00:00Z', version: 2 }],
      deletedIds: ['z'],
      since: new Date('2026-05-20T10:00:00Z'),
      syncedAt: new Date('2026-06-21T10:00:00Z'),
      project: (r) => ({ id: r.id, version: r.version }),
    });
    expect(res.new).toEqual([{ id: 'a', version: 2 }]);
    expect(res.updated).toEqual([]);
    expect(res.deleted_ids).toEqual(['z']);
    expect(res.synced_at).toBe('2026-06-21T10:00:00.000Z');
  });
});
