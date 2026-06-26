'use strict';

const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const { ok, created } = require('../../utils/response');
const supportService = require('../../services/supportService');

/**
 * Support joueurs (console admin /admin/support) : tickets, fil de messages,
 * signalements de questions, KPIs. La validation (Joi) et le rôle minimum sont
 * appliqués dans les routes (validate + requirePermission).
 */

// ── Tickets ──────────────────────────────────────────────────────────────────

/** GET /admin/support/tickets — liste paginée + filtres. */
const listTickets = asyncHandler(async (req, res) => {
  const { status, priority, type, assigned_to, page, limit } = req.query;
  const { tickets, total } = await supportService.listTickets({
    status, priority, type, assigned_to, page, limit,
  });
  return ok(res, { data: tickets, total, page, limit });
});

/** GET /admin/support/tickets/:id — ticket + fil de messages. */
const getTicket = asyncHandler(async (req, res) => {
  const ticket = await supportService.getTicket(req.params.id);
  if (!ticket) throw new ApiError('NOT_FOUND');
  return ok(res, ticket);
});

/** POST /admin/support/tickets — crée un ticket (surtout pour les tests/seed). */
const createTicket = asyncHandler(async (req, res) => {
  const ticket = await supportService.createTicket(req.body);
  return created(res, ticket);
});

/** POST /admin/support/tickets/:id/reply — réponse admin (+ transition de statut). */
const replyTicket = asyncHandler(async (req, res) => {
  const updated = await supportService.replyTicket(req.params.id, {
    adminId: req.user.id,
    body: req.body.body,
    resolve: req.body.resolve,
  });
  if (!updated) throw new ApiError('NOT_FOUND');
  return ok(res, updated);
});

/** PATCH /admin/support/tickets/:id/status — change le statut. */
const updateTicketStatus = asyncHandler(async (req, res) => {
  const ticket = await supportService.updateTicketStatus(req.params.id, req.body.status);
  if (!ticket) throw new ApiError('NOT_FOUND');
  return ok(res, ticket);
});

/** PATCH /admin/support/tickets/:id/assign — (ré)assigne le ticket. */
const assignTicket = asyncHandler(async (req, res) => {
  const ticket = await supportService.assignTicket(req.params.id, req.body.assigned_to);
  if (!ticket) throw new ApiError('NOT_FOUND');
  return ok(res, ticket);
});

// ── Signalements de questions ────────────────────────────────────────────────

/** GET /admin/support/reports — liste paginée des signalements. */
const listReports = asyncHandler(async (req, res) => {
  const { status, page, limit } = req.query;
  const { reports, total } = await supportService.listReports({ status, page, limit });
  return ok(res, { data: reports, total, page, limit });
});

/** PATCH /admin/support/reports/:id/status — traite un signalement. */
const updateReportStatus = asyncHandler(async (req, res) => {
  const report = await supportService.updateReportStatus(req.params.id, req.body.status);
  if (!report) throw new ApiError('NOT_FOUND');
  return ok(res, report);
});

// ── KPIs ─────────────────────────────────────────────────────────────────────

/** GET /admin/support/kpis — indicateurs du tableau de bord support. */
const getKpis = asyncHandler(async (req, res) => {
  return ok(res, await supportService.getSupportKpis());
});

module.exports = {
  listTickets,
  getTicket,
  createTicket,
  replyTicket,
  updateTicketStatus,
  assignTicket,
  listReports,
  updateReportStatus,
  getKpis,
};
