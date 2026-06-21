import { USE_MOCKS } from './api';

/**
 * GET /health (hors /api/v1 — proxifié par Vite). Renvoie status + checks +
 * system { uptime_s, node, postgres }. Repli démo si injoignable.
 */
export async function get() {
  try {
    const res = await fetch('/health', { headers: { Accept: 'application/json' } });
    return await res.json();
  } catch (err) {
    if (USE_MOCKS) {
      return {
        status: 'ok',
        checks: { db: 'up', redis: 'up' },
        system: { uptime_s: 4231, node: 'v20.x', postgres: 'PostgreSQL 16' },
      };
    }
    throw err;
  }
}

export default { get };
