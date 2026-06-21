// SplashScreen — ouverture « Cockpit Émeraude ».
// Logo (carré or + C), wordmark, slogan, barre de progression dorée, puis
// bascule vers Login après ~2 s (les connectés vont directement sur Home via
// le navigateur racine).

import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing, StatusBar, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Logo } from '../components';
import { colors, fonts, fontSizes, radius, spacing } from '../constants/theme';

export default function SplashScreen({ navigation }) {
  const { t } = useTranslation();
  const logoScale = useRef(new Animated.Value(0)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const wordY = useRef(new Animated.Value(20)).current;
  const wordOpacity = useRef(new Animated.Value(0)).current;
  const sloganOpacity = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.sequence([
      // 0ms : logo scale 0→1 + fade (spring)
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, useNativeDriver: true, friction: 6, tension: 80 }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
      // 400ms : wordmark slide-up + fade
      Animated.parallel([
        Animated.timing(wordY, { toValue: 0, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(wordOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]),
      // 700ms : slogan fade
      Animated.timing(sloganOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      // 1000ms : barre or fill left→right (1000ms)
      Animated.timing(progress, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }),
    ]);
    anim.start();

    const timer = setTimeout(() => navigation.replace('Login'), 2000);
    return () => {
      clearTimeout(timer);
      anim.stop();
    };
  }, [logoScale, logoOpacity, wordY, wordOpacity, sloganOpacity, progress, navigation]);

  const fillWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" />
      <View style={styles.center}>
        <Animated.View style={{ opacity: logoOpacity, transform: [{ scale: logoScale }] }}>
          <Logo size={80} />
        </Animated.View>
        <Animated.Text
          style={[styles.word, { opacity: wordOpacity, transform: [{ translateY: wordY }] }]}
        >
          CREVETON
        </Animated.Text>
        <Animated.Text style={[styles.slogan, { opacity: sloganOpacity }]}>
          {t('splash.tagline')}
        </Animated.Text>
      </View>
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, { width: fillWidth }]} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.green900 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  word: {
    fontFamily: fonts.titleBlack,
    fontSize: 32,
    letterSpacing: 2,
    color: colors.cream,
    marginTop: spacing.xl,
  },
  slogan: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.md,
    color: colors.textOnDarkMuted,
    marginTop: spacing.md,
  },
  progressTrack: {
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginHorizontal: spacing.xxl,
    marginBottom: spacing.xxl,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.gold500 },
});
