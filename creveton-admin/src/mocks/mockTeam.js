// Données de démonstration — équipe d'administration (repli hors-ligne dev).
import { DEFAULT_ROLE_PERMISSIONS } from '../constants/permissions';

const mockTeam = {
  data: [
    {
      id: 'tm-1', name: 'Nelson Djoumessi', email: 'admin@creveton.cm', phone: '+237 6 99 00 11 22',
      ville: 'Yaoundé', role: 'super_admin', status: 'active',
      last_active_at: '2026-06-22T08:40:00Z', created_at: '2026-01-04T09:00:00Z',
      invited_by: null, activity_count: 312,
    },
    {
      id: 'tm-2', name: 'Aïcha Bello', email: 'aicha@creveton.cm', phone: '+237 6 70 22 33 44',
      ville: 'Garoua', role: 'admin', status: 'active',
      last_active_at: '2026-06-22T07:10:00Z', created_at: '2026-02-12T10:30:00Z',
      invited_by: 'Nelson Djoumessi', activity_count: 148,
    },
    {
      id: 'tm-3', name: 'Cédric Fotso', email: 'cedric@creveton.cm', phone: '+237 6 55 66 77 88',
      ville: 'Douala', role: 'moderator', status: 'active',
      last_active_at: '2026-06-21T19:25:00Z', created_at: '2026-03-01T14:00:00Z',
      invited_by: 'Aïcha Bello', activity_count: 87,
    },
    {
      id: 'tm-4', name: 'Mariam Nkoulou', email: 'mariam@creveton.cm', phone: '+237 6 78 12 34 56',
      ville: 'Bafoussam', role: 'moderator', status: 'suspended',
      last_active_at: '2026-05-30T11:00:00Z', created_at: '2026-03-18T16:45:00Z',
      invited_by: 'Aïcha Bello', activity_count: 23,
    },
  ],
};

export const mockTeamStats = { total: 4, super_admins: 1, admins: 1, moderators: 2 };

export const mockTeamRoles = {
  roles: ['super_admin', 'admin', 'moderator', 'player'].map((role) => ({
    role,
    members: { super_admin: 1, admin: 1, moderator: 2, player: 0 }[role],
    system: role === 'super_admin' || role === 'player',
    permissions: DEFAULT_ROLE_PERMISSIONS[role] || {},
  })),
};

export const mockTeamActivity = {
  events: [
    { id: 'ev-1', event: 'approved', created_at: '2026-06-22T08:30:00Z', meta: {}, question_text: 'Quelle est la capitale du Cameroun ?' },
    { id: 'ev-2', event: 'created', created_at: '2026-06-21T17:12:00Z', meta: {}, question_text: 'Quel fleuve traverse Édéa ?' },
    { id: 'ev-3', event: 'rejected', created_at: '2026-06-21T15:40:00Z', meta: {}, reason: 'Réponse ambiguë', question_text: 'Combien de régions compte le Cameroun ?' },
    { id: 'ev-4', event: 'force_sync', created_at: '2026-06-20T09:05:00Z', meta: { devices_targeted: 14230 }, question_text: 'Qui a écrit « Ville cruelle » ?' },
  ],
};

export default mockTeam;
