import api from './api';

/** Console — Paramètres : feature flags, état système, intégrations, profil, sessions. */

/** GET /admin/settings/flags */
export function getFlags() {
  return api.get('/admin/settings/flags').then((r) => r.data.flags);
}

/** PATCH /admin/settings/flags/:key */
export function setFlag(key, enabled) {
  return api.patch(`/admin/settings/flags/${key}`, { enabled }).then((r) => r.data.flags);
}

/** GET /admin/settings/system — métriques temps réel. */
export function getSystem() {
  return api.get('/admin/settings/system').then((r) => r.data);
}

/** GET /admin/settings/integrations */
export function getIntegrations() {
  return api.get('/admin/settings/integrations').then((r) => r.data.integrations);
}

/** POST /admin/settings/system/recompute-success-rates */
export function recomputeSuccessRates() {
  return api.post('/admin/settings/system/recompute-success-rates').then((r) => r.data);
}

/** POST /admin/settings/system/recompute-xp */
export function recomputeXp() {
  return api.post('/admin/settings/system/recompute-xp').then((r) => r.data);
}

/** Télécharge un export (questions JSON / utilisateurs CSV) en conservant l'auth. */
async function download(path, filename) {
  const res = await api.get(path, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
export const exportQuestions = () => download('/admin/settings/exports/questions', 'questions-creveton.json');
export const exportUsers = () => download('/admin/settings/exports/users', 'utilisateurs-creveton.csv');

/** GET /users/me — profil du compte connecté. */
export function getMe() {
  return api.get('/users/me').then((r) => r.data);
}

/** PATCH /users/me — met à jour le profil (name, ville, lang). */
export function updateMe(payload) {
  return api.patch('/users/me', payload).then((r) => r.data);
}

/** GET /auth/sessions — sessions actives. */
export function getSessions() {
  return api.get('/auth/sessions').then((r) => r.data.sessions);
}

/** POST /auth/sessions/revoke-others */
export function revokeOtherSessions() {
  return api.post('/auth/sessions/revoke-others').then((r) => r.data);
}

export default {
  getFlags, setFlag, getSystem, getIntegrations,
  recomputeSuccessRates, recomputeXp, exportQuestions, exportUsers,
  getMe, updateMe, getSessions, revokeOtherSessions,
};
