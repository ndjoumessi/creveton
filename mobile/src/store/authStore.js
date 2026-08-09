// Store d'authentification — user, tokens, isAuthenticated, login, logout, refresh.

import { create } from 'zustand';
import { auth as authApi, users as usersApi } from '../services/endpoints';
import { parseApiError, setOnAuthExpired } from '../services/api';
import { setLanguage } from '../i18n';
import {
  setTokens,
  clearTokens,
  getStoredUser,
  setStoredUser,
  clearStoredUser,
  getAccessToken,
  getRefreshToken,
  setLastEmail,
  updateSavedPasswordIfAny,
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

  // Mot de passe oublié — demande d'un code. Le serveur ne dit jamais si le
  // compte existe : on renvoie donc toujours ok, sauf échec réseau ou 429.
  forgotPassword: async (email) => {
    try {
      await authApi.forgotPassword(email);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: parseApiError(e) };
    }
  },

  // Validation du code + nouveau mot de passe. Le serveur renvoie des tokens :
  // on ouvre directement la session, comme après un login.
  resetPassword: async ({ email, code, newPassword }) => {
    set({ loading: true, error: null });
    try {
      const data = await authApi.resetPassword({
        email,
        code,
        new_password: newPassword,
      });
      await get()._applySession(data);
      await setLastEmail(email);
      // Le mot de passe enregistré sur l'écran de connexion vient de devenir
      // faux. Sans cette ligne, le prochain lancement pré-remplirait l'ancien
      // et échouerait — un « mot de passe oublié » réussi rendrait l'app
      // inutilisable jusqu'à ce qu'on pense à vider le champ à la main.
      await updateSavedPasswordIfAny(newPassword);
      set({ loading: false });
      return { ok: true };
    } catch (e) {
      const err = parseApiError(e);
      set({ loading: false, error: err.message });
      return { ok: false, error: err };
    }
  },

  // Connexion email + mot de passe.
  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const data = await authApi.login(email, password);
      await get()._applySession(data);
      await setLastEmail(email); // pré-remplissage du champ au prochain lancement
      set({ loading: false });
      return { ok: true };
    } catch (e) {
      const err = parseApiError(e);
      set({ loading: false, error: err.message });
      return { ok: false, error: err };
    }
  },

  // Déconnexion : révoque côté serveur + purge locale.
  //
  // Le mot de passe enregistré (case du Login) N'EST PAS effacé ici, et c'est
  // délibéré : c'est exactement le cas d'usage de la case. L'effacer à la
  // déconnexion la viderait de son sens — il ne resterait que l'expiration de
  // session, où l'utilisateur ne passe justement pas par ce bouton. Pour
  // retirer le secret, on décoche (effacement immédiat).
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
      if (user?.lang) await setLanguage(user.lang);
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

  // Fusion partielle dans le user courant (sans refetch) — utilisé après un PATCH
  // /users/me ou un upload d'avatar pour refléter le changement localement.
  updateUser: (partial) => {
    if (!partial) return;
    const merged = { ...get().user, ...partial };
    setStoredUser(merged);
    set({ user: merged });
  },

  // Applique une réponse de session (tokens + user).
  _applySession: async (data) => {
    await setTokens({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    });
    const user = data.user || null;
    if (user) await setStoredUser(user);
    // Priorité langue : profil (user.lang) > AsyncStorage > système.
    if (user?.lang) await setLanguage(user.lang);
    set({ user, isAuthenticated: true });
  },
}));

// Branche l'expiration de session (refresh échoué) → logout automatique.
setOnAuthExpired(() => {
  useAuthStore.setState({ user: null, isAuthenticated: false });
  clearStoredUser();
});

export default useAuthStore;
