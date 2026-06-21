// GameStartScreen (onglet Jouer) — carrousel de thèmes (snap), sélection de
// niveau, puis tirage des questions depuis le cache local (repli live) et
// lancement du quiz. Anti-triche : aucune bonne réponse côté client.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Text,
  ScrollView,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen, Title, Body, Label, AppButton, useToast } from '../components';
import { THEMES, LEVELS, GAME } from '../constants/config';
import { useQuestionsStore } from '../store/questionsStore';
import { useGameStore } from '../store/gameStore';
import { questions as questionsApi } from '../services/endpoints';
import {
  colors,
  fonts,
  fontSizes,
  radius,
  spacing,
  shadow,
  themeGradients,
} from '../constants/theme';

const SCREEN_W = Dimensions.get('window').width;
const CARD_GAP = spacing.lg;
const CARD_W = SCREEN_W - spacing.lg * 2; // marge écran (Screen padded = 16)
const SNAP = CARD_W + CARD_GAP;

export default function GameStartScreen({ navigation, route }) {
  const preset = route.params?.presetTheme;
  const presetIndex = Math.max(
    0,
    THEMES.findIndex((t) => t.key === preset),
  );

  const [index, setIndex] = useState(presetIndex >= 0 ? presetIndex : 0);
  const [level, setLevel] = useState(null);
  const [loading, setLoading] = useState(false);

  const scrollRef = useRef(null);
  const toast = useToast();

  const cacheCount = useQuestionsStore((s) => s.count);
  const drawQuestions = useQuestionsStore((s) => s.drawQuestions);
  const startGame = useGameStore((s) => s.startGame);

  const theme = THEMES[index]?.key ?? null;

  // Positionne le carrousel sur le thème présélectionné au montage.
  useEffect(() => {
    if (presetIndex > 0 && scrollRef.current) {
      scrollRef.current.scrollTo({ x: presetIndex * SNAP, animated: false });
      setIndex(presetIndex);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onMomentumEnd = useCallback((e) => {
    const x = e.nativeEvent.contentOffset.x;
    const i = Math.round(x / SNAP);
    setIndex(Math.max(0, Math.min(THEMES.length - 1, i)));
  }, []);

  const ready = theme !== null && level !== null;

  const onStart = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    try {
      // Mode hybride : on pioche d'abord dans le cache local (SQLite).
      let qs = await drawQuestions({
        theme,
        level,
        count: GAME.questionsPerSession,
      });
      // Repli live si le cache est insuffisant.
      if (!qs || qs.length < GAME.questionsPerSession) {
        try {
          const resp = await questionsApi.fetch({
            theme,
            level,
            count: GAME.questionsPerSession,
          });
          if (resp?.data?.length) qs = resp.data;
        } catch {
          /* on garde ce qu'on a en local */
        }
      }
      if (!qs || !qs.length) {
        setLoading(false);
        toast.show({
          type: 'error',
          message: 'Aucune question disponible pour ce thème.',
        });
        return;
      }
      startGame({ mode: 'normal', theme, level, questions: qs });
      setLoading(false);
      navigation.navigate('Quiz');
    } catch {
      setLoading(false);
      toast.show({ type: 'error', message: 'Impossible de démarrer la partie.' });
    }
  }, [ready, theme, level, drawQuestions, startGame, navigation, toast]);

  return (
    <Screen dark scroll>
      {/* En-tête */}
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.navigate('Home')}
          hitSlop={10}
          style={styles.back}
        >
          <Text style={styles.backText}>← Retour</Text>
        </Pressable>
        <Title color={colors.cream} style={styles.title}>
          Nouvelle partie
        </Title>
      </View>

      {/* Carrousel de thèmes */}
      <Label color={colors.textOnDarkFaint} style={styles.sectionLabel}>
        THÈME
      </Label>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={SNAP}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum
        onMomentumScrollEnd={onMomentumEnd}
        contentContainerStyle={styles.carousel}
        style={styles.carouselWrap}
      >
        {THEMES.map((t, i) => {
          const active = i === index;
          return (
            <LinearGradient
              key={t.key}
              colors={themeGradients[t.key]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.themeCard,
                { width: CARD_W },
                active && styles.themeCardActive,
              ]}
            >
              {active ? (
                <View style={styles.check}>
                  <Text style={styles.checkText}>✓</Text>
                </View>
              ) : null}
              <Text style={styles.themeEmoji}>{t.emoji}</Text>
              <Text style={styles.themeName}>{t.label}</Text>
              <Text style={styles.themeMeta}>
                {cacheCount > 0
                  ? `${cacheCount} questions disponibles`
                  : 'Prêt à jouer'}
              </Text>
            </LinearGradient>
          );
        })}
      </ScrollView>

      {/* Indicateur de page du carrousel */}
      <View style={styles.pager}>
        {THEMES.map((t, i) => (
          <View
            key={t.key}
            style={[styles.pagerDot, i === index && styles.pagerDotActive]}
          />
        ))}
      </View>

      {/* Niveau */}
      <Label color={colors.textOnDarkFaint} style={styles.sectionLabel}>
        NIVEAU
      </Label>
      <View style={styles.levels}>
        {LEVELS.map((l) => {
          const active = l.key === level;
          return (
            <Pressable
              key={l.key}
              onPress={() => setLevel(l.key)}
              style={[styles.pill, active && styles.pillActive]}
            >
              <Text style={[styles.pillText, active && styles.pillTextActive]}>
                {l.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {level ? (
        <Body color={colors.textOnDarkMuted} style={styles.levelMeta}>
          {GAME.questionsPerSession} questions · {GAME.timePerQuestionS}s/Q
        </Body>
      ) : null}

      {/* CTA */}
      <AppButton
        title="Lancer la partie"
        variant="primary"
        size="lg"
        iconLeft={<Text style={styles.ctaIcon}>▶</Text>}
        disabled={!ready}
        loading={loading}
        onPress={onStart}
        style={styles.cta}
      />
      <AppButton
        title="⚔️ Défier un ami"
        variant="ghost"
        onPress={() => navigation.navigate('Challenge')}
        style={styles.challenge}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: spacing.lg },
  back: { alignSelf: 'flex-start', marginBottom: spacing.sm },
  backText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.md,
    color: colors.textOnDarkMuted,
  },
  title: { fontSize: fontSizes.xxl },
  sectionLabel: {
    letterSpacing: 1.2,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  carouselWrap: {
    marginHorizontal: -spacing.lg, // déborde sur les marges du Screen
  },
  carousel: {
    paddingHorizontal: spacing.lg,
    gap: CARD_GAP,
  },
  themeCard: {
    height: 200,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 3,
    borderColor: 'transparent',
    ...shadow.card,
  },
  themeCardActive: {
    borderColor: colors.gold400,
  },
  check: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.gold400,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: {
    fontFamily: fonts.titleBold,
    fontSize: fontSizes.lg,
    color: colors.green900,
  },
  themeEmoji: { fontSize: 48 },
  themeName: {
    fontFamily: fonts.titleBold,
    fontSize: fontSizes.xl,
    color: colors.white,
  },
  themeMeta: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.sm,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  pager: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  pagerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.borderOnDark,
  },
  pagerDotActive: {
    width: 22,
    backgroundColor: colors.gold400,
  },
  levels: { flexDirection: 'row', gap: spacing.sm },
  pill: {
    flex: 1,
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.borderInput,
  },
  pillActive: {
    backgroundColor: colors.green900,
    borderColor: colors.green900,
  },
  pillText: {
    fontFamily: fonts.titleSemiBold,
    fontSize: fontSizes.md,
    color: colors.textMuted,
  },
  pillTextActive: { color: colors.cream },
  levelMeta: { marginTop: spacing.sm, textAlign: 'center' },
  ctaIcon: { color: colors.green900, fontSize: fontSizes.md },
  cta: { marginTop: spacing.xl },
  challenge: { marginTop: spacing.md },
});
