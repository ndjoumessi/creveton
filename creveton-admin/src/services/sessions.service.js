import api, { withMock, cleanParams } from './api';
import mockSessions from '../mocks/mockSessions';

const page = (data) => ({ data, page: { limit: data.length, next_cursor: null, has_more: false } });

/** GET /admin/sessions (filtres : user_id, theme, level, date_from). */
export function list(params = {}) {
  return withMock(
    () => api.get('/admin/sessions', { params: cleanParams({ limit: 100, ...params }) }).then((r) => r.data),
    () => {
      let data = [...mockSessions];
      if (params.theme) data = data.filter((s) => s.theme === params.theme);
      if (params.level) data = data.filter((s) => s.level === params.level);
      if (params.q) { const q = params.q.toLowerCase(); data = data.filter((s) => s.user.name.toLowerCase().includes(q)); }
      return page(data);
    },
  );
}

/** GET /admin/sessions/:id (détail + récap). */
export function get(id) {
  return withMock(
    () => api.get(`/admin/sessions/${id}`).then((r) => r.data),
    () => mockSessions.find((s) => s.id === id) || mockSessions[0],
  );
}

export default { list, get };
