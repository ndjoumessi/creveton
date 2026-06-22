// Hook de notifications push : enregistre le token Expo côté backend et route les
// taps de notification vers le bon écran (deep link). S'appuie sur le service
// notifications.js existant (permission + token + listeners) — pas de duplication.

import { useEffect } from 'react';
import {
  registerForPushNotifications,
  attachNotificationListeners,
} from '../services/notifications';
import { users as usersApi } from '../services/endpoints';
import { useAuthStore } from '../store/authStore';
import { navigationRef } from '../navigation/navigationRef';

/**
 * Route un message data-only (tap) vers l'écran correspondant.
 * Types backend (spec §14) : tournament_start, challenge_received,
 * challenge_result, level_up. (force_sync est traité en amont par le service.)
 */
function routeTap(data) {
  if (!data?.type || !navigationRef.isReady()) return;
  try {
    switch (data.type) {
      case 'tournament_start':
        if (data.tournament_id) {
          navigationRef.navigate('TournamentLive', { tournamentId: data.tournament_id });
        }
        break;
      case 'challenge_received':
      case 'challenge_result':
        navigationRef.navigate('Tabs', { screen: 'Challenges' });
        break;
      case 'level_up':
        navigationRef.navigate('Tabs', { screen: 'Profile' });
        break;
      default:
        break;
    }
  } catch {
    // Écran indisponible (ex. pile d'auth) — on ignore silencieusement.
  }
}

export function usePushNotifications() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // Écouteurs (réception + tap) montés une seule fois.
  useEffect(() => {
    const detach = attachNotificationListeners({ onTap: routeTap });
    return detach;
  }, []);

  // Token : (ré)enregistré et poussé au backend dès qu'on est authentifié
  // (PATCH /users/me nécessite une session). Non bloquant.
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    let alive = true;
    (async () => {
      const token = await registerForPushNotifications();
      if (alive && token) {
        try {
          await usersApi.update({ push_token: token });
        } catch {
          // Échec réseau / 401 : on réessaiera au prochain lancement.
        }
      }
    })();
    return () => { alive = false; };
  }, [isAuthenticated]);
}

export default usePushNotifications;
