import api, { withMock, cleanParams } from './api';
import mockUsers from '../mocks/mockUsers';

const page = (data) => ({ data, page: { limit: data.length, next_cursor: null, has_more: false } });

/** GET /admin/users (filtres : ville, level, role, status, q). */
export function list(params = {}) {
  return withMock(
    () => api.get('/admin/users', { params: cleanParams({ limit: 100, ...params }) }).then((r) => r.data),
    () => {
      let data = [...mockUsers];
      if (params.ville) data = data.filter((u) => u.ville === params.ville);
      if (params.role) data = data.filter((u) => u.role === params.role);
      if (params.status) data = data.filter((u) => u.status === params.status);
      if (params.level) data = data.filter((u) => String(u.level) === String(params.level));
      if (params.q) {
        const q = params.q.toLowerCase();
        data = data.filter((u) => `${u.name} ${u.email} ${u.phone}`.toLowerCase().includes(q));
      }
      return page(data);
    },
  );
}

/** GET /admin/users/stats — KPI globaux du parc (total, actifs 7j, nouveaux, bloqués). */
export function stats() {
  return withMock(
    () => api.get('/admin/users/stats').then((r) => r.data),
    () => {
      const DAY = 86400000;
      const now = Date.now();
      const isToday = (iso) => new Date(iso).toDateString() === new Date().toDateString();
      const active7d = (u) => u.last_active_at && now - new Date(u.last_active_at).getTime() <= 7 * DAY;
      return {
        total: mockUsers.length,
        // mockUsers n'a pas de last_active_at : on retombe sur les comptes actifs.
        active_7d: mockUsers.filter((u) => active7d(u) || (!u.last_active_at && u.status === 'active')).length,
        new_today: mockUsers.filter((u) => isToday(u.created_at)).length,
        blocked: mockUsers.filter((u) => u.status === 'suspended' || u.status === 'banned').length,
      };
    },
  );
}

/** GET /admin/users/:id (fiche + stats). */
export function get(id) {
  return withMock(
    () => api.get(`/admin/users/${id}`).then((r) => r.data),
    () => mockUsers.find((u) => u.id === id) || mockUsers[0],
  );
}

export function suspend(id, reason) {
  return withMock(() => api.post(`/admin/users/${id}/suspend`, { reason }).then((r) => r.data), () => ({ id, status: 'suspended' }));
}
export function ban(id, reason) {
  return withMock(() => api.post(`/admin/users/${id}/ban`, { reason }).then((r) => r.data), () => ({ id, status: 'banned' }));
}
export function resetPassword(id) {
  return withMock(() => api.post(`/admin/users/${id}/reset-password`).then((r) => r.data), () => ({ reset_initiated: true }));
}
export function remove(id) {
  return withMock(() => api.delete(`/admin/users/${id}`).then(() => ({ ok: true })), () => ({ ok: true }));
}

/** POST /admin/users/invite — crée un admin/modérateur (mdp temporaire renvoyé). */
export function invite(payload) {
  return withMock(
    () => api.post('/admin/users/invite', payload).then((r) => r.data),
    () => ({ id: `mock-${Date.now()}`, ...payload, temporary_password: 'Crv-demo-1A' }),
  );
}

/** PATCH /admin/users/:id/role — change le rôle (super_admin). */
export function changeRole(id, role) {
  return withMock(() => api.patch(`/admin/users/${id}/role`, { role }).then((r) => r.data), () => ({ id, role }));
}

export default { list, stats, get, suspend, ban, resetPassword, remove, invite, changeRole };
