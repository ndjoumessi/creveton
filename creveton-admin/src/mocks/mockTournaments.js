// 4 tournois mock (statuts variés — CDC §3.4). Mises = 0 (mode gratuit forcé).

const mockTournaments = [
  { id: 't-001', name: 'Grand Quiz National', type: 'free', entry_fee: 0, max_players: 256, registered_players: 184, prize_pool: 0, theme: 'culture', status: 'open', starts_at: '2026-06-25T18:00:00Z', ends_at: null },
  { id: 't-002', name: 'Défi Géographie Express', type: 'flash', entry_fee: 0, max_players: 64, registered_players: 64, prize_pool: 0, theme: 'geographie', status: 'running', starts_at: '2026-06-21T12:00:00Z', ends_at: null },
  { id: 't-003', name: 'Mini Tournoi Histoire', type: 'mini', entry_fee: 0, max_players: 32, registered_players: 12, prize_pool: 0, theme: 'histoire', status: 'scheduled', starts_at: '2026-06-28T16:00:00Z', ends_at: null },
  { id: 't-004', name: 'Coupe Sport Cameroun', type: 'free', entry_fee: 0, max_players: 128, registered_players: 128, prize_pool: 0, theme: 'sport', status: 'closed', starts_at: '2026-06-14T18:00:00Z', ends_at: '2026-06-14T19:30:00Z' },
];

export default mockTournaments;
