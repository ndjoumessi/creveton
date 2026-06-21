import api, { withMock } from './api';
import { mockAnalytics } from '../mocks/mockDashboard';

/** GET /admin/analytics?period=30d (DAU, MAU, rétention, revenus — §12). */
export function get(period = '30d') {
  return withMock(() => api.get('/admin/analytics', { params: { period } }).then((r) => r.data), () => mockAnalytics(period));
}

export default { get };
