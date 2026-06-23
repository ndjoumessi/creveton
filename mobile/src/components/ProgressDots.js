// Points de progression du quiz : répondu (or) / correct (vert) / faux (rouge),
// question courante (blanc, pulse), à venir (blanc estompé). Défile à l'horizontale
// au-delà de 15 questions (marathon = 20).

import React, { useEffect, useRef } from 'react';
import { View, ScrollView, Animated, StyleSheet } from 'react-native';
import { colors, spacing } from '../constants/theme';

const SCROLL_THRESHOLD = 15;
const GAP = 6;

// states[i] : 'correct' | 'wrong' | 'answered' | 'skipped' | undefined
function Dot({ state, isCurrent, isUpcoming }) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isCurrent) {
      pulse.setValue(1);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.35, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
      pulse.setValue(1);
    };
  }, [isCurrent, pulse]);

  let bg;
  let size = 10;
  if (isCurrent) {
    bg = colors.white;
    size = 12;
  } else if (isUpcoming) {
    bg = 'rgba(255,255,255,0.2)';
  } else {
    bg =
      state === 'correct'
        ? colors.green300
        : state === 'wrong'
          ? colors.red400
          : colors.gold500; // répondu (mixte) / passé / autre
  }

  return (
    <Animated.View
      style={[
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
        isCurrent && { transform: [{ scale: pulse }] },
      ]}
    />
  );
}

export default function ProgressDots({ total, current, states = [] }) {
  const dots = Array.from({ length: total }).map((_, i) => (
    <Dot key={i} state={states[i]} isCurrent={i === current} isUpcoming={i > current} />
  ));

  // Marathon (> 15) : rangée unique défilante pour ne pas casser la mise en page.
  if (total > SCROLL_THRESHOLD) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollRow}
      >
        {dots}
      </ScrollView>
    );
  }
  return <View style={styles.row}>{dots}</View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: GAP, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' },
  scrollRow: { flexDirection: 'row', gap: GAP, alignItems: 'center', paddingHorizontal: spacing.sm },
});
