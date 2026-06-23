// Avatar — initiales sur pastille. Couleur dérivée d'un hash du nom (palette
// verte) ; variante « gold » pour l'utilisateur courant (identité forte).

import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { colors, fonts } from '../constants/theme';

const PALETTE = [
  colors.green500,
  colors.green700,
  '#2d5a8e',
  '#5b2d8e',
  '#0f7b75',
  '#8b4513',
];

function initialsOf(name = '') {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  );
}

function hashColor(name = '') {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export default function Avatar({ name = '', size = 48, gold = false, uri = null, style }) {
  const dims = { width: size, height: size, borderRadius: size / 2 };

  // Si le chargement de la photo échoue (URL cassée, 404, hors-ligne), on
  // bascule sur les initiales. Réinitialisé quand `uri` change (nouvel upload).
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [uri]);

  // Photo de profil si disponible (et chargeable), sinon pastille d'initiales.
  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        onError={() => setFailed(true)}
        style={[styles.avatar, dims, { backgroundColor: colors.cardOnDark }, style]}
      />
    );
  }

  const bg = gold ? colors.gold400 : hashColor(name);
  const fg = gold ? colors.green900 : colors.cream;
  return (
    <View style={[styles.avatar, dims, { backgroundColor: bg }, style]}>
      <Text style={[styles.text, { color: fg, fontSize: size * 0.38 }]}>
        {initialsOf(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center' },
  text: { fontFamily: fonts.titleBold },
});
