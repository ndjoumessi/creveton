import { useForm } from 'react-hook-form';
import { Navigate, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogIn, Loader2 } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { notify } from '../components/Toast';
import PasswordInput from '../components/PasswordInput';
import Logo from '../components/Logo';
import { USE_MOCKS } from '../services/api';

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [submitting, setSubmitting] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: { email: USE_MOCKS ? 'admin@creveton.cm' : '', password: '' },
  });

  // Déjà connecté en admin → on file vers la console (après tous les hooks).
  if (user && isAuthenticated() && isAdmin()) {
    return <Navigate to="/dashboard" replace />;
  }

  const onSubmit = async ({ email, password }) => {
    setSubmitting(true);
    try {
      await login(email, password);
      if (!isAdmin()) {
        notify.error(t('login.notify.adminsOnly'));
        useAuthStore.getState().logout();
        return;
      }
      notify.success(t('login.notify.success'));
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const code = err?.response?.data?.error?.code;
      notify.error(code === 'AUTH_INVALID_CREDENTIALS' ? t('login.notify.invalidCredentials') : t('login.notify.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--green900)', padding: 24 }}>
      <div style={{ width: 'min(420px, 94vw)' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ display: 'inline-flex', marginBottom: 14 }}><Logo size={64} /></div>
          <h1 style={{ fontFamily: 'Outfit', fontWeight: 700, color: '#fff', fontSize: 24, margin: 0 }}>{t('login.title')}</h1>
          <p style={{ fontFamily: '"Space Grotesk", sans-serif', color: '#9ca3af', marginTop: 6, fontSize: 14 }}>{t('login.subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="card" style={{ padding: 26 }}>
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

          <button className="btn btn-gold btn-block" type="submit" disabled={submitting} style={{ marginTop: 6, padding: '11px 16px' }}>
            {submitting ? <Loader2 size={17} className="spin" /> : <LogIn size={17} />}
            {submitting ? t('login.loading') : t('login.submit')}
          </button>

          {USE_MOCKS && (
            <p className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 14, marginBottom: 0 }}>
              {t('login.misc.demoBanner')}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
