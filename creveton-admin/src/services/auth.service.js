import api, { USE_MOCKS } from './api';

/** Connexion admin (POST /auth/login → JWT). */
export async function login(email, password) {
  try {
    const { data } = await api.post('/auth/login', { email, password });
    return data; // { access_token, refresh_token, token_type, expires_in, user }
  } catch (err) {
    // ----------------------------------------------------------------------
    // FAIL-CLOSED — la session démo hors-ligne n'est JAMAIS un contournement
    // d'authentification. Trois verrous cumulatifs :
    //   1. import.meta.env.DEV : en PRODUCTION (DEV === false) → throw
    //      systématique, aucun fallback possible (le code mort est par ailleurs
    //      éliminé du build).
    //   2. USE_MOCKS : opt-in explicite (VITE_USE_MOCKS=true), dev uniquement.
    //   3. backend GENUINEMENT injoignable (!err.response) : si le backend a
    //      RÉPONDU — y compris 401/403/4xx/5xx — on relaie l'erreur réelle. Un
    //      mauvais mot de passe ne doit jamais ouvrir de session.
    // ----------------------------------------------------------------------
    const backendResponded = Boolean(err?.response);
    if (import.meta.env.DEV && USE_MOCKS && !backendResponded) {
      return {
        access_token: 'demo-access',
        refresh_token: 'demo-refresh',
        token_type: 'Bearer',
        expires_in: 3600,
        user: {
          id: 'demo-admin',
          name: 'Admin Démo (hors-ligne)',
          email: email || 'admin@creveton.cm',
          role: 'super_admin',
          level: 5,
        },
      };
    }
    throw err;
  }
}

/** POST /auth/change-password — change le mot de passe du compte connecté. */
export async function changePassword(currentPassword, newPassword) {
  const { data } = await api.post('/auth/change-password', {
    current_password: currentPassword,
    new_password: newPassword,
  });
  return data;
}

export default { login, changePassword };
