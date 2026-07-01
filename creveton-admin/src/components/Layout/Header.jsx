import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Command, Moon, Sun, Menu, X } from 'lucide-react';
import { useUiStore } from '../../store/uiStore';
import useThemeStore from '../../store/themeStore';
import { triggerRefresh } from '../../hooks/useApiData';
import { notify } from '../Toast';

const TITLE_KEYS = {
  '/dashboard': 'nav.dashboard',
  '/classement': 'nav.leaderboard',
  '/questions': 'nav.questions',
  '/sessions': 'nav.sessions',
  '/tournaments': 'nav.tournaments',
  '/users': 'nav.users',
  '/settings': 'nav.settings',
};

export default function Header({ mobileNavOpen, onToggleMobileNav }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const lang = useUiStore((s) => s.lang);
  const setLang = useUiStore((s) => s.setLang);
  const isDark = useThemeStore((s) => s.isDark);
  const toggleTheme = useThemeStore((s) => s.toggle);
  const onToggleTheme = () => {
    toggleTheme();
    notify.success(isDark ? t('settings.account.themeToastLight') : t('settings.account.themeToastDark'));
  };

  const title = TITLE_KEYS[pathname] ? t(TITLE_KEYS[pathname]) : t('header.console');

  const onRefresh = () => {
    triggerRefresh();
    notify.success(t('header.notify.refreshed'));
  };
  // Ouvre la palette de commandes (Cmd+K) via un faux événement clavier.
  const openPalette = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));

  return (
    <header className="header">
      <button
        className="hamburger-btn"
        onClick={onToggleMobileNav}
        aria-label={mobileNavOpen ? t('nav.close') : t('nav.open')}
        aria-expanded={mobileNavOpen}
        aria-controls="main-sidebar"
      >
        {mobileNavOpen ? <X size={22} /> : <Menu size={22} />}
      </button>

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

      <button
        className="header-theme-btn"
        onClick={onToggleTheme}
        title={isDark ? t('header.themeLight') : t('header.themeDark')}
        aria-label={isDark ? t('header.themeLight') : t('header.themeDark')}
      >
        {isDark ? <Sun size={16} /> : <Moon size={16} />}
      </button>

      <button className="header-btn" onClick={onRefresh} title={t('header.refresh')}><RefreshCw size={15} /> {t('header.refresh')}</button>
    </header>
  );
}
