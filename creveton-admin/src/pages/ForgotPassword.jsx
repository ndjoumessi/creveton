import { useForm } from 'react-hook-form';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Loader2, MailQuestion, ShieldCheck } from 'lucide-react';
import { forgotPassword, resetPassword } from '../services/auth.service';
import { useAuthStore } from '../store/authStore';
import { notify } from '../components/Toast';
import PasswordInput from '../components/PasswordInput';
import './Login.css';
import './ForgotPassword.css';

/**
 * Page PUBLIQUE « mot de passe oublié » de la console — deux étapes dans un
 * seul écran (demande du code, puis code + nouveau mot de passe).
 *
 * Réutilise la coquille visuelle du Login (`Login.css`, classes `lp-*`) : c'est
 * le même moment du parcours, dupliquer 300 lignes de décor n'apporterait rien.
 * Seul ce qui lui est propre vit dans `ForgotPassword.css` (classes `fp-*`).
 *
 * Contrairement au mobile, le code se saisit dans UN champ et non six cases :
 * au clavier physique, taper ou coller six chiffres d'affilée est plus direct
 * que de sauter de case en case.
 *
 * Anti-énumération : le serveur répond 204 que le compte existe ou non. La page
 * ne dit donc JAMAIS « email inconnu » — elle passe à l'étape suivante dans les
 * deux cas, avec un message au conditionnel.
 */
export default function ForgotPassword() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const login = useAuthStore((s) => s.login);

  // `?email=` : posé par le lien du Login, qui emporte l'adresse déjà saisie.
  const [step, setStep] = useState('request'); // 'request' | 'reset'
  const [email, setEmail] = useState(params.get('email') || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const requestForm = useForm({ defaultValues: { email: params.get('email') || '' } });
  const resetForm = useForm({ defaultValues: { code: '', password: '', confirm: '' } });

  const onRequest = async ({ email: value }) => {
    setSubmitting(true);
    setError(null);
    try {
      await forgotPassword(value);
      setEmail(value);
      setStep('reset');
      notify.success(t('forgotPassword.notify.sent'));
    } catch (err) {
      // Seuls les vrais échecs arrivent ici (réseau, 429) : un compte inexistant
      // renvoie 204 et suit le chemin nominal ci-dessus.
      const code = err?.response?.data?.error?.code;
      setError(code === 'RATE_LIMITED' ? t('forgotPassword.notify.rateLimited') : t('forgotPassword.notify.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const onReset = async ({ code, password }) => {
    setSubmitting(true);
    setError(null);
    try {
      await resetPassword({ email, code, new_password: password });
      notify.success(t('forgotPassword.notify.done'));
      // Le backend renvoie des tokens, mais la console exige un compte ADMIN et
      // vérifie ce rôle à la connexion. On repasse donc par `login` avec le mot
      // de passe tout juste défini, plutôt que d'ouvrir une session en
      // contournant ce contrôle.
      await login(email, password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const code = err?.response?.data?.error?.code;
      const MAP = {
        RESET_CODE_INVALID: 'forgotPassword.notify.badCode',
        RESET_CODE_EXPIRED: 'forgotPassword.notify.expiredCode',
        RESET_TOO_MANY_ATTEMPTS: 'forgotPassword.notify.tooManyAttempts',
        VALIDATION_ERROR: 'forgotPassword.notify.weakPassword',
      };
      setError(t(MAP[code] || 'forgotPassword.notify.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const password = resetForm.watch('password');

  return (
    <div className="lp-shell">
      <div className="lp-left">
        <div className="lp-brand">
          <img className="lp-brand-logo" src="/logo.png" alt="Creveton" />
          <div>
            <div className="lp-brand-name">{t('login.title')}</div>
            <div className="lp-brand-tag">{t('login.brandTag')}</div>
          </div>
        </div>

        <div className="lp-left-body">
          <div className="lp-eyebrow">{t('forgotPassword.eyebrow')}</div>
          <h1 className="lp-headline">{t('forgotPassword.headline')}</h1>
          <p className="lp-headline-sub">{t('forgotPassword.heroSub')}</p>
        </div>

        <div className="lp-left-footer">
          <span className="lp-footer-copy">© 2026 Creveton</span>
        </div>
      </div>

      <div className="lp-right">
        {step === 'request' ? (
          <form onSubmit={requestForm.handleSubmit(onRequest)} className="lp-form">
            <div className="fp-icon" aria-hidden="true"><MailQuestion size={22} /></div>
            <h2 className="lp-form-title">{t('forgotPassword.request.title')}</h2>
            <p className="lp-form-sub">{t('forgotPassword.request.subtitle')}</p>

            <div className="field">
              <label htmlFor="fp-email">{t('login.email')}</label>
              <input
                id="fp-email"
                className="input"
                type="email"
                autoComplete="email"
                placeholder="admin@creveton.cm"
                {...requestForm.register('email', {
                  required: t('login.validation.emailRequired'),
                })}
              />
              {requestForm.formState.errors.email && (
                <span className="field-error">{requestForm.formState.errors.email.message}</span>
              )}
            </div>

            <button className="lp-submit" type="submit" disabled={submitting}>
              {submitting && <Loader2 size={17} className="spin" />}
              <span>{submitting ? t('login.loading') : t('forgotPassword.request.cta')}</span>
              {!submitting && <ArrowRight size={17} className="lp-arrow" />}
            </button>

            {error && <p className="lp-error" role="alert">{error}</p>}

            <p className="fp-hint">{t('forgotPassword.request.hint')}</p>

            <button type="button" className="fp-link" onClick={() => setStep('reset')}>
              {t('forgotPassword.haveCode')}
            </button>

            <div className="lp-form-footer">
              <Link to="/login" className="lp-back">{t('forgotPassword.backToLogin')}</Link>
            </div>
          </form>
        ) : (
          <form onSubmit={resetForm.handleSubmit(onReset)} className="lp-form">
            <div className="fp-icon" aria-hidden="true"><ShieldCheck size={22} /></div>
            <h2 className="lp-form-title">{t('forgotPassword.reset.title')}</h2>
            <p className="lp-form-sub">
              {t('forgotPassword.reset.subtitle')} <strong>{email || '—'}</strong>
            </p>

            {/* Sans email (accès direct à l'étape 2 via « J'ai déjà un code »),
                le serveur ne peut pas identifier le compte : on le redemande. */}
            {!email ? (
              <div className="field">
                <label htmlFor="fp-email2">{t('login.email')}</label>
                <input
                  id="fp-email2"
                  className="input"
                  type="email"
                  autoComplete="email"
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            ) : null}

            <div className="field">
              <label htmlFor="fp-code">{t('forgotPassword.reset.code')}</label>
              <input
                id="fp-code"
                className="input fp-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                {...resetForm.register('code', {
                  required: t('forgotPassword.reset.codeRequired'),
                  pattern: { value: /^\d{6}$/, message: t('forgotPassword.reset.codeFormat') },
                })}
              />
              {resetForm.formState.errors.code && (
                <span className="field-error">{resetForm.formState.errors.code.message}</span>
              )}
            </div>

            <div className="field">
              <label>{t('forgotPassword.reset.newPassword')}</label>
              <PasswordInput
                {...resetForm.register('password', {
                  required: t('login.validation.passwordRequired'),
                  // Même règle que le serveur (Joi) : ≥ 8, 1 majuscule, 1 chiffre.
                  // La valider ici évite un aller-retour pour un refus prévisible.
                  validate: (v) =>
                    /^(?=.*[A-Z])(?=.*\d).{8,}$/.test(v) || t('forgotPassword.reset.weak'),
                })}
              />
              {resetForm.formState.errors.password && (
                <span className="field-error">{resetForm.formState.errors.password.message}</span>
              )}
            </div>

            <div className="field">
              <label>{t('forgotPassword.reset.confirmPassword')}</label>
              <PasswordInput
                {...resetForm.register('confirm', {
                  required: t('login.validation.passwordRequired'),
                  validate: (v) => v === password || t('forgotPassword.reset.mismatch'),
                })}
              />
              {resetForm.formState.errors.confirm && (
                <span className="field-error">{resetForm.formState.errors.confirm.message}</span>
              )}
            </div>

            <button className="lp-submit" type="submit" disabled={submitting}>
              {submitting && <Loader2 size={17} className="spin" />}
              <span>{submitting ? t('login.loading') : t('forgotPassword.reset.cta')}</span>
              {!submitting && <ArrowRight size={17} className="lp-arrow" />}
            </button>

            {error && <p className="lp-error" role="alert">{error}</p>}

            <button
              type="button"
              className="fp-link"
              onClick={() => {
                setError(null);
                setStep('request');
              }}
            >
              {t('forgotPassword.reset.resend')}
            </button>

            <div className="lp-form-footer">
              <Link to="/login" className="lp-back">{t('forgotPassword.backToLogin')}</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
