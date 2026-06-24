// Logo Creveton — vrai logo de marque (cœur drapeau camerounais dans des mains),
// rendu depuis assets/logo.png. L'asset a un fond blanc (pas de transparence) :
// on l'enferme dans une pastille blanche ronde pour qu'il reste lisible sur les
// fonds sombres (green900). `size` pilote l'image ; `style` est fusionné au wrapper.

import React from 'react';
import { View, Image } from 'react-native';

export default function Logo({ size = 80, style }) {
  return (
    <View
      style={[
        {
          width: size + 8,
          height: size + 8,
          borderRadius: (size + 8) / 2,
          backgroundColor: '#ffffff',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <Image
        source={require('../../assets/logo.png')}
        style={{ width: size, height: size, resizeMode: 'contain' }}
        accessibilityLabel="Creveton"
      />
    </View>
  );
}
