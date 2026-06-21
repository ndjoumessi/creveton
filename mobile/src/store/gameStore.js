// Store de la partie en cours — session, réponses, score local, streak, timer.
// Le score affiché localement est indicatif : le serveur recalcule tout à la
// soumission (timer serveur-authoritative, anti-triche — API §6).

import { create } from 'zustand';
import { sessions as sessionsApi } from '../services/endpoints';
import { parseApiError } from '../services/api';

const initial = {
  mode: 'normal', // normal | tournament | challenge
  theme: null,
  level: null,
  questions: [],
  currentIndex: 0,
  answers: [], // { question_id, selected_index, elapsed_ms, skipped }
  // Anti-triche : correct_index n'est jamais renvoyé pendant la partie (API §5).
  // On ne peut donc pas calculer le score localement — le serveur fait foi.
  // On suit en revanche une « série » d'engagement : questions répondues
  // d'affilée dans les temps (ni passées, ni timeout).
  streak: 0,
  streakMax: 0,
  startedAt: null,
  sessionId: null, // renvoyé par /sessions/answer, réutilisé jusqu'au submit
  result: null, // réponse de /sessions/submit
  submitting: false,
  error: null,
};

export const useGameStore = create((set, get) => ({
  ...initial,

  // Démarre une nouvelle partie avec un set de questions déjà tiré.
  startGame: ({ mode = 'normal', theme, level, questions }) => {
    set({
      ...initial,
      mode,
      theme,
      level,
      questions: questions || [],
      startedAt: new Date().toISOString(),
    });
  },

  // Enregistre une réponse pour la question courante.
  // `selectedIndex` = null si timeout ; `skipped` = bouton Passer.
  answerCurrent: ({ selectedIndex, elapsedMs, skipped = false }) => {
    const { questions, currentIndex, answers, streak, streakMax } = get();
    const q = questions[currentIndex];
    if (!q) return;

    const answer = {
      question_id: q.id,
      selected_index: selectedIndex,
      elapsed_ms: Math.round(elapsedMs),
      skipped,
    };

    // Série d'engagement : une vraie réponse (non passée, non timeout) la
    // prolonge, sinon elle se réinitialise.
    const engaged = !skipped && selectedIndex !== null;
    const nextStreak = engaged ? streak + 1 : 0;

    set({
      answers: [...answers, answer],
      streak: nextStreak,
      streakMax: Math.max(streakMax, nextStreak),
    });
  },

  // Mémorise l'id de session renvoyé par /sessions/answer (1re réponse).
  setSessionId: (sessionId) => {
    if (sessionId && !get().sessionId) set({ sessionId });
  },

  next: () => set((s) => ({ currentIndex: s.currentIndex + 1 })),

  isLastQuestion: () => {
    const { currentIndex, questions } = get();
    return currentIndex >= questions.length - 1;
  },

  // Soumet la partie au serveur ; stocke le résultat officiel.
  submit: async () => {
    const { mode, theme, level, startedAt, answers, sessionId } = get();
    set({ submitting: true, error: null });
    try {
      const result = await sessionsApi.submit({
        mode,
        theme,
        level,
        started_at: startedAt,
        session_id: sessionId || undefined,
        answers,
      });
      set({ result, submitting: false });
      return { ok: true, result };
    } catch (e) {
      const err = parseApiError(e);
      set({ submitting: false, error: err.message });
      return { ok: false, error: err };
    }
  },

  reset: () => set({ ...initial }),
}));

export default useGameStore;
