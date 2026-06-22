/**
 * Service Finances (console admin).
 *
 * ⚠️ ÉTAT BACKEND (juin 2026) : les endpoints ci-dessous N'EXISTENT PAS encore
 * (`/admin/transactions`, `/admin/analytics/finances`, `/validate`, `/reject`,
 * `/export`). Seuls `/admin/analytics` (générique) et un `wallet.controller`
 * existent. On sert donc des DONNÉES DE DÉMONSTRATION pour que la page soit
 * complète et navigable. Chaque fonction documente l'appel réel à brancher :
 * remplacer le corps `return Promise.resolve(mock…)` par le `// TODO` indiqué.
 *
 * Les montants sont en FCFA (XAF), entiers (cf. backend transactions.currency).
 */

// ─── Données de démonstration déterministes ────────────────────────────────────
const NOW = Date.now();
const H = 3600 * 1000;
const D = 24 * H;

// 14 transactions plausibles. Les retraits `pending > 10 000 FCFA` alimentent la
// section KYC (spec §11). Statuts/types/providers couvrent tout le filtrage.
const MOCK_TRANSACTIONS = [
  { id: 'tx_1001', created_at: new Date(NOW - 2 * H).toISOString(), user_name: 'Amina Fouda', user_email: 'amina.fouda@example.cm', type: 'withdraw', amount: 25000, provider: 'orange_money', status: 'pending', reference: 'OM-9F2A71' },
  { id: 'tx_1002', created_at: new Date(NOW - 5 * H).toISOString(), user_name: 'Jean-Paul Mbida', user_email: 'jp.mbida@example.cm', type: 'withdraw', amount: 15000, provider: 'mtn_momo', status: 'pending', reference: 'MM-22C8D0' },
  { id: 'tx_1003', created_at: new Date(NOW - 9 * H).toISOString(), user_name: 'Brice Talla', user_email: 'brice.talla@example.cm', type: 'withdraw', amount: 12000, provider: 'campay', status: 'pending', reference: 'CP-7B11E4' },
  { id: 'tx_1004', created_at: new Date(NOW - 1 * D).toISOString(), user_name: 'Cédric Fotso', user_email: 'cedric.fotso@example.cm', type: 'deposit', amount: 5000, provider: 'orange_money', status: 'success', reference: 'OM-3D90AA' },
  { id: 'tx_1005', created_at: new Date(NOW - 1 * D - 3 * H).toISOString(), user_name: 'Awa Ngono', user_email: 'awa.ngono@example.cm', type: 'deposit', amount: 10000, provider: 'mtn_momo', status: 'success', reference: 'MM-61F2C3' },
  { id: 'tx_1006', created_at: new Date(NOW - 2 * D).toISOString(), user_name: 'Junior Kamga', user_email: 'junior.kamga@example.cm', type: 'entry_fee', amount: 1000, provider: 'campay', status: 'success', reference: 'CP-08AA12' },
  { id: 'tx_1007', created_at: new Date(NOW - 2 * D - 6 * H).toISOString(), user_name: 'Sandrine Eyenga', user_email: 'sandrine.eyenga@example.cm', type: 'payout', amount: 40000, provider: 'orange_money', status: 'success', reference: 'OM-55B731' },
  { id: 'tx_1008', created_at: new Date(NOW - 3 * D).toISOString(), user_name: 'Patrick Onana', user_email: 'patrick.onana@example.cm', type: 'deposit', amount: 7500, provider: 'mtn_momo', status: 'failed', reference: 'MM-9931AC' },
  { id: 'tx_1009', created_at: new Date(NOW - 3 * D - 4 * H).toISOString(), user_name: 'Mireille Atangana', user_email: 'mireille.a@example.cm', type: 'refund', amount: 1000, provider: 'campay', status: 'reversed', reference: 'CP-AB7720' },
  { id: 'tx_1010', created_at: new Date(NOW - 4 * D).toISOString(), user_name: 'Hervé Nkolo', user_email: 'herve.nkolo@example.cm', type: 'deposit', amount: 20000, provider: 'orange_money', status: 'success', reference: 'OM-77E0B9' },
  { id: 'tx_1011', created_at: new Date(NOW - 5 * D).toISOString(), user_name: 'Linda Bekono', user_email: 'linda.bekono@example.cm', type: 'withdraw', amount: 30000, provider: 'mtn_momo', status: 'success', reference: 'MM-12F4D8' },
  { id: 'tx_1012', created_at: new Date(NOW - 6 * D).toISOString(), user_name: 'Yves Mballa', user_email: 'yves.mballa@example.cm', type: 'entry_fee', amount: 1000, provider: 'campay', status: 'success', reference: 'CP-3399AF' },
  { id: 'tx_1013', created_at: new Date(NOW - 7 * D).toISOString(), user_name: 'Carine Ndongo', user_email: 'carine.ndongo@example.cm', type: 'deposit', amount: 15000, provider: 'orange_money', status: 'success', reference: 'OM-6612CD' },
  { id: 'tx_1014', created_at: new Date(NOW - 8 * D).toISOString(), user_name: 'Olivier Sime', user_email: 'olivier.sime@example.cm', type: 'withdraw', amount: 8000, provider: 'mtn_momo', status: 'failed', reference: 'MM-44AB0E' },
];

const CURRENCY = 'XAF';

/** Série journalière (30 j) déterministe — volume FCFA par jour. */
function buildDaily(days = 30) {
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(NOW - i * D);
    // Variation lissée (sinus + tendance) — pas de Math.random (déterministe).
    const base = 28000 + Math.round(9000 * Math.sin(i / 3.2) + 5000 * Math.cos(i / 6.5));
    const trend = Math.round((days - i) * 350);
    out.push({ date: date.toISOString().slice(0, 10), volume: Math.max(4000, base + trend) });
  }
  return out;
}

function buildSummary() {
  const success = MOCK_TRANSACTIONS.filter((t) => t.status === 'success');
  const deposits = success.filter((t) => t.type === 'deposit').reduce((a, t) => a + t.amount, 0);
  const withdrawals = success.filter((t) => ['withdraw', 'payout'].includes(t.type)).reduce((a, t) => a + t.amount, 0);
  const pending = MOCK_TRANSACTIONS.filter((t) => t.status === 'pending');
  return {
    volume_total: success.reduce((a, t) => a + t.amount, 0),
    deposits,
    withdrawals,
    pending_count: pending.length,
    pending_amount: pending.reduce((a, t) => a + t.amount, 0),
    currency: CURRENCY,
  };
}

/** Applique les filtres mock côté client (statut/type/provider). */
function filterRows(rows, { status, type, provider } = {}) {
  return rows.filter((t) =>
    (!status || t.status === status) &&
    (!type || t.type === type) &&
    (!provider || t.provider === provider));
}

// ─── API publique (mock → à brancher) ──────────────────────────────────────────

/** KPIs finances. TODO: api.get('/admin/analytics/finances') */
export function summary() {
  return Promise.resolve(buildSummary());
}

/** Volume journalier (N jours). TODO: api.get('/admin/analytics/finances/daily', { params: { days } }) */
export function daily(days = 30) {
  return Promise.resolve({ days, points: buildDaily(days) });
}

/**
 * Liste paginée des transactions (curseur).
 * TODO: api.get('/admin/transactions', { params: cleanParams({ status, type, provider, limit, cursor }) })
 *       → renvoie { data, page: { next_cursor, has_more } }.
 */
export function transactions(filters = {}) {
  const data = filterRows(MOCK_TRANSACTIONS, filters).map((t) => ({ ...t, currency: CURRENCY }));
  return Promise.resolve({ data, page: { next_cursor: null, has_more: false } });
}

/** Validation manuelle d'une transaction. TODO: api.post(`/admin/transactions/${id}/validate`) */
export function validate(id) {
  return Promise.resolve({ id, status: 'success' });
}

/** Rejet d'une transaction (ex. retrait KYC refusé). TODO: api.post(`/admin/transactions/${id}/reject`) */
export function reject(id) {
  return Promise.resolve({ id, status: 'failed' });
}

export default { summary, daily, transactions, validate, reject };
