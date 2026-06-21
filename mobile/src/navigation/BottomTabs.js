// Onglets principaux : Accueil | Jouer | Tournois | Stats | Profil.
// Actif surligné en gold400, safe area iOS gérée par le tabBarStyle.

import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import HomeScreen from '../screens/HomeScreen';
import GameStartScreen from '../screens/GameStartScreen';
import TournamentScreen from '../screens/TournamentScreen';
import StatsScreen from '../screens/StatsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import { colors, fonts, fontSizes } from '../constants/theme';

const Tab = createBottomTabNavigator();

// Icônes emoji (pas de dépendance vectorielle requise).
const ICONS = {
  Home: '🏠',
  Play: '🎮',
  Tournaments: '🏆',
  Stats: '📊',
  Profile: '👤',
};

const LABELS = {
  Home: 'Accueil',
  Play: 'Jouer',
  Tournaments: 'Tournois',
  Stats: 'Stats',
  Profile: 'Profil',
};

function TabIcon({ name, focused }) {
  return (
    <Text style={[styles.icon, focused && styles.iconActive]}>
      {ICONS[name]}
    </Text>
  );
}

export default function BottomTabs() {
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.gold400,
        tabBarInactiveTintColor: colors.textOnDarkMuted,
        tabBarStyle: [
          styles.tabBar,
          { height: 60 + insets.bottom, paddingBottom: insets.bottom + 6 },
        ],
        tabBarLabelStyle: styles.label,
        tabBarItemStyle: styles.item,
        tabBarIcon: ({ focused }) => (
          <TabIcon name={route.name} focused={focused} />
        ),
        tabBarLabel: LABELS[route.name],
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
    backgroundColor: colors.green900,
    borderTopWidth: 1,
    borderTopColor: colors.borderOnDark,
    paddingTop: 6,
  },
  item: { paddingTop: 4 },
  icon: { fontSize: 22, opacity: 0.6 },
  iconActive: { opacity: 1, transform: [{ scale: 1.1 }] },
  label: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.xs,
  },
});
