'use strict';

const supportModel = require('../models/support.model');

/**
 * Logique métier support. La plupart des opérations sont de simples pass-through
 * du model ; seul `replyTicket` porte de la logique (message admin + transition
 * de statut). Couche service conforme à l'architecture route → contrôleur →
 * service → model.
 */

/**
 * Répond à un ticket au nom d'un admin :
 *  - ajoute un message (sender_role 'admin') ;
 *  - si `resolve` → statut 'resolved' ; sinon si le ticket était 'open' → 'in_progress' ;
 *  - renvoie le ticket à jour (avec ses messages), ou null si introuvable.
 */
async function replyTicket(ticketId, { adminId, body, resolve = false }) {
  const ticket = await supportModel.getTicket(ticketId);
  if (!ticket) return null;

  await supportModel.addMessage({
    ticket_id: ticketId,
    sender_id: adminId,
    sender_role: 'admin',
    body,
  });

  if (resolve) {
    await supportModel.updateTicketStatus(ticketId, 'resolved');
  } else if (ticket.status === 'open') {
    await supportModel.updateTicketStatus(ticketId, 'in_progress');
  }

  return supportModel.getTicket(ticketId);
}

module.exports = {
  // Pass-through du model.
  listTickets: supportModel.listTickets,
  getTicket: supportModel.getTicket,
  createTicket: supportModel.createTicket,
  updateTicketStatus: supportModel.updateTicketStatus,
  assignTicket: supportModel.assignTicket,
  listReports: supportModel.listReports,
  updateReportStatus: supportModel.updateReportStatus,
  getSupportKpis: supportModel.getSupportKpis,
  // Logique métier.
  replyTicket,
};
