import api, { cleanParams } from './api';

/**
 * Service Finances (console admin) — branché sur les endpoints réels :
 *   GET  /admin/analytics/finances
 *   GET  /admin/analytics/finances/daily
 *   GET  /admin/transactions
 *   GET  /admin/transactions/export
 *   POST /admin/transactions/:id/validate | /reject
 */

/** KPIs finances (ce mois + variation vs mois précédent). */
export function summary() {
  return api.get('/admin/analytics/finances').then((r) => r.data);
}

/** Série journalière (N jours). On dérive `volume = dépôts + retraits` pour le graphe. */
export function daily(days = 30) {
  return api.get('/admin/analytics/finances/daily', { params: { days } }).then((r) => {
    const points = (r.data?.data || []).map((d) => ({
      date: d.date,
      deposits: d.deposits,
      withdrawals: d.withdrawals,
      volume: (d.deposits || 0) + (d.withdrawals || 0),
    }));
    return { days, points };
  });
}

/** Liste paginée (curseur) du journal financier. */
export function transactions(filters = {}) {
  return api.get('/admin/transactions', { params: cleanParams(filters) }).then((r) => r.data);
}

/** Validation manuelle d'une transaction (statut → success). */
export function validate(id) {
  return api.post(`/admin/transactions/${id}/validate`).then((r) => r.data);
}

/** Rejet d'une transaction (statut → failed, motif optionnel). */
export function reject(id, reason) {
  return api.post(`/admin/transactions/${id}/reject`, { reason }).then((r) => r.data);
}

/** Export CSV serveur — blob (l'en-tête Bearer passe par l'intercepteur axios). */
export function exportCsv(filters = {}) {
  return api
    .get('/admin/transactions/export', { params: cleanParams(filters), responseType: 'blob' })
    .then((r) => r.data);
}

export default { summary, daily, transactions, validate, reject, exportCsv };
