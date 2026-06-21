// 10 utilisateurs mock aux profils variés (CDC §3.2).

const mockUsers = [
  { id: 'u-001', name: 'Junior Kamga', email: 'junior.k@example.cm', phone: '+237690000001', ville: 'Douala', level: 5, total_xp: 41200, wallet_balance: 12500, role: 'player', status: 'active', kyc: true, created_at: '2026-02-10T08:00:00Z' },
  { id: 'u-002', name: 'Awa Mballa', email: 'awa.m@example.cm', phone: '+237690000002', ville: 'Yaoundé', level: 4, total_xp: 38900, wallet_balance: 8000, role: 'player', status: 'active', kyc: false, created_at: '2026-02-15T08:00:00Z' },
  { id: 'u-003', name: 'Boris Nkeng', email: 'boris.n@example.cm', phone: '+237690000003', ville: 'Bafoussam', level: 3, total_xp: 15400, wallet_balance: 0, role: 'player', status: 'suspended', kyc: false, created_at: '2026-03-01T08:00:00Z' },
  { id: 'u-004', name: 'Sandra Eyenga', email: 'sandra.e@example.cm', phone: '+237690000004', ville: 'Douala', level: 5, total_xp: 52300, wallet_balance: 24000, role: 'player', status: 'active', kyc: true, created_at: '2026-01-20T08:00:00Z' },
  { id: 'u-005', name: 'Modérateur Contenu', email: 'mod@creveton.cm', phone: '+237690000005', ville: 'Yaoundé', level: 5, total_xp: 0, wallet_balance: 0, role: 'moderator', status: 'active', kyc: false, created_at: '2026-01-05T08:00:00Z' },
  { id: 'u-006', name: 'Cédric Fotso', email: 'cedric.f@example.cm', phone: '+237690000006', ville: 'Garoua', level: 2, total_xp: 7800, wallet_balance: 1500, role: 'player', status: 'active', kyc: false, created_at: '2026-04-02T08:00:00Z' },
  { id: 'u-007', name: 'Nadège Tchoua', email: 'nadege.t@example.cm', phone: '+237690000007', ville: 'Douala', level: 4, total_xp: 33100, wallet_balance: 16800, role: 'player', status: 'active', kyc: true, created_at: '2026-02-28T08:00:00Z' },
  { id: 'u-008', name: 'Yannick Abega', email: 'yannick.a@example.cm', phone: '+237690000008', ville: 'Bertoua', level: 1, total_xp: 1200, wallet_balance: 0, role: 'player', status: 'banned', kyc: false, created_at: '2026-05-12T08:00:00Z' },
  { id: 'u-009', name: 'Admin Finances', email: 'finance@creveton.cm', phone: '+237690000009', ville: 'Yaoundé', level: 5, total_xp: 0, wallet_balance: 0, role: 'admin', status: 'active', kyc: false, created_at: '2026-01-03T08:00:00Z' },
  { id: 'u-010', name: 'Estelle Ngo', email: 'estelle.n@example.cm', phone: '+237690000010', ville: 'Kribi', level: 3, total_xp: 19600, wallet_balance: 4200, role: 'player', status: 'active', kyc: false, created_at: '2026-03-18T08:00:00Z' },
];

export default mockUsers;
