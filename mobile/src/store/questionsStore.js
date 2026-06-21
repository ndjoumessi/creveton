// Store de synchronisation des questions — cache local, lastSyncAt, statut.
// Le contenu des questions vit dans SQLite ; ce store ne porte que les métas
// de sync pour piloter l'UI (badge « synchronisation… », compteur, erreurs).

import { create } from 'zustand';
import { getQuestions } from '../services/database';

export const useQuestionsStore = create((set) => ({
  count: 0, // nombre de questions actives en cache
  lastSyncAt: null, // ISO de la dernière synchro réussie
  status: 'idle', // 'idle' | 'syncing' | 'error'
  error: null,

  setCount: (count) => set({ count }),
  setLastSyncAt: (lastSyncAt) => set({ lastSyncAt }),
  setStatus: (status) => set({ status }),
  setError: (error) => set({ error }),

  // Tirage local pour démarrer une partie (mode hybride).
  drawQuestions: async ({ theme, level, count = 10 }) =>
    getQuestions({ theme, level, count }),
}));

export default useQuestionsStore;
