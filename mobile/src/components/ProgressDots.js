// Points de progression du quiz : passé (correct/faux), courant, à venir.

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, spacing } from '../constants/theme';

// states: tableau de 'correct' | 'wrong' | 'skipped' | undefined par question
export default function ProgressDots({ total, current, states = [] }) {
  return (
    <View style={styles.row}>
      {Array.from({ length: total }).map((_, i) => {
        let bg = colors.borderOnDark;
        if (i < current) {
          const s = states[i];
          bg =
            s === 'correct'
              ? colors.green300
              : s === 'wrong'
                ? colors.red400
                : colors.gold500;
        } else if (i === current) {
          bg = colors.gold400;
        }
        return (
          <View
            key={i}
            style={[
              styles.dot,
              { backgroundColor: bg },
              i === current && styles.active,
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  active: { width: 22 },
});
