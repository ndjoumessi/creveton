// SplashScreen — ouverture « Cockpit Émeraude ».
// Fond green900, logo centré, nom + slogan, puis bascule vers Login après ~2 s.

import React, { useEffect, useRef } from 'react';
import {
  View, Text, Image, Animated, Easing, StatusBar, StyleSheet,
  Dimensions, AccessibilityInfo,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { colors, fonts, fontSizes } from '../constants/theme';

// Taille adaptative : 42 % de la largeur écran, plafonnée à 180 px (grille 8px).
const { width: screenWidth } = Dimensions.get('window');
const logoSize = Math.min(Math.round(screenWidth * 0.42), 180);

export default function SplashScreen({ navigation, onFinish }) {
  const { t } = useTranslation();
  const logoScale      = useRef(new Animated.Value(0.8)).current;
  const logoOpacity    = useRef(new Animated.Value(0)).current;
  const logoTranslateY = useRef(new Animated.Value(10)).current;
  const titleOpacity   = useRef(new Animated.Value(0)).current;
  const sloganOpacity  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let anim;
    let active = true;

    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (!active) return;
      if (reduced) {
        // Respect prefers-reduced-motion : valeurs finales sans transition.
        logoOpacity.setValue(1);
        logoScale.setValue(1);
        logoTranslateY.setValue(0);
        titleOpacity.setValue(1);
        sloganOpacity.setValue(1);
      } else {
        anim = Animated.parallel([
          // Logo : fade + scale 0.8→1 + translateY 10→0, 700ms ease-out
          Animated.parallel([
            Animated.timing(logoScale,      { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            Animated.timing(logoOpacity,    { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            Animated.timing(logoTranslateY, { toValue: 0, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          ]),
          // Titre : fade delay 300ms, 450ms
          Animated.sequence([
            Animated.delay(300),
            Animated.timing(titleOpacity, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          ]),
          // Slogan : fade delay 450ms, 400ms
          Animated.sequence([
            Animated.delay(450),
            Animated.timing(sloganOpacity, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          ]),
        ]);
        anim.start();
      }
    });

    const timer = setTimeout(() => {
      if (navigation) navigation.replace('Login');
      if (onFinish) onFinish();
    }, 2000);

    return () => {
      active = false;
      clearTimeout(timer);
      if (anim) anim.stop();
    };
  }, [logoScale, logoOpacity, logoTranslateY, titleOpacity, sloganOpacity, navigation, onFinish]);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.green900} />
      <View style={styles.center}>
        <Animated.View style={{
          opacity: logoOpacity,
          transform: [{ scale: logoScale }, { translateY: logoTranslateY }],
        }}>
          <Image
            source={require('../../assets/splash-icon.png')}
            style={{ width: logoSize, height: logoSize, resizeMode: 'contain' }}
            accessibilityLabel="Creveton"
          />
        </Animated.View>
        <View style={styles.textBlock}>
          <Animated.Text style={[styles.name, { opacity: titleOpacity }]}>
            Creveton
          </Animated.Text>
          <Animated.Text style={[styles.slogan, { opacity: sloganOpacity }]}>
            {t('splash.slogan')}
          </Animated.Text>
        </View>
      </View>
      <Text style={styles.footer}>{t('splash.tagline')}</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.green900 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 48,
  },
  textBlock: { alignItems: 'center', marginTop: 32 },
  name: {
    fontFamily: fonts.bodyBold,
    fontSize: 32,
    letterSpacing: 0.3,
    color: '#ffffff',
  },
  slogan: {
    fontFamily: fonts.titleRegular,
    fontSize: fontSizes.base,
    lineHeight: 22,
    color: colors.gold500,
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
    fontFamily: fonts.titleRegular,
    fontSize: fontSizes.xs,
    color: 'rgba(255,255,255,0.38)',
  },
});
