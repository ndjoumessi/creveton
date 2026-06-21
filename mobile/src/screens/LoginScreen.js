// LoginScreen — connexion email + mot de passe.
// BUG 1 corrigé : pas de ScrollView (qui remontait le composant), un seul
// KeyboardAvoidingView (padding iOS / height Android), champs NON contrôlés
// dont les valeurs vivent dans un ref → la frappe ne réinitialise jamais le
// formulaire quand le clavier s'ouvre.

import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Logo, AppButton, AuthField } from '../components';
import { useAuthStore } from '../store/authStore';
import { isValidEmail } from '../utils/validation';
import { colors, fonts, fontSizes, radius, spacing, shadow } from '../constants/theme';

export default function LoginScreen({ navigation }) {
  const { t } = useTranslation();
  const login = useAuthStore((s) => s.login);
  const loading = useAuthStore((s) => s.loading);

  // Valeurs en ref : aucune mise à jour d'état à la frappe (anti-reset).
  const values = useRef({ email: '', password: '' });
  const passwordRef = useRef(null);

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);

  const onSubmit = async () => {
    setError(null);
    const email = values.current.email.trim().toLowerCase();
    const password = values.current.password;
    if (!isValidEmail(email) || !password) {
      setError('Email et mot de passe requis.');
      return;
    }
    const res = await login(email, password);
    if (!res.ok) {
      if (res.error?.code === 'PHONE_NOT_VERIFIED') {
        navigation.navigate('OTP', { phone: res.error?.phone });
        return;
      }
      setError(res.error?.message || 'Connexion impossible.');
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
          <Text style={styles.title}>{t('auth.welcome')}</Text>
          <Text style={styles.subtitle}>{t('auth.welcomeSubtitle')}</Text>

          <AuthField
            label={t('auth.email')}
            defaultValue=""
            onChangeText={(t) => (values.current.email = t)}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
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
            textContentType="password"
            returnKeyType="done"
            onSubmitEditing={onSubmit}
            rightToggle={{ active: showPassword, onToggle: () => setShowPassword((v) => !v) }}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <AppButton
            title={t('auth.login')}
            variant="primary"
            size="lg"
            loading={loading}
            onPress={onSubmit}
            style={styles.submit}
          />
        </View>

        <Pressable
          style={styles.linkRow}
          onPress={() => navigation.navigate('Register')}
          hitSlop={8}
        >
          <Text style={styles.linkText}>
            {t('auth.noAccount')}{' '}
            <Text style={styles.linkAccent}>{t('auth.signup')}</Text>
          </Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.green900 },
  kav: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.lg },
  brand: { alignItems: 'center', marginBottom: spacing.xl },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.xxl,
    padding: 28,
    ...shadow.floating,
  },
  title: {
    fontFamily: fonts.titleBold,
    fontSize: 26,
    color: colors.green900,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.md,
    color: colors.grey,
    marginBottom: spacing.xl,
  },
  error: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.sm,
    color: colors.red400,
    marginBottom: spacing.md,
    marginTop: -spacing.sm,
  },
  submit: { marginTop: spacing.sm },
  linkRow: { alignItems: 'center', marginTop: spacing.xl },
  linkText: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.md,
    color: colors.textOnDarkMuted,
  },
  linkAccent: { fontFamily: fonts.bodyBold, color: colors.gold500 },
});
