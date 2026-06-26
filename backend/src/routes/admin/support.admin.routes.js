'use strict';

const express = require('express');
const Joi = require('joi');
const ctrl = require('../../controllers/admin/support.admin.controller');
const validate = require('../../middlewares/validate');
const { requirePermission } = require('../../middlewares/admin.middleware');

const router = express.Router();

// ── Schémas Joi (inline) ─────────────────────────────────────────────────────
const TICKET_STATUS = ['open', 'in_progress', 'resolved', 'closed'];
const TICKET_PRIORITY = ['urgent', 'normal', 'low'];
const TICKET_TYPE = ['account', 'question', 'bug', 'other'];
const REPORT_STATUS = ['pending', 'ignored', 'resolved'];

const idParam = Joi.object({ id: Joi.string().uuid().required() });

const listTicketsQuery = Joi.object({
  status: Joi.string().valid(...TICKET_STATUS).optional(),
  priority: Joi.string().valid(...TICKET_PRIORITY).optional(),
  type: Joi.string().valid(...TICKET_TYPE).optional(),
  assigned_to: Joi.string().uuid().optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

const createTicketBody = Joi.object({
  player_id: Joi.string().uuid().required(),
  type: Joi.string().valid(...TICKET_TYPE).default('other'),
  subject: Joi.string().min(1).max(255).required(),
  priority: Joi.string().valid(...TICKET_PRIORITY).default('normal'),
});

const replyBody = Joi.object({
  body: Joi.string().min(1).max(2000).required(),
  resolve: Joi.boolean().default(false),
});

const ticketStatusBody = Joi.object({
  status: Joi.string().valid(...TICKET_STATUS).required(),
});

const assignBody = Joi.object({
  assigned_to: Joi.string().uuid().allow(null).required(),
});

const listReportsQuery = Joi.object({
  status: Joi.string().valid(...REPORT_STATUS).optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

const reportStatusBody = Joi.object({
  status: Joi.string().valid(...REPORT_STATUS).required(),
});

// ── Tickets ──────────────────────────────────────────────────────────────────
router.get('/tickets', requirePermission('support:read'), validate(listTicketsQuery, 'query'), ctrl.listTickets);
router.get('/tickets/:id', requirePermission('support:read'), validate(idParam, 'params'), ctrl.getTicket);
router.post('/tickets', requirePermission('support:manage'), validate(createTicketBody), ctrl.createTicket);
router.post('/tickets/:id/reply', requirePermission('support:manage'), validate(idParam, 'params'), validate(replyBody), ctrl.replyTicket);
router.patch('/tickets/:id/status', requirePermission('support:manage'), validate(idParam, 'params'), validate(ticketStatusBody), ctrl.updateTicketStatus);
router.patch('/tickets/:id/assign', requirePermission('support:assign'), validate(idParam, 'params'), validate(assignBody), ctrl.assignTicket);

// ── Signalements de questions ────────────────────────────────────────────────
router.get('/reports', requirePermission('support:read'), validate(listReportsQuery, 'query'), ctrl.listReports);
router.patch('/reports/:id/status', requirePermission('support:manage'), validate(idParam, 'params'), validate(reportStatusBody), ctrl.updateReportStatus);

// ── KPIs ─────────────────────────────────────────────────────────────────────
router.get('/kpis', requirePermission('support:read'), ctrl.getKpis);

module.exports = router;
