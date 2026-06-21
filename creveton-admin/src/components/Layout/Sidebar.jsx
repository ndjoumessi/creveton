import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, BarChart3, Bell, LifeBuoy, Users, ShieldCheck,
  ArrowLeftRight, Wallet, ArrowDownUp, ScrollText, FileClock, UserCog,
  FileQuestion, Trophy, Swords, Settings,
} from 'lucide-react';
import { useUiStore } from '../../store/uiStore';

const NAV = [
  {
    title: 'Vue générale',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/analytics', label: 'Analytique', icon: BarChart3 },
      { to: '/alerts', label: 'Alertes', icon: Bell },
      { to: '/support', label: 'Support', icon: LifeBuoy },
    ],
  },
  {
    title: 'Utilisateurs',
    items: [
      { to: '/users', label: 'Utilisateurs', icon: Users },
      { to: '/kyc', label: 'Vérification KYC', icon: ShieldCheck },
    ],
  },
  {
    title: 'Finances',
    items: [
      { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
      { to: '/finances', label: 'Finances & Revenus', icon: Wallet },
      { to: '/wallet-ops', label: 'Recharges & Retraits', icon: ArrowDownUp },
    ],
  },
  {
    title: 'Conformité',
    items: [
      { to: '/compliance', label: 'Conformité ANIF', icon: ScrollText },
      { to: '/audit', label: 'Journal Audit', icon: FileClock },
      { to: '/team', label: 'Équipe Admin', icon: UserCog },
    ],
  },
  {
    title: 'Contenu',
    items: [
      { to: '/questions', label: 'Questions', icon: FileQuestion },
      { to: '/tournaments', label: 'Tournois', icon: Trophy },
      { to: '/challenges', label: 'Challenges', icon: Swords },
    ],
  },
  {
    title: 'Paramètres',
    items: [{ to: '/settings', label: 'Paramètres', icon: Settings }],
  },
];

export default function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-brand">
        <div className="sidebar-logo">C</div>
        {!collapsed && <span className="sidebar-brand-name">Creveton</span>}
      </div>
      <nav className="sidebar-nav">
        {NAV.map((section) => (
          <div className="nav-section" key={section.title}>
            <div className="nav-section-title">{section.title}</div>
            {section.items.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                title={label}
              >
                <Icon className="nav-icon" size={18} />
                <span className="nav-label">{label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
