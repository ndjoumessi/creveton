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
 *  - anti-triche : réponses répétées < 1 s ⇒ CHEAT_DETECTED (géré en amont)
 *
 * Module pur (sans I/O) pour être facilement testable.
 */

const BASE_POINTS = { beginner: 50, intermediate: 75, expert: 100 };
const LEVEL_MULTIPLIER = { beginner: 1, intermediate: 1.5, expert: 2 };
const SPEED_BONUS_THRESHOLD_MS = 5000;
const SPEED_BONUS_RATE = 0.5;
const UNLOCK_THRESHOLD = 0.7;
const NEXT_DIFFICULTY = { beginner: 'intermediate', intermediate: 'expert', expert: null };
const CHEAT_MIN_MS = 1000;

function streakMultiplier(streak) {
  if (streak >= 5) return 2;
  if (streak >= 3) return 1.5;
  return 1;
}

/**
 * @param {object} params
 * @param {string} params.level beginner|intermediate|expert
 * @param {Array}  params.answers  réponses du joueur
 * @param {Map<string,{correct_index:number, explanation?:string}>} params.solutions
 *        clé = question_id → solution (jamais exposée au client avant ce calcul)
 * @returns {object} résultat de score + review[]
 */
function computeSession({ level, answers, solutions }) {
  const base = BASE_POINTS[level] ?? BASE_POINTS.beginner;

  let score = 0;
  let speedBonus = 0;
  let correctCount = 0;
  let currentStreak = 0;
  let streakMax = 0;
  let bestStreakMult = 1;
  let suspiciousFastCount = 0;
  const review = [];

  for (const ans of answers) {
    const solution = solutions.get(ans.question_id);
    const correctIndex = solution ? solution.correct_index : null;
    const isCorrect =
      !ans.skipped && ans.selected_index !== null && ans.selected_index === correctIndex;

    if (!ans.skipped && ans.elapsed_ms < CHEAT_MIN_MS) {
      suspiciousFastCount += 1;
    }

    if (isCorrect) {
      correctCount += 1;
      currentStreak += 1;
      streakMax = Math.max(streakMax, currentStreak);
      bestStreakMult = Math.max(bestStreakMult, streakMultiplier(currentStreak));

      let points = base;
      if (ans.elapsed_ms <= SPEED_BONUS_THRESHOLD_MS) {
        const bonus = Math.round(base * SPEED_BONUS_RATE);
        points += bonus;
        speedBonus += bonus;
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
  }

  const total = answers.length;
  const successRate = total > 0 ? correctCount / total : 0;
  const levelMult = LEVEL_MULTIPLIER[level] ?? 1;
  const xpEarned = Math.round(score * levelMult * bestStreakMult);
  const levelUnlocked = successRate >= UNLOCK_THRESHOLD;

  return {
    score,
    correct_count: correctCount,
    total_questions: total,
    xp_earned: xpEarned,
    speed_bonus: speedBonus,
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
  BASE_POINTS,
  LEVEL_MULTIPLIER,
  SPEED_BONUS_THRESHOLD_MS,
  UNLOCK_THRESHOLD,
  CHEAT_MIN_MS,
};
