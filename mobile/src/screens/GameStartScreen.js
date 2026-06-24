// GameStartScreen (onglet Jouer) — grille de thèmes 2 colonnes + niveau, récap,
// puis tirage depuis le cache local (mode normal : questions avec correct_index)
// et lancement du quiz.

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Screen, Title, Body, AppButton, useToast } from '../components';
import {
  THEMES,
  LEVELS,
  GAME,
  MODE_DURATION_S,
  MODE_QUESTION_COUNT,
  TIMED_MODES,
} from '../constants/config';
import { useQuestionsStore } from '../store/questionsStore';
import { useGameStore } from '../store/gameStore';
import { themeGradients, fonts, fontSizes, radius, spacing } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { themeLabel, levelLabel } from '../utils/format';
import { hapticMedium } from '../utils/haptics';

const TIME_BY_LEVEL = { beginner: 30, intermediate: 20, expert: 15 };

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
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const toast = useToast();
  const [mode, setMode] = useState(
    GAME_MODES.some((m) => m.key === presetMode) ? presetMode : 'normal'
  );
  const [theme, setTheme] = useState(preset || null);
  const [level, setLevel] = useState('beginner');
  const [loading, setLoading] = useState(false);

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
    // Modes chronométrés : récap dédié (durée globale + nb questions, mix auto).
    if (isMixed) {
      return t(`gameStart.recapTimed.${mode}`, {
        minutes: Math.round(MODE_DURATION_S[mode] / 60),
        count: MODE_QUESTION_COUNT[mode],
      });
    }
    if (!theme) return null;
    const time = TIME_BY_LEVEL[level] || 30;
    return t('gameStart.recap', {
      theme: t(`gameStart.themes.${theme}`, themeLabel(theme)),
      level: t(`gameStart.levels.${level}`, levelLabel(level)),
      count: GAME.questionsPerSession,
      time,
    });
  }, [isMixed, mode, theme, level, t]);

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
    if (!ready) {
      pulse.setValue(1);
      return undefined;
    }
    const loop = Animated.loop(
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
    return () => loop.stop();
  }, [ready, pulse]);

  const onStart = async () => {
    if (!ready) return;
    hapticMedium();
    setLoading(true);
    try {
      const { questions: qs, error } = await drawForMode({ mode, theme, level });
      if (error) {
        const key = error === 'notEnough' ? 'gameStart.notify.notEnough' : 'gameStart.notify.noQuestions';
        toast.show({ type: 'error', message: t(key) });
        setLoading(false);
        return;
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
    <Screen scroll>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.navigate('Home')} hitSlop={8}>
          <Text style={styles.back}>←</Text>
        </Pressable>
        <Title style={styles.headerTitle}>{t('gameStart.title')}</Title>
      </View>

      {/* Sélecteur de mode */}
      <Text style={styles.section}>{t('gameStart.chooseMode')}</Text>
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
                <Text style={[styles.modeName, active && styles.modeNameActive]}>
                  {t(`gameStart.modes.${m.key}.name`)}
                </Text>
                <Text style={styles.modeDesc} numberOfLines={1}>
                  {t(`gameStart.modes.${m.key}.desc`)}
                </Text>
              </View>
              {active ? <Text style={styles.modeCheck}>✓</Text> : null}
            </Pressable>
          );
        })}
      </View>

      {/* Thème & niveau — masqués en mode mixte (tous thèmes/niveaux auto) */}
      {!isMixed ? (
        <>
      <Text style={styles.section}>{t('gameStart.chooseTheme')}</Text>
      <View style={styles.grid}>
        {THEMES.map((th, i) => {
          const active = th.key === theme;
          const anim = cardAnims[i];
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
                    <View style={styles.check}>
                      <Text style={styles.checkText}>✓</Text>
                    </View>
                  ) : null}
                  <Text style={styles.themeEmoji}>{th.emoji}</Text>
                  <Text style={styles.themeName}>
                    {t(`gameStart.themes.${th.key}`, th.label)}
                  </Text>
                  <Text style={styles.themeMeta}>
                    {t('gameStart.misc.questionsPerGame', { count: GAME.questionsPerSession })}
                  </Text>
                </LinearGradient>
              </Pressable>
            </Animated.View>
          );
        })}
      </View>

      <Text style={styles.section}>{t('gameStart.chooseLevel')}</Text>
      <View style={styles.levels}>
        {LEVELS.map((l) => {
          const active = l.key === level;
          return (
            <Pressable
              key={l.key}
              onPress={() => setLevel(l.key)}
              style={[styles.levelPill, active && styles.levelPillActive]}
            >
              <Text style={[styles.levelText, active && styles.levelTextActive]}>
                {t(`gameStart.levels.${l.key}`, l.label)}
              </Text>
            </Pressable>
          );
        })}
      </View>
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
          <Body style={styles.recapText}>{recap}</Body>
        </Animated.View>
      ) : (
        <Body muted style={styles.hint}>
          {t('gameStart.misc.hint')}
        </Body>
      )}

      <Animated.View style={{ transform: [{ scale: pulse }] }}>
        <AppButton
          title={t('gameStart.launch')}
          variant="primary"
          size="lg"
          loading={loading}
          disabled={!ready}
          onPress={onStart}
          style={styles.cta}
        />
      </Animated.View>
      <AppButton
        title={t('gameStart.misc.challengeFriend')}
        variant="ghost"
        size="md"
        onPress={() => navigation.navigate('Challenge')}
        style={styles.challenge}
      />
    </Screen>
  );
}

const COL_GAP = spacing.md;

const makeStyles = (colors) => StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  back: { fontSize: fontSizes.xxl, color: colors.textDark },
  headerTitle: { fontSize: fontSizes.xl },
  section: {
    fontFamily: fonts.titleBold,
    fontSize: fontSizes.lg,
    color: colors.textDark,
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
  check: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.gold500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: { fontFamily: fonts.bodyBold, fontSize: fontSizes.sm, color: colors.green900 },
  themeEmoji: { fontSize: 32 },
  themeName: { fontFamily: fonts.titleBold, fontSize: fontSizes.base, color: colors.textOnDark, marginTop: spacing.xs },
  themeMeta: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.xs, color: 'rgba(255,255,255,0.7)' },

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
  modeName: { fontFamily: fonts.titleBold, fontSize: fontSizes.base, color: colors.textDark },
  modeNameActive: { color: colors.textDark },
  modeDesc: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 1 },
  modeCheck: { fontFamily: fonts.bodyBold, fontSize: fontSizes.lg, color: colors.gold500 },

  levels: { flexDirection: 'row', gap: spacing.sm },
  levelPill: {
    flex: 1,
    height: 46,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.borderInput,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelPillActive: { backgroundColor: colors.green900, borderColor: colors.green900 },
  levelText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm, color: colors.textMuted },
  levelTextActive: { color: colors.textOnDark },

  recap: {
    backgroundColor: colors.cream,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: colors.gold500,
  },
  recapText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm, color: colors.textMuted, textAlign: 'center' },
  hint: { marginTop: spacing.lg, textAlign: 'center' },

  cta: { marginTop: spacing.xl },
  challenge: { marginTop: spacing.md },
});
