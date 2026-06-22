import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RefreshCw, LogOut, Command } from 'lucide-react';
import { useUiStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { triggerRefresh } from '../../hooks/useApiData';
import { notify } from '../Toast';
import Modal from '../Modal';

const TITLE_KEYS = {
  '/dashboard': 'nav.dashboard',
  '/classement': 'nav.leaderboard',
  '/questions': 'nav.questions',
  '/sessions': 'nav.sessions',
  '/tournaments': 'nav.tournaments',
  '/users': 'nav.users',
  '/settings': 'nav.settings',
};

export default function Header() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const lang = useUiStore((s) => s.lang);
  const setLang = useUiStore((s) => s.setLang);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const title = TITLE_KEYS[pathname] ? t(TITLE_KEYS[pathname]) : t('header.console');
  const initials = (user?.name || 'AD').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  const onRefresh = () => {
    triggerRefresh();
    notify.success(t('header.notify.refreshed'));
  };
  const doLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };
  // Ouvre la palette de commandes (Cmd+K) via un faux événement clavier.
  const openPalette = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));

  return (
    <header className="header">
      <div className="breadcrumb">
        <Link to="/dashboard" className="crumb-muted" title={t('header.a11y.console')}>{t('header.console')}</Link>
        <span className="crumb-sep">/</span>
        <span className="crumb-current">{title}</span>
      </div>

      <div className="header-spacer" />

      <button className="cmdk-trigger" onClick={openPalette} title={t('header.a11y.palette')}>
        <Command size={14} /> <span>{t('common.search')}</span> <kbd>⌘K</kbd>
      </button>

      <div className="header-sep" />

      <span className="live-badge"><span className="live-dot" /> {t('header.live')}</span>

      <div className="header-sep" />

      <div className="lang-toggle">
        <button className={lang === 'fr' ? 'active' : ''} onClick={() => setLang('fr')}>FR</button>
        <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>EN</button>
      </div>

      <button className="header-btn" onClick={onRefresh} title={t('header.refresh')}><RefreshCw size={15} /> {t('header.refresh')}</button>

      <div className="header-sep" />

      {user?.avatar_url ? (
        <img className="profile-avatar profile-avatar-img" src={user.avatar_url} alt={user?.name || 'Admin'} title={user?.name || 'Admin'} />
      ) : (
        <div className="profile-avatar" title={user?.name || 'Admin'}>{initials}</div>
      )}

      <button className="header-btn" onClick={() => setConfirmLogout(true)} title={t('header.logout')} aria-label={t('header.logout')}>
        <LogOut size={17} />
      </button>

      <Modal
        open={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        title={t('header.logout')}
        footer={(
          <>
            <button className="btn" onClick={() => setConfirmLogout(false)}>{t('common.cancel')}</button>
            <button className="btn btn-danger" onClick={doLogout}><LogOut size={15} /> {t('header.logout')}</button>
          </>
        )}
      >
        <p style={{ margin: 0 }}>{t('header.logoutConfirm')}</p>
      </Modal>
    </header>
  );
}
