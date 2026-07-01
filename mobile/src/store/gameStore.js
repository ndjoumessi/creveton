// Store de la partie en cours — session, réponses, score local, streak, timer.
// Le score affiché localement est indicatif : le serveur recalcule tout à la
// soumission (timer serveur-authoritative, anti-triche — API §6).

import { create } from 'zustand';
import { sessions as sessionsApi, challenges as challengesApi } from '../services/endpoints';
import { parseApiError } from '../services/api';
import { useNetworkStore } from './networkStore';
import { useOfflineQueue } from './offlineQueue';

// Enrichit la réponse de score (sessions OU challenges) avec le TEXTE des
// questions/options jouées (le serveur ne renvoie que des index) et le temps
// moyen par réponse — calculé localement. Source : les questions en mémoire,
// exactement ce qui a été affiché. Une question absente reste sans options.
function enrichResult(result, answers, questions) {
  const qById = new Map(questions.map((q) => [q.id, q]));
  const enriched = Array.isArray(result.review)
    ? {
        ...result,
        review: result.review.map((item) => {
          const q = qById.get(item.question_id);
          return q
            ? { ...item, question_text: q.text, question_text_en: q.text_en || null, options: q.options || [] }
            : item;
        }),
      }
    : result;

  const timed = answers.filter((a) => typeof a.elapsed_ms === 'number' && !a.skipped);
  const avgMs = timed.length
    ? Math.round(timed.reduce((s, a) => s + a.elapsed_ms, 0) / timed.length)
    : null;
  return typeof enriched.avg_time_ms === 'number' || avgMs == null
    ? enriched
    : { ...enriched, avg_time_ms: avgMs };
}

// Score local « miroir » du serveur (backend scoreService.computeSession) : mêmes
// règles — points de base par niveau, bonus vitesse +50 % (≤ 5 s), bonus de série
// thématique en marathon. Sert au récap hors-ligne : la partie sera rejouée vers
// /sessions/submit au retour réseau et le serveur recalculera EXACTEMENT ces mêmes
// valeurs → aucune donnée factice. Renvoie null si une question jouée n'a pas de
// `correct_index` en cache (set complété par l'API en vue joueur, anti-triche) :
// justesse indéterminable → on n'invente rien, le récap masque les chiffres.
const LOCAL_BASE_POINTS = { beginner: 50, intermediate: 75, expert: 100 };
const LOCAL_SPEED_MS = 5000;
const LOCAL_SPEED_RATE = 0.5;

function localThemeStreakMult(themeHistory) {
  if (themeHistory.length < 2) return 1;
  const last = themeHistory[themeHistory.length - 1];
  let streak = 0;
  for (let i = themeHistory.length - 1; i >= 0; i -= 1) {
    if (themeHistory[i] === last) streak += 1;
    else break;
  }
  if (streak >= 5) return 2;
  if (streak >= 3) return 1.5;
  return 1;
}

function computeLocalResult({ mode, level, answers, questions }) {
  const qById = new Map(questions.map((q) => [q.id, q]));
  const isMixed = mode === 'blitz' || mode === 'marathon';
  let score = 0;
  let correctCount = 0;
  const themeHistory = [];
  for (let idx = 0; idx < answers.length; idx += 1) {
    const ans = answers[idx];
    const q = qById.get(ans.question_id);
    // Justesse indéterminable (question sans correct_index en cache) → abandon.
    if (!q || !Number.isInteger(q.correct_index)) return null;
    // Modes mixtes : points de base du niveau RÉEL de la question (niveaux mêlés).
    const qLevel = isMixed ? q.level || level : level;
    const qBase = LOCAL_BASE_POINTS[qLevel] ?? LOCAL_BASE_POINTS.beginner;
    themeHistory.push(q.theme || `__nomatch_${idx}__`);
    const isCorrect =
      !ans.skipped && ans.selected_index !== null && ans.selected_index === q.correct_index;
    if (isCorrect) {
      correctCount += 1;
      let points = qBase;
      if (ans.elapsed_ms <= LOCAL_SPEED_MS) points += Math.round(qBase * LOCAL_SPEED_RATE);
      const themeMult = mode === 'marathon' ? localThemeStreakMult(themeHistory) : 1;
      if (themeMult > 1) points += Math.round(points * (themeMult - 1));
      score += points;
    }
  }
  return { score, correct_count: correctCount, total_questions: answers.length };
}

const initial = {
  mode: 'normal', // normal | tournament | challenge
  challengeId: null, // défini en mode challenge → submit vers /challenges/:id/submit
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
  isQuizActive: false,
  localResult: null, // récap hors-ligne (score/justesse calculés localement)
};

export const useGameStore = create((set, get) => ({
  ...initial,

  // Démarre une nouvelle partie avec un set de questions déjà tiré.
  // `challengeId` (mode challenge) → la soumission ira vers /challenges/:id/submit.
  startGame: ({ mode = 'normal', challengeId = null, theme, level, questions }) => {
    set({
      ...initial,
      mode,
      challengeId,
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

  setQuizActive: (active) => set({ isQuizActive: active }),

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
    const { mode, challengeId, theme, level, startedAt, answers, sessionId } = get();
    set({ submitting: true, error: null });
    const payload = {
      mode,
      theme,
      level,
      started_at: startedAt,
      session_id: sessionId || undefined,
      answers,
    };

    // ── Défi 1v1 : soumission vers /challenges/:id/submit (score serveur, gagnant,
    // bonus XP). Pas de file hors-ligne : la file rejoue vers /sessions/submit, ce
    // qui serait invalide pour un défi → on exige la connexion (échec explicite).
    if (mode === 'challenge' && challengeId) {
      if (!useNetworkStore.getState().isOnline) {
        const err = { code: 'NETWORK_ERROR', message: 'Connexion requise pour valider un défi.' };
        set({ submitting: false, error: err.message });
        return { ok: false, error: err };
      }
      try {
        const res = await challengesApi.submit(challengeId, payload);
        if (__DEV__) {
          console.log('[challenges/submit] response:', JSON.stringify(res, null, 2));
        }
        // Le défi expose `your_score` ; ResultsScreen lit `score` → on normalise.
        const merged = enrichResult({ ...res, score: res.your_score }, answers, get().questions);
        set({ result: merged, submitting: false });
        return { ok: true, result: merged };
      } catch (e) {
        const err = parseApiError(e);
        if (__DEV__) {
          console.log('[challenges/submit] error:', err.code, err.message);
        }
        set({ submitting: false, error: err.message });
        return { ok: false, error: err };
      }
    }

    // Logs de diagnostic (dev only) : confirme l'envoi du POST, le payload (les
    // question_ids doivent être des UUID valides du backend ciblé) et la réponse.
    if (__DEV__) {
      console.log('[sessions/submit] payload:', JSON.stringify(payload, null, 2));
    }

    // Hors ligne : on met la partie en file (rejouée au retour du réseau) sans
    // appeler l'API. Pas de score serveur → ResultsScreen affiche l'état
    // « sauvegardé hors ligne ».
    if (!useNetworkStore.getState().isOnline) {
      useOfflineQueue.getState().addSession(payload);
      const localResult = computeLocalResult({ mode, level, answers, questions: get().questions });
      set({ submitting: false, localResult });
      return { ok: true, queued: true };
    }

    try {
      const result = await sessionsApi.submit(payload);
      if (__DEV__) {
        console.log('[sessions/submit] response:', JSON.stringify(result, null, 2));
      }
      const merged = enrichResult(result, answers, get().questions);
      set({ result: merged, submitting: false });
      return { ok: true, result: merged };
    } catch (e) {
      const err = parseApiError(e);
      if (__DEV__) {
        console.log('[sessions/submit] error:', err.code, err.message);
      }
      // Échec réseau/timeout malgré un état « en ligne » → on met en file plutôt
      // que de perdre la partie (sera rejouée au prochain retour réseau).
      if (err.code === 'NETWORK_ERROR' || err.code === 'TIMEOUT') {
        useOfflineQueue.getState().addSession(payload);
        const localResult = computeLocalResult({ mode, level, answers, questions: get().questions });
        set({ submitting: false, localResult });
        return { ok: true, queued: true };
      }
      set({ submitting: false, error: err.message });
      return { ok: false, error: err };
    }
  },

  reset: () => set({ ...initial }),
}));

export default useGameStore;
