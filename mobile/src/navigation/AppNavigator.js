// Navigateur racine : choisit AuthStack ou MainStack selon l'état d'auth.

import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import AuthStack from './AuthStack';
import MainStack from './MainStack';
import { Loader } from '../components';
import { useAuthStore } from '../store/authStore';
import { colors } from '../constants/theme';

// Thème de navigation aligné sur la charte (fond crème).
const navTheme = {
  dark: false,
  colors: {
    primary: colors.gold500,
    background: colors.cream,
    card: colors.green900,
    text: colors.textDark,
    border: colors.border,
    notification: colors.red400,
  },
};

export default function AppNavigator() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isBootstrapping = useAuthStore((s) => s.isBootstrapping);
  const bootstrap = useAuthStore((s) => s.bootstrap);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  if (isBootstrapping) {
    return <Loader dark message="Chargement…" />;
  }

  return (
    <NavigationContainer theme={navTheme}>
      {isAuthenticated ? <MainStack /> : <AuthStack />}
    </NavigationContainer>
  );
}
