// RegisterScreen — inscription multi-étapes (API §4 POST /auth/register).
// 3 étapes (identité / compte / profil), barre de progression dorée, transitions animées.
// Fond bicolore (vert profond / cream) + carte blanche flottante.

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Title, Body, AppCard, AppInput, AppButton } from '../components';
import { useAuthStore } from '../store/authStore';
import {
  normalizePhone,
  isValidName,
  isValidPhone,
  isValidEmail,
  isValidPassword,
} from '../utils/validation';
import { SEXES, LANGS } from '../constants/config';
import { colors, fonts, fontSizes, radius, spacing } from '../constants/theme';

const STEPS = [
  { title: 'Qui es-tu ?', label: 'Étape 1/3' },
  { title: 'Ton compte', label: 'Étape 2/3' },
  { title: 'Ton profil', label: 'Étape 3/3' },
];

export default function RegisterScreen({ navigation }) {
  const register = useAuthStore((s) => s.register);
  const loading = useAuthStore((s) => s.loading);

  const [step, setStep] = useState(0);
  const [showPwd, setShowPwd] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '+237',
    password: '',
    confirm: '',
    ville: '',
    age: '',
    sexe: 'N',
    lang: 'fr',
  });
  const [errors, setErrors] = useState({});

  const fade = useRef(new Animated.Value(1)).current;
  const slide = useRef(new Animated.Value(0)).current;

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  // Transition animée vers une nouvelle étape (slide + fade ≤ 300 ms).
  const transitionTo = (next, direction) => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 0,
        duration: 120,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(slide, {
        toValue: -direction * 24,
        duration: 120,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setStep(next);
      slide.setValue(direction * 24);
      Animated.parallel([
        Animated.timing(fade, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(slide, {
          toValue: 0,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    });
  };

  // Validation minimale par étape.
  const validateStep = () => {
    const errs = {};
    if (step === 0) {
      if (!isValidName(form.name)) errs.name = 'Nom requis (2 à 100 caractères).';
      if (!isValidPhone(normalizePhone(form.phone)))
        errs.phone = 'Numéro invalide (format +237XXXXXXXXX).';
    } else if (step === 1) {
      if (!isValidEmail(form.email)) errs.email = 'Adresse email invalide.';
      if (!isValidPassword(form.password))
        errs.password = '8 caractères min., 1 chiffre, 1 majuscule.';
      else if (form.password !== form.confirm)
        errs.confirm = 'Les mots de passe ne correspondent pas.';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const onNext = () => {
    if (!validateStep()) return;
    if (step < STEPS.length - 1) {
      transitionTo(step + 1, 1);
    } else {
      onSubmit();
    }
  };

  const onBack = () => {
    setErrors({});
    if (step > 0) transitionTo(step - 1, -1);
    else navigation.goBack();
  };

  const onSubmit = async () => {
    const phone = normalizePhone(form.phone);
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
      return;
    }
    // Mappe les erreurs serveur connues sur le champ et l'étape concernés.
    const code = res.error?.code;
    if (code === 'EMAIL_ALREADY_USED') {
      setErrors({ email: 'Email déjà utilisé.' });
      if (step !== 1) transitionTo(1, step < 1 ? 1 : -1);
    } else if (code === 'PHONE_ALREADY_USED') {
      setErrors({ phone: 'Numéro déjà utilisé.' });
      if (step !== 0) transitionTo(0, -1);
    } else {
      setErrors({ _global: res.error?.message || 'Inscription impossible.' });
    }
  };

  const isLast = step === STEPS.length - 1;

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
          <Title style={styles.heroTitle} color={colors.cream}>
            Crée ton compte
          </Title>
          <Body style={styles.heroSub} color={colors.textOnDarkMuted}>
            {STEPS[step].label} · {STEPS[step].title}
          </Body>

          <AppCard
            tone="light"
            elevation="floating"
            padding="lg"
            radius={radius.xxl}
            style={styles.card}
          >
            <View style={styles.progress}>
              {STEPS.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.progressSeg,
                    { backgroundColor: i <= step ? colors.gold500 : colors.border },
                  ]}
                />
              ))}
            </View>

            <Animated.View
              style={{ opacity: fade, transform: [{ translateX: slide }] }}
            >
              {step === 0 ? (
                <>
                  <AppInput
                    label="Nom complet"
                    value={form.name}
                    onChangeText={set('name')}
                    error={errors.name}
                    autoCapitalize="words"
                    textContentType="name"
                  />
                  <AppInput
                    label="Téléphone"
                    value={form.phone}
                    onChangeText={set('phone')}
                    error={errors.phone}
                    keyboardType="phone-pad"
                    textContentType="telephoneNumber"
                  />
                </>
              ) : null}

              {step === 1 ? (
                <>
                  <AppInput
                    label="Email"
                    value={form.email}
                    onChangeText={set('email')}
                    error={errors.email}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    textContentType="emailAddress"
                  />
                  <AppInput
                    label="Mot de passe"
                    value={form.password}
                    onChangeText={set('password')}
                    error={errors.password}
                    secureTextEntry={!showPwd}
                    autoCapitalize="none"
                    rightIcon={
                      <Text style={styles.eye}>{showPwd ? '🙈' : '👁'}</Text>
                    }
                    onRightIconPress={() => setShowPwd((v) => !v)}
                  />
                  <AppInput
                    label="Confirmer le mot de passe"
                    value={form.confirm}
                    onChangeText={set('confirm')}
                    error={errors.confirm}
                    secureTextEntry
                    autoCapitalize="none"
                  />
                </>
              ) : null}

              {step === 2 ? (
                <>
                  <AppInput
                    label="Ville (optionnel)"
                    value={form.ville}
                    onChangeText={set('ville')}
                    autoCapitalize="words"
                  />
                  <AppInput
                    label="Âge (optionnel)"
                    value={String(form.age)}
                    onChangeText={set('age')}
                    keyboardType="number-pad"
                  />
                  <Text style={styles.groupLabel}>Sexe</Text>
                  <PillRow
                    options={SEXES}
                    value={form.sexe}
                    onChange={set('sexe')}
                  />
                  <Text style={styles.groupLabel}>Langue</Text>
                  <PillRow
                    options={LANGS}
                    value={form.lang}
                    onChange={set('lang')}
                  />
                </>
              ) : null}
            </Animated.View>

            {errors._global ? (
              <Body color={colors.red400} style={styles.globalError}>
                {errors._global}
              </Body>
            ) : null}

            <AppButton
              title={isLast ? 'Créer mon compte' : 'Suivant →'}
              variant="primary"
              size="lg"
              fullWidth
              loading={loading}
              onPress={onNext}
              style={styles.next}
            />
            <AppButton
              title="← Retour"
              variant="ghost"
              size="md"
              fullWidth
              onPress={onBack}
              style={styles.backBtn}
            />
          </AppCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Rangée de pilules segmentées (sexe / langue).
function PillRow({ options, value, onChange }) {
  return (
    <View style={styles.pillRow}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={[styles.pill, active && styles.pillActive]}
          >
            <Text style={[styles.pillText, active && styles.pillTextActive]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
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
  heroTitle: { marginBottom: spacing.xs },
  heroSub: { marginBottom: spacing.lg },
  card: { width: '100%' },
  progress: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  progressSeg: {
    flex: 1,
    height: 6,
    borderRadius: radius.pill,
  },
  eye: { fontSize: fontSizes.lg },
  groupLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  pillRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  pill: {
    flex: 1,
    height: 46,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.borderInput,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  pillActive: { backgroundColor: colors.green900, borderColor: colors.green900 },
  pillText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  pillTextActive: { color: colors.cream },
  globalError: { marginBottom: spacing.md },
  next: { marginTop: spacing.sm },
  backBtn: { marginTop: spacing.md },
});
