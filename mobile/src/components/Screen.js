// Screen — conteneur safe-area. Fond cream (clair) ou green900 (dark).
// scroll optionnel, pull-to-refresh, padding configurable.
//
// `footer` (opt-in) : contenu ANCRÉ hors de la zone scrollable, toujours visible.
// Sert aux écrans dont l'action principale se retrouve sous la ligne de flottaison
// (écran Jouer : modes + 6 thèmes + niveau poussent « Lancer » hors écran).
// Défaut `null` → aucun changement pour les écrans qui ne le passent pas.

import React from 'react';
import {
  View,
  StyleSheet,
  StatusBar,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { spacing } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';

export default function Screen({
  children,
  footer = null,
  dark = false,
  scroll = false,
  padded = true,
  refreshing = false,
  onRefresh = null,
  edges = ['top', 'bottom'],
  statusBarStyle = null,
  topInsetColor = null,
  style,
  contentStyle,
}) {
  const { colors, isDark } = useTheme();
  const bg = dark ? colors.green900 : colors.cream;
  // En-tête sombre sur corps clair (Stats/Profile) : on peint le fond racine —
  // donc la zone d'inset top sous la status bar — en `topInsetColor` (green900)
  // pour éviter une bande crème au-dessus du bandeau vert, puis on repeint le
  // corps en `bg` par-dessus. Sinon le fond racine = `bg` (comportement actuel).
  const rootBg = topInsetColor || bg;
  const bodyBg = topInsetColor ? { backgroundColor: bg } : null;
  const Content = scroll ? ScrollView : View;
  const contentProps = scroll
    ? {
        contentContainerStyle: [
          padded && styles.padded,
          topInsetColor && styles.bodyFill,
          bodyBg,
          contentStyle,
        ],
        showsVerticalScrollIndicator: false,
        keyboardShouldPersistTaps: 'handled',
        refreshControl: onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.gold400}
            colors={[colors.green500]}
          />
        ) : undefined,
      }
    : { style: [styles.flex, padded && styles.padded, bodyBg, contentStyle] };

  return (
    <SafeAreaView edges={edges} style={[styles.flex, { backgroundColor: rootBg }, style]}>
      <StatusBar barStyle={statusBarStyle || (dark || isDark ? 'light-content' : 'dark-content')} />
      <Content {...contentProps}>{children}</Content>
      {footer ? (
        <View style={[styles.footer, { backgroundColor: bg, borderTopColor: colors.border }]}>
          {footer}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  padded: { padding: spacing.lg },
  bodyFill: { flexGrow: 1 },
  // Liseré haut : détache le pied du contenu qui défile dessous.
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
  },
});
