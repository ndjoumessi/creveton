import { useForm } from 'react-hook-form';
import { Navigate, useNavigate, Link } from 'react-router-dom';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogIn, Loader2 } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { notify } from '../components/Toast';
import PasswordInput from '../components/PasswordInput';
import Logo from '../components/Logo';
import { USE_MOCKS } from '../services/api';
import './Login.css';

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
    <div className="login-split">
      {/* Panneau marque (masqué < 768px) — contenu centré verticalement */}
      <aside className="login-aside">
        <div className="login-aside-top">
          <Logo size={80} />
          <span className="login-brand">{t('login.title')}</span>
          <p className="login-tagline">{t('login.leftTagline')}</p>
        </div>

        <ul className="login-stats" aria-hidden="true">
          <li>
            <strong>500+</strong>
            <span>{t('login.stats.users')}</span>
          </li>
          <li>
            <strong>1k+</strong>
            <span>{t('login.stats.games')}</span>
          </li>
          <li>
            <strong>6</strong>
            <span>{t('login.stats.themes')}</span>
          </li>
        </ul>

        <div className="login-aside-bottom">
          <p className="login-quote">{t('login.leftQuote')}</p>
          <span className="login-version">v1.0</span>
        </div>
      </aside>

      {/* Panneau formulaire */}
      <main className="login-main">
        <Link to="/" className="login-back-link">{t('login.backHome')}</Link>
        <form onSubmit={handleSubmit(onSubmit)} className="login-form">
          <h1 className="login-welcome">{t('login.welcome')}</h1>
          <p className="login-subtitle">{t('login.subtitle')}</p>

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

          <label className="login-remember">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            <span>{t('login.rememberMe')}</span>
          </label>

          <button className="btn btn-gold btn-block" type="submit" disabled={submitting} style={{ padding: '11px 16px' }}>
            {submitting ? <Loader2 size={17} className="spin" /> : <LogIn size={17} />}
            {submitting ? t('login.loading') : t('login.submit')}
          </button>

          {error && <p className="login-error" role="alert">{error}</p>}

          {USE_MOCKS && <p className="login-demo">{t('login.misc.demoBanner')}</p>}
        </form>
      </main>
    </div>
  );
}
