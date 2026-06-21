// LoginScreen — connexion email + mot de passe (API §4 POST /auth/login).
// Fond bicolore (vert profond / cream) + carte blanche flottante chevauchante.

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Title, Body, AppCard, AppInput, AppButton } from '../components';
import { useAuthStore } from '../store/authStore';
import { isValidEmail } from '../utils/validation';
import { colors, fonts, fontSizes, radius, spacing } from '../constants/theme';

export default function LoginScreen({ navigation }) {
  const login = useAuthStore((s) => s.login);
  const loading = useAuthStore((s) => s.loading);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);

  const onSubmit = async () => {
    setError(null);
    if (!isValidEmail(email) || !password) {
      setError('Email et mot de passe requis.');
      return;
    }
    const res = await login(email.trim().toLowerCase(), password);
    if (!res.ok) {
      if (res.error?.code === 'PHONE_NOT_VERIFIED') {
        navigation.navigate('OTP', { phone: res.error?.phone });
        return;
      }
      setError(res.error?.message || 'Connexion impossible.');
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar barStyle="light-content" />
      <View style={styles.topZone} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            style={styles.back}
            onPress={() => navigation.goBack()}
            hitSlop={8}
          >
            <Text style={styles.backText}>← Retour</Text>
          </Pressable>

          <AppCard
            tone="light"
            elevation="floating"
            padding="lg"
            radius={radius.xxl}
            style={styles.card}
          >
            <Title style={styles.title} color={colors.green900}>
              Bon retour 👋
            </Title>
            <Body muted style={styles.subtitle}>
              Connecte-toi pour reprendre la partie.
            </Body>

            <AppInput
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
            />
            <AppInput
              label="Mot de passe"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              textContentType="password"
              rightIcon={
                <Text style={styles.eye}>{showPassword ? '🙈' : '👁'}</Text>
              }
              onRightIconPress={() => setShowPassword((v) => !v)}
            />

            {error ? (
              <Body color={colors.red400} style={styles.error}>
                {error}
              </Body>
            ) : null}

            <AppButton
              title="Se connecter"
              variant="primary"
              size="lg"
              fullWidth
              loading={loading}
              onPress={onSubmit}
              style={styles.submit}
            />

            <Pressable
              style={styles.linkRow}
              onPress={() => navigation.navigate('Register')}
              hitSlop={8}
            >
              <Text style={styles.linkText}>
                Pas encore de compte ?{' '}
                <Text style={styles.linkAccent}>S&apos;inscrire</Text>
              </Text>
            </Pressable>
          </AppCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  flex: { flex: 1 },
  topZone: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '40%',
    backgroundColor: colors.green900,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  back: { alignSelf: 'flex-start', marginBottom: spacing.lg },
  backText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.cream,
  },
  card: { width: '100%' },
  title: { marginBottom: spacing.xs },
  subtitle: { marginBottom: spacing.xl },
  eye: { fontSize: fontSizes.lg },
  error: { marginBottom: spacing.md, marginTop: -spacing.sm },
  submit: { marginTop: spacing.sm },
  linkRow: { alignItems: 'center', marginTop: spacing.xl },
  linkText: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.md,
    color: colors.textMuted,
  },
  linkAccent: { fontFamily: fonts.bodyBold, color: colors.green700 },
});
