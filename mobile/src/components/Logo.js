// Logo Creveton — carré arrondi or avec un « C » Outfit Black, sans aucune
// image/PNG ni drapeau. Rendu en pur View+Text (vectoriel à l'écran, net à
// toute taille). size pilote la largeur ; le « C » et le rayon s'adaptent.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts } from '../constants/theme';

export default function Logo({ size = 80, style }) {
  const r = Math.round(size * 0.2); // ~16px @ 80
  return (
    <View
      style={[
        styles.square,
        { width: size, height: size, borderRadius: r },
        style,
      ]}
    >
      <Text style={[styles.letter, { fontSize: size * 0.45, lineHeight: size }]}>
        C
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  square: {
    backgroundColor: colors.gold500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    fontFamily: fonts.titleBlack,
    color: colors.green900,
    textAlign: 'center',
    includeFontPadding: false,
  },
});
