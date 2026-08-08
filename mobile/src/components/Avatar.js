// Avatar — initiales sur pastille. Couleur dérivée d'un hash du nom (verts de
// marque + accents thème) ; variante « gold » pour l'utilisateur courant
// (identité forte). Theme-aware : seul le fond d'attente de la photo suit le
// thème ; la pastille d'initiales est théma-invariante (couleurs de marque
// fixes → le texte reste crème dans les deux thèmes, d'où `lightColors`).

import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { fonts, lightColors, themeAccent } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';

// Mêmes accents que les cartes thème (themeAccent geographie/culture/science/
// histoire) — l'ordre est figé : il détermine le hash → la couleur par joueur.
const PALETTE = [
  lightColors.green500,
  lightColors.green700,
  themeAccent.geographie,
  themeAccent.culture,
  themeAccent.science,
  themeAccent.histoire,
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

// `glyph` : pastille neutre portant un caractère (emoji ou « ? ») au lieu des
// initiales, pour les identités qui n'en ont pas. Sans lui, un adversaire encore
// inconnu affichait les initiales de son LIBELLÉ : « 🎲 Adversaire aléatoire »
// devenait la pastille « 🎲A ». Fond gris volontaire — la couleur hachée sert à
// distinguer des personnes, pas des emplacements vides.
export default function Avatar({ name = '', size = 48, gold = false, uri = null, glyph = null, style }) {
  const { colors } = useTheme();
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

  if (glyph) {
    return (
      <View
        style={[
          styles.avatar,
          dims,
          { backgroundColor: colors.surfaceCream, borderWidth: 1, borderColor: colors.border },
          style,
        ]}
      >
        <Text style={{ fontSize: size * 0.42 }}>{glyph}</Text>
      </View>
    );
  }

  const bg = gold ? lightColors.gold400 : hashColor(name);
  const fg = gold ? lightColors.green900 : lightColors.cream;
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
