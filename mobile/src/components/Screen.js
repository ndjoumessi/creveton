// Screen — conteneur safe-area. Fond cream (clair) ou green900 (dark).
// scroll optionnel, pull-to-refresh, padding configurable.

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
  dark = false,
  scroll = false,
  padded = true,
  refreshing = false,
  onRefresh = null,
  edges = ['top', 'bottom'],
  style,
  contentStyle,
}) {
  const { colors, isDark } = useTheme();
  const bg = dark ? colors.green900 : colors.cream;
  const Content = scroll ? ScrollView : View;
  const contentProps = scroll
    ? {
        contentContainerStyle: [padded && styles.padded, contentStyle],
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
    : { style: [styles.flex, padded && styles.padded, contentStyle] };

  return (
    <SafeAreaView edges={edges} style={[styles.flex, { backgroundColor: bg }, style]}>
      <StatusBar barStyle={dark || isDark ? 'light-content' : 'dark-content'} />
      <Content {...contentProps}>{children}</Content>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  padded: { padding: spacing.lg },
});
