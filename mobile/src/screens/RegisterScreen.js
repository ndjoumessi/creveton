// RegisterScreen — formulaire d'inscription (API §4 POST /auth/register).
// Champs : nom, email, phone +237, password, ville, age, sexe, lang.

import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
} from 'react-native';
import { Screen, Title, Body, Label, Input, Button } from '../components';
import { useAuthStore } from '../store/authStore';
import { validateRegister, normalizePhone } from '../utils/validation';
import { SEXES, LANGS } from '../constants/config';
import { colors, fonts, fontSizes, radius, spacing } from '../constants/theme';

export default function RegisterScreen({ navigation }) {
  const register = useAuthStore((s) => s.register);
  const loading = useAuthStore((s) => s.loading);

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '+237',
    password: '',
    ville: '',
    age: '',
    sexe: 'N',
    lang: 'fr',
  });
  const [errors, setErrors] = useState({});

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const onSubmit = async () => {
    const phone = normalizePhone(form.phone);
    const candidate = { ...form, phone };
    const errs = validateRegister(candidate);
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const payload = {
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      phone,
      password: form.password,
      ville: form.ville.trim() || undefined,
      age: form.age ? Number(form.age) : undefined,
      sexe: form.sexe,
      lang: form.lang,
    };
    const res = await register(payload);
    if (res.ok) {
      navigation.navigate('OTP', {
        phone,
        otpExpiresAt: res.data.otp_expires_at,
      });
    } else {
      // Mappe les erreurs serveur connues sur les champs.
      const code = res.error?.code;
      if (code === 'EMAIL_ALREADY_USED')
        setErrors((e) => ({ ...e, email: 'Email déjà utilisé.' }));
      else if (code === 'PHONE_ALREADY_USED')
        setErrors((e) => ({ ...e, phone: 'Numéro déjà utilisé.' }));
      else setErrors((e) => ({ ...e, _global: res.error?.message }));
    }
  };

  return (
    <Screen scroll>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Title style={styles.title}>Crée ton compte</Title>
        <Body muted style={styles.subtitle}>
          Rejoins la communauté et grimpe au classement.
        </Body>

        <Input
          label="Nom complet"
          placeholder="Awa Mballa"
          value={form.name}
          onChangeText={set('name')}
          error={errors.name}
          autoCapitalize="words"
        />
        <Input
          label="Email"
          placeholder="awa@example.cm"
          value={form.email}
          onChangeText={set('email')}
          error={errors.email}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <Input
          label="Téléphone"
          placeholder="+237690000000"
          value={form.phone}
          onChangeText={set('phone')}
          error={errors.phone}
          keyboardType="phone-pad"
        />
        <Input
          label="Mot de passe"
          placeholder="8 caractères, 1 chiffre, 1 majuscule"
          value={form.password}
          onChangeText={set('password')}
          error={errors.password}
          secureTextEntry
        />
        <Input
          label="Ville (optionnel)"
          placeholder="Yaoundé"
          value={form.ville}
          onChangeText={set('ville')}
        />
        <Input
          label="Âge (optionnel)"
          placeholder="16"
          value={String(form.age)}
          onChangeText={set('age')}
          error={errors.age}
          keyboardType="number-pad"
        />

        <Label style={styles.groupLabel}>Sexe</Label>
        <ChoiceRow
          options={SEXES}
          value={form.sexe}
          onChange={set('sexe')}
        />

        <Label style={styles.groupLabel}>Langue</Label>
        <ChoiceRow
          options={LANGS}
          value={form.lang}
          onChange={set('lang')}
        />

        {errors._global ? (
          <Body color={colors.red400} style={styles.globalError}>
            {errors._global}
          </Body>
        ) : null}

        <Button
          title="Continuer"
          onPress={onSubmit}
          loading={loading}
          style={styles.submit}
        />
        <Pressable onPress={() => navigation.navigate('Login')}>
          <Body muted style={styles.loginLink}>
            Déjà inscrit ? Se connecter
          </Body>
        </Pressable>
      </KeyboardAvoidingView>
    </Screen>
  );
}

// Groupe de boutons-segments (sexe / langue).
function ChoiceRow({ options, value, onChange }) {
  return (
    <View style={styles.choiceRow}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={[styles.choice, active && styles.choiceActive]}
          >
            <Text style={[styles.choiceText, active && styles.choiceTextActive]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: spacing.sm },
  subtitle: { marginBottom: spacing.lg },
  groupLabel: { marginBottom: spacing.sm, marginTop: spacing.xs },
  choiceRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  choice: {
    flex: 1,
    height: 46,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  choiceActive: { backgroundColor: colors.green500, borderColor: colors.green500 },
  choiceText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.sm,
    color: colors.textDark,
  },
  choiceTextActive: { color: colors.cream },
  globalError: { marginBottom: spacing.md },
  submit: { marginTop: spacing.md },
  loginLink: { textAlign: 'center', marginTop: spacing.lg },
});
