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

/**
 * POST /admin/questions/import (CSV multipart).
 * @param {File} file
 * @param {{ force?: boolean }} [opts]  force=true → insère aussi les avertissements (70–85 %).
 */
export function importCsv(file, { force = false } = {}) {
  const form = new FormData();
  form.append('file', file);
  if (force) form.append('force', 'true');
  return withMock(
    () => api.post('/admin/questions/import', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data),
    () => ({ total_rows: 0, accepted: 0, rejected: 0, warnings: 0, errors: [], warnings_list: [] }),
  );
}

/** POST /admin/questions/:id/image — upload image (multipart, champ « image »). */
export function uploadImage(id, file) {
  const form = new FormData();
  form.append('image', file);
  return api
    .post(`/admin/questions/${id}/image`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
    .then((r) => r.data);
}

/** DELETE /admin/questions/:id/image — retire l'image de la question. */
export function deleteImage(id) {
  return api.delete(`/admin/questions/${id}/image`).then((r) => r.data);
}

/**
 * POST /admin/questions/improve-text — correcteur IA via proxy backend (la clé
 * Anthropic reste côté serveur, jamais dans le frontend). → { suggestion, changed }.
 */
export function improveText({ text, lang = 'fr', type = 'statement', action = 'correct' }) {
  return api.post('/admin/questions/improve-text', { text, lang, type, action }).then((r) => r.data);
}

/**
 * POST /admin/questions/:id/translate — traduction IA d'une question EXISTANTE
 * (FR↔EN), bloquante. → { translated, text_fr, text_en, options }.
 */
export function translateQuestion(id, targetLang) {
  return api.post(`/admin/questions/${id}/translate`, { target_lang: targetLang }).then((r) => r.data);
}

/** POST /admin/questions/force-sync (push silencieux). */
export function forceSync(questionIds) {
  return withMock(
    () => api.post('/admin/questions/force-sync', { question_ids: questionIds }).then((r) => r.data),
    () => ({ pushed: true, devices_targeted: 14230 }),
  );
}

/** GET /admin/questions/stats — stats globales (par thème + extrêmes). */
export function globalStats() {
  return withMock(
    () => api.get('/admin/questions/stats').then((r) => r.data),
    () => ({ by_theme: [], hardest: [], easiest: [] }),
  );
}

/** GET /admin/questions/:id/stats — distribution des choix + comparaison thème. */
export function questionStats(id) {
  return withMock(
    () => api.get(`/admin/questions/${id}/stats`).then((r) => r.data),
    () => ({ id, total_answers: 0, success_rate: null, theme_avg_rate: null, distribution: [], main_distractor_index: null, sync_count: 0 }),
  );
}

/** GET /admin/questions/:id/history — journal d'audit. */
export function questionHistory(id) {
  return withMock(
    () => api.get(`/admin/questions/${id}/history`).then((r) => r.data),
    () => ({ id, version: 1, events: [] }),
  );
}

export default {
  list, create, update, transition, remove, importCsv, forceSync,
  uploadImage, deleteImage, improveText, translateQuestion,
  globalStats, questionStats, questionHistory,
};
