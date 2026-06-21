// Store des stats joueur — historique des parties (→ stats dérivées) + classement
// global avec rang du joueur. Sert l'onglet Stats et les cartes stats de l'accueil.

import { create } from 'zustand';
import {
  users as usersApi,
  leaderboard as leaderboardApi,
} from '../services/endpoints';
import { parseApiError } from '../services/api';
import { computeStats, EMPTY_STATS } from '../services/stats.service';

export const useStatsStore = create((set, get) => ({
  history: null, // null = pas encore chargé ; [] = chargé, vide
  stats: EMPTY_STATS,
  leaderboard: [], // [{ rank, user_id, name, level, score, ville }]
  myRank: null, // { rank, score, level }
  totalPlayers: null, // connu seulement si la 1re page couvre tout le classement
  histLoading: false,
  lbLoading: false,
  error: null,

  // GET /users/me/history → calcule les stats dérivées.
  loadHistory: async ({ limit = 50 } = {}) => {
    set({ histLoading: true, error: null });
    try {
      const res = await usersApi.history({ limit });
      const history = res.data || [];
      set({ history, stats: computeStats(history), histLoading: false });
      return history;
    } catch (e) {
      set({
        histLoading: false,
        error: parseApiError(e).message,
        history: get().history || [],
      });
      return get().history || [];
    }
  },

  // GET /leaderboard?scope=global → top + mon rang.
  loadLeaderboard: async ({
    scope = 'global',
    limit = 100,
    currentUserId,
  } = {}) => {
    set({ lbLoading: true });
    try {
      const data = await leaderboardApi.get({ scope, limit });
      const rows = data.data || [];
      let myRank = data.me || null;
      // Repli : retrouver mon rang dans la liste si l'API ne fournit pas `me`.
      if (!myRank && currentUserId) {
        const mine = rows.find((r) => r.user_id === currentUserId);
        if (mine) {
          myRank = { rank: mine.rank, score: mine.score, level: mine.level };
        }
      }
      // On ne connaît le total de joueurs que si cette page couvre tout.
      const hasMore = !!data.page?.has_more;
      const totalPlayers = hasMore ? null : rows.length;
      set({ leaderboard: rows, myRank, totalPlayers, lbLoading: false });
      return rows;
    } catch (e) {
      set({ lbLoading: false, error: parseApiError(e).message });
      return get().leaderboard;
    }
  },

  refresh: async ({ currentUserId } = {}) => {
    await Promise.all([
      get().loadHistory(),
      get().loadLeaderboard({ currentUserId }),
    ]);
  },
}));

export default useStatsStore;
