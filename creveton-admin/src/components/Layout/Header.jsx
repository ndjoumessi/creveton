import { useLocation, useNavigate } from 'react-router-dom';
import { RefreshCw, LogOut } from 'lucide-react';
import { useUiStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { triggerRefresh } from '../../hooks/useApiData';
import { notify } from '../Toast';

const TITLES = {
  '/': 'Dashboard',
  '/leaderboard': 'Classement',
  '/questions': 'Questions',
  '/sessions': 'Parties',
  '/tournaments': 'Tournois',
  '/users': 'Utilisateurs',
  '/settings': 'Paramètres',
};

export default function Header() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const lang = useUiStore((s) => s.lang);
  const setLang = useUiStore((s) => s.setLang);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const title = TITLES[pathname] || 'Console';
  const initials = (user?.name || 'AD').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  const onRefresh = () => {
    triggerRefresh();
    notify.success('Données actualisées');
  };
  const onLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="header">
      <div className="breadcrumb">
        <span className="crumb-muted">Console</span>
        <span className="crumb-sep">/</span>
        <span className="crumb-current">{title}</span>
      </div>

      <div className="header-spacer" />

      <span className="live-badge"><span className="live-dot" /> Live</span>

      <div className="lang-toggle">
        <button className={lang === 'fr' ? 'active' : ''} onClick={() => setLang('fr')}>FR</button>
        <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>EN</button>
      </div>

      <button className="btn btn-sm" onClick={onRefresh}><RefreshCw size={15} /> Actualiser</button>

      <div className="profile">
        <div className="avatar">{initials}</div>
      </div>

      <button className="icon-btn" onClick={onLogout} title="Déconnexion" aria-label="Déconnexion">
        <LogOut size={17} />
      </button>
    </header>
  );
}
