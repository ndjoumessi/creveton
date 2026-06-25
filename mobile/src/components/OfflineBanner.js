// Bannière « hors connexion » — overlay discret en haut de l'écran. Apparaît en
// glissant (slide-down 300ms) quand le réseau tombe, disparaît (slide-up) au
// retour. Tap pour masquer manuellement (réapparaît à la prochaine coupure).
// Charte : fond or (gold500), texte vert profond (green900), 📶.

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNetworkStore } from '../store/networkStore';
import { colors, fonts } from '../constants/theme';

const BAR_HEIGHT = 32;

export default function OfflineBanner() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const isOnline = useNetworkStore((s) => s.isOnline);
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false); // garde la vue montée le temps du slide-up
  const total = BAR_HEIGHT + insets.top;
  const slide = useRef(new Animated.Value(-total)).current; // caché par défaut

  const visible = !isOnline && !dismissed;

  // Réinitialise le « dismiss » dès qu'on repasse en ligne (réapparaîtra à la
  // prochaine coupure).
  useEffect(() => {
    if (isOnline) setDismissed(false);
  }, [isOnline]);

  useEffect(() => {
    if (visible) setMounted(true);
    Animated.timing(slide, {
      toValue: visible ? 0 : -total,
      duration: 300,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
  }, [visible, slide, total]);

  if (!mounted && !visible) return null;

  return (
    <Animated.View
      style={[styles.wrap, { height: total, paddingTop: insets.top, transform: [{ translateY: slide }] }]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <Pressable style={styles.inner} onPress={() => setDismissed(true)} hitSlop={6}>
        <Text style={styles.text} numberOfLines={1}>📶 {t('offline.banner')}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    backgroundColor: colors.gold500,
  },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  text: { fontFamily: fonts.titleBold, fontSize: 13, color: colors.green900 },
});
