// BottomSheet — feuille modale ancrée en bas, partagée (Défis « Nouveau
// challenge », Profil « Photo de profil »…). Remplace les Modal/backdrop/handle
// faits main des écrans, à rendu identique :
//   - handle pill centré + coins supérieurs radius.xl,
//   - backdrop semi-transparent (colors.overlay) → tap = onClose,
//   - safe-area bas (insets) + KeyboardAvoidingView (padding iOS / height
//     Android, convention formulaires) pour les feuilles avec inputs,
//   - slide-up ≤ motion.enter (300 ms) ease-out, sortie motion.base ; rendu
//     instantané (durée 0) si « Réduire les animations » est actif.
//
// Props :
//   visible   : bool — ouvre/ferme la feuille (la fermeture attend l'animation)
//   onClose   : () => void — tap backdrop, bouton retour Android
//   title?    : string — titre (Outfit bold 20) sous le handle
//   children  : contenu de la feuille (non stylé par le composant, gap xs)
//   snapPoint : 'auto' (défaut, hauteur du contenu) | number (hauteur fixe)
//   style     : override du conteneur (ex. fond blanc, gap différent)

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, radius, spacing, motion } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { useReduceMotion } from '../hooks/useReduceMotion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function BottomSheet({
  visible,
  onClose,
  title,
  children,
  snapPoint = 'auto',
  style,
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const { height: windowHeight } = useWindowDimensions();

  // Le Modal reste monté le temps de l'animation de sortie.
  const [mounted, setMounted] = useState(visible);
  const anim = useRef(new Animated.Value(0)).current; // 0 = fermé, 1 = ouvert

  const animateTo = useCallback(
    (toValue, duration, done) => {
      if (reduceMotion) {
        anim.setValue(toValue);
        done?.();
        return;
      }
      Animated.timing(anim, {
        toValue,
        duration,
        easing: Easing.out(Easing.cubic), // ease-out (charte motion)
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) done?.();
      });
    },
    [anim, reduceMotion],
  );

  useEffect(() => {
    if (visible) {
      setMounted(true);
      animateTo(1, motion.enter);
    } else {
      animateTo(0, motion.base, () => setMounted(false));
    }
  }, [visible, animateTo]);

  if (!mounted) return null;

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [windowHeight, 0] });

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <AnimatedPressable
          style={[styles.backdrop, { opacity: anim }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={title}
        />
        <Animated.View
          style={[
            styles.sheet,
            typeof snapPoint === 'number' ? { height: snapPoint } : null,
            { paddingBottom: spacing.xxl + insets.bottom },
            style,
            { transform: [{ translateY }] },
          ]}
        >
          <View style={styles.handle} />
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surfaceCream,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: fonts.titleBold,
    fontSize: 20,
    color: colors.textDark,
    marginBottom: spacing.xs,
  },
});
