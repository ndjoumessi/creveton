import { Link } from 'react-router-dom';
import { useUiStore } from '../store/uiStore';

// Page publique statique. Contenu bilingue inline (pas de clés i18n dédiées) ;
// le switcher réutilise uiStore.lang pour rester cohérent avec le reste du site.
const CONTENT = {
  fr: {
    title: 'Politique de confidentialité',
    updated: 'Dernière mise à jour : juin 2026',
    back: '← Retour à l’accueil',
    sections: [
      {
        h: '1. Données collectées',
        p: ['Creveton collecte les données suivantes lors de l’inscription et de l’utilisation :'],
        ul: [
          'Numéro de téléphone (authentification OTP)',
          'Nom d’affichage et photo de profil (optionnel)',
          'Progression de jeu : scores, niveaux, historique de parties',
          'Données de tournois et classements',
          'Token de notification push (si autorisé)',
        ],
      },
      {
        h: '2. Utilisation des données',
        p: ['Ces données sont utilisées exclusivement pour :'],
        ul: [
          'Permettre l’authentification et la gestion du compte',
          'Calculer les scores, classements et progressions',
          'Envoyer des notifications de tournois (si autorisées)',
          'Améliorer l’expérience de jeu',
        ],
      },
      {
        h: '3. Partage des données',
        p: ['Creveton ne vend et ne partage pas vos données personnelles avec des tiers, sauf obligation légale.'],
      },
      {
        h: '4. Conservation des données',
        p: ['Vos données sont conservées tant que votre compte est actif. Vous pouvez demander la suppression de votre compte en contactant support@creveton.cm.'],
      },
      {
        h: '5. Sécurité',
        p: ['Les données sont transmises via HTTPS (TLS 1.3) et stockées sur des serveurs sécurisés.'],
      },
      {
        h: '6. Contact',
        p: ['Pour toute question : support@creveton.cm'],
      },
    ],
  },
  en: {
    title: 'Privacy Policy',
    updated: 'Last updated: June 2026',
    back: '← Back to home',
    sections: [
      {
        h: '1. Data collected',
        p: ['Creveton collects the following data during sign-up and use:'],
        ul: [
          'Phone number (OTP authentication)',
          'Display name and profile picture (optional)',
          'Game progress: scores, levels, match history',
          'Tournament and leaderboard data',
          'Push notification token (if allowed)',
        ],
      },
      {
        h: '2. Use of data',
        p: ['This data is used exclusively to:'],
        ul: [
          'Enable authentication and account management',
          'Compute scores, rankings and progress',
          'Send tournament notifications (if allowed)',
          'Improve the gaming experience',
        ],
      },
      {
        h: '3. Data sharing',
        p: ['Creveton does not sell or share your personal data with third parties, except where legally required.'],
      },
      {
        h: '4. Data retention',
        p: ['Your data is kept as long as your account is active. You can request account deletion by contacting support@creveton.cm.'],
      },
      {
        h: '5. Security',
        p: ['Data is transmitted over HTTPS (TLS 1.3) and stored on secure servers.'],
      },
      {
        h: '6. Contact',
        p: ['For any question: support@creveton.cm'],
      },
    ],
  },
};

const SG = "'Space Grotesk', system-ui, sans-serif";
const OUTFIT = "'Outfit', system-ui, sans-serif";

export default function Privacy() {
  const lang = useUiStore((s) => s.lang) === 'en' ? 'en' : 'fr';
  const setLang = useUiStore((s) => s.setLang);
  const c = CONTENT[lang];

  const langBtn = (code, label) => (
    <button
      type="button"
      onClick={() => setLang(code)}
      style={{
        background: 'none',
        border: 0,
        cursor: 'pointer',
        fontFamily: SG,
        fontWeight: 600,
        fontSize: 13,
        padding: '4px 6px',
        color: lang === code ? '#d4a017' : 'rgba(253,246,233,0.5)',
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#fdf6e9', fontFamily: OUTFIT, color: '#374151' }}>
      {/* Header vert nuit */}
      <header style={{ background: '#0b2e1a', padding: '24px 0 36px' }}>
        <div style={{ maxWidth: 820, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none' }}>
              <span style={{ width: 40, height: 40, background: '#d4a017', borderRadius: 10, display: 'grid', placeItems: 'center', fontFamily: SG, fontWeight: 700, fontSize: 18, color: '#0b2e1a' }}>C</span>
              <span style={{ fontFamily: SG, fontWeight: 600, fontSize: 20, color: '#fdf6e9' }}>Creveton</span>
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {langBtn('fr', 'FR')}
              {langBtn('en', 'EN')}
            </div>
          </div>
          <h1 style={{ fontFamily: SG, fontWeight: 700, fontSize: 'clamp(28px, 4vw, 40px)', letterSpacing: '-0.8px', color: '#fdf6e9', margin: '32px 0 8px' }}>
            {c.title}
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: 'rgba(253,246,233,0.55)' }}>{c.updated}</p>
        </div>
      </header>

      {/* Corps crème */}
      <main style={{ maxWidth: 820, margin: '0 auto', padding: '40px 24px 64px' }}>
        {c.sections.map((s) => (
          <section key={s.h} style={{ marginBottom: 32 }}>
            <h2 style={{ fontFamily: SG, fontWeight: 700, fontSize: 20, letterSpacing: '-0.3px', color: '#0b2e1a', margin: '0 0 12px' }}>
              {s.h}
            </h2>
            {s.p.map((para) => (
              <p key={para} style={{ margin: '0 0 10px', fontSize: 15, lineHeight: 1.65, color: '#374151' }}>{para}</p>
            ))}
            {s.ul && (
              <ul style={{ margin: '8px 0 0', paddingLeft: 22 }}>
                {s.ul.map((li) => (
                  <li key={li} style={{ fontSize: 15, lineHeight: 1.7, color: '#374151' }}>{li}</li>
                ))}
              </ul>
            )}
          </section>
        ))}

        <Link to="/" style={{ display: 'inline-block', marginTop: 8, fontFamily: SG, fontWeight: 600, fontSize: 14, color: '#2a8a4f', textDecoration: 'none' }}>
          {c.back}
        </Link>
      </main>
    </div>
  );
}
