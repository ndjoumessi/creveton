// Points de progression du quiz : correct (vert) / faux (rouge) / répondu sans
// verdict (crème, modes chronométrés) / passée (anneau vide), question courante
// (blanc, pulse), à venir (blanc estompé). Défile à l'horizontale au-delà de 15
// questions (marathon = 20).
//
// « Répondu » et « passée » étaient tous deux EN OR. Deux problèmes : l'or est la
// couleur de récompense de la charte (CTA, nav active, trophées, ≤ 10 % de
// l'écran) — une question SAUTÉE s'affichait donc dans la même couleur qu'un gain,
// et brillait plus que les bonnes réponses en vert juste à côté. Et les deux états
// n'ont pas le même sens : en blitz on a répondu mais le verdict est serveur-only,
// alors qu'une question passée est un trou. Un point plein neutre pour l'un, un
// anneau vide pour l'autre.

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

  let size = 10;
  // Anneau vide = « passée » : un trou dans la partie, pas un résultat.
  let skin = { backgroundColor: colors.trackOnDark };
  if (isCurrent) {
    size = 12;
    skin = { backgroundColor: colors.white };
  } else if (isUpcoming) {
    skin = { backgroundColor: colors.trackOnDark };
  } else if (state === 'correct') {
    skin = { backgroundColor: colors.green300 };
  } else if (state === 'wrong') {
    skin = { backgroundColor: colors.red400 };
  } else if (state === 'skipped') {
    skin = {
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: colors.textOnDarkFaint,
    };
  } else if (state === 'answered') {
    // Blitz/marathon : répondu, verdict serveur-only. Neutre plein — distinct
    // d'un trou (anneau) comme d'un verdict (vert/rouge).
    skin = { backgroundColor: colors.textOnDarkMuted };
  }

  return (
    <Animated.View
      style={[
        { width: size, height: size, borderRadius: size / 2 },
        skin,
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
