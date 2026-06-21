import { create } from 'zustand';
import { setSession, clearSession, hasSession } from '../services/api';
import * as authService from '../services/auth.service';

// Profil admin courant : sessionStorage (lié à la durée de l'onglet, comme le
// refresh_token). Ce n'est pas un credential, mais on aligne son cycle de vie
// sur la session. Aucun JWT n'est écrit ici (cf. services/api.js).
const USER_KEY = 'creveton_admin_user';

function loadUser() {
  try {
    return JSON.parse(sessionStorage.getItem(USER_KEY)) || null;
  } catch {
    return null;
  }
}

// Rôles autorisés à accéder à la console (CDC §3.7).
const ADMIN_ROLES = ['moderator', 'admin', 'super_admin'];

export const useAuthStore = create((set, get) => ({
  user: loadUser(),

  // Authentifié tant qu'un refresh_token est présent (l'access_token, lui, vit
  // en mémoire et est re-dérivé via /auth/refresh après un rechargement).
  isAuthenticated: () => hasSession() && Boolean(get().user),
  isAdmin: () => ADMIN_ROLES.includes(get().user?.role),
  role: () => get().user?.role || null,

  async login(email, password) {
    const res = await authService.login(email, password);
    setSession({ access_token: res.access_token, refresh_token: res.refresh_token });
    sessionStorage.setItem(USER_KEY, JSON.stringify(res.user));
    set({ user: res.user });
    return res.user;
  },

  logout() {
    clearSession();
    sessionStorage.removeItem(USER_KEY);
    set({ user: null });
  },
}));
