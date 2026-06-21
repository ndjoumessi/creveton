// Toast — position haute, slide-down + fade, auto-dismiss. Fourni via contexte :
//   const toast = useToast(); toast.show({ type: 'success', message: '…' });
// Monter <ToastProvider> à la racine (App.js).

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from 'react';
import { Animated, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, fontSizes, radius, spacing, shadow, zIndex } from '../constants/theme';

const ToastContext = createContext({ show: () => {} });
export const useToast = () => useContext(ToastContext);

const TYPES = {
  success: { bg: colors.green700, icon: '✓', accent: colors.green300 },
  error: { bg: colors.red600, icon: '✕', accent: '#ffd2cd' },
  info: { bg: colors.green900, icon: 'ℹ', accent: colors.gold400 },
};

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef(null);

  const hide = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: -120, duration: 220, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => setToast(null));
  }, [translateY, opacity]);

  const show = useCallback(
    ({ type = 'info', message, duration = 2800 }) => {
      clearTimeout(timer.current);
      setToast({ type, message });
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, speed: 14, bounciness: 6 }),
        Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
      timer.current = setTimeout(hide, duration);
    },
    [translateY, opacity, hide]
  );

  useEffect(() => () => clearTimeout(timer.current), []);

  const cfg = toast ? TYPES[toast.type] || TYPES.info : null;

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast ? (
        <Animated.View
          style={[
            styles.wrap,
            { top: insets.top + spacing.sm, opacity, transform: [{ translateY }] },
          ]}
          pointerEvents="box-none"
        >
          <Pressable onPress={hide} style={[styles.toast, { backgroundColor: cfg.bg }]}>
            <Text style={[styles.icon, { color: cfg.accent }]}>{cfg.icon}</Text>
            <Text style={styles.message} numberOfLines={2}>
              {toast.message}
            </Text>
          </Pressable>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    zIndex: zIndex.toast,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.base,
    width: '100%',
    ...shadow.floating,
  },
  icon: { fontFamily: fonts.bodyBold, fontSize: fontSizes.base },
  message: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.md,
    color: colors.cream,
  },
});

export default ToastProvider;
