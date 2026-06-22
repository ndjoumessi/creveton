'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');
const financeService = require('../../services/financeService');

/** Administration des transactions / journal financier (console Finances §12). */

const EXPORT_COLUMNS = ['id', 'date', 'user_email', 'type', 'amount', 'currency', 'provider', 'status', 'reference'];

/** Échappe une valeur CSV (RFC 4180 : guillemets doublés, champ quoté). */
function csvCell(value) {
  const s = value == null ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

/** GET /admin/transactions — liste paginée (curseur) + filtres. */
const list = asyncHandler(async (req, res) => {
  const result = await financeService.listTransactions(req.query);
  return ok(res, result);
});

/** GET /admin/transactions/export — CSV (mêmes filtres, sans pagination, plafonné 10 000). */
const exportCsv = asyncHandler(async (req, res) => {
  const rows = await financeService.exportRows(req.query, 10000);
  const header = EXPORT_COLUMNS.join(',');
  const lines = rows.map((t) => [
    t.id,
    t.created_at instanceof Date ? t.created_at.toISOString() : t.created_at,
    t.user_email,
    t.type,
    t.amount,
    t.currency,
    t.provider,
    t.status,
    t.reference,
  ].map(csvCell).join(','));
  // BOM pour qu'Excel lise l'UTF-8 ; CRLF entre lignes (RFC 4180).
  const csv = `﻿${[header, ...lines].join('\r\n')}\r\n`;
  const filename = `creveton_transactions_${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.status(200).send(csv);
});

/** POST /admin/transactions/:id/validate — statut → success. */
const validate = asyncHandler(async (req, res) => {
  const tx = await financeService.updateStatus(req.params.id, 'success', { adminId: req.user.id });
  return ok(res, tx);
});

/** POST /admin/transactions/:id/reject — statut → failed (+ motif optionnel). */
const reject = asyncHandler(async (req, res) => {
  const tx = await financeService.updateStatus(req.params.id, 'failed', {
    adminId: req.user.id,
    reason: req.body?.reason,
  });
  return ok(res, tx);
});

module.exports = { list, exportCsv, validate, reject };
