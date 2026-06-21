// Onglets principaux — Accueil | Jouer | Tournois | Stats | Profil.
// Fond blanc, ombre haute douce. Onglet actif : icône + label or, point or
// sous l'icône. Inactif : gris (#9ca3af). Hauteur 80 + safe area bas.

import React, { useEffect, useRef } from 'react';
import { Animated, Text, View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import HomeScreen from '../screens/HomeScreen';
import GameStartScreen from '../screens/GameStartScreen';
import TournamentScreen from '../screens/TournamentScreen';
import StatsScreen from '../screens/StatsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import { colors, fonts, fontSizes, shadow, spacing } from '../constants/theme';

const Tab = createBottomTabNavigator();

const ICONS = { Home: '🏠', Play: '▶', Tournaments: '🏆', Stats: '📊', Profile: '👤' };
const LABELS = {
  Home: 'Accueil',
  Play: 'Jouer',
  Tournaments: 'Tournois',
  Stats: 'Stats',
  Profile: 'Profil',
};

function TabItem({ routeName, focused }) {
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
  const color = focused ? colors.gold500 : colors.textFaint;

  return (
    <View style={styles.item}>
      <Animated.Text
        style={[styles.icon, { color, transform: [{ translateY }] }]}
      >
        {ICONS[routeName]}
      </Animated.Text>
      <Text style={[styles.label, { color }]}>{LABELS[routeName]}</Text>
      <View style={[styles.dot, focused && styles.dotActive]} />
    </View>
  );
}

export default function BottomTabs() {
  const insets = useSafeAreaInsets();
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
      <Tab.Screen name="Tournaments" component={TournamentScreen} />
      <Tab.Screen name="Stats" component={StatsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
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
});
