// SplashScreen — ouverture « Cockpit Émeraude ».
// Dégradé émeraude vertical (respiration lumineuse au centre), halo doré doux
// derrière le logo cœur-drapeau, cascade logo → nom → slogan, puis bascule vers
// Login après ~2 s.
//
// NOTE thème : cet écran est volontairement FIGÉ sombre (comme CircularTimer,
// LoadingScreen, Toast — cf. mobile/CLAUDE.md « Thème & tokens »). Il garde donc
// l'import statique des tokens au lieu du pattern useTheme + makeStyles.

import React, { useEffect, useRef } from 'react';
import {
  View, Image, Animated, Easing, StatusBar, StyleSheet, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  colors, fonts, fontSizes, motion, shadow, emeraldGradient,
} from '../constants/theme';
import { useReduceMotion } from '../hooks/useReduceMotion';

// Taille adaptative : 42 % de la largeur écran, plafonnée à 180 px (grille 8px).
const { width: screenWidth } = Dimensions.get('window');
const logoSize = Math.min(Math.round(screenWidth * 0.42), 180);
// Le PNG du logo a ~30 % de marge transparente : les halos sont calibrés sur le
// contenu visible (cœur ≈ 0.7 × logoSize), en deux cercles concentriques.
const haloInnerSize = Math.round(logoSize * 1.16);
const haloOuterSize = Math.round(logoSize * 1.5);

export default function SplashScreen({ navigation, onFinish }) {
  const { t } = useTranslation();
  const reduceMotion = useReduceMotion();

  const logoScale      = useRef(new Animated.Value(0.92)).current;
  const logoOpacity    = useRef(new Animated.Value(0)).current;
  const logoTranslateY = useRef(new Animated.Value(12)).current;
  const titleOpacity   = useRef(new Animated.Value(0)).current;
  const titleTranslateY = useRef(new Animated.Value(8)).current;
  const sloganOpacity  = useRef(new Animated.Value(0)).current;

  // Cascade d'entrée — durées 100 % tokens `motion`, ease-out cubic (cohérent app).
  useEffect(() => {
    if (reduceMotion) {
      // Respect prefers-reduced-motion : état final direct, sans transition.
      logoOpacity.setValue(1);
      logoScale.setValue(1);
      logoTranslateY.setValue(0);
      titleOpacity.setValue(1);
      titleTranslateY.setValue(0);
      sloganOpacity.setValue(1);
      return undefined;
    }

    const easeOut = Easing.out(Easing.cubic);
    const anim = Animated.parallel([
      // 1. Logo + halo : fade + scale 0.92→1 + translateY 12→0 (0 → 300 ms)
      Animated.parallel([
        Animated.timing(logoScale,      { toValue: 1, duration: motion.enter, easing: easeOut, useNativeDriver: true }),
        Animated.timing(logoOpacity,    { toValue: 1, duration: motion.enter, easing: easeOut, useNativeDriver: true }),
        Animated.timing(logoTranslateY, { toValue: 0, duration: motion.enter, easing: easeOut, useNativeDriver: true }),
      ]),
      // 2. Nom : fade + léger lift (220 → 520 ms)
      Animated.sequence([
        Animated.delay(motion.base),
        Animated.parallel([
          Animated.timing(titleOpacity,    { toValue: 1, duration: motion.enter, easing: easeOut, useNativeDriver: true }),
          Animated.timing(titleTranslateY, { toValue: 0, duration: motion.enter, easing: easeOut, useNativeDriver: true }),
        ]),
      ]),
      // 3. Slogan + signature : fade (340 → 640 ms)
      Animated.sequence([
        Animated.delay(motion.base + motion.fast),
        Animated.timing(sloganOpacity, { toValue: 1, duration: motion.enter, easing: easeOut, useNativeDriver: true }),
      ]),
    ]);
    anim.start();
    return () => anim.stop();
  }, [reduceMotion, logoScale, logoOpacity, logoTranslateY, titleOpacity, titleTranslateY, sloganOpacity]);

  // Bascule auto vers Login après ~2 s (logique de navigation inchangée).
  useEffect(() => {
    const timer = setTimeout(() => {
      if (navigation) navigation.replace('Login');
      if (onFinish) onFinish();
    }, 2000);
    return () => clearTimeout(timer);
  }, [navigation, onFinish]);

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[emeraldGradient[0], emeraldGradient[1], emeraldGradient[0]]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={colors.green900} />
        <View style={styles.center}>
          <Animated.View
            style={[
              styles.logoStage,
              {
                opacity: logoOpacity,
                transform: [{ scale: logoScale }, { translateY: logoTranslateY }],
              },
            ]}
          >
            <View style={[styles.halo, styles.haloOuter]} />
            <View style={[styles.halo, styles.haloInner, shadow.gold]} />
            <Image
              source={require('../../assets/splash-icon.png')}
              style={styles.logo}
              accessibilityLabel="Creveton"
            />
          </Animated.View>
          <View style={styles.textBlock}>
            <Animated.Text
              style={[
                styles.name,
                { opacity: titleOpacity, transform: [{ translateY: titleTranslateY }] },
              ]}
            >
              Creveton
            </Animated.Text>
            <Animated.Text style={[styles.slogan, { opacity: sloganOpacity }]}>
              {t('splash.slogan')}
            </Animated.Text>
          </View>
        </View>
        <Animated.Text style={[styles.footer, { opacity: sloganOpacity }]}>
          {t('splash.tagline')}
        </Animated.Text>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.green900 },
  safe: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 48,
  },
  // Scène du logo : les halos sont absolus et centrés derrière l'image.
  logoStage: {
    width: haloOuterSize,
    height: haloOuterSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    backgroundColor: colors.goldVeil,
  },
  haloOuter: {
    width: haloOuterSize,
    height: haloOuterSize,
    borderRadius: haloOuterSize / 2,
    opacity: 0.45,
  },
  haloInner: {
    width: haloInnerSize,
    height: haloInnerSize,
    borderRadius: haloInnerSize / 2,
  },
  logo: {
    width: logoSize,
    height: logoSize,
    resizeMode: 'contain',
  },
  textBlock: { alignItems: 'center', marginTop: 32 },
  // Nom de marque : Outfit ExtraBold — la voix « titre/score » de la charte.
  name: {
    fontFamily: fonts.titleExtraBold,
    fontSize: fontSizes.xxxl,
    letterSpacing: 0.5,
    color: colors.cream,
  },
  // Slogan : Space Grotesk (voix corps), crème atténué — l'or est réservé au halo.
  slogan: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.base,
    lineHeight: 22,
    color: colors.textOnDarkMuted,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 32,
  },
  footer: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,
    letterSpacing: 1,
    color: colors.textOnDarkFaint,
  },
});
