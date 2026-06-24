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
import { useCountUp } from '../hooks/useCountUp';
import LogoCameroun from '../components/LogoCameroun';
import './Landing.css';

// Données structurelles (icônes, emojis, valeurs non traduisibles).
// Le texte visible est résolu via t() au rendu à partir des clés ci-dessous.
const features = [
  { icon: Target, titreKey: 'landing.features.quiz', descKey: 'landing.features.quizDesc' },
  { icon: Trophy, titreKey: 'landing.features.tournaments', descKey: 'landing.features.tournamentsDesc' },
  { icon: BarChart3, titreKey: 'landing.features.leaderboard', descKey: 'landing.features.leaderboardDesc' },
];

const themes = [
  { emoji: '🌍', nom: 'Géographie', count: 18 },
  { emoji: '📚', nom: 'Culture', count: 15 },
  { emoji: '🏛️', nom: 'Histoire', count: 16 },
  { emoji: '🏭', nom: 'Industrie', count: 12 },
];

const etapes = [
  { icon: UserPlus, titreKey: 'landing.howItWorks.step1', descKey: 'landing.howItWorks.step1Desc' },
  { icon: LayoutGrid, titreKey: 'landing.howItWorks.step2', descKey: 'landing.howItWorks.step2Desc' },
  { icon: Gamepad2, titreKey: 'landing.howItWorks.step3', descKey: 'landing.howItWorks.step3Desc' },
];

const temoignages = [
  {
    initiales: 'CF',
    nom: 'Cédric F.',
    ville: 'Garoua',
    citation: 'Je joue chaque soir ! Les questions sont bien pensées et la compétition est addictive.',
  },
  {
    initiales: 'AM',
    nom: 'Awa M.',
    ville: 'Douala',
    citation: 'Enfin un quiz 100 % camerounais. J’apprends plein de choses sur mon pays en m’amusant.',
  },
  {
    initiales: 'JK',
    nom: 'Junior K.',
    ville: 'Yaoundé',
    citation: 'Le mode tournoi est génial. Affronter mes amis en direct, c’est devenu un rituel du week-end.',
  },
];

const reseaux = [
  { icon: MessageCircle, label: 'Facebook' },
  { icon: AtSign, label: 'Instagram' },
  { icon: Send, label: 'X (Twitter)' },
];

/* Une statistique animée au défilement. */
function StatCountUp({ end, suffix, label }) {
  const [value, ref] = useCountUp(end);
  return (
    <div className="land-stat">
      <span className="land-stat-num" ref={ref}>
        {value}
        {suffix}
      </span>
      <span className="land-stat-label">{label}</span>
    </div>
  );
}

export default function Landing() {
  const { t } = useTranslation();
  // Cible du CTA console : tableau de bord si déjà connecté admin, sinon login.
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const consoleTarget = user && isAuthenticated() && isAdmin() ? '/dashboard' : '/login';

  return (
    <div className="land-root">
      {/* ─────────────── HERO ─────────────── */}
      <header className="land-hero">
        <div className="land-hero-bg" aria-hidden="true">
          <svg
            className="land-hero-pattern"
            width="100%"
            height="100%"
            preserveAspectRatio="xMidYMid slice"
          >
            <defs>
              <pattern
                id="land-grid"
                width="56"
                height="56"
                patternUnits="userSpaceOnUse"
              >
                <circle cx="2" cy="2" r="1.5" fill="#ffffff" fillOpacity="0.06" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#land-grid)" />
          </svg>
        </div>

        <div className="land-container land-hero-inner">
          <div className="land-hero-copy">
            <div className="land-logo" aria-hidden="true">
              <LogoCameroun size={96} />
            </div>

            <h1 className="land-title">Creveton</h1>
            <p className="land-subtitle">{t('landing.hero.subtitle')}</p>

            <span className="land-badge">🇨🇲 {t('landing.hero.available')}</span>

            <div className="land-cta-row">
              <a className="land-btn land-btn-gold" href="#">
                {t('landing.hero.download')}
              </a>
            </div>
            {/* Lien console admin : sous le bouton (plus à droite) — discret, doré. */}
            <Link className="land-cta-admin" to={consoleTarget}>
              {t('landing.hero.adminAccess')}
            </Link>
          </div>

          {/* Mockup téléphone */}
          <div className="land-phone-wrap">
            <div className="land-phone" aria-hidden="true">
              <div className="land-phone-notch" />
              <div className="land-phone-screen">
                <div className="land-quiz-head">
                  <span className="land-quiz-theme">🌍 Géographie</span>
                  <span className="land-quiz-timer">00:12</span>
                </div>
                <div className="land-quiz-progress">
                  <span style={{ width: '60%' }} />
                </div>
                <p className="land-quiz-question">
                  Quelle est la capitale politique du Cameroun ?
                </p>
                <ul className="land-quiz-options">
                  <li className="land-quiz-option">Douala</li>
                  <li className="land-quiz-option land-quiz-option-right">
                    Yaoundé
                  </li>
                  <li className="land-quiz-option">Bamenda</li>
                  <li className="land-quiz-option">Garoua</li>
                </ul>
                <div className="land-quiz-score">
                  <span>Score</span>
                  <strong>1 240</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ─────────────── CHIFFRES (count-up au scroll) ─────────────── */}
      <section className="land-stats">
        <div className="land-container land-stats-grid">
          <StatCountUp end={60} suffix="+" label={t('landing.stats.questions')} />
          <StatCountUp end={9} suffix="" label={t('landing.stats.players')} />
          <StatCountUp end={22} suffix="" label={t('landing.stats.games')} />
        </div>
      </section>

      {/* ─────────────── COMMENT ÇA MARCHE ─────────────── */}
      <section className="land-steps">
        <div className="land-container">
          <h2 className="land-section-title">{t('landing.howItWorks.title')}</h2>
          <ol className="land-steps-grid">
            {etapes.map(({ icon: Icon, titreKey, descKey }, i) => (
              <li className="land-step" key={titreKey}>
                <span className="land-step-num" aria-hidden="true">
                  {i + 1}
                </span>
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

      {/* ─────────────── FONCTIONNALITÉS ─────────────── */}
      <section className="land-features">
        <div className="land-container">
          <h2 className="land-section-title">{t('landing.features.title')}</h2>
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

      {/* ─────────────── THÈMES ─────────────── */}
      <section className="land-themes">
        <div className="land-container">
          <h2 className="land-section-title">{t('landing.themes.title')}</h2>
          <div className="land-themes-grid">
            {themes.map(({ emoji, nom, count }) => (
              <article className="land-theme-card" key={nom}>
                <span className="land-theme-emoji" aria-hidden="true">
                  {emoji}
                </span>
                <h3 className="land-theme-name">{nom}</h3>
                <p className="land-theme-count">{count} {t('landing.themes.questions')}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────── TÉMOIGNAGES ─────────────── */}
      <section className="land-testimonials">
        <div className="land-container">
          <h2 className="land-section-title">{t('landing.testimonials.title')}</h2>
          <div className="land-testimonials-grid">
            {temoignages.map(({ initiales, nom, ville, citation }) => (
              <figure className="land-testimonial" key={nom}>
                <div
                  className="land-testimonial-stars"
                  aria-label={t('landing.a11y.rating')}
                >
                  {['s1', 's2', 's3', 's4', 's5'].map((s) => (
                    <Star
                      key={s}
                      size={18}
                      strokeWidth={0}
                      fill="currentColor"
                      aria-hidden="true"
                    />
                  ))}
                </div>
                <blockquote className="land-testimonial-quote">
                  « {citation} »
                </blockquote>
                <figcaption className="land-testimonial-author">
                  <span className="land-testimonial-avatar" aria-hidden="true">
                    {initiales}
                  </span>
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

      {/* ─────────────── CTA FINAL ─────────────── */}
      <section className="land-cta-final">
        <div className="land-container land-cta-final-inner">
          <h2 className="land-cta-final-title">{t('landing.cta.title')}</h2>
          <a className="land-btn land-btn-green" href="#">
            {t('landing.cta.button')}
          </a>
        </div>
      </section>

      {/* ─────────────── FOOTER ─────────────── */}
      <footer className="land-footer">
        <div className="land-container land-footer-inner">
          <div className="land-footer-brand">
            <LogoCameroun size={32} />
            <p className="land-footer-copy">
              © 2026 Creveton · Cameroun · {t('landing.footer.rights')}
            </p>
          </div>

          <nav className="land-footer-social" aria-label={t('landing.a11y.socialNetworks')}>
            {reseaux.map(({ icon: Icon, label }) => (
              <a
                className="land-footer-social-link"
                href="#"
                key={label}
                aria-label={label}
              >
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
