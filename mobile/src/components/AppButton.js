// AppButton — variant (primary/secondary/ghost/danger/dark/outlineGold) × size (sm/md/lg).
// Feedback tactile < 120ms (scale spring au press), état loading (spinner inline).
// L'or est réservé au variant primary (CTA).
//
// Accessibilité : `Pressable` ne porte AUCUN rôle par défaut (contrairement à
// `Button`). Sans les attributs ci-dessous, chaque CTA de l'app — « Jouer »,
// « Accepter et jouer », « Charger plus » — était annoncé par TalkBack comme du
// texte ordinaire, ni actionnable, ni désactivé quand il l'était. Le libellé est
// explicite plutôt que déduit des enfants : en chargement le titre est REMPLACÉ
// par un spinner, et le bouton devenait alors parfaitement muet.

import React, { useRef, useMemo } from 'react';
import {
  Animated,
  Pressable,
  Text,
  View,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { fonts, fontSizes, radius, spacing, shadow, MIN_TOUCH } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { hapticLight } from '../utils/haptics';

const SIZES = {
  sm: { height: Math.max(42, MIN_TOUCH), font: fontSizes.md, px: spacing.lg }, // ≥44 (WCAG) / 48 (Android)
  md: { height: 52, font: fontSizes.base, px: spacing.xl },
  lg: { height: 60, font: fontSizes.lg, px: spacing.xl },
};

export default function AppButton({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  iconLeft = null,
  iconRight = null,
  fullWidth = true,
  haptic = true,
  accessibilityLabel,
  accessibilityHint,
  style,
  textStyle,
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const { colors, isDark } = useTheme();
  const VARIANTS = useMemo(() => makeVariants(colors, isDark), [colors, isDark]);
  const isDisabled = disabled || loading;
  // `isInert` = réellement indisponible, par opposition à « occupé » (loading).
  // Seul ce cas change d'apparence ; le chargement garde celle du variant.
  const isInert = disabled && !loading;
  const v = VARIANTS[variant] || VARIANTS.primary;
  const s = SIZES[size] || SIZES.md;

  const handlePress = (e) => {
    if (haptic) hapticLight();
    onPress?.(e);
  };

  const pressIn = () =>
    Animated.spring(scale, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 50,
      bounciness: 0,
    }).start();
  const pressOut = () =>
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 40,
      bounciness: 6,
    }).start();

  return (
    <Animated.View
      style={[
        fullWidth && styles.fullWidth,
        { transform: [{ scale }] },
        variant === 'primary' && !isDisabled && shadow.gold,
        style,
      ]}
    >
      <Pressable
        onPress={handlePress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel || (typeof title === 'string' ? title : undefined)}
        accessibilityHint={accessibilityHint}
        // `disabled` et `busy` sont distincts : « indisponible » et « en cours »
        // ne se réparent pas de la même façon côté utilisateur.
        accessibilityState={{ disabled: isDisabled, busy: loading }}
        style={[
          styles.base,
          { height: s.height, paddingHorizontal: s.px },
          v.container,
          // Désactivé : on REMPLACE l'apparence du variant au lieu de la
          // ternir. Un `opacity: 0.45` posé sur un `ghost` (déjà pâle) sur fond
          // sombre donnait un contrôle qui se lisait comme un bouton actif
          // discret — le libellé « Indisponible » portait l'info tout seul.
          // Un fond neutre plein rend l'état inerte quel que soit le variant
          // de départ, et se comporte pareil en clair et en sombre.
          // Le neutre diffère par thème : en clair, `surfaceCream` est le crème
          // (#fdf6e9) — 1.07:1 sur une carte blanche, donc invisible. On prend
          // le gris `border` comme APLAT, qui donne 1.24:1.
          isInert && {
            backgroundColor: isDark ? colors.surfaceCream : colors.border,
            borderColor: isDark ? colors.border : colors.borderInput,
            borderWidth: 1,
          },
        ]}
      >
        {loading ? (
          // En chargement on GARDE l'apparence du variant : neutraliser un CTA
          // primaire pendant sa propre action le ferait passer pour cassé.
          <ActivityIndicator color={v.text.color} />
        ) : (
          <View style={styles.content}>
            {iconLeft}
            <Text
              style={[
                styles.text,
                { fontSize: s.font },
                v.text,
                // Le libellé n'est PAS terni : c'est lui qui porte le sens
                // (« Indisponible », « Complet »), il doit rester lisible — AA
                // exigé. Le signal de désactivation vient de l'aplat neutre et
                // de l'absence d'or, pas d'un texte pâle. 8.33:1 en clair,
                // 5.63:1 en sombre.
                isInert && { color: isDark ? colors.textFaint : colors.textBody },
                textStyle,
              ]}
            >
              {title}
            </Text>
            {iconRight}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fullWidth: { alignSelf: 'stretch' },
  base: {
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  text: { fontFamily: fonts.titleBold, letterSpacing: 0.2 },
});

// En sombre, `ghost` (contour vert) passe au vert clair (green300) pour rester
// lisible sur surface sombre ; `secondary` garde un libellé clair stable.
const makeVariants = (colors, isDark) => ({
  primary: {
    container: { backgroundColor: colors.gold500 },
    text: { color: colors.green900 },
  },
  secondary: {
    container: { backgroundColor: colors.green500 },
    text: { color: colors.textOnDark },
  },
  ghost: {
    container: {
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: isDark ? colors.green300 : colors.green700,
    },
    text: { color: isDark ? colors.green300 : colors.green700 },
  },
  danger: {
    container: {
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: colors.red400,
    },
    text: { color: colors.red400 },
  },
  // Fond vert profond, libellé or — CTA « Rejouer » sur écran résultat sombre.
  dark: {
    container: { backgroundColor: colors.green900 },
    text: { color: colors.gold500 },
  },
  // Contour or sur fond transparent — action secondaire sur écran sombre.
  outlineGold: {
    container: {
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: colors.gold500,
    },
    text: { color: colors.gold500 },
  },
});
