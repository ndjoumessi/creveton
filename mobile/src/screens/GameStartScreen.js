// GameStartScreen (onglet Jouer) — grille de thèmes 2 colonnes + niveau, récap,
// puis tirage depuis le cache local (mode normal : questions avec correct_index)
// et lancement du quiz.

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Info, Check } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Screen, Title, Heading, Body, AppButton, ChoiceChips, useToast } from '../components';
import Icon from '../components/Icon';
import {
  THEMES,
  LEVELS,
  GAME,
  TIMED_MODES,
} from '../constants/config';
import { useQuestionsStore } from '../store/questionsStore';
import { useGameStore } from '../store/gameStore';
import { themeGradients, fontSizes, radius, spacing } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { themeLabel, levelLabel } from '../utils/format';
import { hapticMedium } from '../utils/haptics';

// Mode Normal : 15 s/question, quel que soit le niveau (aplati — était 30/20/15).
// La difficulté reste portée par les questions et le score (50/75/100 pts).
const TIME_BY_LEVEL = { beginner: 15, intermediate: 15, expert: 15 };

// Modes proposés. `mixed` = thème/niveau automatiques (tous mélangés) + timer global.
const GAME_MODES = [
  { key: 'normal', emoji: '⚡', mixed: false },
  { key: 'blitz', emoji: '⏱', mixed: true },
  { key: 'marathon', emoji: '🏃', mixed: true },
];

export default function GameStartScreen({ navigation, route }) {
  const preset = route.params?.presetTheme;
  // Mode pré-sélectionné depuis l'accueil (cartes « Choisir un mode »).
  const presetMode = route.params?.presetMode;
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const reduceMotion = useReduceMotion();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // En-têtes de section : toujours textDark (théma-aware = quasi-blanc en sombre,
  // vert profond en clair) pour qu'ils se lisent comme des titres, pas comme des
  // accents verts (green300 se confondait avec la charte sur fond sombre).
  const sectionStyle = styles.section;
  // Indice « choisis un thème » : doré (attire l'œil) en sombre ; en clair, l'or
  // sur crème serait illisible → on garde le muté lisible. L'icône ℹ️ reste dans les 2.
  const hintColor = isDark ? colors.gold400 : colors.textMuted;
  const hintStyle = isDark ? [styles.hint, { color: colors.gold400 }] : styles.hint;
  const toast = useToast();
  const [mode, setMode] = useState(
    GAME_MODES.some((m) => m.key === presetMode) ? presetMode : 'normal'
  );
  const [theme, setTheme] = useState(preset || null);
  const [level, setLevel] = useState('beginner');
  const [loading, setLoading] = useState(false);
  // L'onglet « Jouer » reste monté : un nouveau tap sur une carte de mode (Accueil)
  // met à jour route.params mais NE relance PAS le useState ci-dessus → le mode
  // resterait figé (et en blitz/marathon, `ready` resterait false faute de thème).
  // On resynchronise donc le mode/thème présélectionnés quand les params changent.
  useEffect(() => {
    if (GAME_MODES.some((m) => m.key === presetMode)) setMode(presetMode);
  }, [presetMode]);
  useEffect(() => {
    if (preset) setTheme(preset);
  }, [preset]);

  const isMixed = TIMED_MODES.includes(mode);

  const drawForMode = useQuestionsStore((s) => s.drawForMode);
  const startGame = useGameStore((s) => s.startGame);

  // Animation d'entrée : chaque carte de thème glisse vers le haut + apparaît,
  // avec un décalage de 100ms par index.
  const cardAnims = useRef(THEMES.map(() => new Animated.Value(0))).current;
  useEffect(() => {
    Animated.stagger(
      100,
      cardAnims.map((a) =>
        Animated.timing(a, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        })
      )
    ).start();
  }, [cardAnims]);

  const recap = useMemo(() => {
    // Modes chronométrés : PAS de récap. Il répétait mot pour mot la carte de
    // mode déjà sélectionnée et surlignée en or — « Marathon · 2 min · 20
    // questions · mix » sous une carte disant « Marathon » puis « 2 min · 20
    // questions · mix ». Le récap n'a de valeur qu'en mode Normal, où il réunit
    // thème + niveau + durée par question, que les cartes ne montrent nulle part
    // ensemble. (`recapTimed` reste dans les traductions : pas de clé orpheline
    // supprimée à la volée, mais il n'est plus rendu.)
    if (isMixed) return null;
    if (!theme) return null;
    const time = TIME_BY_LEVEL[level] || 15;
    return t('gameStart.recap', {
      theme: t(`gameStart.themes.${theme}`, themeLabel(theme)),
      level: t(`gameStart.levels.${level}`, levelLabel(level)),
      count: GAME.questionsPerSession,
      time,
    });
  }, [isMixed, theme, level, t]);

  // Le récap apparaît en glissant vers le bas quand thème + niveau sont choisis.
  const recapAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(recapAnim, {
      toValue: recap ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [recap, recapAnim]);

  // Pulse doré subtil du bouton « Lancer » quand il est actif. En mode mixte,
  // pas de thème/niveau à choisir → prêt immédiatement.
  const ready = isMixed || (!!theme && !!level);
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    // Inactif ou reduce-motion : rendu final direct (échelle 1, pas de boucle).
    if (!ready || reduceMotion) {
      pulse.setValue(1);
      return undefined;
    }
    let loop;
    // Le bouton s'active : petit scale-in 0.97 → 1.0 (~200ms), puis pulse doré en boucle.
    pulse.setValue(0.97);
    const enter = Animated.timing(pulse, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    });
    enter.start(({ finished }) => {
      if (!finished) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1.03,
            duration: 700,
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 1,
            duration: 700,
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
    });
    return () => {
      enter.stop();
      loop?.stop();
    };
  }, [ready, pulse, reduceMotion]);

  // Indice « choisis un thème » sous le bouton (mode non mixte, aucun thème choisi).
  // Fondu d'apparition après ~1s pour laisser l'utilisateur parcourir les thèmes d'abord.
  const showPickHint = !isMixed && !theme;
  const pickHintAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!showPickHint) {
      pickHintAnim.setValue(0);
      return undefined;
    }
    if (reduceMotion) {
      pickHintAnim.setValue(1);
      return undefined;
    }
    pickHintAnim.setValue(0);
    const anim = Animated.timing(pickHintAnim, {
      toValue: 1,
      duration: 400,
      delay: 1000,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [showPickHint, pickHintAnim, reduceMotion]);

  // Emphase de la carte de thème sélectionnée : scale 1.03 + badge ✓ doré animé
  // (0.8 → 1.0, ~200ms). Une valeur animée par carte (0 = non sélectionnée).
  const selectAnims = useRef(THEMES.map(() => new Animated.Value(0))).current;
  useEffect(() => {
    THEMES.forEach((th, i) => {
      const target = th.key === theme ? 1 : 0;
      if (reduceMotion) {
        selectAnims[i].setValue(target);
        return;
      }
      Animated.timing(selectAnims[i], {
        toValue: target,
        duration: 200,
        useNativeDriver: true,
      }).start();
    });
  }, [theme, selectAnims, reduceMotion]);

  const onStart = async () => {
    if (!ready) return;
    hapticMedium();
    setLoading(true);
    try {
      const { questions: qs, error, warning } = await drawForMode({ mode, theme, level });
      if (error) {
        const key = error === 'notEnough' ? 'gameStart.notify.notEnough' : 'gameStart.notify.noQuestions';
        toast.show({ type: 'error', message: t(key) });
        setLoading(false);
        return;
      }
      // Top-up API impossible (hors-ligne) : on lance quand même avec le cache,
      // mais on prévient que la partie peut être plus courte que prévu.
      if (warning === 'offline') {
        toast.show({ type: 'info', message: t('gameStart.notify.offline') });
      }
      startGame({
        mode,
        theme: isMixed ? null : theme,
        level: isMixed ? null : level,
        questions: qs,
      });
      setLoading(false);
      navigation.navigate('Quiz');
    } catch {
      setLoading(false);
      toast.show({ type: 'error', message: t('gameStart.notify.startFailed') });
    }
  };

  return (
    <Screen
      scroll
      // 'bottom' ajouté avec le pied ancré : sans lui, le pied venait coller la
      // barre d'onglets, sans respiration. La barre absorbe déjà l'inset système
      // (BottomTabs : `paddingBottom: insets.bottom`), donc ce que l'on gagne ici
      // est un espacement visuel, pas une zone de sécurité manquante.
      edges={['top', 'bottom']}
      // L'action principale était en bas d'une page longue (3 modes + 6 cartes de
      // thème + niveau) : « Lancer » n'apparaissait qu'après avoir fait défiler,
      // alors que c'est le geste que l'écran existe pour provoquer. Ancré en pied,
      // il reste sous le pouce quel que soit le défilement. L'indice « choisis un
      // thème » l'accompagne : il explique POURQUOI le bouton est inactif, il doit
      // donc être visible en même temps que lui.
      footer={
        <>
          <Animated.View style={{ transform: [{ scale: pulse }] }}>
            <AppButton
              title={t('gameStart.launch')}
              variant="primary"
              size="lg"
              loading={loading}
              disabled={!ready}
              onPress={onStart}
            />
          </Animated.View>
          {showPickHint ? (
            <Animated.View style={{ opacity: pickHintAnim }}>
              <Body weight="medium" size="sm" color={colors.gold500} style={styles.pickHint}>
                {t('gameStart.pickThemeHint')}
              </Body>
            </Animated.View>
          ) : null}
        </>
      }
    >
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.navigate('Home')}
          hitSlop={{ top: 12, bottom: 12, left: 14, right: 14 }} // cible tactile ≥44px (flèche retour)
        >
          <Text style={styles.back}>←</Text>
        </Pressable>
        <Title size="xl">{t('gameStart.title')}</Title>
      </View>

      {/* Sélecteur de mode */}
      <Heading weight="bold" style={sectionStyle}>{t('gameStart.chooseMode')}</Heading>
      <View style={styles.modes}>
        {GAME_MODES.map((m) => {
          const active = m.key === mode;
          return (
            <Pressable
              key={m.key}
              onPress={() => setMode(m.key)}
              style={[styles.modeRow, active && styles.modeRowActive]}
            >
              <Text style={styles.modeEmoji}>{m.emoji}</Text>
              <View style={styles.modeBody}>
                <Heading weight="bold" size="base">
                  {t(`gameStart.modes.${m.key}.name`)}
                </Heading>
                <Body size="xs" muted style={styles.modeDesc} numberOfLines={1}>
                  {t(`gameStart.modes.${m.key}.desc`)}
                </Body>
              </View>
              {active ? <Icon icon={Check} size={18} color={colors.gold500} strokeWidth={3} /> : null}
            </Pressable>
          );
        })}
      </View>

      {/* Thème & niveau — masqués en mode mixte (tous thèmes/niveaux auto) */}
      {!isMixed ? (
        <>
      <Heading weight="bold" style={sectionStyle}>{t('gameStart.chooseTheme')}</Heading>
      <View style={styles.grid}>
        {THEMES.map((th, i) => {
          const active = th.key === theme;
          const anim = cardAnims[i];
          const select = selectAnims[i];
          // Nombre réel de questions en cache pour ce thème (0 si absent / non chargé).
          return (
            <Animated.View
              key={th.key}
              style={[
                styles.gridItem,
                {
                  opacity: anim,
                  transform: [
                    {
                      translateY: anim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [24, 0],
                      }),
                    },
                    {
                      scale: select.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 1.03],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Pressable onPress={() => setTheme(th.key)}>
                <LinearGradient
                  colors={themeGradients[th.key] || themeGradients.industrie}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.themeCard, active && styles.themeCardActive]}
                >
                  {active ? (
                    <Animated.View
                      style={[
                        styles.check,
                        {
                          opacity: select,
                          transform: [
                            {
                              scale: select.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0.8, 1],
                              }),
                            },
                          ],
                        },
                      ]}
                    >
                      <Icon icon={Check} size={14} color={colors.green900} strokeWidth={3} />
                    </Animated.View>
                  ) : null}
                  <Text style={styles.themeEmoji}>{th.emoji}</Text>
                  <Heading weight="bold" size="base" color={colors.textOnDark} style={styles.themeName}>
                    {t(`gameStart.themes.${th.key}`, th.label)}
                  </Heading>
                  <Body size="xs" color={colors.textOnDarkMuted}>
                    {t('gameStart.misc.questionsPerGame', { count: GAME.questionsPerSession })}
                  </Body>
                </LinearGradient>
              </Pressable>
              {/* Pastilles de disponibilité RETIRÉES (demande produit). « Disponible
                  hors ligne » était partie d'abord — elle couvrait le cas normal.
                  « En ligne uniquement » suit : la grille se lit mieux sans, et
                  l'information reste délivrée AU MOMENT où elle compte — hors ligne,
                  `drawForMode` échoue proprement et le toast « pas assez de
                  questions » s'affiche, sans que l'utilisateur perde sa partie.
                  Contrepartie assumée : plus d'avertissement AVANT le tap. */}
            </Animated.View>
          );
        })}
      </View>

      <Heading weight="bold" style={sectionStyle}>{t('gameStart.chooseLevel')}</Heading>
      <ChoiceChips
        options={LEVELS.map((l) => ({
          key: l.key,
          label: t(`gameStart.levels.${l.key}`, l.label),
        }))}
        value={level}
        onChange={setLevel}
      />
        </>
      ) : null}

      {recap ? (
        <Animated.View
          style={[
            styles.recap,
            {
              opacity: recapAnim,
              transform: [
                {
                  translateY: recapAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-8, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Body weight="medium" size="sm" muted style={styles.recapText}>{recap}</Body>
        </Animated.View>
      ) : (
        <View style={styles.hintRow}>
          <Icon icon={Info} size={16} color={hintColor} />
          <Body weight="medium" style={hintStyle}>
            {t('gameStart.misc.hint')}
          </Body>
        </View>
      )}

      {/* Action SECONDAIRE : reste dans le contenu défilant. La mettre dans le pied
          ancré aurait porté sa hauteur à ~150 px (CTA + indice + ce bouton), au
          détriment de la grille de thèmes qu'on vient précisément de rendre visible. */}
      <AppButton
        title={t('gameStart.misc.challengeFriend')}
        variant="ghost"
        size="md"
        // `Challenges` est un écran de la PILE depuis le passage à 4 onglets
        // (08-2026) : navigation à plat, plus imbriquée sous `Tabs`.
        onPress={() => navigation.navigate('Challenges', { openCreate: true })}
        style={styles.challenge}
      />
    </Screen>
  );
}

const COL_GAP = spacing.md;

const makeStyles = (colors) => StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  back: { fontSize: fontSizes.xxl, color: colors.textDark },
  section: {
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: COL_GAP },
  gridItem: { width: '47.8%' },
  themeCard: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    minHeight: 120,
    justifyContent: 'flex-end',
    gap: 2,
    borderWidth: 3,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  themeCardActive: { borderColor: colors.gold500 },
  // Chip or plein + glyphe vert profond = contraste maxi du ✓. L'anneau crème
  // (textOnDark) sépare le badge de TOUTE couleur de carte (brun histoire, vert
  // industrie inclus) → visible sur les 6 thèmes.
  check: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 24,
    height: 24,
    borderRadius: radius.md,
    backgroundColor: colors.gold500,
    borderWidth: 1.5,
    borderColor: colors.textOnDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeEmoji: { fontSize: 32 },
  themeName: { marginTop: spacing.xs },

  modes: { gap: spacing.sm },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 60,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.borderInput,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  modeRowActive: { borderColor: colors.gold500, backgroundColor: colors.goldVeil },
  modeEmoji: { fontSize: 24 },
  modeBody: { flex: 1 },
  modeDesc: { marginTop: 1 },

  recap: {
    backgroundColor: colors.cream,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: colors.gold500,
  },
  recapText: { textAlign: 'center' },
  hintRow: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  hint: {
    textAlign: 'center',
    color: colors.textMuted,
  },

  // Nudge vers le CTA : or (accent distinct, court libellé unique → dans le budget or).
  // textMuted rendait vert-de-gris en sombre (indistinct du reste).
  pickHint: {
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  challenge: { marginTop: spacing.md },
});
