import api, { cleanParams } from './api';

/**
 * Support joueurs — branché sur l'API backend (/admin/support/*).
 *
 * Le backend ne renvoie pas le profil joueur ni le nom de l'assigné : on adapte
 * les shapes pour SupportPage (nom = UUID tronqué à 8 caractères, lookup à venir).
 * Les messages d'un ticket ne transitent que par GET /tickets/:id. Les stats sont
 * dérivées de la liste des tickets (pas d'endpoint dédié), l'activité reste vide.
 */

/** UUID → « 1a2b3c4d… » (8 premiers caractères) ; '—' si absent. */
function shortId(id) {
  return id ? `${String(id).slice(0, 8)}…` : '—';
}

/** Message API (sender_role/created_at/sender_id) → shape SupportPage (from/at/author). */
function adaptMessage(m) {
  return {
    id: m.id,
    from: m.sender_role,
    body: m.body,
    at: m.created_at,
    author: m.sender_role === 'admin' && m.sender_id ? shortId(m.sender_id) : undefined,
  };
}

/** Ticket API → shape SupportPage (player synthétique, assigned_to tronqué, messages). */
function adaptTicket(tk) {
  if (!tk) return tk;
  const out = {
    ...tk,
    // Profil joueur non renvoyé par le backend → nom = player_id tronqué.
    player: { name: shortId(tk.player_id) },
    // Assigné : UUID tronqué (lookup nom à venir) ; null = non assigné.
    assigned_to: tk.assigned_to ? shortId(tk.assigned_to) : null,
  };
  if (Array.isArray(tk.messages)) out.messages = tk.messages.map(adaptMessage);
  return out;
}

/** Signalement API → shape SupportPage (reported_by = nom joint, sinon id tronqué). */
function adaptReport(r) {
  if (!r) return r;
  return {
    ...r,
    reported_by: r.reporter_name || shortId(r.reported_by),
    // Pas d'agrégat côté endpoint : chaque ligne = 1 signalement.
    count: r.count ?? 1,
  };
}

// ── Tickets ──────────────────────────────────────────────────────────────────

function listTickets({ status, priority, type, page, limit } = {}) {
  return api
    .get('/admin/support/tickets', { params: cleanParams({ status, priority, type, page, limit }) })
    .then((r) => {
      const body = r.data || {};
      const data = (body.data || []).map(adaptTicket);
      return { data, total: body.total ?? data.length };
    });
}

function getTicket(id) {
  return api.get(`/admin/support/tickets/${id}`).then((r) => adaptTicket(r.data));
}

function reply(id, body, { resolve = false } = {}) {
  return api
    .post(`/admin/support/tickets/${id}/reply`, { body, resolve: !!resolve })
    .then((r) => adaptTicket(r.data));
}

function setStatus(id, status) {
  return api.patch(`/admin/support/tickets/${id}/status`, { status }).then((r) => adaptTicket(r.data));
}

function assignTicket(id, assigned_to) {
  return api
    .patch(`/admin/support/tickets/${id}/assign`, { assigned_to })
    .then((r) => adaptTicket(r.data));
}

// ── Signalements de questions ────────────────────────────────────────────────

function listReports({ status, page, limit } = {}) {
  return api
    .get('/admin/support/reports', { params: cleanParams({ status, page, limit }) })
    .then((r) => {
      const body = r.data || {};
      return { data: (body.data || []).map(adaptReport), total: body.total ?? 0 };
    });
}

function updateReportStatus(id, status) {
  return api.patch(`/admin/support/reports/${id}/status`, { status }).then((r) => r.data);
}

// ── KPIs / stats / activité ──────────────────────────────────────────────────

function kpi() {
  return api.get('/admin/support/kpis').then((r) => {
    const k = r.data || {};
    // SupportPage attend `pending` ; le backend l'expose sous `in_progress`.
    return {
      open: k.open ?? 0,
      pending: k.in_progress ?? 0,
      resolved_today: k.resolved_today ?? 0,
      avg_resolution_min: k.avg_resolution_min ?? 0,
    };
  });
}

/** Pas d'endpoint stats : on dérive de la liste des tickets (group by type + par jour). */
async function stats() {
  const { data } = await listTickets({ limit: 100 });
  const typeMap = {};
  const dayMap = {};
  data.forEach((tk) => {
    if (tk.type) typeMap[tk.type] = (typeMap[tk.type] || 0) + 1;
    const day = tk.created_at ? String(tk.created_at).slice(0, 10) : null;
    if (day) dayMap[day] = (dayMap[day] || 0) + 1;
  });
  return {
    by_type: Object.entries(typeMap).map(([type, n]) => ({ type, n })),
    daily: Object.entries(dayMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, tickets]) => ({ date, tickets })),
  };
}

/** Pas d'endpoint d'activité dédié pour l'instant. */
function activity() {
  return Promise.resolve([]);
}

export default {
  listTickets,
  getTicket,
  reply,
  setStatus,
  assignTicket,
  listReports,
  updateReportStatus,
  kpi,
  stats,
  activity,
};
