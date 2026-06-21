// Store du classement — global / thème / hebdo / mensuel + rang du joueur.

import { create } from 'zustand';
import { leaderboard as leaderboardApi } from '../services/endpoints';
import { parseApiError } from '../services/api';

export const useLeaderboardStore = create((set, get) => ({
  scope: 'global', // global | theme | weekly | monthly
  theme: null,
  me: null, // { rank, score, level }
  data: [], // [{ rank, user_id, name, level, score, ville }]
  nextCursor: null,
  hasMore: false,
  loading: false,
  error: null,

  setScope: (scope) => set({ scope }),

  // Charge la première page pour un scope donné.
  load: async ({ scope, theme, limit = 20 } = {}) => {
    const useScope = scope || get().scope;
    set({ loading: true, error: null, scope: useScope, theme: theme || null });
    try {
      const data = await leaderboardApi.get({
        scope: useScope,
        theme: theme || undefined,
        limit,
      });
      set({
        me: data.me || null,
        data: data.data || [],
        nextCursor: data.page?.next_cursor || null,
        hasMore: !!data.page?.has_more,
        loading: false,
      });
      return { ok: true };
    } catch (e) {
      const err = parseApiError(e);
      set({ loading: false, error: err.message });
      return { ok: false, error: err };
    }
  },

  // Pagination : page suivante.
  loadMore: async () => {
    const { hasMore, nextCursor, scope, theme, data, loading } = get();
    if (!hasMore || loading) return;
    set({ loading: true });
    try {
      const resp = await leaderboardApi.get({
        scope,
        theme: theme || undefined,
        cursor: nextCursor,
      });
      set({
        data: [...data, ...(resp.data || [])],
        nextCursor: resp.page?.next_cursor || null,
        hasMore: !!resp.page?.has_more,
        loading: false,
      });
    } catch (e) {
      set({ loading: false, error: parseApiError(e).message });
    }
  },
}));

export default useLeaderboardStore;
