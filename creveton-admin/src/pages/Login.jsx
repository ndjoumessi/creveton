import { useForm } from 'react-hook-form';
import { Navigate, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { LogIn, Loader2 } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { notify } from '../components/Toast';
import PasswordInput from '../components/PasswordInput';
import { USE_MOCKS } from '../services/api';

export default function Login() {
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
        notify.error('Accès réservé aux administrateurs.');
        useAuthStore.getState().logout();
        return;
      }
      notify.success('Connexion réussie');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const code = err?.response?.data?.error?.code;
      notify.error(code === 'AUTH_INVALID_CREDENTIALS' ? 'Email ou mot de passe incorrect.' : 'Échec de la connexion.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--green900)', padding: 24 }}>
      <div style={{ width: 'min(420px, 94vw)' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div className="sidebar-logo" style={{ width: 56, height: 56, margin: '0 auto 14px', fontSize: 26, borderRadius: 16 }}>C</div>
          <h1 style={{ fontFamily: 'Outfit', color: '#fff', fontSize: 26, margin: 0 }}>Creveton</h1>
          <p style={{ color: '#7fae93', marginTop: 6, fontSize: 14 }}>Console d’administration</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="card" style={{ padding: 26 }}>
          <div className="field">
            <label>Email</label>
            <input
              className="input"
              type="email"
              placeholder="admin@creveton.cm"
              {...register('email', { required: 'Email requis' })}
            />
            {errors.email && <span className="field-error">{errors.email.message}</span>}
          </div>

          <div className="field">
            <label>Mot de passe</label>
            <PasswordInput {...register('password', { required: 'Mot de passe requis' })} />
            {errors.password && <span className="field-error">{errors.password.message}</span>}
          </div>

          <button className="btn btn-gold btn-block" type="submit" disabled={submitting} style={{ marginTop: 6, padding: '11px 16px' }}>
            {submitting ? <Loader2 size={17} className="spin" /> : <LogIn size={17} />}
            Se connecter
          </button>

          {USE_MOCKS && (
            <p className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 14, marginBottom: 0 }}>
              Mode démo actif — toute saisie ouvre une session admin fictive.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
