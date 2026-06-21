// Calculs de stats joueur dérivés de l'historique des parties
// (GET /users/me/history). Module pur et testable.
//
// Données réelles uniquement (CLAUDE.md « honnêteté des données ») : tout ce qui
// n'est PAS présent dans le payload d'historique reste `null` et s'affiche « — »
// côté écran. En particulier le streak n'est pas porté par l'historique → il
// provient du profil (`user.stats`) via `profileStreak`, jamais inventé ici.

export const EMPTY_STATS = {
  totalGames: 0,
  avgScore: 0,
  successRate: 0,
  maxStreak: null,
  favoriteTheme: null,
  byTheme: {},
  scoreEvolution: [],
  todayGames: 0,
};

const num = (v) => Number(v) || 0;

// Compte les parties jouées aujourd'hui (jour calendaire local).
function countToday(history) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  return history.reduce((acc, g) => {
    if (!g.played_at) return acc;
    const t = new Date(g.played_at);
    if (Number.isNaN(t.getTime())) return acc;
    const sameDay =
      t.getFullYear() === y && t.getMonth() === m && t.getDate() === d;
    return sameDay ? acc + 1 : acc;
  }, 0);
}

// history : tableau renvoyé par /users/me/history (récent → ancien).
export function computeStats(history) {
  if (!history || history.length === 0) return { ...EMPTY_STATS };

  const totalGames = history.length;
  const avgScore = Math.round(
    history.reduce((s, g) => s + num(g.score), 0) / totalGames
  );

  const totalCorrect = history.reduce((s, g) => s + num(g.correct_count), 0);
  const totalQuestions = history.reduce((s, g) => s + num(g.total_questions), 0);
  const successRate =
    totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

  // Agrégation par thème.
  const byTheme = {};
  history.forEach((g) => {
    const key = g.theme || 'inconnu';
    if (!byTheme[key]) {
      byTheme[key] = { games: 0, correct: 0, total: 0, score: 0 };
    }
    byTheme[key].games += 1;
    byTheme[key].correct += num(g.correct_count);
    byTheme[key].total += num(g.total_questions);
    byTheme[key].score += num(g.score);
  });
  Object.values(byTheme).forEach((t) => {
    t.rate = t.total > 0 ? Math.round((t.correct / t.total) * 100) : null;
    t.avgScore = t.games > 0 ? Math.round(t.score / t.games) : 0;
  });

  // Thème favori = le plus joué (null si aucun).
  const favoriteTheme =
    Object.entries(byTheme).sort(([, a], [, b]) => b.games - a.games)[0]?.[0] ||
    null;

  // Évolution : 10 dernières parties en ordre chronologique (ancien → récent).
  const scoreEvolution = history
    .slice(0, 10)
    .reverse()
    .map((g, i) => ({ index: i, score: num(g.score), theme: g.theme }));

  return {
    totalGames,
    avgScore,
    successRate,
    maxStreak: null, // absent de l'historique — voir profileStreak
    favoriteTheme,
    byTheme,
    scoreEvolution,
    todayGames: countToday(history),
  };
}

// Streak depuis le profil (`user.stats`) — tolérant aux noms de champs.
// Renvoie `null` quand l'info n'existe pas (affiché « — »), jamais 0 par défaut.
export function profileStreak(userStats) {
  if (!userStats) return { max: null, current: null };
  const max =
    userStats.max_streak ??
    userStats.best_streak ??
    userStats.streak_max ??
    null;
  const current = userStats.current_streak ?? userStats.streak ?? null;
  return { max, current };
}

export default { computeStats, profileStreak, EMPTY_STATS };
