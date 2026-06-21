// Parties mock (GET /admin/sessions). Inclut le récap answers pour le détail.

const recap = (correct, total) =>
  Array.from({ length: total }, (_, i) => ({
    question_id: `q-${i + 1}`,
    question_text: `Question ${i + 1} sur le thème ?`,
    options: [
      { text: 'Option A', is_correct: false },
      { text: 'Option B', is_correct: true },
      { text: 'Option C', is_correct: false },
      { text: 'Option D', is_correct: false },
    ],
    correct_index: 1,
    your_index: i < correct ? 1 : 0,
    is_correct: i < correct,
    elapsed_ms: 2000 + i * 350,
  }));

const S = (id, name, ville, theme, level, score, correct, total, xp, when) => ({
  id, user: { id: `u-${id}`, name, ville, level: 4 },
  theme, level, score, correct_count: correct, question_count: total,
  xp_earned: xp, duration_s: total * 12, played_at: when,
  speed_bonus: Math.round(score * 0.2), streak_max: Math.min(correct, 5),
  answers: recap(correct, total),
});

const mockSessions = [
  S('s-001', 'Junior Kamga', 'Douala', 'geographie', 'beginner', 375, 5, 5, 750, '2026-06-21T10:30:00Z'),
  S('s-002', 'Awa Mballa', 'Yaoundé', 'sport', 'intermediate', 280, 4, 6, 560, '2026-06-21T09:50:00Z'),
  S('s-003', 'Sandra Eyenga', 'Douala', 'culture', 'expert', 410, 6, 8, 820, '2026-06-20T19:15:00Z'),
  S('s-004', 'Cédric Fotso', 'Garoua', 'histoire', 'beginner', 150, 2, 5, 300, '2026-06-20T16:40:00Z'),
  S('s-005', 'Nadège Tchoua', 'Douala', 'science', 'intermediate', 320, 5, 7, 640, '2026-06-20T14:05:00Z'),
  S('s-006', 'Estelle Ngo', 'Kribi', 'geographie', 'beginner', 225, 3, 5, 450, '2026-06-19T20:10:00Z'),
  S('s-007', 'Boris Nkeng', 'Bafoussam', 'industrie', 'intermediate', 190, 3, 6, 380, '2026-06-19T18:00:00Z'),
  S('s-008', 'Yannick Abega', 'Bertoua', 'sport', 'beginner', 300, 4, 5, 600, '2026-06-19T12:25:00Z'),
];

export default mockSessions;
