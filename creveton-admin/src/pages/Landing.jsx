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
import { useAuthStore } from '../store/authStore';
import { useCountUp } from '../hooks/useCountUp';
import './Landing.css';

const features = [
  {
    icon: Target,
    titre: 'Quiz chronométré',
    description:
      'Réponds vite et juste. Chaque seconde compte pour grimper au classement et battre tes adversaires.',
  },
  {
    icon: Trophy,
    titre: 'Tournois compétitifs',
    description:
      'Affronte les meilleurs joueurs du Cameroun dans des tournois à élimination et remporte la couronne.',
  },
  {
    icon: BarChart3,
    titre: 'Classements en direct',
    description:
      'Suis ta progression en temps réel et compare tes scores avec la communauté Creveton.',
  },
];

const themes = [
  { emoji: '🌍', nom: 'Géographie', questions: '18 questions' },
  { emoji: '📚', nom: 'Culture', questions: '15 questions' },
  { emoji: '🏛️', nom: 'Histoire', questions: '16 questions' },
  { emoji: '🏭', nom: 'Industrie', questions: '12 questions' },
];

const etapes = [
  {
    icon: UserPlus,
    titre: 'Inscris-toi',
    description:
      'Crée ton compte en quelques secondes et rejoins la communauté Creveton.',
  },
  {
    icon: LayoutGrid,
    titre: 'Choisis ton thème',
    description:
      'Géographie, culture, histoire ou industrie : sélectionne ton univers favori.',
  },
  {
    icon: Gamepad2,
    titre: 'Joue et gagne',
    description:
      'Réponds vite, marque des points et grimpe au sommet du classement national.',
  },
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
              C
            </div>

            <h1 className="land-title">Creveton</h1>
            <p className="land-subtitle">Le quiz compétitif du Cameroun</p>

            <span className="land-badge">🇨🇲 Disponible sur Android</span>

            <div className="land-cta-row">
              <a className="land-btn land-btn-gold" href="#">
                Télécharger l&apos;app
              </a>
              <Link className="land-cta-secondary" to={consoleTarget}>
                Accéder à la console admin →
              </Link>
            </div>
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
          <StatCountUp end={60} suffix="+" label="Questions" />
          <StatCountUp end={9} suffix="" label="Joueurs" />
          <StatCountUp end={22} suffix="" label="Parties jouées" />
        </div>
      </section>

      {/* ─────────────── COMMENT ÇA MARCHE ─────────────── */}
      <section className="land-steps">
        <div className="land-container">
          <h2 className="land-section-title">Comment ça marche</h2>
          <ol className="land-steps-grid">
            {etapes.map(({ icon: Icon, titre, description }, i) => (
              <li className="land-step" key={titre}>
                <span className="land-step-num" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="land-step-icon" aria-hidden="true">
                  <Icon size={24} strokeWidth={2.2} />
                </span>
                <h3 className="land-step-title">{titre}</h3>
                <p className="land-step-desc">{description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ─────────────── FONCTIONNALITÉS ─────────────── */}
      <section className="land-features">
        <div className="land-container">
          <h2 className="land-section-title">Pensé pour la compétition</h2>
          <div className="land-features-grid">
            {features.map(({ icon: Icon, titre, description }) => (
              <article className="land-feature" key={titre}>
                <span className="land-feature-icon" aria-hidden="true">
                  <Icon size={26} strokeWidth={2.2} />
                </span>
                <h3 className="land-feature-title">{titre}</h3>
                <p className="land-feature-desc">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────── THÈMES ─────────────── */}
      <section className="land-themes">
        <div className="land-container">
          <h2 className="land-section-title">Quatre univers à explorer</h2>
          <div className="land-themes-grid">
            {themes.map(({ emoji, nom, questions }) => (
              <article className="land-theme-card" key={nom}>
                <span className="land-theme-emoji" aria-hidden="true">
                  {emoji}
                </span>
                <h3 className="land-theme-name">{nom}</h3>
                <p className="land-theme-count">{questions}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────── TÉMOIGNAGES ─────────────── */}
      <section className="land-testimonials">
        <div className="land-container">
          <h2 className="land-section-title">Ils jouent déjà</h2>
          <div className="land-testimonials-grid">
            {temoignages.map(({ initiales, nom, ville, citation }) => (
              <figure className="land-testimonial" key={nom}>
                <div
                  className="land-testimonial-stars"
                  aria-label="Note 5 sur 5"
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
          <h2 className="land-cta-final-title">Prêt à jouer ?</h2>
          <a className="land-btn land-btn-green" href="#">
            Télécharger gratuitement
          </a>
        </div>
      </section>

      {/* ─────────────── FOOTER ─────────────── */}
      <footer className="land-footer">
        <div className="land-container land-footer-inner">
          <p className="land-footer-copy">
            © 2026 Creveton · Cameroun · Tous droits réservés
          </p>

          <nav className="land-footer-social" aria-label="Réseaux sociaux">
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

          <nav className="land-footer-links" aria-label="Liens légaux">
            <a href="#">Mentions légales</a>
            <a href="#">Confidentialité</a>
            <a href="#">Contact</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
