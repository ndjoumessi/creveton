// GameStartScreen (onglet Jouer) — sélection thème (6) + niveau (3),
// puis tirage des questions depuis le cache local et lancement du quiz.

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Pressable, Text } from 'react-native';
import {
  Screen,
  Title,
  Heading,
  Body,
  Label,
  Button,
  Card,
} from '../components';
import { THEMES, LEVELS, GAME } from '../constants/config';
import { useQuestionsStore } from '../store/questionsStore';
import { useGameStore } from '../store/gameStore';
import { questions as questionsApi } from '../services/endpoints';
import { colors, fonts, fontSizes, radius, spacing } from '../constants/theme';

export default function GameStartScreen({ navigation, route }) {
  const preset = route.params?.presetTheme;
  const [theme, setTheme] = useState(preset || null);
  const [level, setLevel] = useState('beginner');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const drawQuestions = useQuestionsStore((s) => s.drawQuestions);
  const startGame = useGameStore((s) => s.startGame);

  useEffect(() => {
    if (preset) setTheme(preset);
  }, [preset]);

  const onStart = async () => {
    if (!theme) {
      setError('Choisis un thème.');
      return;
    }
    setError(null);
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
        setError('Aucune question disponible pour ce thème. Réessaie plus tard.');
        setLoading(false);
        return;
      }
      startGame({ mode: 'normal', theme, level, questions: qs });
      setLoading(false);
      navigation.navigate('Quiz');
    } catch (e) {
      setLoading(false);
      setError('Impossible de démarrer la partie.');
    }
  };

  return (
    <Screen dark scroll>
      <Title color={colors.cream} style={styles.title}>
        Nouvelle partie
      </Title>
      <Body color={colors.textOnDarkMuted} style={styles.subtitle}>
        Choisis ton thème et ton niveau de difficulté.
      </Body>

      <Heading color={colors.cream} style={styles.sectionTitle}>
        Thème
      </Heading>
      <View style={styles.grid}>
        {THEMES.map((t) => {
          const active = t.key === theme;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTheme(t.key)}
              style={[styles.themeCard, active && styles.themeActive]}
            >
              <Text style={styles.themeEmoji}>{t.emoji}</Text>
              <Text style={[styles.themeLabel, active && styles.themeLabelActive]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Heading color={colors.cream} style={styles.sectionTitle}>
        Niveau
      </Heading>
      <View style={styles.levels}>
        {LEVELS.map((l) => {
          const active = l.key === level;
          return (
            <Pressable
              key={l.key}
              onPress={() => setLevel(l.key)}
              style={[styles.levelCard, active && styles.levelActive]}
            >
              <Text style={[styles.levelLabel, active && styles.levelLabelActive]}>
                {l.label}
              </Text>
              <Text style={[styles.levelPts, active && styles.levelPtsActive]}>
                {l.points} pts / réponse
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Card dark style={styles.summary}>
        <Body color={colors.textOnDarkMuted}>
          {GAME.questionsPerSession} questions · {GAME.timePerQuestionS}s par question
        </Body>
        <Body color={colors.textOnDarkMuted}>
          Bonus vitesse ⚡ si réponse ≤ {GAME.speedBonusThresholdMs / 1000}s · streak ×1,5 dès 3 bonnes
        </Body>
      </Card>

      {error ? (
        <Body color={colors.red400} style={styles.error}>
          {error}
        </Body>
      ) : null}

      <Button
        title="Démarrer 🚀"
        onPress={onStart}
        loading={loading}
        style={styles.cta}
      />
      <Button
        title="⚔️ Défier un ami"
        variant="ghost"
        onPress={() => navigation.navigate('Challenge')}
        style={styles.challenge}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: spacing.sm },
  subtitle: { marginBottom: spacing.lg },
  sectionTitle: { marginBottom: spacing.md, marginTop: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  themeCard: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.cardOnDark,
    borderWidth: 1.5,
    borderColor: colors.borderOnDark,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  themeActive: { borderColor: colors.gold400, backgroundColor: colors.green700 },
  themeEmoji: { fontSize: 32 },
  themeLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.xs,
    color: colors.textOnDarkMuted,
  },
  themeLabelActive: { color: colors.gold400 },
  levels: { gap: spacing.sm },
  levelCard: {
    borderRadius: radius.md,
    backgroundColor: colors.cardOnDark,
    borderWidth: 1.5,
    borderColor: colors.borderOnDark,
    padding: spacing.md,
  },
  levelActive: { borderColor: colors.gold400, backgroundColor: colors.green700 },
  levelLabel: {
    fontFamily: fonts.titleSemiBold,
    fontSize: fontSizes.md,
    color: colors.cream,
  },
  levelLabelActive: { color: colors.gold400 },
  levelPts: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,
    color: colors.textOnDarkMuted,
    marginTop: 2,
  },
  levelPtsActive: { color: colors.cream },
  summary: { marginTop: spacing.lg, gap: spacing.xs },
  error: { marginTop: spacing.md },
  cta: { marginTop: spacing.lg },
  challenge: { marginTop: spacing.md },
});
