// CircularTimer — minuteur circulaire SVG. Deux variantes :
//  · 'ring' (défaut) — arc par question piloté par `progress` (Animated 1 → 0) ;
//    couleur or → orange → rouge, chiffre centré même couleur, pulse < 5 s.
//  · 'watch' (opt-in, modes chronométrés) — anneau « montre » à couleur pleine
//    selon `mode` (blitz = rouge, marathon = or), M:SS au centre, libellé du mode
//    dessous, pulse < 10 s. L'anneau se vide en interne sur `totalMs` (le parent
//    ne pilote que le temps restant chiffré `leftMs`).

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { colors, fonts, spacing } from '../constants/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const GOLD = colors.gold500;
const ORANGE = '#f97316';
const RED = colors.red400;

// Variante 'watch' : trait et fond de piste distincts par mode.
const WATCH_STROKE = { blitz: 4, marathon: 3 };
const WATCH_TRACK = { blitz: 'rgba(255,255,255,0.08)', marathon: 'rgba(255,255,255,0.06)' };

export default function CircularTimer({
  size = 80,
  strokeWidth = 5,
  progress, // Animated.Value : 1 (plein) → 0 (écoulé) — variante 'ring'
  seconds, // valeur numérique affichée au centre — variante 'ring'
  variant = 'ring', // 'ring' (par question) | 'watch' (global chronométré)
  mode, // 'blitz' | 'marathon' — variante 'watch'
  leftMs, // temps restant (ms) → M:SS + urgence — variante 'watch'
  totalMs, // durée totale (ms) → vidage linéaire de l'anneau — variante 'watch'
  label, // libellé du mode affiché sous l'anneau — variante 'watch'
}) {
  const watch = variant === 'watch';

  // Trait mode-dépendant en 'watch', prop en 'ring'.
  const sw = watch ? WATCH_STROKE[mode] || 4 : strokeWidth;
  const r = (size - sw) / 2;
  const circumference = 2 * Math.PI * r;
  const scale = useRef(new Animated.Value(1)).current;
  const reduceMotion = useReduceMotion();

  // En 'watch', l'anneau se vide via une animation interne (le parent ne pilote
  // que le temps restant chiffré) ; en 'ring', `progress` vient du parent.
  const internalProgress = useRef(new Animated.Value(1)).current;
  const activeProgress = watch ? internalProgress : progress;

  useEffect(() => {
    if (!watch) return undefined;
    internalProgress.setValue(1);
    const anim = Animated.timing(internalProgress, {
      toValue: 0,
      duration: totalMs,
      easing: Easing.linear,
      useNativeDriver: false, // strokeDashoffset n'est pas pilotable en natif
    });
    anim.start();
    return () => anim.stop();
  }, [watch, internalProgress, totalMs]);

  // M:SS + urgence (variante 'watch').
  const secs = watch ? Math.max(0, Math.ceil(leftMs / 1000)) : seconds;
  const urgent = watch && secs <= 10;
  const clockLabel = watch
    ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
    : null;

  // strokeDashoffset : 0 = arc complet (progress 1), circ = vide (progress 0)
  const dashoffset = activeProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });
  // Couleur de l'arc : pleine par mode en 'watch' ; rouge → orange → or en 'ring'.
  const arcStroke = watch
    ? mode === 'blitz'
      ? RED
      : GOLD
    : activeProgress.interpolate({
        inputRange: [0, 0.2, 0.5, 1],
        outputRange: [RED, RED, ORANGE, GOLD],
      });
  const trackStroke = watch ? WATCH_TRACK[mode] || WATCH_TRACK.blitz : 'rgba(255,255,255,0.2)';

  // Pulsation 'ring' : sous 5 s. Redémarre à chaque seconde (dép. `seconds`).
  useEffect(() => {
    if (watch || reduceMotion) return undefined;
    if (seconds <= 5 && seconds > 0) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.08, duration: 400, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 400, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => {
        loop.stop();
        scale.setValue(1);
      };
    }
    return undefined;
  }, [watch, seconds, scale, reduceMotion]);

  // Pulsation 'watch' : sous 10 s (continue tant que urgent), coupée si reduce-motion.
  useEffect(() => {
    if (!watch) return undefined;
    if (!urgent || reduceMotion) {
      scale.setValue(1);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.08, duration: 400, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 400, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
      scale.setValue(1);
    };
  }, [watch, urgent, scale, reduceMotion]);

  // Noyau SVG partagé : cercle de fond + arc de progression (départ en haut).
  const ring = (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackStroke} strokeWidth={sw} fill="none" />
      <AnimatedCircle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={arcStroke}
        strokeWidth={sw}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={dashoffset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  );

  if (watch) {
    const labelColor = mode === 'blitz' ? colors.gold500 : colors.gold400;
    return (
      <Animated.View style={[styles.watchWrap, { transform: [{ scale }] }]}>
        <View style={[styles.watchCircle, { width: size, height: size }]}>
          {ring}
          <View style={styles.center} pointerEvents="none">
            <Text style={[styles.watchValue, urgent && styles.watchValueUrgent]}>{clockLabel}</Text>
          </View>
        </View>
        <Text style={[styles.watchLabel, { color: labelColor }]}>{label}</Text>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.wrap, { width: size, height: size, transform: [{ scale }] }]}>
      {ring}
      <View style={styles.center} pointerEvents="none">
        <Animated.Text style={[styles.value, { color: arcStroke }]}>{seconds}</Animated.Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  value: { fontFamily: fonts.titleBold, fontSize: 20 },
  watchWrap: { alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  watchCircle: { alignItems: 'center', justifyContent: 'center' },
  watchValue: { fontFamily: fonts.titleBlack, fontSize: 28, color: colors.white },
  watchValueUrgent: { color: colors.red400 },
  watchLabel: { fontFamily: fonts.titleBold, fontSize: 10 },
});
