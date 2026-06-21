// SplashScreen — ouverture « Cockpit Émeraude ».
// Logo or animé, wordmark CREVETON, slogan, barre de progression dorée.
// Bascule vers Login après ~2 s (les utilisateurs connectés ne montent jamais cet écran).

import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Easing, StatusBar, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts, fontSizes, radius, spacing } from '../constants/theme';

export default function SplashScreen({ navigation }) {
  const logoScale = useRef(new Animated.Value(0.5)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const wordmarkY = useRef(new Animated.Value(20)).current;
  const wordmarkOpacity = useRef(new Animated.Value(0)).current;
  const sloganOpacity = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.parallel([
      Animated.timing(logoScale, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.back(1.4)),
        useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(wordmarkY, {
        toValue: 0,
        duration: 300,
        delay: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(wordmarkOpacity, {
        toValue: 1,
        duration: 300,
        delay: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(sloganOpacity, {
        toValue: 1,
        duration: 400,
        delay: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(progress, {
        toValue: 1,
        duration: 1800,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false,
      }),
    ]);
    animation.start();

    const timer = setTimeout(() => navigation.replace('Login'), 2000);

    return () => {
      clearTimeout(timer);
      animation.stop();
    };
  }, [
    logoScale,
    logoOpacity,
    wordmarkY,
    wordmarkOpacity,
    sloganOpacity,
    progress,
    navigation,
  ]);

  const fillWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" />

      <View style={styles.center}>
        <Animated.View
          style={[
            styles.logo,
            { opacity: logoOpacity, transform: [{ scale: logoScale }] },
          ]}
        >
          <Text style={styles.logoLetter}>C</Text>
        </Animated.View>

        <Animated.Text
          style={[
            styles.wordmark,
            { opacity: wordmarkOpacity, transform: [{ translateY: wordmarkY }] },
          ]}
        >
          CREVETON
        </Animated.Text>

        <Animated.Text style={[styles.slogan, { opacity: sloganOpacity }]}>
          Quiz. Compétition. Cameroun.
        </Animated.Text>
      </View>

      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, { width: fillWidth }]} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.green900,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 96,
    height: 96,
    borderRadius: radius.xxl,
    backgroundColor: colors.gold500,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  logoLetter: {
    fontFamily: fonts.titleBlack,
    fontSize: 56,
    lineHeight: 64,
    color: colors.green900,
  },
  wordmark: {
    fontFamily: fonts.titleBlack,
    fontSize: 32,
    letterSpacing: 2,
    color: colors.cream,
    marginBottom: spacing.md,
  },
  slogan: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.md,
    color: colors.textOnDarkMuted,
  },
  progressTrack: {
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    marginHorizontal: spacing.xxl,
    marginBottom: spacing.xxl,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.gold500,
  },
});
