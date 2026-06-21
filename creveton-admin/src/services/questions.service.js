import api, { withMock, cleanParams } from './api';
import mockQuestions from '../mocks/mockQuestions';

const page = (data) => ({ data, page: { limit: data.length, next_cursor: null, has_more: false } });

/** GET /admin/questions (filtres : status, theme, level, q, limit, cursor). */
export function list(params = {}) {
  // limit=100 (max backend) : on charge tout le contenu et la table pagine
  // côté client (20/page). Une vraie pagination serveur viendra si le volume croît.
  return withMock(
    () => api.get('/admin/questions', { params: cleanParams({ limit: 100, ...params }) }).then((r) => r.data),
    () => {
      let data = [...mockQuestions];
      if (params.status) data = data.filter((q) => q.status === params.status);
      if (params.theme) data = data.filter((q) => q.theme === params.theme);
      if (params.level) data = data.filter((q) => q.level === params.level);
      if (params.q) data = data.filter((q) => q.text_fr.toLowerCase().includes(params.q.toLowerCase()));
      return page(data);
    },
  );
}

/** POST /admin/questions. */
export function create(payload) {
  return withMock(
    () => api.post('/admin/questions', payload).then((r) => r.data),
    () => ({ id: `mock-${Date.now()}`, ...payload, status: 'draft', version: 1, success_rate: null }),
  );
}

/** PATCH /admin/questions/:id. */
export function update(id, payload) {
  return withMock(() => api.patch(`/admin/questions/${id}`, payload).then((r) => r.data), () => ({ id, ...payload }));
}

/** POST /admin/questions/:id/transition. */
export function transition(id, to, reason) {
  return withMock(
    () => api.post(`/admin/questions/${id}/transition`, { to, reason }).then((r) => r.data),
    () => ({ id, status: to }),
  );
}

/** DELETE /admin/questions/:id (soft delete). */
export function remove(id) {
  return withMock(() => api.delete(`/admin/questions/${id}`).then((r) => r.data), () => ({ id, status: 'archived' }));
}

/** POST /admin/questions/import (CSV multipart). */
export function importCsv(file) {
  const form = new FormData();
  form.append('file', file);
  return withMock(
    () => api.post('/admin/questions/import', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data),
    () => ({ total_rows: 0, accepted: 0, rejected: 0, errors: [] }),
  );
}

/** POST /admin/questions/force-sync (push silencieux). */
export function forceSync(questionIds) {
  return withMock(
    () => api.post('/admin/questions/force-sync', { question_ids: questionIds }).then((r) => r.data),
    () => ({ pushed: true, devices_targeted: 14230 }),
  );
}

export default { list, create, update, transition, remove, importCsv, forceSync };
