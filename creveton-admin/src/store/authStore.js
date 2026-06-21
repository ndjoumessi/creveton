import { create } from 'zustand';
import { setTokens, getTokens } from '../services/api';
import * as authService from '../services/auth.service';

const USER_KEY = 'creveton_admin_user';

function loadUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY)) || null;
  } catch {
    return null;
  }
}

// Rôles autorisés à accéder à la console (CDC §3.7).
const ADMIN_ROLES = ['moderator', 'admin', 'super_admin'];

export const useAuthStore = create((set, get) => ({
  user: loadUser(),
  tokens: getTokens(),

  isAuthenticated: () => Boolean(get().tokens?.access_token && get().user),
  isAdmin: () => ADMIN_ROLES.includes(get().user?.role),
  role: () => get().user?.role || null,

  async login(email, password) {
    const res = await authService.login(email, password);
    const tokens = {
      access_token: res.access_token,
      refresh_token: res.refresh_token,
    };
    setTokens(tokens);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    set({ user: res.user, tokens });
    return res.user;
  },

  logout() {
    setTokens(null);
    localStorage.removeItem(USER_KEY);
    set({ user: null, tokens: null });
  },
}));
