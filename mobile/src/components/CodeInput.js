// CodeInput — saisie d'un code à N chiffres en cases séparées.
//
// Extrait de OTPScreen (vérification du téléphone) pour servir aussi la
// réinitialisation de mot de passe. Un mode ajouté à OTPScreen aurait été plus
// court à écrire mais faux : cet écran émet des tokens et marque le téléphone
// vérifié — ce n'est pas le même contrat. Seule la SAISIE est commune.
//
// Comportements conservés à l'identique : avance automatique, retour arrière sur
// case vide qui recule d'un cran, collage du code entier depuis le presse-papier
// (SMS/email), soumission dès la dernière case remplie, secousse à l'erreur.
//
// Le parent pilote : il fournit `value` et reçoit `onChange` / `onComplete`, et
// déclenche la secousse via le ref (`shake()` / `clear()`).

import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { TextInput, Animated, StyleSheet } from 'react-native';
import { fonts, fontSizes, radius, shadow, spacing } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { useReduceMotion } from '../hooks/useReduceMotion';

const CodeInput = forwardRef(function CodeInput(
  {
    length = 6,
    value = '',
    onChange,
    onComplete,
    error = false,
    autoFocus = true,
    // `sms-otp` fait remplir la case par la suggestion Android/iOS. Inadapté à un
    // code reçu par EMAIL : le système ne le proposera pas, et le déclarer
    // brouille l'autofill. Le parent choisit.
    autoComplete = 'one-time-code',
    editable = true,
    accessibilityLabel,
  },
  ref
) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const reduceMotion = useReduceMotion();
  const inputs = useRef([]);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const digits = useMemo(() => {
    const chars = String(value || '').slice(0, length).split('');
    return Array(length)
      .fill('')
      .map((_, i) => chars[i] || '');
  }, [value, length]);

  const focusFirst = useCallback(() => {
    requestAnimationFrame(() => inputs.current[0]?.focus());
  }, []);

  const shake = useCallback(() => {
    if (reduceMotion) return; // a11y : l'erreur reste portée par la couleur + le texte
    shakeAnim.setValue(0);
    Animated.sequence(
      [1, -1, 0.6, -0.6, 0].map((toValue) =>
        Animated.timing(shakeAnim, { toValue, duration: 60, useNativeDriver: true })
      )
    ).start();
  }, [shakeAnim, reduceMotion]);

  useImperativeHandle(ref, () => ({
    shake,
    clear: () => {
      onChange?.('');
      focusFirst();
    },
    focus: focusFirst,
  }));

  const emit = (next) => {
    const joined = next.join('');
    onChange?.(joined);
    if (next.every(Boolean)) onComplete?.(joined);
  };

  const handleChange = (text, i) => {
    const clean = text.replace(/\D/g, '');

    // Collage du code complet : une seule case reçoit toute la chaîne.
    if (clean.length > 1) {
      const chars = clean.slice(0, length).split('');
      const filled = Array(length)
        .fill('')
        .map((_, idx) => chars[idx] || '');
      const last = Math.min(chars.length, length) - 1;
      inputs.current[last >= 0 ? last : 0]?.focus();
      emit(filled);
      return;
    }

    const next = [...digits];
    next[i] = clean;
    emit(next);
    if (clean && i < length - 1) inputs.current[i + 1]?.focus();
  };

  const handleKeyPress = (e, i) => {
    if (e.nativeEvent.key === 'Backspace' && !digits[i] && i > 0) {
      inputs.current[i - 1]?.focus();
    }
  };

  const translateX = shakeAnim.interpolate({ inputRange: [-1, 1], outputRange: [-10, 10] });

  return (
    <Animated.View
      style={[styles.row, { transform: [{ translateX }] }]}
      accessibilityLabel={accessibilityLabel}
    >
      {digits.map((d, i) => (
        <TextInput
          key={i}
          ref={(el) => {
            inputs.current[i] = el;
          }}
          value={d}
          onChangeText={(text) => handleChange(text, i)}
          onKeyPress={(e) => handleKeyPress(e, i)}
          onFocus={() => setFocusedIndex(i)}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete={autoComplete}
          maxLength={length}
          editable={editable}
          selectionColor={colors.green500}
          style={[
            styles.box,
            d ? styles.boxFilled : null,
            focusedIndex === i ? styles.boxFocused : null,
            error ? styles.boxError : null,
          ]}
          autoFocus={autoFocus && i === 0}
        />
      ))}
    </Animated.View>
  );
});

const makeStyles = (colors) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    box: {
      // Largeur fixe héritée d'OTPScreen : 6 cases de 52 px tiennent sur un
      // écran de 360 dp avec les gouttières. `flex: 1` casserait l'alignement
      // avec l'existant sans rien apporter.
      width: 52,
      height: 60,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: colors.borderInput,
      backgroundColor: colors.white,
      textAlign: 'center',
      fontFamily: fonts.titleBold,
      fontSize: fontSizes.xl,
      // Chiffre : textDark (thème-aware). Tous les fonds de case (base/filled/
      // error) flippent → le chiffre reste lisible en clair ET en sombre.
      color: colors.textDark,
    },
    boxFilled: {
      borderColor: colors.green500,
      // successBg (flippe) et non successBgSoft (figé clair) : sinon en sombre le
      // chiffre clair tomberait sur un fond clair figé → invisible.
      backgroundColor: colors.successBg,
    },
    boxFocused: {
      borderColor: colors.green700,
      ...shadow.soft,
      shadowColor: colors.green500,
      shadowOpacity: 0.18,
    },
    boxError: { borderColor: colors.red400, backgroundColor: colors.white },
  });

export default CodeInput;
