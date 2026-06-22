// Données de démonstration — support joueurs (MVP : pas de backend dédié).
const mockSupport = {
  tickets: [
    {
      id: 'TK-001', status: 'open', priority: 'urgent', type: 'account',
      player: { name: 'Cédric Fotso', ville: 'Douala', level: 4, sessions_played: 212 },
      subject: 'Compte bloqué après mise à jour',
      excerpt: "Je n'arrive plus à me connecter depuis hier soir, l'app affiche « compte suspendu » sans raison.",
      assigned_to: null, created_at: '2026-06-22T08:37:00Z',
      messages: [
        { id: 'm1', from: 'player', body: "Je n'arrive plus à me connecter depuis hier soir, l'app affiche « compte suspendu ».", at: '2026-06-22T08:37:00Z' },
      ],
    },
    {
      id: 'TK-002', status: 'open', priority: 'normal', type: 'question',
      player: { name: 'Aïssatou Bah', ville: 'Maroua', level: 3, sessions_played: 96 },
      subject: 'Réponse incorrecte sur une question de géographie',
      excerpt: 'La question sur le plus haut sommet donne une mauvaise réponse correcte selon moi.',
      assigned_to: 'Cédric Fotso', created_at: '2026-06-22T07:50:00Z',
      messages: [
        { id: 'm1', from: 'player', body: 'La bonne réponse devrait être le Mont Cameroun, pas le Mont Oku.', at: '2026-06-22T07:50:00Z' },
        { id: 'm2', from: 'admin', body: 'Merci pour le signalement, nous vérifions la question.', at: '2026-06-22T08:05:00Z', author: 'Cédric Fotso' },
      ],
    },
    {
      id: 'TK-003', status: 'in_progress', priority: 'low', type: 'bug',
      player: { name: 'Junior Mvondo', ville: 'Ebolowa', level: 2, sessions_played: 41 },
      subject: 'Le minuteur saute parfois',
      excerpt: 'Pendant une partie, le chrono est passé de 12s à 4s d’un coup.',
      assigned_to: 'Aïcha Bello', created_at: '2026-06-21T18:20:00Z',
      messages: [
        { id: 'm1', from: 'player', body: 'Le chrono a sauté de 12s à 4s pendant une partie.', at: '2026-06-21T18:20:00Z' },
        { id: 'm2', from: 'system', body: 'Ticket assigné à Aïcha Bello.', at: '2026-06-21T18:25:00Z' },
      ],
    },
    {
      id: 'TK-004', status: 'resolved', priority: 'normal', type: 'other',
      player: { name: 'Grace Eyenga', ville: 'Kribi', level: 5, sessions_played: 380 },
      subject: 'Comment récupérer mes XP ?',
      excerpt: 'J’ai changé de téléphone et je ne retrouve plus ma progression.',
      assigned_to: 'Aïcha Bello', created_at: '2026-06-20T10:00:00Z',
      messages: [
        { id: 'm1', from: 'player', body: 'J’ai changé de téléphone, je ne retrouve plus ma progression.', at: '2026-06-20T10:00:00Z' },
        { id: 'm2', from: 'admin', body: 'Votre progression est liée à votre numéro, reconnectez-vous avec le même numéro.', at: '2026-06-20T10:30:00Z', author: 'Aïcha Bello' },
        { id: 'm3', from: 'player', body: 'Parfait, tout est revenu. Merci !', at: '2026-06-20T11:00:00Z' },
      ],
    },
    {
      id: 'TK-005', status: 'open', priority: 'normal', type: 'account',
      player: { name: 'Bilal Hamidou', ville: 'Ngaoundéré', level: 1, sessions_played: 8 },
      subject: 'OTP non reçu',
      excerpt: 'Je ne reçois pas le code de vérification par SMS.',
      assigned_to: null, created_at: '2026-06-22T06:15:00Z',
      messages: [{ id: 'm1', from: 'player', body: 'Je ne reçois pas le code SMS de vérification.', at: '2026-06-22T06:15:00Z' }],
    },
  ],
  reports: [
    { id: 'RP-1', question_id: 'q-101', question_text: 'Quel est le plus haut sommet du Cameroun ?', reported_by: 'Aïssatou Bah', reason: 'Réponse correcte erronée', count: 5, created_at: '2026-06-22T07:50:00Z' },
    { id: 'RP-2', question_id: 'q-102', question_text: 'En quelle année le Cameroun a-t-il accédé à l’indépendance ?', reported_by: 'Junior Mvondo', reason: 'Ambiguë (deux dates possibles)', count: 2, created_at: '2026-06-21T20:10:00Z' },
    { id: 'RP-3', question_id: 'q-103', question_text: 'Quelle ville est surnommée la capitale économique ?', reported_by: 'Grace Eyenga', reason: 'Faute d’orthographe dans une option', count: 1, created_at: '2026-06-20T09:30:00Z' },
  ],
};

export const mockSupportKpi = { open: 3, pending: 1, resolved_today: 1, avg_resolution_min: 42 };
export const mockSupportDaily = [
  { date: '2026-06-16', tickets: 4 }, { date: '2026-06-17', tickets: 6 }, { date: '2026-06-18', tickets: 3 },
  { date: '2026-06-19', tickets: 7 }, { date: '2026-06-20', tickets: 5 }, { date: '2026-06-21', tickets: 8 }, { date: '2026-06-22', tickets: 5 },
];
export const mockSupportByType = [
  { type: 'account', n: 8 }, { type: 'question', n: 5 }, { type: 'bug', n: 4 }, { type: 'other', n: 3 },
];

export default mockSupport;
