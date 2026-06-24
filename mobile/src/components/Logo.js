// Logo Creveton — vrai logo de marque (cœur drapeau camerounais dans des mains),
// rendu depuis assets/logo.png. `size` pilote largeur/hauteur ; `style` est fusionné.

import React from 'react';
import { Image } from 'react-native';

export default function Logo({ size = 80, style }) {
  return (
    <Image
      source={require('../../assets/logo.png')}
      style={[{ width: size, height: size, resizeMode: 'contain' }, style]}
      accessibilityLabel="Creveton"
    />
  );
}
