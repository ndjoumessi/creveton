// Store d'authentification — user, tokens, isAuthenticated, login, logout, refresh.

import { create } from 'zustand';
import { auth as authApi, users as usersApi } from '../services/endpoints';
import { parseApiError, setOnAuthExpired } from '../services/api';
import {
  setTokens,
  clearTokens,
  getStoredUser,
  setStoredUser,
  clearStoredUser,
  getAccessToken,
  getRefreshToken,
} from '../services/storage';

export const useAuthStore = create((set, get) => ({
  user: null,
  isAuthenticated: false,
  isBootstrapping: true, // pendant la restauration au lancement
  loading: false,
  error: null,

  // Restaure la session depuis le storage au démarrage.
  bootstrap: async () => {
    set({ isBootstrapping: true });
    const [access, refresh, user] = await Promise.all([
      getAccessToken(),
      getRefreshToken(),
      getStoredUser(),
    ]);
    if (access && refresh) {
      set({ user, isAuthenticated: true, isBootstrapping: false });
      // Rafraîchit le profil en arrière-plan (non bloquant).
      get().refreshProfile();
    } else {
      set({ isAuthenticated: false, user: null, isBootstrapping: false });
    }
  },

  // Inscription → renvoie { user_id, phone, otp_expires_at } pour l'écran OTP.
  register: async (payload) => {
    set({ loading: true, error: null });
    try {
      const data = await authApi.register(payload);
      set({ loading: false });
      return { ok: true, data };
    } catch (e) {
      const err = parseApiError(e);
      set({ loading: false, error: err.message });
      return { ok: false, error: err };
    }
  },

  // Vérification OTP → pose les tokens + user et authentifie.
  verifyOtp: async (phone, code) => {
    set({ loading: true, error: null });
    try {
      const data = await authApi.verifyOtp(phone, code);
      await get()._applySession(data);
      set({ loading: false });
      return { ok: true };
    } catch (e) {
      const err = parseApiError(e);
      set({ loading: false, error: err.message });
      return { ok: false, error: err };
    }
  },

  resendOtp: async (phone) => {
    try {
      const data = await authApi.resendOtp(phone);
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: parseApiError(e) };
    }
  },

  // Connexion email + mot de passe.
  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const data = await authApi.login(email, password);
      await get()._applySession(data);
      set({ loading: false });
      return { ok: true };
    } catch (e) {
      const err = parseApiError(e);
      set({ loading: false, error: err.message });
      return { ok: false, error: err };
    }
  },

  // Déconnexion : révoque côté serveur + purge locale.
  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      /* on purge quand même */
    }
    await clearTokens();
    await clearStoredUser();
    set({ user: null, isAuthenticated: false });
  },

  // Recharge le profil courant (GET /users/me).
  refreshProfile: async () => {
    try {
      const data = await usersApi.me();
      const user = data.user || data;
      await setStoredUser(user);
      set({ user });
      return user;
    } catch {
      return null;
    }
  },

  setUser: (user) => {
    setStoredUser(user);
    set({ user });
  },

  // Applique une réponse de session (tokens + user).
  _applySession: async (data) => {
    await setTokens({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    });
    const user = data.user || null;
    if (user) await setStoredUser(user);
    set({ user, isAuthenticated: true });
  },
}));

// Branche l'expiration de session (refresh échoué) → logout automatique.
setOnAuthExpired(() => {
  useAuthStore.setState({ user: null, isAuthenticated: false });
  clearStoredUser();
});

export default useAuthStore;
