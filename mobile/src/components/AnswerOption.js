// AnswerOption — bouton de réponse partagé (QuizScreen + TournamentLiveScreen).
// Une ligne A–D : badge lettre + libellé, avec tous les états de feedback du jeu :
//   · idle       — défaut (surface, bordure)
//   · selected   — choix du joueur AVANT révélation (vert doux, pas de verdict)
//   · correct    — bonne réponse révélée (vert plein, glyphe ✓ ; `showGoodLabel`
//                  ajoute « bonne réponse » quand le joueur ne l'avait PAS choisie)
//   · incorrect  — mauvais choix révélé (rouge, glyphe ✗)
//   · neutral    — mode mixte blitz/marathon : option choisie en OR, sans verdict
//                  (la justesse est server-only) ; `showCheck` fait « pop » un ✓
//   · dimmed     — les autres options quand une réponse est posée (opacité réduite)
// La désactivation (post-réponse) passe par `disabled` — indépendante de l'état visuel.
//
// Thème : useTheme() interne (palette claire/sombre). Choix dark préservés :
// selected = successBg (sombre) / successBgSoft (clair) ; texte correct =
// green300 (sombre) / successText (clair) ; texte faux = red400 (sombre) /
// red600 (clair) ; lettres des badges pleins en textOnDark (stable en sombre).
//
// A11y : rôle radio + selected/checked/disabled. Animations (scale au press,
// pop du ✓) neutralisées si « Réduire les animations » est actif (useReduceMotion).

import React, { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, Pressable, Animated, Easing, StyleSheet } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { hapticLight } from '../utils/haptics';
import { fonts, fontSizes, radius, spacing } from '../constants/theme';

export default function AnswerOption({
  letter,
  text,
  state = 'idle', // 'idle' | 'selected' | 'correct' | 'incorrect' | 'neutral' | 'dimmed'
  selected = false, // choix du joueur (vérité a11y — l'état visuel peut différer)
  disabled = false,
  showGoodLabel = false, // libellé « bonne réponse » (correct non choisi)
  showCheck = false, // ✓ animé sur le badge (mode neutre)
  onPress,
}) {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const reduceMotion = useReduceMotion();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const scale = useRef(new Animated.Value(1)).current;
  const checkScale = useRef(new Animated.Value(0)).current;

  // ✓ qui « pop » sur le badge (confirmation du tap en mode mixte).
  useEffect(() => {
    if (!showCheck) {
      checkScale.setValue(0);
      return undefined;
    }
    if (reduceMotion) {
      checkScale.setValue(1);
      return undefined;
    }
    Animated.sequence([
      Animated.timing(checkScale, { toValue: 1.2, duration: 120, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(checkScale, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start();
    return undefined;
  }, [showCheck, reduceMotion, checkScale]);

  let container = styles.optDefault;
  let badge = styles.badgeDefault;
  let badgeText = styles.badgeTextDefault;
  let label = styles.optTextDefault;
  let glyph = letter;

  if (state === 'selected') {
    container = styles.optSelected;
  } else if (state === 'correct') {
    container = styles.optCorrect;
    badge = styles.badgeCorrect;
    badgeText = styles.badgeTextOnColor;
    label = styles.optTextCorrect;
    glyph = '✓';
  } else if (state === 'incorrect') {
    container = styles.optWrong;
    badge = styles.badgeWrong;
    badgeText = styles.badgeTextOnColor;
    label = styles.optTextWrong;
    glyph = '✗';
  } else if (state === 'neutral') {
    container = styles.optNeutral;
    badge = styles.badgeOnGold;
    badgeText = styles.badgeTextGold;
    label = styles.optTextNeutral;
  } else if (state === 'dimmed') {
    container = styles.optDimmed;
  }

  const onPressIn = () => {
    if (reduceMotion) return;
    Animated.timing(scale, { toValue: 0.97, duration: 50, useNativeDriver: true }).start();
  };
  const onPressOut = () => {
    if (reduceMotion) return;
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={() => {
          hapticLight();
          onPress?.();
        }}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={disabled}
        accessibilityRole="radio"
        accessibilityState={{ selected, checked: selected, disabled: !!disabled }}
        style={[styles.option, container]}
      >
        <View style={[styles.badge, badge]}>
          {showCheck ? (
            <Animated.Text style={[styles.badgeText, badgeText, { transform: [{ scale: checkScale }] }]}>
              ✓
            </Animated.Text>
          ) : (
            <Text style={[styles.badgeText, badgeText]}>{glyph}</Text>
          )}
        </View>
        <View style={styles.optBody}>
          {showGoodLabel ? <Text style={styles.goodLabel}>{t('quiz.goodAnswer')}</Text> : null}
          <Text style={[styles.optText, label]}>{text}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// `isDark` ne sert qu'aux états de feedback : `successBgSoft`/`successText`/`red600`
// n'ont pas d'équivalent AA sur les fonds sombres → on bascule sur successBg/
// green300/red400 en sombre (choix hérités de QuizScreen).
const makeStyles = (colors, isDark) => StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    borderRadius: radius.md, // 14
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1.5,
  },
  optDefault: { backgroundColor: colors.surface, borderColor: colors.border },
  optSelected: {
    backgroundColor: isDark ? colors.successBg : colors.successBgSoft,
    borderColor: colors.green500,
  },
  optCorrect: { backgroundColor: colors.successBg, borderColor: colors.green500 },
  optWrong: { backgroundColor: colors.errorBg, borderColor: colors.red400 },
  // Mode mixte (blitz/marathon) : feedback neutre (or / grisé).
  optNeutral: { backgroundColor: colors.gold500, borderColor: colors.gold500 },
  optDimmed: { backgroundColor: colors.surface, borderColor: colors.border, opacity: 0.4 },

  badge: { width: 32, height: 32, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  badgeDefault: { backgroundColor: colors.green900 },
  badgeCorrect: { backgroundColor: colors.green500 },
  badgeWrong: { backgroundColor: colors.red400 },
  badgeOnGold: { backgroundColor: colors.surface },
  badgeText: { fontFamily: fonts.titleBold, fontSize: fontSizes.md },
  // Lettres A-D sur pastilles pleines (vert nuit/émeraude/rouge) : toujours claires
  // — `colors.white` s'inverse en sombre, `textOnDark` non.
  badgeTextDefault: { color: colors.textOnDark },
  badgeTextOnColor: { color: colors.textOnDark },
  badgeTextGold: { color: colors.gold500 },

  optBody: { flex: 1 },
  optText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.md },
  optTextDefault: { color: colors.textBody },
  optTextCorrect: {
    color: isDark ? colors.green300 : colors.successText,
    fontFamily: fonts.bodySemiBold,
  },
  optTextWrong: { color: isDark ? colors.red400 : colors.red600 },
  // Sur fond or : `colors.white` (blanc en clair, surface sombre en sombre) garde
  // le contraste sur gold500 dans les deux thèmes.
  optTextNeutral: { color: colors.white, fontFamily: fonts.bodySemiBold },
  goodLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: isDark ? colors.green300 : colors.successText,
    marginBottom: 2,
  },
});
