import mockSupport, { mockSupportKpi, mockSupportDaily, mockSupportByType } from '../mocks/mockSupport';

/**
 * Support joueurs — MVP : pas de backend dédié (tickets/signalements simulés).
 * L'API réelle (tickets persistés, signalements) est prévue en v2 ; ce service
 * sert des données de démonstration en mémoire pour piloter l'interface.
 */

let tickets = mockSupport.tickets.map((t) => ({ ...t }));

export function listTickets({ status } = {}) {
  const data = status ? tickets.filter((t) => t.status === status) : tickets;
  return Promise.resolve({ data: data.map((t) => ({ ...t })) });
}

export function listReports() {
  return Promise.resolve({ data: mockSupport.reports.map((r) => ({ ...r })) });
}

export function kpi() {
  return Promise.resolve(mockSupportKpi);
}

export function stats() {
  return Promise.resolve({ daily: mockSupportDaily, by_type: mockSupportByType });
}

/** Répond à un ticket (in-memory) — renvoie le ticket mis à jour. */
export function reply(id, body, { author = 'Vous', resolve = false } = {}) {
  tickets = tickets.map((t) => {
    if (t.id !== id) return t;
    const messages = [...t.messages, { id: `m${t.messages.length + 1}`, from: 'admin', body, author, at: new Date().toISOString() }];
    return { ...t, messages, status: resolve ? 'resolved' : t.status === 'open' ? 'in_progress' : t.status };
  });
  return Promise.resolve(tickets.find((t) => t.id === id));
}

/** Change le statut d'un ticket (open → in_progress → resolved). */
export function setStatus(id, status) {
  tickets = tickets.map((t) => (t.id === id ? { ...t, status } : t));
  return Promise.resolve(tickets.find((t) => t.id === id));
}

export default { listTickets, listReports, kpi, stats, reply, setStatus };
