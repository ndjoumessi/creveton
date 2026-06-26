import { useForm } from 'react-hook-form';
import { Navigate, useNavigate, Link } from 'react-router-dom';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Loader2 } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { notify } from '../components/Toast';
import PasswordInput from '../components/PasswordInput';
import { USE_MOCKS } from '../services/api';
import './Login.css';

// Lattice de losanges (décor animé du panneau gauche). Coordonnées pré-calculées
// une fois ; l'animation de pulsation vit dans Login.css (.lp-diamond + @keyframes).
const DIAMONDS = (() => {
  const out = [];
  const SP = 88;
  const R = 27;
  const COLS = 8;
  const ROWS = 8;
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const cx = col * SP + (row % 2 ? SP / 2 : 0);
      const cy = row * SP;
      out.push({ cx, cy, r: R });
    }
  }
  return out;
})();

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [submitting, setSubmitting] = useState(false);
  // Erreur inline (sous le bouton) plutôt qu'un toast.
  const [error, setError] = useState(null);
  // « Se souvenir de moi » : on ne mémorise QUE l'email (jamais le mot de passe).
  // Pré-remplissage via defaultValues (équivalent react-hook-form du useEffect/setEmail).
  const rememberedEmail = localStorage.getItem('remembered_email') || '';
  const [rememberMe, setRememberMe] = useState(!!rememberedEmail);
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      email: USE_MOCKS ? 'admin@creveton.cm' : rememberedEmail,
      password: '',
    },
  });

  // Déjà connecté en admin → on file vers la console (après tous les hooks).
  if (user && isAuthenticated() && isAdmin()) {
    return <Navigate to="/dashboard" replace />;
  }

  const onSubmit = async ({ email, password }) => {
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      if (!isAdmin()) {
        useAuthStore.getState().logout();
        setError(t('login.notify.adminsOnly'));
        return;
      }
      // Connexion admin réussie → on persiste (ou efface) l'email mémorisé.
      if (rememberMe) localStorage.setItem('remembered_email', email);
      else localStorage.removeItem('remembered_email');
      notify.success(t('login.notify.success'));
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const code = err?.response?.data?.error?.code;
      setError(code === 'AUTH_INVALID_CREDENTIALS' ? t('login.notify.invalidCredentials') : t('login.notify.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="lp-shell">
      {/* ─────────── Panneau gauche (marque) ─────────── */}
      <div className="lp-left">
        <svg className="lp-quiz-grid" viewBox="0 0 704 704" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          {DIAMONDS.map((d, i) => (
            <path
              key={i}
              className="lp-diamond"
              d={`M ${d.cx} ${d.cy - d.r} L ${d.cx + d.r} ${d.cy} L ${d.cx} ${d.cy + d.r} L ${d.cx - d.r} ${d.cy} Z`}
            />
          ))}
        </svg>

        <div className="lp-brand">
          <span className="lp-brand-logo">C</span>
          <div>
            <div className="lp-brand-name">{t('login.title')}</div>
            <div className="lp-brand-tag">{t('login.brandTag')}</div>
          </div>
        </div>

        <div className="lp-left-body">
          <div className="lp-eyebrow">{t('login.eyebrow')}</div>
          <h1 className="lp-headline">
            {t('login.headlineA')} <em>{t('login.headlineEm')}</em> {t('login.headlineB')}
          </h1>
          <p className="lp-headline-sub">{t('login.heroSub')}</p>

          <div className="lp-stats" aria-hidden="true">
            <div className="lp-stat">
              <div className="lp-stat-num">180<span>+</span></div>
              <div className="lp-stat-label">{t('login.stats.questions')}</div>
            </div>
            <div className="lp-stat-div" />
            <div className="lp-stat">
              <div className="lp-stat-num">15</div>
              <div className="lp-stat-label">{t('login.stats.themes')}</div>
            </div>
            <div className="lp-stat-div" />
            <div className="lp-stat">
              <div className="lp-stat-num">3</div>
              <div className="lp-stat-label">{t('login.stats.levels')}</div>
            </div>
          </div>
        </div>

        <div className="lp-left-footer">
          <div className="lp-pills" aria-hidden="true">
            <span className="lp-pill lp-pill-a">A</span>
            <span className="lp-pill lp-pill-b">B</span>
            <span className="lp-pill lp-pill-c">C</span>
            <span className="lp-pill lp-pill-d">D</span>
          </div>
          <span className="lp-footer-copy">© 2026 Creveton</span>
        </div>
      </div>

      {/* ─────────── Panneau droit (formulaire) ─────────── */}
      <div className="lp-right">
        <form onSubmit={handleSubmit(onSubmit)} className="lp-form">
          <h2 className="lp-form-title">{t('login.formTitle')}</h2>
          <p className="lp-form-sub">{t('login.subtitle')}</p>

          <div className="field">
            <label>{t('login.email')}</label>
            <input
              className="input"
              type="email"
              placeholder="admin@creveton.cm"
              {...register('email', { required: t('login.validation.emailRequired') })}
            />
            {errors.email && <span className="field-error">{errors.email.message}</span>}
          </div>

          <div className="field">
            <label>{t('login.password')}</label>
            <PasswordInput {...register('password', { required: t('login.validation.passwordRequired') })} />
            {errors.password && <span className="field-error">{errors.password.message}</span>}
          </div>

          <div className="lp-form-row">
            <label className="lp-remember">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span>{t('login.rememberMe')}</span>
            </label>
            <button type="button" className="lp-forgot">{t('login.forgot')}</button>
          </div>

          <button className="lp-submit" type="submit" disabled={submitting}>
            {submitting && <Loader2 size={17} className="spin" />}
            <span>{submitting ? t('login.loading') : t('login.cta')}</span>
            {!submitting && <ArrowRight size={17} className="lp-arrow" />}
          </button>

          {/* Erreur inline (entre le bouton et la suite). Pas de bloc « offline » :
              la console admin n'embarque pas de détection réseau (à la différence
              du Login mobile). */}
          {error && <p className="lp-error" role="alert">{error}</p>}

          <div className="lp-divider">
            <span className="lp-divider-line" />
            <span className="lp-divider-or">{t('login.dividerOr')}</span>
            <span className="lp-divider-line" />
          </div>

          {/* SSO — placeholder statique pour l'instant. */}
          <button type="button" className="lp-sso">{t('login.sso')}</button>

          <div className="lp-form-footer">
            <Link to="/" className="lp-back">{t('login.backHome')}</Link>
            <span className="lp-version">v1.0</span>
          </div>

          {USE_MOCKS && <p className="lp-demo">{t('login.misc.demoBanner')}</p>}
        </form>
      </div>
    </div>
  );
}
