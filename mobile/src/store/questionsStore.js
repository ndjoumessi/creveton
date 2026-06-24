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
  // Renvoie { questions, warning? } ou { error: 'notEnough' | 'noQuestions' }.
  // `warning: 'offline'` = le cache local était insuffisant ET le repli API a
  // échoué (backend injoignable / hors-ligne). On joue quand même avec le cache,
  // mais le caller affiche un avertissement non bloquant (sinon l'échec du
  // top-up est silencieux et l'utilisateur croit qu'il manque des questions).
  drawForMode: async ({ mode = 'normal', theme = null, level = null }) => {
    const isMixed = TIMED_MODES.includes(mode);
    const count = isMixed ? MODE_QUESTION_COUNT[mode] : GAME.questionsPerSession;
    const drawParams = isMixed ? { count } : { theme, level, count };

    let qs = await getQuestions(drawParams);
    let warning = null;
    if (!qs || qs.length < count) {
      try {
        const resp = await questionsApi.fetch(drawParams);
        if (resp?.data?.length) qs = resp.data;
      } catch {
        // Repli API impossible : on garde le cache local mais on signale la
        // panne de connectivité au caller (top-up non effectué).
        warning = 'offline';
      }
    }
    // Marathon : exactement 20 questions exigées côté serveur.
    if (mode === 'marathon' && (!qs || qs.length < MODE_QUESTION_COUNT.marathon)) {
      return { error: 'notEnough' };
    }
    if (!qs || !qs.length) return { error: 'noQuestions' };
    if (isMixed) qs = qs.slice(0, count); // borne stricte (marathon = 20)
    // Cache toujours en deçà du compte visé après un top-up raté → avertir.
    if (warning && qs.length < count) return { questions: qs, warning };
    return { questions: qs };
  },
}));

export default useQuestionsStore;
