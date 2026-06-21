import axios from 'axios';

/**
 * Client HTTP central. baseURL depuis VITE_API_URL (sinon /api/v1 proxifié).
 * Intercepteurs : injection du JWT, refresh automatique sur 401, et redirection
 * vers /login si le refresh échoue.
 */

const baseURL = import.meta.env.VITE_API_URL || '/api/v1';
// Fail-closed : les mocks ne s'activent QUE sur un build de dev ET avec opt-in
// explicite. Un build de production (import.meta.env.DEV === false) ne peut
// jamais les activer, quelle que soit la variable d'environnement.
export const USE_MOCKS =
  import.meta.env.DEV && import.meta.env.VITE_USE_MOCKS === 'true';

/* ----------------------------------------------------------------------------
 * Stockage des tokens — mitigation XSS (sécurité)
 *
 * CHOIX RETENU :
 *   - access_token  → EN MÉMOIRE uniquement (variable module ci-dessous),
 *                     jamais persisté. Perdu au rechargement → re-dérivé via
 *                     /auth/refresh. Inatteignable par lecture de storage.
 *   - refresh_token → sessionStorage (et NON localStorage) : effacé à la
 *                     fermeture de l'onglet, non partagé entre onglets → fenêtre
 *                     d'exposition réduite.
 *
 * POURQUOI PAS localStorage : tout script de la page (donc un XSS) peut lire
 * localStorage et exfiltrer un refresh_token longue durée (30 j). On évite ça.
 *
 * IDÉAL (non réalisable côté front seul, à migrer) : refresh_token dans un
 * cookie HttpOnly + Secure + SameSite=Strict posé par le BACKEND, totalement
 * invisible au JavaScript. Le backend renvoie aujourd'hui les tokens en JSON ;
 * dès qu'il posera ce cookie, supprimer le stockage sessionStorage ci-dessous
 * et laisser le navigateur transporter le refresh_token automatiquement.
 * ------------------------------------------------------------------------- */

const RT_KEY = 'creveton_admin_rt';
let accessToken = null; // mémoire seule — jamais écrit dans un storage

export function getAccessToken() {
  return accessToken;
}

export function getRefreshToken() {
  try {
    return sessionStorage.getItem(RT_KEY);
  } catch {
    return null;
  }
}

/** Une session est considérée présente tant qu'un refresh_token existe. */
export function hasSession() {
  return Boolean(getRefreshToken());
}

export function setSession({ access_token, refresh_token } = {}) {
  if (access_token !== undefined) accessToken = access_token;
  if (refresh_token) {
    try {
      sessionStorage.setItem(RT_KEY, refresh_token);
    } catch {
      /* sessionStorage indisponible — la session restera en mémoire seule */
    }
  }
}

export function clearSession() {
  accessToken = null;
  try {
    sessionStorage.removeItem(RT_KEY);
  } catch {
    /* ignore */
  }
}

const api = axios.create({ baseURL, timeout: 15000 });

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

let refreshing = null;

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const { config, response } = error;
    if (response?.status === 401 && !config.__retried) {
      const refreshToken = getRefreshToken();
      if (refreshToken) {
        try {
          config.__retried = true;
          refreshing =
            refreshing ||
            axios.post(`${baseURL}/auth/refresh`, { refresh_token: refreshToken });
          const { data } = await refreshing;
          refreshing = null;
          accessToken = data.access_token; // re-stocké en mémoire seule
          config.headers.Authorization = `Bearer ${accessToken}`;
          return api(config);
        } catch (e) {
          refreshing = null;
          clearSession();
          if (window.location.pathname !== '/login') window.location.assign('/login');
          return Promise.reject(e);
        }
      }
    }
    return Promise.reject(error);
  },
);

/**
 * Exécute un appel API ; en mode démo (USE_MOCKS), retombe sur les données mock
 * si le backend est injoignable — l'app reste utilisable sans backend.
 */
export async function withMock(fetcher, mock) {
  if (!USE_MOCKS) return fetcher();
  try {
    return await fetcher();
  } catch {
    return typeof mock === 'function' ? mock() : mock;
  }
}

export default api;
