import api, { withMock } from './api';
import mockDashboard from '../mocks/mockDashboard';

/**
 * Synthèse dashboard (activité du jour + statut système + dernière synchro).
 * Pas d'endpoint agrégé dédié côté backend → repli mock. Les autres chiffres du
 * dashboard (questions approuvées, tournois ouverts, utilisateurs) sont dérivés
 * des vrais endpoints /admin/questions, /tournaments, /admin/users côté page.
 */
export function summary() {
  return withMock(() => api.get('/admin/dashboard').then((r) => r.data), mockDashboard);
}

export default { summary };
