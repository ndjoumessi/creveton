import { Link } from 'react-router-dom';
import {
  Target,
  Trophy,
  BarChart3,
  UserPlus,
  LayoutGrid,
  Gamepad2,
  Star,
  MessageCircle,
  AtSign,
  Send,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/authStore';
import { useUiStore } from '../store/uiStore';
import { useCountUp } from '../hooks/useCountUp';
import './Landing.css';

// Lattice de losanges (décor des bandes vert nuit : héro + CTA). Coordonnées
// pré-calculées une fois ; la pulsation vit dans Landing.css (.land-diamond), miroir du Login.
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
    <svg className="land-hero-grid" viewBox="0 0 1232 792" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
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

// Données structurelles (icônes, emojis, valeurs non traduisibles). Le texte
// visible est résolu via t() à partir des clés ci-dessous.
const features = [
  { icon: Target, titreKey: 'landing.features.quiz', descKey: 'landing.features.quizDesc' },
  { icon: Trophy, titreKey: 'landing.features.tournaments', descKey: 'landing.features.tournamentsDesc' },
  { icon: BarChart3, titreKey: 'landing.features.leaderboard', descKey: 'landing.features.leaderboardDesc' },
];

const themes = [
  { emoji: '🌍', nameKey: 'landing.themes.geography', count: 18 },
  { emoji: '📚', nameKey: 'landing.themes.culture', count: 15 },
  { emoji: '🏛️', nameKey: 'landing.themes.history', count: 16 },
  { emoji: '🏭', nameKey: 'landing.themes.industry', count: 12 },
];

const etapes = [
  { icon: UserPlus, titreKey: 'landing.howItWorks.step1', descKey: 'landing.howItWorks.step1Desc' },
  { icon: LayoutGrid, titreKey: 'landing.howItWorks.step2', descKey: 'landing.howItWorks.step2Desc' },
  { icon: Gamepad2, titreKey: 'landing.howItWorks.step3', descKey: 'landing.howItWorks.step3Desc' },
];

const temoignages = [
  { initiales: 'CF', nom: 'Cédric F.', ville: 'Garoua', quoteKey: 'landing.testimonials.quote1' },
  { initiales: 'AM', nom: 'Awa M.', ville: 'Douala', quoteKey: 'landing.testimonials.quote2' },
  { initiales: 'JK', nom: 'Junior K.', ville: 'Yaoundé', quoteKey: 'landing.testimonials.quote3' },
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
        <span>{suffix}</span>
      </span>
      <span className="land-stat-label">{label}</span>
    </div>
  );
}

export default function Landing() {
  const { t } = useTranslation();
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
            <span className="land-nav-logo">C</span>
            <span className="land-nav-name">Creveton</span>
          </div>
          <div className="land-nav-links">
            <a className="land-nav-link" href="#features">{t('landing.nav.features')}</a>
            <a className="land-nav-link" href="#themes">{t('landing.nav.themes')}</a>
            <a className="land-nav-link" href="#about">{t('landing.nav.about')}</a>
          </div>
          {/* Switcher autonome — hors .land-nav-links pour rester visible < 768px. */}
          <div className="land-lang-switch">
            <button
              type="button"
              className={`land-lang-btn${lang === 'fr' ? ' active' : ''}`}
              onClick={() => setLang('fr')}
            >
              FR
            </button>
            <button
              type="button"
              className={`land-lang-btn${lang === 'en' ? ' active' : ''}`}
              onClick={() => setLang('en')}
            >
              EN
            </button>
          </div>
          <a className="land-nav-cta" href="#">{t('landing.nav.download')}</a>
        </nav>

        <div className="land-hero-inner">
          <div className="land-hero-left">
            <span className="land-hero-badge">🇨🇲 {t('landing.hero.available')}</span>
            <div className="land-hero-eyebrow">{t('landing.hero.eyebrow')}</div>
            <h1 className="land-headline">
              {t('landing.hero.headlineA')} <em>{t('landing.hero.headlineEm')}</em> {t('landing.hero.headlineB')}
            </h1>
            <p className="land-hero-sub">{t('landing.hero.subtitle')}</p>

            <div className="land-hero-actions">
              <a className="land-btn-dl" href="#">{t('landing.hero.download')}</a>
              <Link className="land-btn-console" to={consoleTarget}>{t('landing.hero.adminAccess')}</Link>
            </div>

            <div className="land-hero-stats">
              <StatCountUp end={180} suffix="+" label={t('landing.stats.questions')} />
              <span className="land-stat-div" aria-hidden="true" />
              <StatCountUp end={15} suffix="" label={t('landing.stats.themes')} />
              <span className="land-stat-div" aria-hidden="true" />
              <StatCountUp end={3} suffix="" label={t('landing.stats.levels')} />
            </div>
          </div>

          {/* Mockup téléphone */}
          <div className="land-hero-right">
            <div className="land-phone" aria-hidden="true">
              <div className="land-phone-status">
                <span>9:41</span>
                <span className="land-phone-sig">
                  <i /><i /><i /><i />
                </span>
              </div>
              <div className="land-phone-header">
                <span className="land-phone-badge">🌍 {t('landing.themes.geography')}</span>
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
          </div>
        </div>

        <div className="land-pills" aria-hidden="true">
          <span className="land-pill land-pill-a">A</span>
          <span className="land-pill land-pill-b">B</span>
          <span className="land-pill land-pill-c">C</span>
          <span className="land-pill land-pill-d">D</span>
        </div>
      </section>

      {/* ═══════════ COMMENT ÇA MARCHE (crème) ═══════════ */}
      <section className="land-section cream">
        <div className="land-container">
          <div className="land-section-head">
            <div className="land-eyebrow">{t('landing.howItWorks.eyebrow')}</div>
            <h2 className="land-title">{t('landing.howItWorks.title')}</h2>
          </div>
          <ol className="land-steps-grid">
            {etapes.map(({ icon: Icon, titreKey, descKey }, i) => (
              <li className="land-step" key={titreKey}>
                <span className="land-step-num" aria-hidden="true">{i + 1}</span>
                <span className="land-step-icon" aria-hidden="true">
                  <Icon size={24} strokeWidth={2.2} />
                </span>
                <h3 className="land-step-title">{t(titreKey)}</h3>
                <p className="land-step-desc">{t(descKey)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ═══════════ FONCTIONNALITÉS (blanc) ═══════════ */}
      <section className="land-section white" id="features">
        <div className="land-container">
          <div className="land-section-head">
            <div className="land-eyebrow gold">{t('landing.features.eyebrow')}</div>
            <h2 className="land-title">{t('landing.features.title')}</h2>
          </div>
          <div className="land-features-grid">
            {features.map(({ icon: Icon, titreKey, descKey }) => (
              <article className="land-feature" key={titreKey}>
                <span className="land-feature-icon" aria-hidden="true">
                  <Icon size={26} strokeWidth={2.2} />
                </span>
                <h3 className="land-feature-title">{t(titreKey)}</h3>
                <p className="land-feature-desc">{t(descKey)}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ THÈMES (crème) ═══════════ */}
      <section className="land-section cream" id="themes">
        <div className="land-container">
          <div className="land-section-head">
            <div className="land-eyebrow">{t('landing.themes.eyebrow')}</div>
            <h2 className="land-title">{t('landing.themes.title')}</h2>
          </div>
          <div className="land-themes-grid">
            {themes.map(({ emoji, nameKey, count }) => (
              <article className="land-theme-card" key={nameKey}>
                <span className="land-theme-emoji" aria-hidden="true">{emoji}</span>
                <h3 className="land-theme-name">{t(nameKey)}</h3>
                <p className="land-theme-count">{count} {t('landing.themes.questions')}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ TÉMOIGNAGES (blanc) ═══════════ */}
      <section className="land-section white" id="about">
        <div className="land-container">
          <div className="land-section-head">
            <div className="land-eyebrow gold">{t('landing.testimonials.eyebrow')}</div>
            <h2 className="land-title">{t('landing.testimonials.title')}</h2>
          </div>
          <div className="land-testimonials-grid">
            {temoignages.map(({ initiales, nom, ville, quoteKey }) => (
              <figure className="land-testimonial" key={nom}>
                <div className="land-testimonial-stars" aria-label={t('landing.a11y.rating')}>
                  {['s1', 's2', 's3', 's4', 's5'].map((s) => (
                    <Star key={s} size={18} strokeWidth={0} fill="currentColor" aria-hidden="true" />
                  ))}
                </div>
                <blockquote className="land-testimonial-quote">« {t(quoteKey)} »</blockquote>
                <figcaption className="land-testimonial-author">
                  <span className="land-testimonial-avatar" aria-hidden="true">{initiales}</span>
                  <span className="land-testimonial-meta">
                    <span className="land-testimonial-name">{nom}</span>
                    <span className="land-testimonial-city">{ville}</span>
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ CTA FINAL (vert nuit + losanges) ═══════════ */}
      <section className="land-cta">
        <DiamondGrid />
        <div className="land-container land-cta-inner">
          <div className="land-eyebrow gold">{t('landing.cta.eyebrow')}</div>
          <h2 className="land-cta-title">{t('landing.cta.title')}</h2>
          <p className="land-cta-sub">{t('landing.cta.sub')}</p>
          <a className="land-btn-dl" href="#">{t('landing.cta.button')}</a>
        </div>
      </section>

      {/* ═══════════ FOOTER (#071f12) ═══════════ */}
      <footer className="land-footer">
        <div className="land-container land-footer-inner">
          <div className="land-footer-brand">
            <span className="land-nav-logo">C</span>
            <span className="land-nav-name">Creveton</span>
            <p className="land-footer-copy">
              © 2026 Creveton · {t('landing.footer.country')} · {t('landing.footer.rights')}
            </p>
          </div>

          <nav className="land-footer-social" aria-label={t('landing.a11y.socialNetworks')}>
            {reseaux.map(({ icon: Icon, label }) => (
              <a className="land-footer-social-link" href="#" key={label} aria-label={label}>
                <Icon size={20} strokeWidth={2} aria-hidden="true" />
              </a>
            ))}
          </nav>

          <nav className="land-footer-links" aria-label={t('landing.a11y.legalLinks')}>
            <a href="#">{t('landing.footer.legal')}</a>
            <a href="#">{t('landing.footer.privacy')}</a>
            <a href="#">{t('landing.footer.contact')}</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
