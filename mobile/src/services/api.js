// Client API axios — baseURL depuis .env + 3 intercepteurs :
//   1. injection du Bearer access_token
//   2. refresh automatique sur 401 (token expiré) puis rejeu de la requête
//   3. retry exponentiel sur 503 (Mobile Money / SMS indisponible)
//
// Le module ne dépend pas du store zustand pour éviter les cycles : il lit
// les tokens depuis storage et notifie l'app d'un échec de refresh via un
// callback enregistrable (setOnAuthExpired).

import axios from 'axios';
import { API_URL, RETRY } from '../constants/config';
import {
  getAccessToken,
  getRefreshToken,
  setTokens,
  clearTokens,
} from './storage';

const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
});

// Callback déclenché quand le refresh échoue → l'app doit déconnecter.
let onAuthExpired = null;
export function setOnAuthExpired(cb) {
  onAuthExpired = cb;
}

// --- Intercepteur requête : injecte le Bearer token ----------------------
api.interceptors.request.use(async (config) => {
  const token = await getAccessToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// --- Gestion du refresh (single-flight pour éviter les refresh parallèles) -
let refreshPromise = null;

async function refreshAccessToken() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const refresh_token = await getRefreshToken();
    if (!refresh_token) throw new Error('NO_REFRESH_TOKEN');
    // Instance brute : pas d'intercepteur (évite la récursion).
    const resp = await axios.post(
      `${API_URL}/auth/refresh`,
      { refresh_token },
      { headers: { 'Content-Type': 'application/json' } }
    );
    const { access_token } = resp.data || {};
    if (!access_token) throw new Error('REFRESH_FAILED');
    await setTokens({ access_token });
    return access_token;
  })();
  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Intercepteur réponse : 401 → refresh, 503 → retry -------------------
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;
    if (!config) return Promise.reject(error);
    const status = response?.status;
    const code = response?.data?.error?.code;

    // 1) 401 token expiré → refresh + rejeu (une seule fois par requête)
    const isAuthRoute = config.url?.includes('/auth/');
    if (
      status === 401 &&
      !config._retriedAuth &&
      !isAuthRoute &&
      code !== 'REFRESH_TOKEN_INVALID' &&
      code !== 'REFRESH_TOKEN_EXPIRED'
    ) {
      config._retriedAuth = true;
      try {
        const newToken = await refreshAccessToken();
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${newToken}`;
        return api(config);
      } catch (e) {
        await clearTokens();
        if (onAuthExpired) onAuthExpired();
        return Promise.reject(error);
      }
    }

    // 2) 503 service tiers indisponible → retry exponentiel
    if (status === 503) {
      config._retryCount = config._retryCount || 0;
      if (config._retryCount < RETRY.maxRetries) {
        config._retryCount += 1;
        const delay =
          RETRY.baseDelayMs * 2 ** (config._retryCount - 1) +
          Math.floor(Math.random() * 300);
        await sleep(delay);
        return api(config);
      }
    }

    return Promise.reject(error);
  }
);

// Normalise une erreur axios → { code, message, status, details }
export function parseApiError(error) {
  const status = error?.response?.status;
  const err = error?.response?.data?.error;
  if (err) {
    return {
      status,
      code: err.code || 'UNKNOWN',
      message: err.message || 'Une erreur est survenue.',
      details: err.details || [],
      requestId: err.request_id,
    };
  }
  if (error?.code === 'ECONNABORTED') {
    return { status: 0, code: 'TIMEOUT', message: 'Délai dépassé.' };
  }
  return {
    status: status || 0,
    code: 'NETWORK_ERROR',
    message: 'Connexion impossible. Vérifie ta connexion internet.',
  };
}

export default api;
