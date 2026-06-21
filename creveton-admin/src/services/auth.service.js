import api, { USE_MOCKS } from './api';

/** Connexion admin (POST /auth/login → JWT). */
export async function login(email, password) {
  try {
    const { data } = await api.post('/auth/login', { email, password });
    return data; // { access_token, refresh_token, token_type, expires_in, user }
  } catch (err) {
    // Démo locale UNIQUEMENT : session admin fictive pour explorer l'UI quand
    // aucun backend n'est lancé. Conditions strictes pour éviter tout
    // contournement d'authentification :
    //   - USE_MOCKS (déjà borné à import.meta.env.DEV dans api.js)
    //   - le backend est réellement injoignable (err.response absent). On ne
    //     retombe JAMAIS sur la démo si le backend a répondu (401/403/…), sinon
    //     un mauvais mot de passe ouvrirait une session super_admin.
    const backendUnreachable = !err?.response;
    if (USE_MOCKS && backendUnreachable) {
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
