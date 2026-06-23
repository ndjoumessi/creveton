'use strict';

/**
 * Calcul de score serveur-authoritative (réf. spec §6 — Calcul du score).
 *
 * Règles :
 *  - points de base par niveau : beginner 50, intermediate 75, expert 100
 *  - bonus vitesse : +50 % si elapsed_ms ≤ 5000
 *  - streak : ×1,5 dès 3 bonnes réponses consécutives, ×2 dès 5
 *  - XP de session : score × multiplicateur_niveau × multiplicateur_streak (max)
 *  - déverrouillage difficulté supérieure si réussite ≥ 70 %
 *  - anti-triche : réponses répétées < 500 ms ⇒ CHEAT_DETECTED (géré en amont,
 *    et exempté en blitz/marathon où la cadence rapide est voulue)
 *
 * Module pur (sans I/O) pour être facilement testable.
 */

const BASE_POINTS = { beginner: 50, intermediate: 75, expert: 100 };
const LEVEL_MULTIPLIER = { beginner: 1, intermediate: 1.5, expert: 2 };
const SPEED_BONUS_THRESHOLD_MS = 5000;
const SPEED_BONUS_RATE = 0.5;
const UNLOCK_THRESHOLD = 0.7;
const NEXT_DIFFICULTY = { beginner: 'intermediate', intermediate: 'expert', expert: null };
const CHEAT_MIN_MS = 500; // fenêtre « réponse suspecte » (assouplie depuis 1000 ms)

function streakMultiplier(streak) {
  if (streak >= 5) return 2;
  if (streak >= 3) return 1.5;
  return 1;
}

/**
 * Multiplicateur de « streak thématique » (mode marathon) : récompense les
 * questions consécutives d'un même thème dans la séquence présentée.
 * @param {string[]} themeHistory  ex. ['culture','culture','culture','geographie']
 * @returns {number} 1, 1.5 (≥ 3 d'affilée) ou 2 (≥ 5 d'affilée)
 */
function themeStreakMultiplier(themeHistory) {
  if (!themeHistory || themeHistory.length < 2) return 1;
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

/** Points de base d'une question selon son niveau de difficulté. */
function basePoints(level) {
  return BASE_POINTS[level] ?? BASE_POINTS.beginner;
}

/** Bonus de vitesse pour une réponse (0 au-delà du seuil de rapidité). */
function speedBonus(base, elapsedMs) {
  return elapsedMs <= SPEED_BONUS_THRESHOLD_MS ? Math.round(base * SPEED_BONUS_RATE) : 0;
}

/**
 * @param {object} params
 * @param {string} params.level beginner|intermediate|expert
 * @param {Array}  params.answers  réponses du joueur
 * @param {Map<string,{correct_index:number, explanation?:string}>} params.solutions
 *        clé = question_id → solution (jamais exposée au client avant ce calcul)
 * @returns {object} résultat de score + review[]
 */
function computeSession({ level, mode = 'normal', answers, solutions }) {
  // Modes mixtes : niveaux mélangés → les points de base suivent le niveau RÉEL
  // de chaque question (chargé serveur), pas un niveau de session unique.
  const isMixed = mode === 'blitz' || mode === 'marathon';

  let score = 0;
  let speedBonus = 0;
  let themeStreakBonus = 0;
  let correctCount = 0;
  let currentStreak = 0;
  let streakMax = 0;
  let bestStreakMult = 1;
  let suspiciousFastCount = 0;
  const review = [];
  const themeHistory = []; // séquence des thèmes (marathon) pour le bonus thématique

  answers.forEach((ans, idx) => {
    const solution = solutions.get(ans.question_id);
    const correctIndex = solution ? solution.correct_index : null;
    const isCorrect =
      !ans.skipped && ans.selected_index !== null && ans.selected_index === correctIndex;

    // Points de base : niveau de la question (modes mixtes) ou de la session.
    const qLevel = isMixed ? solution?.level ?? level : level;
    const qBase = BASE_POINTS[qLevel] ?? BASE_POINTS[level] ?? BASE_POINTS.beginner;

    // Streak thématique (marathon) : sentinelle unique si thème inconnu pour ne
    // pas créer de fausse série entre questions non résolues.
    const themeKey = solution?.theme || `__nomatch_${idx}__`;
    themeHistory.push(themeKey);
    const themeMult = mode === 'marathon' ? themeStreakMultiplier(themeHistory) : 1;

    if (!ans.skipped && ans.elapsed_ms < CHEAT_MIN_MS) {
      suspiciousFastCount += 1;
    }

    if (isCorrect) {
      correctCount += 1;
      currentStreak += 1;
      streakMax = Math.max(streakMax, currentStreak);
      bestStreakMult = Math.max(bestStreakMult, streakMultiplier(currentStreak));

      let points = qBase;
      if (ans.elapsed_ms <= SPEED_BONUS_THRESHOLD_MS) {
        const bonus = Math.round(qBase * SPEED_BONUS_RATE);
        points += bonus;
        speedBonus += bonus;
      }
      // Bonus thème (marathon) : multiplie les points de la question.
      if (themeMult > 1) {
        const tBonus = Math.round(points * (themeMult - 1));
        points += tBonus;
        themeStreakBonus += tBonus;
      }
      score += points;
    } else {
      currentStreak = 0;
    }

    review.push({
      question_id: ans.question_id,
      your_index: ans.selected_index,
      correct_index: correctIndex,
      is_correct: isCorrect,
      explanation: solution ? solution.explanation ?? null : null,
    });
  });

  const total = answers.length;
  const successRate = total > 0 ? correctCount / total : 0;
  // XP : en mode mixte le multiplicateur de niveau n'a pas de sens (niveaux
  // mélangés) → 1 ; sinon multiplicateur du niveau de session.
  const levelMult = isMixed ? 1 : LEVEL_MULTIPLIER[level] ?? 1;
  const xpEarned = Math.round(score * levelMult * bestStreakMult);
  const levelUnlocked = !isMixed && successRate >= UNLOCK_THRESHOLD;

  return {
    score,
    correct_count: correctCount,
    total_questions: total,
    xp_earned: xpEarned,
    speed_bonus: speedBonus,
    theme_streak_bonus: themeStreakBonus,
    streak_max: streakMax,
    success_rate: Number(successRate.toFixed(4)),
    level_unlocked: levelUnlocked,
    unlocked_difficulty: levelUnlocked ? NEXT_DIFFICULTY[level] : null,
    suspicious_fast_count: suspiciousFastCount,
    review,
  };
}

module.exports = {
  computeSession,
  streakMultiplier,
  themeStreakMultiplier,
  basePoints,
  speedBonus,
  BASE_POINTS,
  LEVEL_MULTIPLIER,
  SPEED_BONUS_THRESHOLD_MS,
  SPEED_BONUS_RATE,
  UNLOCK_THRESHOLD,
  CHEAT_MIN_MS,
};
