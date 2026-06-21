// 10 questions mock couvrant tous les statuts du workflow (CDC §3.3).

const opt = (a, b, c, d, correct) =>
  [a, b, c, d].map((text, i) => ({ text, is_correct: i === correct }));

const mockQuestions = [
  {
    id: 'q-001', text_fr: 'Quelle est la capitale politique du Cameroun ?', type: 'mcq',
    options: opt('Douala', 'Yaoundé', 'Bafoussam', 'Garoua', 1), correct_index: 1,
    theme: 'geographie', level: 'beginner', explanation: 'Yaoundé est la capitale depuis 1922.',
    status: 'approved', version: 3, success_rate: 0.82, created_at: '2026-05-02T10:00:00Z', updated_at: '2026-06-10T09:00:00Z',
  },
  {
    id: 'q-002', text_fr: 'Comment surnomme-t-on l’équipe nationale de football ?', type: 'mcq',
    options: opt('Les Éléphants', 'Les Lions Indomptables', 'Les Aigles', 'Les Étalons', 1), correct_index: 1,
    theme: 'sport', level: 'beginner', explanation: 'Les Lions Indomptables.',
    status: 'approved', version: 1, success_rate: 0.91, created_at: '2026-05-03T10:00:00Z', updated_at: '2026-05-03T10:00:00Z',
  },
  {
    id: 'q-003', text_fr: 'Quel fleuve traverse Yaoundé ?', type: 'mcq',
    options: opt('Le Wouri', 'La Sanaga', 'Le Mfoundi', 'Le Nyong', 2), correct_index: 2,
    theme: 'geographie', level: 'intermediate', explanation: 'Le Mfoundi traverse Yaoundé.',
    status: 'pending_review', version: 1, success_rate: null, created_at: '2026-06-14T10:00:00Z', updated_at: '2026-06-14T10:00:00Z',
  },
  {
    id: 'q-004', text_fr: 'En quelle année le Cameroun a-t-il accédé à l’indépendance ?', type: 'mcq',
    options: opt('1958', '1960', '1961', '1972', 1), correct_index: 1,
    theme: 'histoire', level: 'intermediate', explanation: 'Le 1er janvier 1960.',
    status: 'draft', version: 1, success_rate: null, created_at: '2026-06-18T10:00:00Z', updated_at: '2026-06-18T10:00:00Z',
  },
  {
    id: 'q-005', text_fr: 'Quelle ville est la capitale économique ?', type: 'mcq',
    options: opt('Yaoundé', 'Douala', 'Kribi', 'Limbé', 1), correct_index: 1,
    theme: 'geographie', level: 'beginner', explanation: 'Douala est le poumon économique.',
    status: 'approved', version: 2, success_rate: 0.88, created_at: '2026-05-10T10:00:00Z', updated_at: '2026-06-01T10:00:00Z',
  },
  {
    id: 'q-006', text_fr: 'Quel est le plus haut sommet du Cameroun ?', type: 'mcq',
    options: opt('Mont Oku', 'Mont Cameroun', 'Mandara', 'Mbam', 1), correct_index: 1,
    theme: 'geographie', level: 'expert', explanation: 'Le Mont Cameroun (4095 m).',
    status: 'rejected', version: 1, success_rate: null, created_at: '2026-06-05T10:00:00Z', updated_at: '2026-06-09T10:00:00Z',
  },
  {
    id: 'q-007', text_fr: 'Quelle monnaie est utilisée au Cameroun ?', type: 'mcq',
    options: opt('Le Naira', 'Le Franc CFA', 'Le Cedi', 'Le Dirham', 1), correct_index: 1,
    theme: 'industrie', level: 'beginner', explanation: 'Le Franc CFA (XAF).',
    status: 'approved', version: 1, success_rate: 0.95, created_at: '2026-05-12T10:00:00Z', updated_at: '2026-05-12T10:00:00Z',
  },
  {
    id: 'q-008', text_fr: 'Quel scientifique camerounais est connu pour ses travaux en santé ?', type: 'mcq',
    options: opt('Victor Anomah Ngu', 'Manu Dibango', 'Mongo Beti', 'Roger Milla', 0), correct_index: 0,
    theme: 'science', level: 'expert', explanation: 'Pr. Victor Anomah Ngu, pionnier en oncologie.',
    status: 'pending_review', version: 1, success_rate: null, created_at: '2026-06-16T10:00:00Z', updated_at: '2026-06-16T10:00:00Z',
  },
  {
    id: 'q-009', text_fr: 'Combien de régions compte le Cameroun ?', type: 'mcq',
    options: opt('8', '10', '12', '14', 1), correct_index: 1,
    theme: 'geographie', level: 'beginner', explanation: 'Le Cameroun compte 10 régions.',
    status: 'archived', version: 4, success_rate: 0.79, created_at: '2026-04-20T10:00:00Z', updated_at: '2026-06-12T10:00:00Z',
  },
  {
    id: 'q-010', text_fr: 'Quel artiste a popularisé le Makossa ?', type: 'mcq',
    options: opt('Manu Dibango', 'Petit Pays', 'Lady Ponce', 'Locko', 0), correct_index: 0,
    theme: 'culture', level: 'intermediate', explanation: 'Manu Dibango, légende du Makossa.',
    status: 'approved', version: 1, success_rate: 0.74, created_at: '2026-05-22T10:00:00Z', updated_at: '2026-05-22T10:00:00Z',
  },
];

export default mockQuestions;
