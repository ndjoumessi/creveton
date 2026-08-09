// ResetPasswordScreen — étape 2 de « mot de passe oublié » : code à 6 chiffres
// reçu par email + nouveau mot de passe.
//
// À la réussite, le serveur renvoie des tokens (l'utilisateur vient de prouver
// qu'il contrôle la boîte) : le store bascule `isAuthenticated` et le navigateur
// change seul — pas de navigation manuelle ici.
//
// Le mot de passe passe par `passwordIssues`, comme l'inscription et le
// changement de mot de passe : les trois écrans désignent la contrainte non
// satisfaite au lieu de réciter la règle.

import React, { useRef, useState, useMemo } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { ShieldCheck } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import {
  Screen,
  Logo,
  Title,
  Body,
  Label,
  AuthField,
  CodeInput,
  AppButton,
  useToast,
} from '../components';
import Icon from '../components/Icon';
import { useAuthStore } from '../store/authStore';
import { passwordIssues } from '../utils/validation';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { radius, spacing } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';

const LENGTH = 6;

export default function ResetPasswordScreen({ navigation, route }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const toast = useToast();
  const { isOnline } = useNetworkStatus();
  const resetPassword = useAuthStore((s) => s.resetPassword);
  const forgotPassword = useAuthStore((s) => s.forgotPassword);

  const email = route.params?.email || '';
  const codeRef = useRef(null);
  const values = useRef({ password: '', confirm: '' });

  const [code, setCode] = useState('');
  const [errors, setErrors] = useState({ code: null, password: null, confirm: null });
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  // Cet écran était le SEUL des quatre à saisie de mot de passe sans œil
  // afficher/masquer (Login, Register et ChangePassword l'avaient déjà). C'est
  // pourtant celui où il manque le plus : on y tape un mot de passe qu'on vient
  // d'inventer, deux fois, sans jamais pouvoir vérifier ce qu'on a frappé.
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const onSubmit = async () => {
    const password = values.current.password;
    const confirm = values.current.confirm;
    const next = { code: null, password: null, confirm: null };

    if (code.length !== LENGTH) next.code = t('auth.reset.codeRequired');
    const issues = passwordIssues(password);
    if (issues.length) {
      next.password = issues.map((k) => t(`auth.register.validation.password_${k}`)).join(' ');
    } else if (confirm !== password) {
      next.confirm = t('auth.register.validation.passwordMismatch');
    }
    if (next.code || next.password || next.confirm) {
      setErrors(next);
      if (next.code) codeRef.current?.shake();
      return;
    }
    setErrors({ code: null, password: null, confirm: null });

    if (!isOnline) {
      setErrors((p) => ({ ...p, code: t('offline.loginRequired') }));
      return;
    }

    setSubmitting(true);
    const res = await resetPassword({ email, code, newPassword: password });
    setSubmitting(false);

    if (!res.ok) {
      const msg = res.error?.message || t('auth.reset.notify.failed');
      // Code refusé/expiré → on vide les cases : les laisser remplies inviterait
      // à retaper par-dessus des chiffres déjà rejetés.
      const codeRejected = ['RESET_CODE_INVALID', 'RESET_CODE_EXPIRED', 'RESET_TOO_MANY_ATTEMPTS']
        .includes(res.error?.code);
      if (codeRejected) {
        codeRef.current?.shake();
        setCode('');
        setErrors((p) => ({ ...p, code: msg }));
      } else {
        setErrors((p) => ({ ...p, password: msg }));
      }
      return;
    }
    // Succès : le store a posé la session, le navigateur bascule tout seul.
    toast.show({ type: 'success', message: t('auth.reset.notify.done') });
  };

  const onResend = async () => {
    if (!email || resending) return;
    setResending(true);
    const res = await forgotPassword(email);
    setResending(false);
    toast.show(
      res.ok
        ? { type: 'success', message: t('auth.forgot.notify.sent') }
        : { type: 'error', message: res.error?.message || t('auth.forgot.notify.failed') }
    );
    if (res.ok) setCode('');
  };

  return (
    <Screen scroll contentStyle={styles.content}>
      <Pressable
        style={styles.back}
        onPress={() => navigation.goBack()}
        hitSlop={8}
        accessibilityRole="button"
      >
        <Body weight="semibold" color={colors.green500}>{t('auth.register.back')}</Body>
      </Pressable>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.center}>
          <Logo size={40} />
          <View style={styles.badge}>
            <Icon icon={ShieldCheck} size={38} color={colors.green500} />
          </View>
          <Title size="xl" style={styles.heading}>{t('auth.reset.title')}</Title>
          <Body muted style={styles.subtitle}>
            {t('auth.reset.subtitle')}
            {email ? (
              <>
                {'\n'}
                <Body weight="bold" color={colors.textDark}>{email}</Body>
              </>
            ) : null}
          </Body>
        </View>

        <CodeInput
          ref={codeRef}
          length={LENGTH}
          value={code}
          onChange={(v) => {
            setCode(v);
            if (errors.code) setErrors((p) => ({ ...p, code: null }));
          }}
          error={!!errors.code}
          // Code reçu par EMAIL : pas d'autofill SMS à annoncer au système.
          autoComplete="off"
          accessibilityLabel={t('auth.reset.codeLabel')}
        />
        {errors.code ? (
          <Label color={colors.errorText} style={styles.codeError} accessibilityLiveRegion="polite">
            {errors.code}
          </Label>
        ) : null}

        <View style={styles.fields}>
          <AuthField
            label={t('auth.reset.newPassword')}
            defaultValue=""
            onChangeText={(v) => (values.current.password = v)}
            error={errors.password}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="newPassword"
            autoComplete="new-password"
            returnKeyType="next"
            rightToggle={{ active: showPassword, onToggle: () => setShowPassword((v) => !v) }}
          />
          <AuthField
            label={t('auth.reset.confirmPassword')}
            defaultValue=""
            onChangeText={(v) => (values.current.confirm = v)}
            error={errors.confirm}
            secureTextEntry={!showConfirm}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="newPassword"
            autoComplete="new-password"
            returnKeyType="done"
            onSubmitEditing={onSubmit}
            rightToggle={{ active: showConfirm, onToggle: () => setShowConfirm((v) => !v) }}
          />
        </View>

        <AppButton
          title={t('auth.reset.submit')}
          variant="primary"
          size="lg"
          fullWidth
          loading={submitting}
          disabled={!isOnline}
          onPress={onSubmit}
        />

        {email ? (
          <Pressable
            style={styles.resendWrap}
            onPress={onResend}
            disabled={resending}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityState={{ disabled: resending, busy: resending }}
          >
            <Body size="md" color={colors.green500}>{t('auth.reset.resend')}</Body>
          </Pressable>
        ) : null}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
    content: { paddingBottom: spacing.xxl },
    back: { alignSelf: 'flex-start', marginBottom: spacing.lg },
    center: { alignItems: 'center', marginBottom: spacing.lg },
    badge: {
      width: 76,
      height: 76,
      borderRadius: radius.pill,
      backgroundColor: colors.successBg,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.lg,
      marginBottom: spacing.lg,
    },
    heading: { textAlign: 'center', marginBottom: spacing.sm },
    subtitle: { textAlign: 'center', lineHeight: 22 },
    codeError: { textAlign: 'center', marginTop: spacing.sm },
    fields: { marginTop: spacing.xl },
    resendWrap: { alignSelf: 'center', marginTop: spacing.xl },
  });
