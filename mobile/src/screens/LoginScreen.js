// LoginScreen — connexion email + mot de passe (API §4 POST /auth/login).

import React, { useState } from 'react';
import {
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { Screen, Title, Body, Input, Button } from '../components';
import { useAuthStore } from '../store/authStore';
import { isValidEmail } from '../utils/validation';
import { colors, spacing } from '../constants/theme';

export default function LoginScreen({ navigation }) {
  const login = useAuthStore((s) => s.login);
  const loading = useAuthStore((s) => s.loading);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);

  const onSubmit = async () => {
    setError(null);
    if (!isValidEmail(email) || !password) {
      setError('Email et mot de passe requis.');
      return;
    }
    const res = await login(email.trim().toLowerCase(), password);
    if (!res.ok) {
      const code = res.error?.code;
      if (code === 'PHONE_NOT_VERIFIED') {
        navigation.navigate('OTP', { phone: res.error?.phone });
        return;
      }
      setError(res.error?.message || 'Connexion impossible.');
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <Pressable style={styles.back} onPress={() => navigation.goBack()}>
          <Body color={colors.green700}>← Retour</Body>
        </Pressable>

        <Title style={styles.title}>Bon retour 👋</Title>
        <Body muted style={styles.subtitle}>
          Connecte-toi pour reprendre la partie.
        </Body>

        <Input
          label="Email"
          placeholder="awa@example.cm"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <Input
          label="Mot de passe"
          placeholder="••••••••"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        {error ? (
          <Body color={colors.red400} style={styles.error}>
            {error}
          </Body>
        ) : null}

        <Button
          title="Se connecter"
          onPress={onSubmit}
          loading={loading}
          style={styles.submit}
        />
        <Pressable onPress={() => navigation.navigate('Register')}>
          <Body muted style={styles.link}>
            Pas encore de compte ? S'inscrire
          </Body>
        </Pressable>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  back: { marginBottom: spacing.md },
  title: { marginBottom: spacing.sm },
  subtitle: { marginBottom: spacing.xl },
  error: { marginBottom: spacing.md },
  submit: { marginTop: spacing.md },
  link: { textAlign: 'center', marginTop: spacing.lg },
});
