import api, { withMock } from './api';
import mockDashboard from '../mocks/mockDashboard';

/**
 * Synthèse du tableau de bord en UN SEUL appel (GET /admin/dashboard).
 * Réponse : { kpis, recent_users, pending_questions, system }. Repli mock en
 * mode démo (dev sans backend).
 */
export function overview() {
  return withMock(() => api.get('/admin/dashboard').then((r) => r.data), mockDashboard);
}

export default { overview };
