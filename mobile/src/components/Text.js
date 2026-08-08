// Composants texte typés à la charte.
// Outfit → Title/Heading (titres, scores). Space Grotesk → Body/Label (corps).
// Couleurs par défaut contrastées (≥ 4.5:1), réactives au mode sombre via useTheme.
//
// ── API ────────────────────────────────────────────────────────────────────────
// Quatre variants, chacun avec un rendu PAR DÉFAUT inchangé (rétro-compat) :
//   <Title>    Outfit Bold        · fontSizes.xxl (28) · colors.textDark
//   <Heading>  Outfit SemiBold    · fontSizes.lg  (18) · colors.textDark
//   <Body>     Space Grotesk Reg. · fontSizes.base(16) · colors.textBody
//   <Label>    Space Grotesk Med. · fontSizes.sm  (13) · colors.textMuted
//
// Props communes (toutes optionnelles, opt-in — sans elles le rendu est identique) :
//   size    RÔLE (`textRoles` : 'screenTitle'|'cardTitle'|'body'|'caption'|
//           'keyFigure'|'question'|'authTitle') — à préférer — OU
//           clé de `fontSizes` ('xs'|'sm'|'md'|'base'|'lg'|'xl'|'xxl'|'xxxl'|
//           'display'|'hero') OU nombre brut (px) pour les cas hors grille.
//   weight  poids dans la famille du variant :
//           · Title/Heading (Outfit)       : 'regular'|'medium'|'semibold'|'bold'|
//                                            'extrabold'|'black'
//           · Body/Label (Space Grotesk)   : 'regular'|'medium'|'semibold'|'bold'
//   color   couleur explicite (token de theme.js — jamais de couleur en dur).
//   style   surcharge finale (layout, lineHeight, textAlign…), priorité maximale.
//   muted   (Body uniquement) bascule la couleur sur colors.textMuted.
//
// Exemples :
//   <Title size="lg" color={colors.gold500}>⚡ 120 pts</Title>   // score Outfit ≥ 700
//   <Heading size="question">Question…</Heading>                 // rôle (textRoles)
//   <Body weight="semibold" size="md">✓ Réponse envoyée</Body>
//   <Label size="md">3/10</Label>
//
// Règle charte : les chiffres importants restent en Outfit ≥ 700 → utiliser
// Title (bold par défaut) ou weight 'bold'/'extrabold'/'black', jamais Body.
// ───────────────────────────────────────────────────────────────────────────────

import React, { useMemo } from 'react';
import { Text as RNText, StyleSheet } from 'react-native';
import { fonts, fontSizes, textRoles } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';

// Poids → fontFamily, par famille. Un poids inconnu est ignoré (défaut du variant).
const TITLE_WEIGHTS = {
  regular: fonts.titleRegular,
  medium: fonts.titleMedium,
  semibold: fonts.titleSemiBold,
  bold: fonts.titleBold,
  extrabold: fonts.titleExtraBold,
  black: fonts.titleBlack,
};

const BODY_WEIGHTS = {
  regular: fonts.bodyRegular,
  medium: fonts.bodyMedium,
  semibold: fonts.bodySemiBold,
  bold: fonts.bodyBold,
};

// `size` : clé de fontSizes ou nombre brut. Valeur inconnue → null (défaut du variant).
function resolveSize(size) {
  if (typeof size === 'number') return size;
  // Rôles d'abord (screenTitle, keyFigure…), puis l'échelle par taille. Un rôle
  // dit l'intention ; `fontSizes` reste accepté pour tous les call-sites existants.
  if (typeof size === 'string' && textRoles[size] != null) return textRoles[size];
  if (typeof size === 'string' && fontSizes[size] != null) return fontSizes[size];
  return null;
}

// Style d'overrides opt-in (weight/size). Retourne null si aucun override.
function overrides(weights, weight, size) {
  const fontFamily = weight ? weights[weight] : null;
  const fontSize = resolveSize(size);
  if (!fontFamily && fontSize == null) return null;
  const out = {};
  if (fontFamily) out.fontFamily = fontFamily;
  if (fontSize != null) out.fontSize = fontSize;
  return out;
}

function makeStyles(colors) {
  return StyleSheet.create({
    title: {
      fontFamily: fonts.titleBold,
      fontSize: fontSizes.xxl,
      color: colors.textDark,
    },
    heading: {
      fontFamily: fonts.titleSemiBold,
      fontSize: fontSizes.lg,
      color: colors.textDark,
    },
    body: {
      fontFamily: fonts.bodyRegular,
      fontSize: fontSizes.base,
      color: colors.textBody,
    },
    label: {
      fontFamily: fonts.bodyMedium,
      fontSize: fontSizes.sm,
      color: colors.textMuted,
    },
    muted: { color: colors.textMuted },
  });
}

function useTextStyles() {
  const { colors } = useTheme();
  return useMemo(() => makeStyles(colors), [colors]);
}

export function Title({ style, children, color, size, weight, ...props }) {
  const styles = useTextStyles();
  return (
    <RNText
      style={[styles.title, overrides(TITLE_WEIGHTS, weight, size), color && { color }, style]}
      {...props}
    >
      {children}
    </RNText>
  );
}

export function Heading({ style, children, color, size, weight, ...props }) {
  const styles = useTextStyles();
  return (
    <RNText
      style={[styles.heading, overrides(TITLE_WEIGHTS, weight, size), color && { color }, style]}
      {...props}
    >
      {children}
    </RNText>
  );
}

export function Body({ style, children, color, muted, size, weight, ...props }) {
  const styles = useTextStyles();
  return (
    <RNText
      style={[
        styles.body,
        overrides(BODY_WEIGHTS, weight, size),
        muted && styles.muted,
        color && { color },
        style,
      ]}
      {...props}
    >
      {children}
    </RNText>
  );
}

export function Label({ style, children, color, size, weight, ...props }) {
  const styles = useTextStyles();
  return (
    <RNText
      style={[styles.label, overrides(BODY_WEIGHTS, weight, size), color && { color }, style]}
      {...props}
    >
      {children}
    </RNText>
  );
}

export default { Title, Heading, Body, Label };
