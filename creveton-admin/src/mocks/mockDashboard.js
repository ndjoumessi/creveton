// Mock du tableau de bord — aligné sur la réponse de GET /admin/dashboard.

const mockDashboard = {
  kpis: {
    total_users: 12480,
    games_today: 342,
    active_questions: 187,
    open_tournaments: 3,
    online_now: 84,
    success_rate: 72,
  },
  recent_users: [
    { id: 'u-001', name: 'Junior Kamga', ville: 'Douala', created_at: '2026-06-21T08:30:00Z' },
    { id: 'u-002', name: 'Awa Mballa', ville: 'Yaoundé', created_at: '2026-06-21T07:55:00Z' },
    { id: 'u-010', name: 'Estelle Ngo', ville: 'Kribi', created_at: '2026-06-20T19:10:00Z' },
    { id: 'u-006', name: 'Cédric Fotso', ville: 'Garoua', created_at: '2026-06-20T16:42:00Z' },
    { id: 'u-007', name: 'Nadège Tchoua', ville: 'Douala', created_at: '2026-06-20T14:05:00Z' },
  ],
  pending_questions: [
    { id: 'q-003', text_fr: 'Quel fleuve traverse Yaoundé ?', theme: 'geographie', level: 'intermediate', status: 'pending_review' },
    { id: 'q-008', text_fr: 'Quel scientifique camerounais est connu pour ses travaux en santé ?', theme: 'science', level: 'expert', status: 'pending_review' },
  ],
  system: {
    api: 'operational',
    db: 'operational',
    redis: 'operational',
    last_sync: '2026-06-21T09:42:00Z',
  },
};

export default mockDashboard;
