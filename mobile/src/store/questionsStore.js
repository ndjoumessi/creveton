// Store de synchronisation des questions — cache local, lastSyncAt, statut.
// Le contenu des questions vit dans SQLite ; ce store ne porte que les métas
// de sync pour piloter l'UI (badge « synchronisation… », compteur, erreurs).

import { create } from 'zustand';
import { getQuestions } from '../services/database';
import { questions as questionsApi } from '../services/endpoints';
import { TIMED_MODES, MODE_QUESTION_COUNT, GAME } from '../constants/config';

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

  // Tirage complet pour un mode donné — flux unique partagé par l'écran « Jouer »
  // ET « Rejouer » (ResultsScreen). Cache local d'abord, repli API si insuffisant.
  // Modes mixtes (blitz/marathon) : tous thèmes/niveaux confondus, count imposé.
  // Renvoie { questions } ou { error: 'notEnough' | 'noQuestions' }.
  drawForMode: async ({ mode = 'normal', theme = null, level = null }) => {
    const isMixed = TIMED_MODES.includes(mode);
    const count = isMixed ? MODE_QUESTION_COUNT[mode] : GAME.questionsPerSession;
    const drawParams = isMixed ? { count } : { theme, level, count };

    let qs = await getQuestions(drawParams);
    if (!qs || qs.length < count) {
      try {
        const resp = await questionsApi.fetch(drawParams);
        if (resp?.data?.length) qs = resp.data;
      } catch {
        /* hors-ligne : on garde le cache local */
      }
    }
    // Marathon : exactement 20 questions exigées côté serveur.
    if (mode === 'marathon' && (!qs || qs.length < MODE_QUESTION_COUNT.marathon)) {
      return { error: 'notEnough' };
    }
    if (!qs || !qs.length) return { error: 'noQuestions' };
    if (isMixed) qs = qs.slice(0, count); // borne stricte (marathon = 20)
    return { questions: qs };
  },
}));

export default useQuestionsStore;
