'use strict';

process.env.NODE_ENV = 'test';

const { requirePermission, PERMISSIONS } = require('../src/middlewares/admin.middleware');

function run(op, role) {
  const req = { user: { role } };
  let err = 'NO_CALL';
  requirePermission(op)(req, {}, (e) => {
    err = e || null;
  });
  return err;
}

describe('admin.middleware requirePermission', () => {
  test('matrice §12 : lecture autorisée dès moderator', () => {
    expect(run('questions:read', 'moderator')).toBeNull();
    expect(run('analytics:read', 'moderator')).toBeNull();
  });

  test('suppression question réservée à admin (moderator refusé)', () => {
    expect(run('questions:delete', 'moderator')).toMatchObject({ code: 'FORBIDDEN' });
    expect(run('questions:delete', 'admin')).toBeNull();
  });

  test('gestion users réservée à admin', () => {
    expect(run('users:manage', 'moderator')).toMatchObject({ code: 'FORBIDDEN' });
    expect(run('users:manage', 'admin')).toBeNull();
    expect(run('users:manage', 'super_admin')).toBeNull();
  });

  test('system:manage réservé à super_admin', () => {
    expect(run('system:manage', 'admin')).toMatchObject({ code: 'FORBIDDEN' });
    expect(run('system:manage', 'super_admin')).toBeNull();
  });

  test('player n’a aucun accès admin', () => {
    expect(run('questions:read', 'player')).toMatchObject({ code: 'FORBIDDEN' });
  });

  test('opération inconnue → fail-closed (FORBIDDEN même pour super_admin)', () => {
    expect(run('inexistant:op', 'super_admin')).toMatchObject({ code: 'FORBIDDEN' });
  });

  test('la table couvre les domaines clés', () => {
    expect(PERMISSIONS['questions:force-sync']).toBe('admin');
    expect(PERMISSIONS['tournaments:manage']).toBe('admin');
  });
});
