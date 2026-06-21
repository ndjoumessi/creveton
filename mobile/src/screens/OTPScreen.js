// OTPScreen — saisie 6 chiffres, badge animé, timer mm:ss, renvoi OTP (API §4).

import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  Pressable,
  Animated,
  Easing,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Screen, Logo, Title, Body, Label, AppButton, useToast } from '../components';
import { useAuthStore } from '../store/authStore';
import {
  colors,
  fonts,
  fontSizes,
  radius,
  spacing,
  shadow,
} from '../constants/theme';
import { formatTimer } from '../utils/format';

const LENGTH = 6;
const FALLBACK_SECONDS = 600;
const RESEND_UNLOCK = 540; // renvoi possible quand il reste ≤ 540s

// Mise en forme légère du numéro (groupes de 2-3 chiffres) pour la lisibilité.
function prettyPhone(raw) {
  if (!raw) return '';
  const str = String(raw).trim();
  const plus = str.startsWith('+') ? '+' : '';
  const digits = str.replace(/\D/g, '');
  if (digits.length < 6) return str;
  // ex. +237 6 12 34 56 78
  const groups = digits.replace(/(\d{1,3})(?=(\d{2})+(?!\d))/g, '$1 ');
  return `${plus}${groups}`.trim();
}

export default function OTPScreen({ route, navigation }) {
  const { t } = useTranslation();
  const { phone, otpExpiresAt } = route.params || {};
  const verifyOtp = useAuthStore((s) => s.verifyOtp);
  const resendOtp = useAuthStore((s) => s.resendOtp);
  const loading = useAuthStore((s) => s.loading);
  const toast = useToast();

  const [digits, setDigits] = useState(Array(LENGTH).fill(''));
  const [error, setError] = useState(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [expiresAt, setExpiresAt] = useState(otpExpiresAt);
  const [remaining, setRemaining] = useState(FALLBACK_SECONDS);
  const [resending, setResending] = useState(false);

  const inputs = useRef([]);
  const bounce = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;

  const code = useMemo(() => digits.join(''), [digits]);
  const expired = remaining <= 0;
  const canResend = expired || remaining <= RESEND_UNLOCK;

  // Badge « 📱 » — léger rebond continu.
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(bounce, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [bounce]);

  // Décompte basé sur otp_expires_at (≈ 10 min) ; nettoyé au démontage.
  useEffect(() => {
    const tick = () => {
      if (!expiresAt) {
        setRemaining((r) => Math.max(0, r - 1));
        return;
      }
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

  const triggerShake = useCallback(() => {
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -1, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0.6, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -0.6, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  }, [shake]);

  const resetBoxes = useCallback(() => {
    setDigits(Array(LENGTH).fill(''));
    requestAnimationFrame(() => inputs.current[0]?.focus());
  }, []);

  const submit = useCallback(
    async (full) => {
      setError(null);
      const res = await verifyOtp(phone, full);
      if (!res.ok) {
        triggerShake();
        resetBoxes();
        const msg = res.error?.message || t('auth.otp.notify.invalidCode');
        setError(msg);
        toast.show({ type: 'error', message: msg });
      }
      // Succès : authStore bascule isAuthenticated → le navigateur change seul.
    },
    [verifyOtp, phone, triggerShake, resetBoxes, toast, t]
  );

  const onChange = (text, i) => {
    const clean = text.replace(/\D/g, '');
    setError(null);

    // Collage du code complet.
    if (clean.length > 1) {
      const chars = clean.slice(0, LENGTH).split('');
      const filled = Array(LENGTH)
        .fill('')
        .map((_, idx) => chars[idx] || '');
      setDigits(filled);
      const last = Math.min(chars.length, LENGTH) - 1;
      inputs.current[last >= 0 ? last : 0]?.focus();
      if (filled.every(Boolean)) submit(filled.join(''));
      return;
    }

    setDigits((prev) => {
      const next = [...prev];
      next[i] = clean;
      if (clean && next.every(Boolean)) submit(next.join(''));
      return next;
    });
    if (clean && i < LENGTH - 1) inputs.current[i + 1]?.focus();
  };

  const onKeyPress = (e, i) => {
    if (e.nativeEvent.key === 'Backspace' && !digits[i] && i > 0) {
      inputs.current[i - 1]?.focus();
    }
  };

  const onResend = async () => {
    if (!canResend || resending) return;
    setError(null);
    setResending(true);
    const res = await resendOtp(phone);
    setResending(false);
    if (res.ok) {
      setExpiresAt(res.data?.otp_expires_at);
      if (!res.data?.otp_expires_at) setRemaining(FALLBACK_SECONDS);
      resetBoxes();
      toast.show({ type: 'success', message: t('auth.otp.notify.resent') });
    } else {
      const msg = res.error?.message || t('auth.otp.notify.resendFailed');
      setError(msg);
      toast.show({ type: 'error', message: msg });
    }
  };

  const badgeTranslate = bounce.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -8],
  });
  const rowTranslate = shake.interpolate({
    inputRange: [-1, 1],
    outputRange: [-10, 10],
  });

  return (
    <Screen scroll contentStyle={styles.content}>
      <Pressable
        style={styles.back}
        onPress={() => navigation.goBack()}
        hitSlop={8}
      >
        <Body color={colors.green700} style={styles.backText}>
          {t('auth.register.back')}
        </Body>
      </Pressable>

      <View style={styles.center}>
        <Logo size={40} />

        <Animated.View
          style={[styles.badge, { transform: [{ translateY: badgeTranslate }] }]}
        >
          <Body style={styles.badgeEmoji}>📱</Body>
        </Animated.View>

        <Title style={styles.heading}>{t('auth.otp.title')}</Title>
        <Body muted style={styles.subtitle}>
          {t('auth.otp.subtitle')}{'\n'}
          <Body style={styles.phone}>{prettyPhone(phone)}</Body>
        </Body>
      </View>

      <Animated.View
        style={[styles.boxes, { transform: [{ translateX: rowTranslate }] }]}
      >
        {digits.map((d, i) => {
          const isFocused = focusedIndex === i;
          return (
            <TextInput
              key={i}
              ref={(el) => {
                inputs.current[i] = el;
              }}
              value={d}
              onChangeText={(t) => onChange(t, i)}
              onKeyPress={(e) => onKeyPress(e, i)}
              onFocus={() => setFocusedIndex(i)}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              maxLength={LENGTH}
              selectionColor={colors.green500}
              style={[
                styles.box,
                d ? styles.boxFilled : null,
                isFocused ? styles.boxFocused : null,
                error ? styles.boxError : null,
              ]}
              autoFocus={i === 0}
            />
          );
        })}
      </Animated.View>

      {error ? (
        <Body color={colors.errorText} style={styles.error}>
          {error}
        </Body>
      ) : null}

      <View style={styles.timerRow}>
        {expired ? (
          <Label color={colors.errorText}>{t('auth.otp.expiredCode')}</Label>
        ) : (
          <>
            <Label muted>{t('auth.otp.misc.expiresIn')} </Label>
            <Body style={styles.timer}>{formatTimer(remaining)}</Body>
          </>
        )}
      </View>

      <AppButton
        title={t('auth.otp.validate')}
        size="md"
        onPress={() => submit(code)}
        loading={loading}
        disabled={code.length !== LENGTH || loading}
        style={styles.submit}
      />

      <Pressable
        onPress={onResend}
        disabled={!canResend || resending}
        hitSlop={8}
        style={styles.resendWrap}
      >
        <Body
          style={styles.resend}
          color={canResend ? colors.green700 : colors.textFaint}
        >
          {resending ? t('auth.otp.misc.resending') : t('auth.otp.resend')}
        </Body>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl },
  back: { alignSelf: 'flex-start', marginBottom: spacing.lg },
  backText: { fontFamily: fonts.bodySemiBold },
  center: { alignItems: 'center', marginBottom: spacing.xl },
  badge: {
    width: 84,
    height: 84,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(42, 138, 79, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(42, 138, 79, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  badgeEmoji: { fontSize: 38, lineHeight: 46 },
  heading: {
    fontFamily: fonts.titleBold,
    fontSize: 22,
    color: colors.green900,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  subtitle: { textAlign: 'center', lineHeight: 22 },
  phone: { fontFamily: fonts.bodyBold, color: colors.green700 },
  boxes: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  box: {
    width: 52,
    height: 60,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.borderInput,
    backgroundColor: colors.white,
    textAlign: 'center',
    fontFamily: fonts.titleBold,
    fontSize: fontSizes.xl,
    color: colors.green900,
  },
  boxFilled: {
    borderColor: colors.green500,
    backgroundColor: colors.successBgSoft,
  },
  boxFocused: {
    borderColor: colors.green700,
    ...shadow.soft,
    shadowColor: colors.green500,
    shadowOpacity: 0.18,
  },
  boxError: { borderColor: colors.red400, backgroundColor: colors.white },
  error: { textAlign: 'center', marginTop: spacing.md },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  timer: {
    fontFamily: fonts.titleBold,
    fontSize: fontSizes.base,
    color: colors.gold500,
  },
  submit: { marginTop: spacing.xl },
  resendWrap: { marginTop: spacing.lg, alignSelf: 'center' },
  resend: { textAlign: 'center', fontFamily: fonts.bodySemiBold },
});
