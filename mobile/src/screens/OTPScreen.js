// OTPScreen — saisie 6 chiffres, timer 10 min, renvoi OTP (API §4).

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { View, StyleSheet, TextInput, Pressable } from 'react-native';
import { Screen, Title, Body, Button } from '../components';
import { useAuthStore } from '../store/authStore';
import { colors, fonts, fontSizes, radius, spacing } from '../constants/theme';
import { formatTimer } from '../utils/format';

const LENGTH = 6;

export default function OTPScreen({ route, navigation }) {
  const { phone, otpExpiresAt } = route.params || {};
  const verifyOtp = useAuthStore((s) => s.verifyOtp);
  const resendOtp = useAuthStore((s) => s.resendOtp);
  const loading = useAuthStore((s) => s.loading);

  const [digits, setDigits] = useState(Array(LENGTH).fill(''));
  const [error, setError] = useState(null);
  const [expiresAt, setExpiresAt] = useState(otpExpiresAt);
  const [remaining, setRemaining] = useState(600);
  const inputs = useRef([]);

  // Décompte basé sur otp_expires_at (10 min).
  useEffect(() => {
    const tick = () => {
      if (!expiresAt) return setRemaining((r) => Math.max(0, r - 1));
      const secs = Math.max(
        0,
        Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000)
      );
      setRemaining(secs);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const code = useMemo(() => digits.join(''), [digits]);
  const expired = remaining <= 0;

  const onChange = (text, i) => {
    const clean = text.replace(/\D/g, '');
    if (clean.length > 1) {
      // Collage du code complet
      const next = clean.slice(0, LENGTH).split('');
      const filled = Array(LENGTH)
        .fill('')
        .map((_, idx) => next[idx] || '');
      setDigits(filled);
      inputs.current[Math.min(next.length, LENGTH - 1)]?.focus();
      return;
    }
    setDigits((d) => {
      const copy = [...d];
      copy[i] = clean;
      return copy;
    });
    if (clean && i < LENGTH - 1) inputs.current[i + 1]?.focus();
  };

  const onKeyPress = (e, i) => {
    if (e.nativeEvent.key === 'Backspace' && !digits[i] && i > 0) {
      inputs.current[i - 1]?.focus();
    }
  };

  const onVerify = async () => {
    setError(null);
    if (code.length !== LENGTH) {
      setError('Saisis les 6 chiffres.');
      return;
    }
    const res = await verifyOtp(phone, code);
    if (!res.ok) {
      setError(res.error?.message || 'Code invalide.');
      setDigits(Array(LENGTH).fill(''));
      inputs.current[0]?.focus();
    }
    // Succès : authStore passe isAuthenticated → AppNavigator bascule.
  };

  const onResend = async () => {
    setError(null);
    const res = await resendOtp(phone);
    if (res.ok) {
      setExpiresAt(res.data?.otp_expires_at);
      setDigits(Array(LENGTH).fill(''));
      inputs.current[0]?.focus();
    } else {
      setError(res.error?.message || 'Renvoi impossible.');
    }
  };

  return (
    <Screen>
      <Pressable style={styles.back} onPress={() => navigation.goBack()}>
        <Body color={colors.green700}>← Retour</Body>
      </Pressable>

      <Title style={styles.title}>Vérification</Title>
      <Body muted style={styles.subtitle}>
        Saisis le code à 6 chiffres envoyé par SMS au{'\n'}
        <Body style={styles.phone}>{phone}</Body>
      </Body>

      <View style={styles.boxes}>
        {digits.map((d, i) => (
          <TextInput
            key={i}
            ref={(el) => (inputs.current[i] = el)}
            value={d}
            onChangeText={(t) => onChange(t, i)}
            onKeyPress={(e) => onKeyPress(e, i)}
            keyboardType="number-pad"
            maxLength={LENGTH}
            style={[styles.box, d && styles.boxFilled, error && styles.boxError]}
            autoFocus={i === 0}
          />
        ))}
      </View>

      {error ? (
        <Body color={colors.red400} style={styles.error}>
          {error}
        </Body>
      ) : null}

      <View style={styles.timerRow}>
        {expired ? (
          <Body color={colors.red400}>Code expiré</Body>
        ) : (
          <Body muted>Expire dans {formatTimer(remaining)}</Body>
        )}
      </View>

      <Button
        title="Vérifier"
        onPress={onVerify}
        loading={loading}
        disabled={code.length !== LENGTH}
        style={styles.submit}
      />

      <Pressable onPress={onResend} disabled={!expired && remaining > 540}>
        <Body
          style={styles.resend}
          color={
            expired || remaining <= 540 ? colors.green700 : colors.textMuted
          }
        >
          Renvoyer le code
        </Body>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { marginBottom: spacing.md },
  title: { marginBottom: spacing.sm },
  subtitle: { marginBottom: spacing.xl },
  phone: { fontFamily: fonts.bodyBold, color: colors.green700 },
  boxes: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  box: {
    flex: 1,
    height: 60,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.white,
    textAlign: 'center',
    fontFamily: fonts.titleBold,
    fontSize: fontSizes.xl,
    color: colors.textDark,
  },
  boxFilled: { borderColor: colors.green500 },
  boxError: { borderColor: colors.red400 },
  error: { marginTop: spacing.md },
  timerRow: { alignItems: 'center', marginTop: spacing.lg },
  submit: { marginTop: spacing.lg },
  resend: { textAlign: 'center', marginTop: spacing.lg },
});
