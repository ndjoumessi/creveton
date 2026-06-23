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

  // Modes chronométrés (blitz/marathon) : à l'expiration du timer global, marque
  // toutes les questions non répondues comme `skipped` pour que la soumission
  // couvre le set complet (marathon = exactement 20 réponses attendues serveur).
  fillRemainingSkipped: () => {
    const { questions, answers } = get();
    const answered = new Set(answers.map((a) => a.question_id));
    const extra = questions
      .filter((q) => !answered.has(q.id))
      .map((q) => ({ question_id: q.id, selected_index: null, elapsed_ms: 0, skipped: true }));
    if (extra.length) set({ answers: [...answers, ...extra] });
  },

  isLastQuestion: () => {
    const { currentIndex, questions } = get();
    return currentIndex >= questions.length - 1;
  },

  // Soumet la partie au serveur ; stocke le résultat officiel.
  submit: async () => {
    const { mode, theme, level, startedAt, answers, sessionId } = get();
    set({ submitting: true, error: null });
    const payload = {
      mode,
      theme,
      level,
      started_at: startedAt,
      session_id: sessionId || undefined,
      answers,
    };
    // Logs de diagnostic (dev only) : confirme l'envoi du POST, le payload (les
    // question_ids doivent être des UUID valides du backend ciblé) et la réponse.
    if (__DEV__) {
      console.log('[sessions/submit] payload:', JSON.stringify(payload, null, 2));
    }
    try {
      const result = await sessionsApi.submit(payload);
      if (__DEV__) {
        console.log('[sessions/submit] response:', JSON.stringify(result, null, 2));
      }
      // Enrichit review[] avec le TEXTE des questions/options jouées : le serveur
      // ne renvoie que les index (correct_index/your_index). Les questions jouées
      // sont déjà en mémoire (tirées du cache local) avec leur texte + options →
      // source idéale (exactement ce qui a été affiché, sans relire SQLite). Une
      // question absente reste sans options (l'écran n'affichera que l'explication).
      const qById = new Map(get().questions.map((q) => [q.id, q]));
      const enriched = Array.isArray(result.review)
        ? {
            ...result,
            review: result.review.map((item) => {
              const q = qById.get(item.question_id);
              return q ? { ...item, question_text: q.text, options: q.options || [] } : item;
            }),
          }
        : result;

      // Temps moyen par réponse — calculé localement (les `answers` portent
      // toujours `elapsed_ms`, contrairement au review[] de l'API qui peut l'omettre).
      // On ne le recalcule pas si l'API le fournit déjà.
      const timed = answers.filter((a) => typeof a.elapsed_ms === 'number' && !a.skipped);
      const avgMs = timed.length
        ? Math.round(timed.reduce((s, a) => s + a.elapsed_ms, 0) / timed.length)
        : null;
      const merged = (typeof enriched.avg_time_ms === 'number' || avgMs == null)
        ? enriched
        : { ...enriched, avg_time_ms: avgMs };
      set({ result: merged, submitting: false });
      return { ok: true, result: merged };
    } catch (e) {
      const err = parseApiError(e);
      if (__DEV__) {
        console.log('[sessions/submit] error:', err.code, err.message);
      }
      set({ submitting: false, error: err.message });
      return { ok: false, error: err };
    }
  },

  reset: () => set({ ...initial }),
}));

export default useGameStore;
