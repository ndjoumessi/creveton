import api, { withMock } from './api';
import mockTournaments from '../mocks/mockTournaments';

/**
 * GET /admin/tournaments — liste admin + synthèse { data, stats }. Repli mock
 * en mode démo hors-ligne.
 */
export function list(params = {}) {
  return withMock(
    () => api.get('/admin/tournaments', { params }).then((r) => ({ data: r.data.data || [], stats: r.data.stats || null })),
    () => ({ data: mockTournaments, stats: null }),
  );
}

/** GET /admin/tournaments/:id — détail + participants + stats. */
export function detail(id) {
  return withMock(
    () => api.get(`/admin/tournaments/${id}`).then((r) => r.data),
    () => ({ tournament: mockTournaments.find((t) => t.id === id) || null, participants: [], stats: null }),
  );
}

export function create(payload) {
  return withMock(() => api.post('/admin/tournaments', payload).then((r) => r.data), () => ({ id: `mock-${Date.now()}`, ...payload, status: 'scheduled' }));
}
export function start(id) {
  return withMock(() => api.post(`/admin/tournaments/${id}/start`).then((r) => r.data), () => ({ id, status: 'running' }));
}
export function cancel(id) {
  return withMock(() => api.post(`/admin/tournaments/${id}/cancel`).then((r) => r.data), () => ({ tournament: { id, status: 'cancelled' } }));
}
export function payout(id) {
  return withMock(() => api.post(`/admin/tournaments/${id}/payout`).then((r) => r.data), () => ({ tournament: { id, status: 'paid' }, results: [] }));
}

export function addParticipant(tournamentId, userId) {
  return withMock(
    () => api.post(`/admin/tournaments/${tournamentId}/participants`, { user_id: userId }).then((r) => r.data),
    () => ({ tournament_id: tournamentId, user_id: userId, score: 0 }),
  );
}

export function removeParticipant(tournamentId, userId) {
  return withMock(
    () => api.delete(`/admin/tournaments/${tournamentId}/participants/${userId}`).then((r) => r.data),
    () => ({ tournament_id: tournamentId, user_id: userId }),
  );
}

export default { list, detail, create, start, cancel, payout, addParticipant, removeParticipant };
