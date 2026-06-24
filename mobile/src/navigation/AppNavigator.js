// Navigateur racine : choisit AuthStack ou MainStack selon l'état d'auth.

import React, { useEffect } from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import AuthStack from './AuthStack';
import MainStack from './MainStack';
import { navigationRef } from './navigationRef';
import { LoadingScreen } from '../components';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import { colors, darkColors } from '../constants/theme';

// Thème de navigation aligné sur la charte, réactif au mode sombre.
// IMPORTANT : on part de DefaultTheme pour hériter de sa clé `fonts`
// (regular/medium/bold/heavy). React Navigation v7 et les en-têtes
// native-stack lisent `theme.fonts.regular` ; un thème sans `fonts`
// provoque « Cannot read property 'regular' of undefined ».
function buildNavTheme(isDark) {
  const c = isDark ? darkColors : colors;
  return {
    ...DefaultTheme,
    dark: isDark,
    colors: {
      ...DefaultTheme.colors,
      primary: colors.gold500,
      background: isDark ? darkColors.background : colors.cream,
      card: isDark ? darkColors.backgroundSecondary : colors.green900,
      text: c.textDark,
      border: c.border,
      notification: colors.red400,
    },
  };
}

export default function AppNavigator() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isBootstrapping = useAuthStore((s) => s.isBootstrapping);
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const isDark = useThemeStore((s) => s.isDark);
  const navTheme = buildNavTheme(isDark);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  if (isBootstrapping) {
    return <LoadingScreen message="Chargement…" />;
  }

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      {isAuthenticated ? <MainStack /> : <AuthStack />}
    </NavigationContainer>
  );
}
