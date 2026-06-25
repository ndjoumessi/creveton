import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

const DISMISS_KEY = 'creveton_admin_pwa_dismissed';

/**
 * Bannière discrète « Installer l'application » : n'apparaît que lorsque le
 * navigateur émet `beforeinstallprompt` (PWA installable, non encore installée)
 * et que l'utilisateur ne l'a pas masquée définitivement (localStorage).
 */
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY) === 'true') return undefined;
    const handler = (e) => {
      e.preventDefault();
      setDeferred(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    // Une fois installée, on retire la bannière.
    const installed = () => setDeferred(null);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);

  if (!deferred) return null;

  const install = async () => {
    deferred.prompt();
    try {
      await deferred.userChoice;
    } finally {
      setDeferred(null);
    }
  };

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, 'true');
    setDeferred(null);
  };

  return (
    <div className="install-banner" role="region" aria-label="Installer l'application">
      <span className="install-banner__text">
        <Download size={16} aria-hidden="true" />
        Installer Creveton Admin comme application
      </span>
      <span className="install-banner__actions">
        <button type="button" className="install-banner__cta" onClick={install}>
          Installer
        </button>
        <button
          type="button"
          className="install-banner__close"
          onClick={dismiss}
          aria-label="Ne plus afficher"
          title="Ne plus afficher"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </span>
    </div>
  );
}
