// Regroupe les appels API par domaine (auth, questions, sessions, etc.).
// Chaque fonction renvoie response.data ; les erreurs remontent telles quelles
// (à parser avec parseApiError).

import api from './api';
import { getAccessToken } from './storage';
import { API_URL } from '../constants/config';

// --- Auth (API §4) -------------------------------------------------------
export const auth = {
  register: (payload) => api.post('/auth/register', payload).then((r) => r.data),
  verifyOtp: (phone, code) =>
    api.post('/auth/verify-otp', { phone, code }).then((r) => r.data),
  resendOtp: (phone) =>
    api.post('/auth/resend-otp', { phone }).then((r) => r.data),
  login: (email, password) =>
    api.post('/auth/login', { email, password }).then((r) => r.data),
  logout: () => api.post('/auth/logout').then((r) => r.data),
};

// --- Questions & sync (API §5) ------------------------------------------
export const questions = {
  fetch: ({ theme, level, count }) =>
    api
      .get('/questions', { params: { theme, level, count } })
      .then((r) => r.data),
  delta: (since) =>
    api.get('/questions/delta', { params: { since } }).then((r) => r.data),
  all: (params) => api.get('/questions/all', { params }).then((r) => r.data),
};

// --- Sessions (API §6) ---------------------------------------------------
export const sessions = {
  // Feedback immédiat par question (mode normal).
  // payload: { question_id, selected_index, elapsed_ms, mode, session_id }
  // → { correct, correct_index, explanation, points_earned, speed_bonus, streak, session_id }
  answer: (payload) =>
    api.post('/sessions/answer', payload).then((r) => r.data),
  submit: (payload) =>
    api.post('/sessions/submit', payload).then((r) => r.data),
};

// --- Classement (API §7) -------------------------------------------------
export const leaderboard = {
  get: (params) => api.get('/leaderboard', { params }).then((r) => r.data),
};

// --- Tournois (API §8) ---------------------------------------------------
export const tournaments = {
  list: (params) => api.get('/tournaments', { params }).then((r) => r.data),
  detail: (id) => api.get(`/tournaments/${id}`).then((r) => r.data),
  join: (id, payment, idempotencyKey) =>
    api
      .post(
        `/tournaments/${id}/join`,
        { payment },
        { headers: { 'Idempotency-Key': idempotencyKey } }
      )
      .then((r) => r.data),
};

// --- Challenges (API §9) -------------------------------------------------
export const challenges = {
  create: (payload) =>
    api.post('/challenges/create', payload).then((r) => r.data),
  accept: (id) => api.post(`/challenges/${id}/accept`).then((r) => r.data),
  submit: (id, payload) =>
    api.post(`/challenges/${id}/submit`, payload).then((r) => r.data),
};

// --- Profil & utilisateur (API §10) -------------------------------------
export const users = {
  me: () => api.get('/users/me').then((r) => r.data),
  update: (payload) => api.patch('/users/me', payload).then((r) => r.data),
  history: (params) =>
    api.get('/users/me/history', { params }).then((r) => r.data),
  transactions: (params) =>
    api.get('/users/me/transactions', { params }).then((r) => r.data),
  // Téléverse une photo de profil (multipart, champ « avatar ») → { avatar_url }.
  //
  // On passe par `fetch` (et NON axios) : l'instance axios force un
  // Content-Type par défaut ; le surcharger en 'multipart/form-data' sans
  // boundary casse le parsing serveur (multer → « Boundary not found » → 500).
  // En ne fixant AUCUN Content-Type, React Native génère lui-même l'en-tête
  // multipart avec le bon boundary. On reforme une erreur compatible
  // parseApiError (error.response.data.error).
  uploadAvatar: async (formData) => {
    const token = await getAccessToken();
    const res = await fetch(`${API_URL}/users/me/avatar`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* réponse non-JSON */
    }
    if (!res.ok) {
      const e = new Error(data?.error?.message || `HTTP ${res.status}`);
      e.response = { status: res.status, data };
      throw e;
    }
    return data;
  },
};

// --- Wallet (API §11, flag) ---------------------------------------------
export const wallet = {
  get: () => api.get('/wallet').then((r) => r.data),
  recharge: (payload, idempotencyKey) =>
    api
      .post('/wallet/recharge', payload, {
        headers: { 'Idempotency-Key': idempotencyKey },
      })
      .then((r) => r.data),
};

export default {
  auth,
  questions,
  sessions,
  leaderboard,
  tournaments,
  challenges,
  users,
  wallet,
};
