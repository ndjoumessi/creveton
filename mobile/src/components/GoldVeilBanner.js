// GoldVeilBanner — conteneur « voile d'or » partagé (fond goldVeil, bordure
// goldVeilBorder, coins arrondis, contenu centré). Présentation pure : aucune
// logique d'animation ici — l'appelant enveloppe le composant dans un
// `Animated.View` pour les entrées (record : slide/opacity, palier : scale).
//
// Props :
//   - children  : contenu du bandeau.
//   - style     : surcharge par bandeau (padding, marges, flexDirection, radius pill vs xl…).
//   - radius    : rayon des coins (défaut radius.xl).

import React from 'react';
import { View } from 'react-native';
import { radius as radiusTokens } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';

export default function GoldVeilBanner({ children, style, radius }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.goldVeil,
          borderWidth: 1,
          borderColor: colors.goldVeilBorder,
          borderRadius: radius ?? radiusTokens.xl,
          alignItems: 'center',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
