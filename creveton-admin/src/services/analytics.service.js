import api, { withMock, cleanParams } from './api';

/** GET /admin/analytics?period= — inclut la série journalière `daily`. */
export function get(params = {}) {
  return withMock(
    () => api.get('/admin/analytics', { params: cleanParams(params) }).then((r) => r.data),
    () => {
      // Repli démo : 7 jours de données plausibles déterministes.
      const today = new Date();
      const daily = Array.from({ length: 7 }).map((_, i) => {
        const d = new Date(today);
        d.setDate(d.getDate() - (6 - i));
        return { date: d.toISOString().slice(0, 10), signups: (i * 3 + 2) % 9, games: (i * 5 + 3) % 13 };
      });
      return { period: '7d', daily, dau: 6, mau: 9, new_signups: 4 };
    },
  );
}

/** Raccourci 7 jours pour le graphe d'activité du dashboard. */
export const get7d = () => get({ period: '7d' });

export default { get, get7d };
