import api, { withMock, cleanParams } from './api';
import { mockLeaderboard } from '../mocks/mockLeaderboard';

/** GET /admin/leaderboard?scope=&theme= → { me, data, page }. */
export function get(params = {}) {
  return withMock(
    () => api.get('/admin/leaderboard', { params: cleanParams(params) }).then((r) => r.data),
    () => mockLeaderboard(params.scope || 'global', params.theme),
  );
}

export default { get };
