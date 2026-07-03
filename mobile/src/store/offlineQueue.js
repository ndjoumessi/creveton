// File d'attente des parties jouées HORS LIGNE — persistée (AsyncStorage) pour
// survivre à un redémarrage de l'app. Quand la connexion revient, `syncPending`
// rejoue chaque partie via POST /sessions/submit puis la retire de la file.
//
// On stocke le payload BRUT de soumission (mode/theme/level/started_at/
// session_id/answers) sous `payload` — surtout pas les champs locaux (id,
// queued_at) que le backend rejetterait (validation Joi stricte).

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sessions as sessionsApi } from '../services/endpoints';
import { parseApiError } from '../services/api';

// Identifiant local unique sans Math.random (déterministe + compteur).
let seq = 0;
const localId = () => `offline_${Date.now()}_${(seq += 1)}`;

export const useOfflineQueue = create(
  persist(
    (set, get) => ({
      pendingSessions: [], // [{ id, queued_at, payload }]

      addSession: (payload) => set((state) => ({
        pendingSessions: [
          ...state.pendingSessions,
          { id: localId(), queued_at: new Date().toISOString(), payload },
        ],
      })),

      removeSession: (id) => set((state) => ({
        pendingSessions: state.pendingSessions.filter((s) => s.id !== id),
      })),

      clearAll: () => set({ pendingSessions: [] }),

      // Rejoue les parties en attente. Idempotent vis-à-vis des échecs : une
      // partie qui échoue reste en file (réessayée au prochain retour en ligne).
      syncPending: async () => {
        const { pendingSessions, removeSession } = get();
        if (pendingSessions.length === 0) return { synced: 0, failed: 0 };

        let synced = 0;
        let failed = 0;
        for (const item of pendingSessions) {
          try {
            await sessionsApi.submit(item.payload);
            removeSession(item.id);
            synced += 1;
          } catch (e) {
            // SESSION_ALREADY_SUBMITTED (409) = la partie a DÉJÀ été enregistrée
            // serveur (souvent : soumission en ligne réussie mais expirée côté
            // client → mise en file à tort). On la retire de la file comme un
            // succès, sinon elle rejoue et re-409 à chaque reconnexion (file
            // empoisonnée). Tout autre échec reste en file pour un prochain essai.
            if (parseApiError(e).code === 'SESSION_ALREADY_SUBMITTED') {
              removeSession(item.id);
              synced += 1;
            } else {
              failed += 1;
            }
          }
        }
        return { synced, failed };
      },
    }),
    {
      name: 'creveton-offline-queue',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ pendingSessions: state.pendingSessions }),
    },
  ),
);

export default useOfflineQueue;
