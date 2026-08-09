import { Link } from 'react-router-dom';
import {
  Target,
  Swords,
  Trophy,
  BarChart3,
  Flame,
  UserPlus,
  LayoutGrid,
  Gamepad2,
  WifiOff,
  Languages,
  Smartphone,
  MessageCircle,
  AtSign,
  Send,
  ArrowRight,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/authStore';
import { useUiStore } from '../store/uiStore';
import { useCountUp } from '../hooks/useCountUp';
import { useHashScroll } from '../hooks/useHashScroll';
import { PRODUCT_FACTS, PUBLIC_THEMES } from '../constants/product';
import './Landing.css';

// Lattice de losanges (décor des bandes vert nuit : héro + thèmes + CTA).
// Coordonnées pré-calculées une fois ; la pulsation vit dans Landing.css.
const DIAMONDS = (() => {
  const out = [];
  const SP = 88;
  const R = 27;
  for (let row = 0; row < 9; row += 1) {
    for (let col = 0; col < 14; col += 1) {
      const cx = col * SP + (row % 2 ? SP / 2 : 0);
      const cy = row * SP;
      out.push({ cx, cy, r: R });
    }
  }
  return out;
})();

function DiamondGrid() {
  return (
    <svg className="land-grid" viewBox="0 0 1232 792" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {DIAMONDS.map((d, i) => (
        <path
          key={i}
          className="land-diamond"
          d={`M ${d.cx} ${d.cy - d.r} L ${d.cx + d.r} ${d.cy} L ${d.cx} ${d.cy + d.r} L ${d.cx - d.r} ${d.cy} Z`}
        />
      ))}
    </svg>
  );
}

// Données structurelles (icônes, valeurs non traduisibles). Le texte visible
// est résolu via t() à partir des clés ci-dessous.

// Capacités RÉELLES du produit (backend : sessions chronométrées, challengeService
// 1v1, tournois temps réel socket.io, leaderboard, creditSessionXp/niveaux 1–5).
const features = [
  { icon: Target, key: 'quiz' },
  { icon: Swords, key: 'duel' },
  { icon: Trophy, key: 'tournaments' },
  { icon: BarChart3, key: 'leaderboard' },
  { icon: Flame, key: 'xp' },
];

const etapes = [
  { icon: UserPlus, key: 'step1' },
  { icon: LayoutGrid, key: 'step2' },
  { icon: Gamepad2, key: 'step3' },
];

// Ce qui distingue vraiment l'app sur son marché — chaque point est adossé à
// du code existant : offlineQueue (AsyncStorage + rejeu /sessions/submit),
// colonnes text_fr/text_en + getQuestionText, cache expo-sqlite du delta sync.
const conception = [
  { icon: WifiOff, key: 'offline' },
  { icon: Languages, key: 'bilingual' },
  { icon: Smartphone, key: 'light' },
];

const reseaux = [
  { icon: MessageCircle, label: 'Facebook' },
  { icon: AtSign, label: 'Instagram' },
  { icon: Send, label: 'X (Twitter)' },
];

// Options du mockup quiz (noms de villes = propres, non traduisibles). B correct.
const mockOptions = [
  { letter: 'A', city: 'Douala' },
  { letter: 'B', city: 'Yaoundé', correct: true },
  { letter: 'C', city: 'Bamenda' },
  { letter: 'D', city: 'Garoua' },
];

/* Une statistique animée au défilement (count-up via IntersectionObserver). */
function StatCountUp({ end, suffix, label }) {
  const [value, ref] = useCountUp(end);
  return (
    <div className="land-stat">
      <span className="land-stat-num" ref={ref}>
        {value}
        {suffix && <span>{suffix}</span>}
      </span>
      <span className="land-stat-label">{label}</span>
    </div>
  );
}

/* Mockup téléphone du héro — extrait pour garder le héro lisible. */
function PhoneMockup({ t }) {
  return (
    <div className="land-phone" aria-hidden="true">
      <div className="land-phone-status">
        <span>9:41</span>
        <span className="land-phone-sig">
          <i /><i /><i /><i />
        </span>
      </div>
      <div className="land-phone-header">
        <span className="land-phone-badge">🌍 {t('questions.themes.geographie')}</span>
        <span className="land-phone-timer">00:12</span>
      </div>
      <div className="land-phone-progress">
        <span className="land-phone-fill" />
      </div>
      <div className="land-phone-question">
        <div className="land-phone-qlabel">{t('landing.mockup.qNum')}</div>
        <p className="land-phone-qtext">{t('landing.mockup.question')}</p>
      </div>
      <div className="land-phone-options">
        {mockOptions.map(({ letter, city, correct }) => (
          <div key={letter} className={`land-phone-option${correct ? ' correct' : ''}`}>
            <span className="land-phone-letter">{letter}</span>
            {city}
          </div>
        ))}
      </div>
      <div className="land-phone-score">
        <span>{t('landing.mockup.score')}</span>
        <strong>1 240 pts</strong>
      </div>
    </div>
  );
}

export default function Landing() {
  const { t } = useTranslation();
  // Lien partagé ou rafraîchissement sur `/landing#themes` : le saut natif a eu
  // lieu avant que React ne rende les sections, il n'a rien trouvé.
  useHashScroll();
  // Switcher de langue autonome (la Landing publique n'a pas la navbar admin).
  // setLang → i18n.changeLanguage + localStorage ; useTranslation re-render seul.
  const lang = useUiStore((s) => s.lang);
  const setLang = useUiStore((s) => s.setLang);
  // Cible du CTA console : tableau de bord si déjà connecté admin, sinon login.
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const consoleTarget = user && isAuthenticated() && isAdmin() ? '/dashboard' : '/login';

  return (
    <div className="land-page">
      {/* ═══════════ HÉRO (vert nuit + losanges) ═══════════ */}
      <section className="land-hero">
        <DiamondGrid />

        <nav className="land-nav">
          <div className="land-nav-brand">
            <img className="land-nav-logo" src="/logo.png" alt="Creveton" />
            <span className="land-nav-name">Creveton</span>
          </div>
          <div className="land-nav-links">
            <a className="land-nav-link" href="#features">{t('landing.nav.features')}</a>
            <a className="land-nav-link" href="#themes">{t('landing.nav.themes')}</a>
            <a className="land-nav-link" href="#about">{t('landing.nav.about')}</a>
          </div>
          {/* Switcher autonome — hors .land-nav-links pour rester visible < 768px. */}
          <div className="land-nav-end">
            <div className="land-lang-switch" role="group" aria-label={t('landing.a11y.language')}>
              <button
                type="button"
                className={`land-lang-btn${lang === 'fr' ? ' active' : ''}`}
                aria-pressed={lang === 'fr'}
                onClick={() => setLang('fr')}
              >
                FR
              </button>
              <button
                type="button"
                className={`land-lang-btn${lang === 'en' ? ' active' : ''}`}
                aria-pressed={lang === 'en'}
                onClick={() => setLang('en')}
              >
                EN
              </button>
            </div>
            <a className="land-nav-cta" href="#download">{t('landing.nav.download')}</a>
          </div>
        </nav>

        <div className="land-hero-inner">
          <div className="land-hero-left">
            {/* Le drapeau vit dans son propre span : en enfant direct d'un flex,
                le texte « 🇨🇲 » forme un item anonyme dont l'espace final est
                écrasé — l'emoji se collait au libellé malgré le `gap`. */}
            <span className="land-hero-badge">
              <span aria-hidden="true">🇨🇲</span>
              {t('landing.hero.available')}
            </span>
            <h1 className="land-headline">
              {t('landing.hero.headlineA')} <em>{t('landing.hero.headlineEm')}</em>
            </h1>
            <p className="land-hero-sub">{t('landing.hero.subtitle')}</p>

            <div className="land-hero-actions">
              <a className="land-btn-dl" id="download" href="#download">
                {t('landing.hero.download')}
              </a>
              <Link className="land-btn-console" to={consoleTarget}>
                {t('landing.hero.adminAccess')}
                <ArrowRight size={16} strokeWidth={2.4} aria-hidden="true" />
              </Link>
            </div>

            <div className="land-hero-stats">
              <StatCountUp end={PRODUCT_FACTS.questions} suffix="+" label={t('landing.stats.questions')} />
              <span className="land-stat-div" aria-hidden="true" />
              <StatCountUp end={PRODUCT_FACTS.themes} label={t('landing.stats.themes')} />
              <span className="land-stat-div" aria-hidden="true" />
              <StatCountUp end={PRODUCT_FACTS.levels} label={t('landing.stats.levels')} />
            </div>
          </div>

          <div className="land-hero-right">
            <span className="land-phone-halo" aria-hidden="true" />
            <PhoneMockup t={t} />
          </div>
        </div>
      </section>

      {/* ═══════════ ÉTAPES — rail numéroté, sans cartes (crème) ═══════════ */}
      <section className="land-section cream">
        <div className="land-container">
          <div className="land-section-head">
            <div className="land-eyebrow">{t('landing.howItWorks.eyebrow')}</div>
            <h2 className="land-title">{t('landing.howItWorks.title')}</h2>
          </div>
          <ol className="land-rail">
            {etapes.map(({ icon: Icon, key }, i) => (
              <li className="land-rail-step" key={key}>
                <span className="land-rail-num" aria-hidden="true">{`0${i + 1}`}</span>
                <span className="land-rail-icon" aria-hidden="true">
                  <Icon size={20} strokeWidth={2.2} />
                </span>
                <h3 className="land-rail-title">{t(`landing.howItWorks.${key}`)}</h3>
                <p className="land-rail-desc">{t(`landing.howItWorks.${key}Desc`)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ═══════════ FONCTIONNALITÉS — asymétrique (blanc) ═══════════ */}
      <section className="land-section white" id="features">
        <div className="land-container land-split">
          <div className="land-split-aside">
            <div className="land-eyebrow gold">{t('landing.features.eyebrow')}</div>
            <h2 className="land-title left">{t('landing.features.title')}</h2>
            <p className="land-split-sub">{t('landing.features.sub')}</p>
          </div>
          <ul className="land-flist">
            {features.map(({ icon: Icon, key }) => (
              <li className="land-frow" key={key}>
                <span className="land-frow-icon" aria-hidden="true">
                  <Icon size={20} strokeWidth={2.2} />
                </span>
                <div className="land-frow-body">
                  <h3 className="land-frow-title">{t(`landing.features.${key}`)}</h3>
                  <p className="land-frow-desc">{t(`landing.features.${key}Desc`)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ═══════════ THÈMES — bande vert nuit (ancre sombre en milieu de page) ═══ */}
      <section className="land-band" id="themes">
        <DiamondGrid />
        <div className="land-container land-band-inner">
          <div className="land-section-head on-dark">
            <div className="land-eyebrow gold">{t('landing.themes.eyebrow')}</div>
            <h2 className="land-title on-dark">
              {t('landing.themes.title', {
                themes: PRODUCT_FACTS.themes,
                questions: `${PRODUCT_FACTS.questions}+`,
              })}
            </h2>
          </div>
          <ul className="land-themes">
            {PUBLIC_THEMES.map(({ key, emoji }) => (
              <li className="land-theme" key={key}>
                <span className="land-theme-emoji" aria-hidden="true">{emoji}</span>
                <span className="land-theme-name">{t(`questions.themes.${key}`)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ═══════════ CONÇU ICI — remplace les faux témoignages (blanc) ═══════════ */}
      <section className="land-section white" id="about">
        <div className="land-container">
          <div className="land-section-head">
            <div className="land-eyebrow">{t('landing.built.eyebrow')}</div>
            <h2 className="land-title">{t('landing.built.title')}</h2>
          </div>
          <ul className="land-built">
            {conception.map(({ icon: Icon, key }) => (
              <li className="land-built-item" key={key}>
                <span className="land-built-icon" aria-hidden="true">
                  <Icon size={22} strokeWidth={2.1} />
                </span>
                <h3 className="land-built-title">{t(`landing.built.${key}`)}</h3>
                <p className="land-built-desc">{t(`landing.built.${key}Desc`)}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ═══════════ CTA FINAL (vert nuit + losanges) ═══════════ */}
      <section className="land-cta">
        <DiamondGrid />
        <div className="land-container land-cta-inner">
          <div className="land-eyebrow gold">{t('landing.cta.eyebrow')}</div>
          <h2 className="land-cta-title">{t('landing.cta.title')}</h2>
          <p className="land-cta-sub">{t('landing.cta.sub')}</p>
          <a className="land-btn-dl" href="#download">{t('landing.cta.button')}</a>
          <div className="land-pills" aria-hidden="true">
            <span className="land-pill land-pill-a">A</span>
            <span className="land-pill land-pill-b">B</span>
            <span className="land-pill land-pill-c">C</span>
            <span className="land-pill land-pill-d">D</span>
          </div>
        </div>
      </section>

      {/* ═══════════ FOOTER (#071f12) ═══════════ */}
      <footer className="land-footer">
        <div className="land-container land-footer-inner">
          <div className="land-footer-brand">
            <img className="land-nav-logo" src="/logo.png" alt="Creveton" />
            <span className="land-nav-name">Creveton</span>
            <p className="land-footer-copy">
              © 2026 Creveton · {t('landing.footer.country')} · {t('landing.footer.rights')}
            </p>
          </div>

          <nav className="land-footer-social" aria-label={t('landing.a11y.socialNetworks')}>
            {reseaux.map(({ icon: Icon, label }) => (
              <a className="land-footer-social-link" href="#" key={label} aria-label={label}>
                <Icon size={18} strokeWidth={2} aria-hidden="true" />
              </a>
            ))}
          </nav>

          <nav className="land-footer-links" aria-label={t('landing.a11y.legalLinks')}>
            <a href="#">{t('landing.footer.legal')}</a>
            <Link to="/privacy">{t('landing.footer.privacy')}</Link>
            <a href="#">{t('landing.footer.contact')}</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
