// GameStartScreen (onglet Jouer) — grille de thèmes 2 colonnes + niveau, récap,
// puis tirage depuis le cache local (mode normal : questions avec correct_index)
// et lancement du quiz.

import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen, Title, Body, AppButton, useToast } from '../components';
import { THEMES, LEVELS, GAME } from '../constants/config';
import { useQuestionsStore } from '../store/questionsStore';
import { useGameStore } from '../store/gameStore';
import { questions as questionsApi } from '../services/endpoints';
import { themeGradients, colors, fonts, fontSizes, radius, spacing } from '../constants/theme';
import { themeLabel, levelLabel } from '../utils/format';

const TIME_BY_LEVEL = { beginner: 30, intermediate: 20, expert: 15 };

export default function GameStartScreen({ navigation, route }) {
  const preset = route.params?.presetTheme;
  const toast = useToast();
  const [theme, setTheme] = useState(preset || null);
  const [level, setLevel] = useState('beginner');
  const [loading, setLoading] = useState(false);

  const drawQuestions = useQuestionsStore((s) => s.drawQuestions);
  const startGame = useGameStore((s) => s.startGame);

  const recap = useMemo(() => {
    if (!theme) return null;
    const t = TIME_BY_LEVEL[level] || 30;
    return `${themeLabel(theme)} · ${levelLabel(level)} · ${GAME.questionsPerSession} questions · ${t}s/Q`;
  }, [theme, level]);

  const onStart = async () => {
    if (!theme || !level) return;
    setLoading(true);
    try {
      let qs = await drawQuestions({ theme, level, count: GAME.questionsPerSession });
      if (!qs || qs.length < GAME.questionsPerSession) {
        try {
          const resp = await questionsApi.fetch({ theme, level, count: GAME.questionsPerSession });
          if (resp?.data?.length) qs = resp.data;
        } catch {
          /* on garde le cache local */
        }
      }
      if (!qs || !qs.length) {
        toast.show({ type: 'error', message: 'Aucune question disponible pour ce thème.' });
        setLoading(false);
        return;
      }
      startGame({ mode: 'normal', theme, level, questions: qs });
      setLoading(false);
      navigation.navigate('Quiz');
    } catch {
      setLoading(false);
      toast.show({ type: 'error', message: 'Impossible de démarrer la partie.' });
    }
  };

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.navigate('Home')} hitSlop={8}>
          <Text style={styles.back}>←</Text>
        </Pressable>
        <Title style={styles.headerTitle}>Nouvelle partie</Title>
      </View>

      <Text style={styles.section}>Choisis ton thème</Text>
      <View style={styles.grid}>
        {THEMES.map((t) => {
          const active = t.key === theme;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTheme(t.key)}
              style={styles.gridItem}
            >
              <LinearGradient
                colors={themeGradients[t.key] || themeGradients.industrie}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.themeCard, active && styles.themeCardActive]}
              >
                {active ? (
                  <View style={styles.check}>
                    <Text style={styles.checkText}>✓</Text>
                  </View>
                ) : null}
                <Text style={styles.themeEmoji}>{t.emoji}</Text>
                <Text style={styles.themeName}>{t.label}</Text>
                <Text style={styles.themeMeta}>{GAME.questionsPerSession} questions</Text>
              </LinearGradient>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.section}>Choisis ton niveau</Text>
      <View style={styles.levels}>
        {LEVELS.map((l) => {
          const active = l.key === level;
          return (
            <Pressable
              key={l.key}
              onPress={() => setLevel(l.key)}
              style={[styles.levelPill, active && styles.levelPillActive]}
            >
              <Text style={[styles.levelText, active && styles.levelTextActive]}>{l.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {recap ? (
        <View style={styles.recap}>
          <Body style={styles.recapText}>{recap}</Body>
        </View>
      ) : (
        <Body muted style={styles.hint}>
          Sélectionne un thème pour lancer une partie.
        </Body>
      )}

      <AppButton
        title="Lancer ▶"
        variant="primary"
        size="lg"
        loading={loading}
        disabled={!theme || !level}
        onPress={onStart}
        style={styles.cta}
      />
      <AppButton
        title="⚔️ Défier un ami"
        variant="ghost"
        size="md"
        onPress={() => navigation.navigate('Challenge')}
        style={styles.challenge}
      />
    </Screen>
  );
}

const COL_GAP = spacing.md;

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  back: { fontSize: fontSizes.xxl, color: colors.green900 },
  headerTitle: { fontSize: fontSizes.xl },
  section: {
    fontFamily: fonts.titleBold,
    fontSize: fontSizes.lg,
    color: colors.green900,
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
  themeName: { fontFamily: fonts.titleBold, fontSize: fontSizes.base, color: colors.white, marginTop: spacing.xs },
  themeMeta: { fontFamily: fonts.bodyRegular, fontSize: fontSizes.xs, color: 'rgba(255,255,255,0.7)' },

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
  levelTextActive: { color: colors.white },

  recap: {
    backgroundColor: colors.cream,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  recapText: { fontFamily: fonts.bodyMedium, fontSize: fontSizes.sm, color: colors.grey, textAlign: 'center' },
  hint: { marginTop: spacing.lg, textAlign: 'center' },

  cta: { marginTop: spacing.xl },
  challenge: { marginTop: spacing.md },
});
