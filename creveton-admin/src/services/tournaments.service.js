import api, { withMock } from './api';
import mockTournaments from '../mocks/mockTournaments';

/**
 * NB : le backend n'expose pas (encore) de liste admin des tournois ; on tente
 * GET /tournaments et on retombe sur les mocks. Les actions admin existent bien
 * (create / start / cancel / payout — §12).
 */
export function list(params = {}) {
  return withMock(
    () => api.get('/tournaments', { params }).then((r) => ({ data: r.data.data || r.data })),
    () => ({ data: mockTournaments }),
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

export default { list, create, start, cancel, payout };
