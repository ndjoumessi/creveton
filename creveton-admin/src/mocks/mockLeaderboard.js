// Classement mock (GET /admin/leaderboard) — { me, data, page }.

const NAMES = [
  ['Junior Kamga', 'Douala'], ['Sandra Eyenga', 'Douala'], ['Awa Mballa', 'Yaoundé'],
  ['Nadège Tchoua', 'Douala'], ['Estelle Ngo', 'Kribi'], ['Boris Nkeng', 'Bafoussam'],
  ['Cédric Fotso', 'Garoua'], ['Yannick Abega', 'Bertoua'], ['Marie Atangana', 'Yaoundé'],
  ['Paul Biya Jr', 'Douala'], ['Lucas Ze', 'Ebolowa'], ['Aïcha Bello', 'Maroua'],
];

export function mockLeaderboard(scope = 'global', theme = null) {
  const base = scope === 'weekly' ? 8000 : scope === 'monthly' ? 22000 : 41000;
  const data = NAMES.map(([name, ville], i) => ({
    rank: i + 1,
    user_id: `u-${i + 1}`,
    name,
    ville,
    level: Math.max(1, 5 - Math.floor(i / 3)),
    score: Math.round(base * (1 - i * 0.06)),
    games: 120 - i * 7,
  }));
  return {
    me: { rank: 142, score: 8450, level: 3 },
    data,
    page: { limit: 100, next_cursor: null, has_more: false },
    scope,
    theme: theme || null,
  };
}

export default mockLeaderboard;
