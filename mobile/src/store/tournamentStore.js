// Store de la manche de tournoi en TEMPS RÉEL (zustand).
// Reflète l'état diffusé par le serveur (question courante, révélation,
// classement live, fin). La justesse/score ne sont JAMAIS calculés ici : on
// stocke ce que le serveur envoie (cf. services/socket.js).

import { create } from 'zustand';

// Phases d'une manche : 'idle' avant montage, 'waiting' inscrit en attente du
// démarrage admin, 'question' question diffusée, 'reveal' correction, 'ended'.
const initial = {
  tournamentId: null,
  phase: 'idle',
  // Question courante (vue joueur — sans bonne réponse).
  // { index, total, text, options:[{index,text}], theme, level, deadlineAt, durationMs }
  question: null,
  selectedIndex: null, // choix du joueur pour la question courante (null = aucun)
  // Révélation de fin de question : { correctIndex, explanation, leaderboard }
  reveal: null,
  // Classement live (top N) : [{ user_id, score, rank }] — sans nom (anti-jointure live).
  leaderboard: [],
  myScore: 0,
  myRank: null,
  // Récap de fin : { leaderboard, myScore, myRank }
  ended: null,
};

export const useTournamentStore = create((set) => ({
  ...initial,

  setTournamentId: (tournamentId) => set({ tournamentId }),
  setPhase: (phase) => set({ phase }),
  // Nouvelle question → on réinitialise le choix et la révélation précédente.
  setQuestion: (question) => set({ question, selectedIndex: null, reveal: null }),
  setSelectedIndex: (selectedIndex) => set({ selectedIndex }),
  setReveal: (reveal) => set({ reveal }),
  setLeaderboard: (leaderboard) => set({ leaderboard: leaderboard || [] }),
  setMyStanding: (myScore, myRank) => set({ myScore, myRank }),
  setEnded: (ended) =>
    set({ ended, myScore: ended?.myScore ?? 0, myRank: ended?.myRank ?? null }),

  reset: () => set({ ...initial }),
}));

export default useTournamentStore;
