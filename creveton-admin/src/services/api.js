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

const TOKENS_KEY = 'creveton_admin_tokens';

export function getTokens() {
  try {
    return JSON.parse(localStorage.getItem(TOKENS_KEY)) || null;
  } catch {
    return null;
  }
}
export function setTokens(tokens) {
  if (tokens) localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
  else localStorage.removeItem(TOKENS_KEY);
}

const api = axios.create({ baseURL, timeout: 15000 });

api.interceptors.request.use((config) => {
  const tokens = getTokens();
  if (tokens?.access_token) {
    config.headers.Authorization = `Bearer ${tokens.access_token}`;
  }
  return config;
});

let refreshing = null;

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const { config, response } = error;
    if (response?.status === 401 && !config.__retried) {
      const tokens = getTokens();
      if (tokens?.refresh_token) {
        try {
          config.__retried = true;
          refreshing =
            refreshing ||
            axios.post(`${baseURL}/auth/refresh`, { refresh_token: tokens.refresh_token });
          const { data } = await refreshing;
          refreshing = null;
          setTokens({ ...tokens, access_token: data.access_token });
          config.headers.Authorization = `Bearer ${data.access_token}`;
          return api(config);
        } catch (e) {
          refreshing = null;
          setTokens(null);
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
