// LoginScreen — connexion email + mot de passe.
// BUG 1 corrigé : pas de ScrollView (qui remontait le composant), un seul
// KeyboardAvoidingView (padding iOS / height Android), champs NON contrôlés
// dont les valeurs vivent dans un ref → la frappe ne réinitialise jamais le
// formulaire quand le clavier s'ouvre.

import React, { useRef, useState, useMemo, useEffect } from 'react';
import {
  View,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WifiOff } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Logo, AppButton, AuthField, Title, Body, Label } from '../components';
import Icon from '../components/Icon';
import { useAuthStore } from '../store/authStore';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { isValidEmail } from '../utils/validation';
import { getLastEmail } from '../services/storage';
import { radius, spacing, shadow, MIN_TOUCH } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';

export default function LoginScreen({ navigation }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const login = useAuthStore((s) => s.login);
  const loading = useAuthStore((s) => s.loading);
  const { isOnline } = useNetworkStatus();

  // Valeurs en ref : aucune mise à jour d'état à la frappe (anti-reset).
  const values = useRef({ email: '', password: '' });
  const emailRef = useRef(null);
  const passwordRef = useRef(null);

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);

  // Pré-remplit l'email avec le dernier connecté. Le champ est non contrôlé
  // (defaultValue posé une fois au montage, avant la lecture async) → on pousse
  // la valeur impérativement via setNativeProps + on alimente le ref des valeurs
  // (onChangeText ne se déclenche que sur saisie utilisateur).
  useEffect(() => {
    let active = true;
    getLastEmail().then((email) => {
      if (!active || !email || values.current.email) return;
      values.current.email = email;
      emailRef.current?.setNativeProps({ text: email });
    });
    return () => {
      active = false;
    };
  }, []);

  const onSubmit = async () => {
    setError(null);
    if (!isOnline) {
      setError(t('offline.loginRequired'));
      return;
    }
    const email = values.current.email.trim().toLowerCase();
    const password = values.current.password;
    if (!isValidEmail(email) || !password) {
      setError(t('auth.notify.credentialsRequired'));
      return;
    }
    const res = await login(email, password);
    if (!res.ok) {
      if (res.error?.code === 'PHONE_NOT_VERIFIED') {
        navigation.navigate('OTP', { phone: res.error?.phone });
        return;
      }
      setError(res.error?.message || t('auth.notify.loginFailed'));
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kav}
      >
        <View style={styles.brand}>
          <Logo size={56} />
        </View>

        <View style={styles.card}>
          <Title size="authTitle" style={styles.title}>{t('auth.welcome')}</Title>
          <Body size="md" muted style={styles.subtitle}>{t('auth.welcomeSubtitle')}</Body>

          {/* `autoComplete` ET `textContentType` : ce ne sont pas des synonymes.
              `textContentType` est ignoré sur Android, `autoComplete` est ignoré
              sur iOS (RN ne s'en sert là que pour DÉDUIRE un `textContentType`
              absent — cf. TextInput.js). N'en poser qu'un seul, comme ici
              jusqu'à présent, laisse donc une plateforme entière sans indice :
              le gestionnaire de mots de passe Android ne voyait aucun formulaire
              de connexion et n'a jamais proposé d'enregistrer quoi que ce soit.

              Le couple identifiant/mot de passe est annoncé en `username` +
              `current-password` plutôt qu'en `emailAddress` : côté Apple,
              `.emailAddress` est un champ de CARNET D'ADRESSES, seul `.username`
              associé à un champ mot de passe déclenche l'invite « Enregistrer le
              mot de passe ». Le clavier reste en `email-address`. */}
          <AuthField
            ref={emailRef}
            label={t('auth.email')}
            defaultValue=""
            onChangeText={(t) => (values.current.email = t)}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="username"
            autoComplete="username"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            blurOnSubmit={false}
          />
          <AuthField
            ref={passwordRef}
            label={t('auth.password')}
            defaultValue=""
            onChangeText={(t) => (values.current.password = t)}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
            autoComplete="current-password"
            returnKeyType="done"
            onSubmitEditing={onSubmit}
            rightToggle={{ active: showPassword, onToggle: () => setShowPassword((v) => !v) }}
          />

          {/* Emporte l'email déjà tapé : l'utilisateur vient d'échouer à se
              connecter, le lui redemander serait une friction gratuite. */}
          <Pressable
            style={styles.forgotRow}
            onPress={() =>
              navigation.navigate('ForgotPassword', { email: values.current.email.trim() })
            }
            hitSlop={8}
            accessibilityRole="button"
          >
            <Body size="md" color={colors.green500}>{t('auth.forgot.link')}</Body>
          </Pressable>

          {!isOnline ? (
            <View style={styles.offlineRow}>
              <Icon icon={WifiOff} size={16} color={colors.textMuted} />
              <Label style={styles.offline}>{t('offline.loginRequired')}</Label>
            </View>
          ) : null}
          {error ? (
            <Label color={colors.red400} style={styles.error} accessibilityLiveRegion="polite">
              {error}
            </Label>
          ) : null}

          <AppButton
            title={t('auth.login')}
            variant="primary"
            size="lg"
            loading={loading}
            disabled={!isOnline}
            onPress={onSubmit}
            style={styles.submit}
          />
        </View>

        <Pressable
          style={styles.linkRow}
          onPress={() => navigation.navigate('Register')}
          hitSlop={8}
          accessibilityRole="link"
        >
          <Body size="md" color={colors.textOnDarkMuted}>
            {t('auth.noAccount')}{' '}
            <Body weight="bold" size="md" color={colors.gold500}>{t('auth.signup')}</Body>
          </Body>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.green900 },
  kav: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.lg },
  brand: { alignItems: 'center', marginBottom: spacing.xl },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.sheet,
    padding: 28,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.floating,
  },
  title: {
    marginBottom: spacing.xs,
  },
  subtitle: {
    marginBottom: spacing.xl,
  },
  error: {
    marginBottom: spacing.md,
    marginTop: -spacing.sm,
  },
  offlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: spacing.md,
    marginTop: -spacing.sm,
  },
  offline: {
    textAlign: 'center',
  },
  submit: { marginTop: spacing.sm },
  // Aligné à droite sous le champ mot de passe — position attendue, et
  // n'entre pas en concurrence visuelle avec le CTA de connexion.
  forgotRow: { alignSelf: 'flex-end', marginTop: spacing.xs },
  linkRow: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
    minHeight: MIN_TOUCH,
    paddingVertical: spacing.sm,
  },
});
