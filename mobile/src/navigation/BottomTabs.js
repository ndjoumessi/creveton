// Onglets principaux — Accueil | Jouer | Tournois | Stats | Profil.
// Fond blanc, ombre haute douce. Onglet actif : icône + label or, point or
// sous l'icône. Inactif : gris (#9ca3af). Hauteur 80 + safe area bas.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Text, View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import HomeScreen from '../screens/HomeScreen';
import GameStartScreen from '../screens/GameStartScreen';
import TournamentScreen from '../screens/TournamentScreen';
import ChallengesScreen from '../screens/ChallengesScreen';
import StatsScreen from '../screens/StatsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import { tournaments as tournamentsApi } from '../services/endpoints';
import { fonts, fontSizes, shadow, spacing } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';

const Tab = createBottomTabNavigator();

const ICONS = { Home: '🏠', Play: '▶', Tournaments: '🏆', Challenges: '⚔️', Stats: '📊', Profile: '👤' };
const LABEL_KEYS = {
  Home: 'tabs.home',
  Play: 'tabs.play',
  Tournaments: 'tabs.tournaments',
  Challenges: 'tabs.challenges',
  Stats: 'tabs.stats',
  Profile: 'tabs.profile',
};

function TabItem({ routeName, focused }) {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const lift = useRef(new Animated.Value(focused ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(lift, {
      toValue: focused ? 1 : 0,
      useNativeDriver: true,
      speed: 20,
      bounciness: 8,
    }).start();
  }, [focused, lift]);

  const translateY = lift.interpolate({ inputRange: [0, 1], outputRange: [0, -2] });
  // Inactif : en clair on garde textFaint (#9ca3af, lisible sur barre blanche, inchangé) ;
  // en sombre on monte à textMuted (#9dbfaa), plus lisible sur la barre sombre (#162a1e).
  const color = focused ? colors.gold500 : isDark ? colors.textMuted : colors.textFaint;

  return (
    <View style={styles.item}>
      <Animated.Text
        style={[styles.icon, { color, transform: [{ translateY }] }]}
      >
        {ICONS[routeName]}
      </Animated.Text>
      <Text style={[styles.label, { color }]}>{t(LABEL_KEYS[routeName])}</Text>
      <View style={[styles.dot, focused && styles.dotActive]} />
    </View>
  );
}

export default function BottomTabs() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // Badge rouge sur « Tournois » s'il existe un tournoi ouvert/en cours.
  const [activeTournaments, setActiveTournaments] = useState(0);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const resp = await tournamentsApi.list({ status: 'open' });
        if (alive) setActiveTournaments((resp.data || []).length);
      } catch {
        /* silencieux : pas de badge */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: [
          styles.tabBar,
          { height: 64 + insets.bottom, paddingBottom: insets.bottom },
        ],
        tabBarItemStyle: styles.tabItem,
        tabBarIcon: ({ focused }) => (
          <TabItem routeName={route.name} focused={focused} />
        ),
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Play" component={GameStartScreen} />
      <Tab.Screen
        name="Tournaments"
        component={TournamentScreen}
        options={{
          tabBarBadge: activeTournaments > 0 ? activeTournaments : undefined,
          tabBarBadgeStyle: styles.badge,
        }}
      />
      <Tab.Screen name="Challenges" component={ChallengesScreen} />
      <Tab.Screen name="Stats" component={StatsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  tabBar: {
    backgroundColor: colors.white,
    borderTopWidth: 0,
    paddingTop: spacing.sm,
    ...shadow.tabBar,
  },
  tabItem: { paddingTop: spacing.xs },
  item: { alignItems: 'center', justifyContent: 'center', width: 64, gap: 2 },
  icon: { fontSize: 20 },
  label: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.xs },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'transparent', marginTop: 1 },
  dotActive: { backgroundColor: colors.gold500 },
  badge: {
    backgroundColor: colors.red400,
    color: '#ffffff', // texte sur pastille rouge → blanc stable (jamais flippé en sombre)
    fontFamily: fonts.bodyBold,
    fontSize: 10,
  },
});
