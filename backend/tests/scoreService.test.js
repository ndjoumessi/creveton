'use strict';

const scoreService = require('../src/services/scoreService');

/** Solutions factices indexées par question_id. */
function solutionsFrom(map) {
  return new Map(Object.entries(map));
}

describe('scoreService.computeSession', () => {
  test('compte les bonnes réponses et applique le bonus vitesse', () => {
    const solutions = solutionsFrom({
      q1: { correct_index: 1, explanation: 'ok' },
      q2: { correct_index: 0, explanation: 'ok' },
    });

    const res = scoreService.computeSession({
      level: 'beginner', // base 50
      solutions,
      answers: [
        { question_id: 'q1', selected_index: 1, elapsed_ms: 3000, skipped: false }, // correct + rapide
        { question_id: 'q2', selected_index: 2, elapsed_ms: 8000, skipped: false }, // faux
      ],
    });

    expect(res.correct_count).toBe(1);
    expect(res.total_questions).toBe(2);
    // 50 base + 25 bonus vitesse (50 %) = 75
    expect(res.score).toBe(75);
    expect(res.speed_bonus).toBe(25);
  });

  test('applique le multiplicateur de streak (×2 dès 5 bonnes réponses)', () => {
    const sol = {};
    const answers = [];
    for (let i = 0; i < 5; i += 1) {
      sol[`q${i}`] = { correct_index: 0 };
      answers.push({ question_id: `q${i}`, selected_index: 0, elapsed_ms: 2000, skipped: false });
    }
    const res = scoreService.computeSession({
      level: 'intermediate', // base 75, mult niveau 1.5
      solutions: solutionsFrom(sol),
      answers,
    });

    expect(res.correct_count).toBe(5);
    expect(res.streak_max).toBe(5);
    // score = 5 × (75 + 37.5→38 ? ) attention arrondi bonus : round(75*0.5)=38 → 113/q
    // On vérifie surtout que l'XP applique mult niveau (1.5) × mult streak (2).
    expect(res.xp_earned).toBe(Math.round(res.score * 1.5 * 2));
    expect(res.level_unlocked).toBe(true);
    expect(res.unlocked_difficulty).toBe('expert');
  });

  test("ne déverrouille pas la difficulté en dessous de 70 % de réussite", () => {
    const solutions = solutionsFrom({
      q1: { correct_index: 0 },
      q2: { correct_index: 0 },
      q3: { correct_index: 0 },
    });
    const res = scoreService.computeSession({
      level: 'beginner',
      solutions,
      answers: [
        { question_id: 'q1', selected_index: 0, elapsed_ms: 4000, skipped: false }, // ok
        { question_id: 'q2', selected_index: 1, elapsed_ms: 4000, skipped: false }, // faux
        { question_id: 'q3', selected_index: null, elapsed_ms: 30000, skipped: true }, // passé
      ],
    });
    expect(res.success_rate).toBeCloseTo(1 / 3, 4);
    expect(res.level_unlocked).toBe(false);
    expect(res.unlocked_difficulty).toBeNull();
  });

  test('détecte les réponses suspectes (< 500 ms)', () => {
    const solutions = solutionsFrom({ q1: { correct_index: 0 } });
    const res = scoreService.computeSession({
      level: 'beginner',
      solutions,
      answers: [{ question_id: 'q1', selected_index: 0, elapsed_ms: 400, skipped: false }],
    });
    expect(res.suspicious_fast_count).toBe(1);
  });
});
