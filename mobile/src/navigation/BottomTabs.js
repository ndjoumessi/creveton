// Onglets principaux — Accueil | Jouer | Tournois | Profil.
// Réduit de 6 à 4 le 2026-08-08 : « Défis » et « Stats » vivent désormais dans
// MainStack (voir le commentaire au-dessus de <Tab.Screen name="Profile">).
// Fond blanc, ombre haute douce. Onglet actif : icône + label or, point or
// sous l'icône. Inactif : gris (#9ca3af). Hauteur 80 + safe area bas.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Text, View, StyleSheet, useWindowDimensions } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import HomeScreen from '../screens/HomeScreen';
import GameStartScreen from '../screens/GameStartScreen';
import TournamentScreen from '../screens/TournamentScreen';
import ProfileScreen from '../screens/ProfileScreen';
import { Home, Gamepad2, Trophy, User } from 'lucide-react-native';
import { tournaments as tournamentsApi } from '../services/endpoints';
import { fonts, shadow, spacing, MIN_TOUCH } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import Icon from '../components/Icon';

const Tab = createBottomTabNavigator();

const ICONS = { Home, Play: Gamepad2, Tournaments: Trophy, Profile: User };
const LABEL_KEYS = {
  Home: 'tabs.home',
  Play: 'tabs.play',
  Tournaments: 'tabs.tournaments',
  Profile: 'tabs.profile',
};

// 4 onglets, moins les marges internes de React Navigation. Sur un écran de
// 360 dp cela donne ~84 dp par libellé — « Tournaments » (le plus long des deux
// langues) mesure ~66 dp à 11 px. La marge couvre une traduction plus longue.
const TAB_COUNT = 4;
const TAB_GUTTER = 6;

function TabItem({ routeName, focused }) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const itemWidth = Math.max(64, width / TAB_COUNT - TAB_GUTTER * 2);
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
  // en sombre on monte à textMuted (#bdcfc1), plus lisible sur la barre sombre (#16331f).
  const color = focused ? colors.gold500 : isDark ? colors.textMuted : colors.textFaint;

  return (
    <View style={[styles.item, { width: itemWidth }]}>
      <Animated.View style={{ transform: [{ translateY }] }}>
        <Icon icon={ICONS[routeName]} size={24} color={color} strokeWidth={focused ? 2.25 : 1.75} />
      </Animated.View>
      {/* Une seule ligne, une seule TAILLE. `adjustsFontSizeToFit` réglait bien
          le retour à la ligne (« Tournamen / ts ») mais en rétrécissant le seul
          libellé trop long : « Tournois » s'affichait visiblement plus petit que
          « Accueil » et « Profil » à côté. Des libellés de tailles différentes
          dans une même barre se lisent comme un défaut de rendu.
          La largeur de l'onglet est désormais CALCULÉE (cf. `itemWidth`), ce qui
          laisse la place au plus long libellé sans toucher à la police. */}
      <Text style={[styles.label, { color }]} numberOfLines={1}>
        {t(LABEL_KEYS[routeName])}
      </Text>
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
      {/* 6 onglets → 4 (08-2026). « Défis » et « Stats » sont passés dans
          MainStack : six onglets dépassaient la recommandation iOS/Android
          (3 à 5) et diluaient l'action principale. Aucun écran n'est supprimé.
          · Défis      → bouton « Défier un ami » (écran Jouer), résultat de duel,
                         notification push, et le stub `Challenge`.
          · Stats      → en-tête « Mes stats » de l'Accueil, et le Profil.
          Les appels imbriqués `navigate('Tabs', { screen: 'Challenges' })` ont
          été convertis en `navigate('Challenges')` : les deux écrans ne sont
          plus enfants du navigateur d'onglets. */}
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  tabBar: {
    backgroundColor: colors.white,
    // Fin liseré haut : sépare le contenu de la nav (themed clair/sombre).
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    ...shadow.tabBar,
  },
  tabItem: { paddingTop: spacing.xs },
  // Pas de largeur figée ici : elle est calculée par TabItem à partir de la
  // largeur de fenêtre (`useWindowDimensions`, donc réactif à la rotation et à
  // l'écran scindé). Les 64 px d'origine dataient des SIX onglets et bridaient
  // les libellés longs ; `alignSelf: 'stretch'` seul ne suffisait pas, le
  // conteneur d'icône de React Navigation ne s'élargit pas de lui-même.
  item: { alignItems: 'center', justifyContent: 'center', minHeight: MIN_TOUCH, gap: 2 },
  label: { fontFamily: fonts.bodyMedium, fontSize: 11, textAlign: 'center' },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'transparent', marginTop: 1 },
  dotActive: { backgroundColor: colors.gold500 },
  badge: {
    backgroundColor: colors.red400,
    color: '#ffffff', // texte sur pastille rouge → blanc stable (jamais flippé en sombre)
    fontFamily: fonts.bodyBold,
    fontSize: 10,
  },
});
