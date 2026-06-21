// Données mock du dashboard MVP (éléments sans endpoint dédié : activité du jour
// + statut système + dernière synchro questions).

const mockDashboard = {
  games_today: 342,
  system: { api: 'ok', database: 'ok', redis: 'ok' },
  last_questions_sync: '2026-06-21T09:42:00Z',
};

export default mockDashboard;
