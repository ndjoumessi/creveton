// Bannière « hors connexion » — overlay discret en haut de l'écran. Apparaît en
// glissant (slide-down 300ms) quand le réseau tombe, disparaît (slide-up) au
// retour. Tap pour masquer manuellement (réapparaît à la prochaine coupure).
// Charte : fond or (gold500), texte vert profond (green900), 📶.

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { WifiOff } from 'lucide-react-native';
import { useNetworkStore } from '../store/networkStore';
import { useGameStore } from '../store/gameStore';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { colors, fonts } from '../constants/theme';
import Icon from './Icon';

const BAR_HEIGHT = 32;

export default function OfflineBanner() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const isOnline = useNetworkStore((s) => s.isOnline);
  const isInternetReachable = useNetworkStore((s) => s.isInternetReachable);
  const isQuizActive = useGameStore((s) => s.isQuizActive);
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false); // garde la vue montée le temps du slide-up
  const total = BAR_HEIGHT + insets.top;
  const slide = useRef(new Animated.Value(-total)).current; // caché par défaut

  // Hors-ligne « effectif » : déconnecté OU connecté sans Internet joignable
  // (portail captif). `null` = inconnu → joignable (pas de faux hors-ligne).
  const offline = !isOnline || isInternetReachable === false;
  // Masquée pendant une partie active (QuizScreen) — l'immersion ne doit pas
  // être interrompue ; la logique offline queue reste active en arrière-plan.
  const visible = offline && !dismissed && !isQuizActive;

  // Réinitialise le « dismiss » dès qu'on repasse en ligne (réapparaîtra à la
  // prochaine coupure).
  useEffect(() => {
    if (!offline) setDismissed(false);
  }, [offline]);

  useEffect(() => {
    if (visible) setMounted(true);
    Animated.timing(slide, {
      toValue: visible ? 0 : -total,
      duration: reduceMotion ? 0 : 300, // a11y : pas de glissement si « réduire les animations »
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
  }, [visible, slide, total, reduceMotion]);

  if (!mounted && !visible) return null;

  return (
    <Animated.View
      style={[styles.wrap, { height: total, paddingTop: insets.top, transform: [{ translateY: slide }] }]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <Pressable style={styles.inner} onPress={() => setDismissed(true)} hitSlop={6}>
        <Icon icon={WifiOff} size={15} color={colors.green900} />
        <Text style={styles.text} numberOfLines={1}>{t('offline.banner')}</Text>
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
  inner: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  text: { fontFamily: fonts.titleBold, fontSize: 13, color: colors.green900 },
});
