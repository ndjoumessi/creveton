import { USE_MOCKS } from './api';

/**
 * URL du health-check backend. `/health` vit à la RACINE de l'API (hors /api/v1).
 * En PROD, `VITE_API_URL` est absolu (…/api/v1) : on retire le suffixe `/api/v1`
 * pour viser `…/health` sur l'origine BACKEND (pas l'origine de la console admin,
 * servie par nginx sans proxy /health → renverrait index.html). En DEV
 * (`VITE_API_URL` absent), on garde le chemin relatif `/health`, proxifié vers
 * le backend :4000 par Vite.
 */
const API_BASE = import.meta.env.VITE_API_URL || '';
export const HEALTH_URL = API_BASE ? `${API_BASE.replace(/\/api\/v1\/?$/, '')}/health` : '/health';

/**
 * GET /health → { status, checks:{db,redis}, system:{uptime_s,node,postgres} }.
 * Le backend renvoie 200 (ok) OU 503 (degraded) : les DEUX portent la même
 * structure `checks`/`system` → on parse dans les deux cas (fetch ne rejette
 * que sur erreur réseau). Une réponse NON-JSON (ex. index.html si le proxy
 * /health manque) est traitée comme injoignable. Repli démo si `USE_MOCKS`.
 */
export async function get() {
  try {
    const res = await fetch(HEALTH_URL, { headers: { Accept: 'application/json' } });
    const ctype = res.headers.get('content-type') || '';
    if (!ctype.includes('application/json')) {
      throw new Error('health: réponse non-JSON (proxy /health manquant ?)');
    }
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
