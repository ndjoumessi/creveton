'use strict';

const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const txModel = require('../models/transaction.model');

/**
 * Logique Finances (console admin §12) : liste/filtre du journal financier,
 * KPIs, série journalière, et validation/rejet manuel des transactions.
 * Toute la lecture SQL vit dans transaction.model ; ici, la logique métier.
 */

/** GET /admin/transactions — liste paginée par curseur (keyset sur id). */
async function listTransactions(filters = {}) {
  const limit = filters.limit || 20;
  const { rows, hasMore } = await txModel.listAdmin({ ...filters, limit });
  const data = rows.map(txModel.toAdminView);
  return {
    data,
    page: {
      limit,
      next_cursor: hasMore && data.length ? data[data.length - 1].id : null,
      has_more: hasMore,
    },
  };
}

/** GET /admin/analytics/finances — KPIs ce mois + variation vs mois précédent. */
async function summary() {
  const r = await txModel.financeSummary();
  const delta = (cur, prev) => {
    if (prev > 0) return Math.round(((cur - prev) / prev) * 100);
    return cur > 0 ? 100 : 0; // pas de base de comparaison → 100 % si nouveau, sinon 0.
  };
  return {
    volume_total: { amount: r.vol_cur, delta_pct: delta(r.vol_cur, r.vol_prev) },
    deposits: { amount: r.dep_cur, delta_pct: delta(r.dep_cur, r.dep_prev) },
    withdrawals: { amount: r.wd_cur, delta_pct: delta(r.wd_cur, r.wd_prev) },
    pending: { count: r.pending_count, amount: r.pending_amount },
  };
}

/** GET /admin/analytics/finances/daily — N points (jours), fuseau Africa/Douala. */
async function daily(days = 30) {
  const data = await txModel.financeDaily(days);
  return { data };
}

/**
 * POST /admin/transactions/:id/validate|reject — transition de statut.
 * Journalise l'action dans metadata.admin_action (pas de table audit_events).
 */
async function updateStatus(id, status, { adminId, reason } = {}) {
  const action = {
    action: status === 'success' ? 'validate' : 'reject',
    admin_id: adminId ?? null,
    reason: reason ?? null,
    at: new Date().toISOString(),
  };
  const row = await txModel.adminUpdateStatus(id, status, action);
  if (!row) throw new ApiError('NOT_FOUND', { message: 'Transaction introuvable.' });
  logger.info('Transaction mise à jour (admin)', { transaction_id: id, status, admin_id: adminId });
  return txModel.toAdminView(row);
}

/** GET /admin/transactions/export — lignes filtrées (plafonnées à `cap`). */
async function exportRows(filters = {}, cap = 10000) {
  const rows = await txModel.listForExport(filters, cap);
  return rows.map(txModel.toAdminView);
}

module.exports = { listTransactions, summary, daily, updateStatus, exportRows };
