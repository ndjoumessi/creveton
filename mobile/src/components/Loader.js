// Indicateur de chargement plein écran.

import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Body } from './Text';
import { colors, spacing } from '../constants/theme';

export default function Loader({ message, dark = false }) {
  return (
    <View
      style={[
        styles.container,
        { backgroundColor: dark ? colors.green900 : colors.cream },
      ]}
    >
      <ActivityIndicator size="large" color={colors.gold400} />
      {message ? (
        <Body
          style={styles.message}
          color={dark ? colors.cream : colors.textDark}
        >
          {message}
        </Body>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  message: { marginTop: spacing.md },
});
