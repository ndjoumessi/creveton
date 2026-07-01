import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, Trophy, FileQuestion, Gamepad2, Swords, Users, Settings, UsersRound, ShieldCheck, Headphones, Wallet, LogOut } from 'lucide-react';
import dashboardService from '../../services/dashboard.service';
import { useApiData } from '../../hooks/useApiData';
import { useAuthStore } from '../../store/authStore';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { roleLabels } from '../../constants/enums';
import Avatar from '../Avatar';

const NAV = [
  {
    titleKey: 'nav.general',
    items: [
      { to: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard, end: true },
      { to: '/classement', labelKey: 'nav.leaderboard', icon: Trophy },
    ],
  },
  {
    titleKey: 'nav.content',
    items: [
      { to: '/questions', labelKey: 'nav.questions', icon: FileQuestion, badgeKey: 'pending' },
      { to: '/sessions', labelKey: 'nav.sessions', icon: Gamepad2 },
      { to: '/tournaments', labelKey: 'nav.tournaments', icon: Swords },
    ],
  },
  {
    titleKey: 'nav.userSection',
    items: [{ to: '/users', labelKey: 'nav.users', icon: Users }],
  },
  {
    titleKey: 'nav.financeSection',
    // Accès finances réservé à admin+ (miroir de permissions.js finances.read).
    items: [{ to: '/finances', labelKey: 'nav.finances', icon: Wallet, roles: ['admin', 'super_admin'] }],
  },
  {
    titleKey: 'nav.teamSection',
    items: [
      // Équipe & rôles : réservés à admin+ (team:read = admin côté backend).
      { to: '/team', labelKey: 'nav.team', icon: UsersRound, end: true, roles: ['admin', 'super_admin'] },
      { to: '/team/roles', labelKey: 'nav.roles', icon: ShieldCheck, roles: ['admin', 'super_admin'] },
      { to: '/support', labelKey: 'nav.support', icon: Headphones },
    ],
  },
  {
    titleKey: 'nav.params',
    items: [{ to: '/settings', labelKey: 'nav.settings', icon: Settings }],
  },
];

export default function Sidebar({ mobileNavOpen = false, onCloseMobileNav }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.role)();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const handleLogout = () => { logout(); navigate('/login', { replace: true }); };
  // Focus trap + Échap + restauration du focus quand le drawer mobile est ouvert.
  const trapRef = useFocusTrap(mobileNavOpen, onCloseMobileNav);
  // Compteur de questions en attente pour le badge de notification.
  const { data } = useApiData(() => dashboardService.overview().catch(() => null), [], { pollMs: 60000 });
  const pending = data?.pending_questions?.length || 0;

  // Filtre les entrées gardées par rôle (item.roles), puis masque les sections vides.
  const sections = NAV
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.roles || item.roles.includes(role)),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <aside id="main-sidebar" ref={trapRef} className={`sidebar${mobileNavOpen ? ' is-open' : ''}`}>
      <Link to="/dashboard" className="sidebar-brand" aria-label="Tableau de bord Creveton" onClick={onCloseMobileNav}>
        <img src="/logo.png" width={32} height={32} className="sidebar-logo-img" alt="Creveton" />
        <span className="sidebar-brand-txt">
          <span className="sidebar-brand-name">Creveton</span>
          <span className="sidebar-brand-sub">Cockpit Émeraude</span>
        </span>
      </Link>
      <nav className="sidebar-nav">
        {sections.map((section) => (
          <div className="nav-section" key={section.titleKey}>
            <div className="nav-section-title">{t(section.titleKey)}</div>
            {section.items.map(({ to, labelKey, icon: Icon, end, badgeKey }) => {
              const label = t(labelKey);
              return (
                <NavLink key={to} to={to} end={end} onClick={onCloseMobileNav} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title={label}>
                  <Icon className="nav-icon" size={18} />
                  <span className="nav-label">{label}</span>
                  {badgeKey === 'pending' && pending > 0 && <span className="nav-badge">{pending}</span>}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>
      {user && (
        <div className="sidebar-foot">
          <Avatar name={user.name} src={user.avatar_url} size="sm" />
          <div className="sidebar-foot-id">
            <span className="sidebar-foot-name">{user.name}</span>
            <span className="sidebar-foot-role">{roleLabels[user.role] || user.role}</span>
          </div>
          <button
            type="button"
            className="sidebar-logout"
            onClick={handleLogout}
            title={t('header.logout')}
            aria-label={t('header.logout')}
          >
            <LogOut size={18} />
          </button>
        </div>
      )}
    </aside>
  );
}
