import api, { withMock } from './api';
import mockTeam, { mockTeamStats, mockTeamRoles, mockTeamActivity } from '../mocks/mockTeam';

/** Équipe d'administration : membres (rôles admin), rôles & permissions, activité. */

/** GET /admin/team — membres (role ∈ moderator|admin|super_admin). */
export function list(params = {}) {
  return withMock(
    () => api.get('/admin/team', { params }).then((r) => ({ data: r.data.data || [] })),
    () => mockTeam,
  );
}

/** GET /admin/team/stats */
export function stats() {
  return withMock(() => api.get('/admin/team/stats').then((r) => r.data), () => mockTeamStats);
}

/** POST /admin/team/invite { email, name, role, message? } → { user, invite_url } */
export function invite(payload) {
  return withMock(
    () => api.post('/admin/team/invite', payload).then((r) => r.data),
    () => ({
      user: { id: `mock-${Date.now()}`, name: payload.name, email: payload.email, role: payload.role },
      invite_url: `https://admin.creveton.cm/accept-invite?token=mock-${Date.now()}`,
    }),
  );
}

/** POST /admin/team/accept-invite { token, password } (public) */
export function acceptInvite(token, password) {
  return withMock(
    () => api.post('/admin/team/accept-invite', { token, password }).then((r) => r.data),
    () => ({ message: 'Compte activé' }),
  );
}

/** PATCH /admin/team/:id/role { role } */
export function setRole(id, role) {
  return withMock(() => api.patch(`/admin/team/${id}/role`, { role }).then((r) => r.data), () => ({ id, role }));
}

/** DELETE /admin/team/:id (soft delete) */
export function remove(id) {
  return withMock(() => api.delete(`/admin/team/${id}`).then((r) => r.data), () => ({ id }));
}

/** GET /admin/team/:id/activity — journal d'audit du membre (question_events). */
export function activity(id) {
  return withMock(() => api.get(`/admin/team/${id}/activity`).then((r) => r.data), () => mockTeamActivity);
}

/** GET /admin/team/roles — rôles + nombre de membres + matrices de permissions. */
export function roles() {
  return withMock(() => api.get('/admin/team/roles').then((r) => r.data), () => mockTeamRoles);
}

/** PATCH /admin/team/roles/:role/permissions { permissions } */
export function setRolePermissions(role, permissions) {
  return withMock(
    () => api.patch(`/admin/team/roles/${role}/permissions`, { permissions }).then((r) => r.data),
    () => ({ role, permissions }),
  );
}

export default { list, stats, invite, acceptInvite, setRole, remove, activity, roles, setRolePermissions };
