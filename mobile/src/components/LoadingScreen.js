// LoadingScreen — spinner or sur fond vert. Optionnellement plein écran avec
// safe area, ou inline (fill du parent).

import React from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts, fontSizes, spacing } from '../constants/theme';

export default function LoadingScreen({ message, fullScreen = true }) {
  const inner = (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.gold400} />
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
  if (!fullScreen) return <View style={styles.fill}>{inner}</View>;
  return (
    <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
      {inner}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.green900 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  message: {
    marginTop: spacing.lg,
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.md,
    color: colors.textOnDarkMuted,
  },
});
