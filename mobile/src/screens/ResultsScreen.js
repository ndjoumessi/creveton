// ResultsScreen — score, XP gagné, récapitulatif bonnes/mauvaises réponses,
// boutons Rejouer / Accueil. Données issues de /sessions/submit (API §6).

import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  Screen,
  Title,
  Heading,
  Body,
  Label,
  Card,
  Button,
  Badge,
  EmptyState,
} from '../components';
import { useGameStore } from '../store/gameStore';
import { useAuthStore } from '../store/authStore';
import { colors, fonts, fontSizes, spacing } from '../constants/theme';

export default function ResultsScreen({ route, navigation }) {
  const { ok, error } = route.params || {};
  const result = useGameStore((s) => s.result);
  const theme = useGameStore((s) => s.theme);
  const level = useGameStore((s) => s.level);
  const reset = useGameStore((s) => s.reset);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);

  // Rafraîchit le profil (XP/niveau) après une partie réussie.
  useEffect(() => {
    if (ok) refreshProfile();
  }, [ok, refreshProfile]);

  const goHome = () => {
    reset();
    navigation.navigate('Tabs', { screen: 'Home' });
  };
  const replay = () => {
    reset();
    navigation.navigate('Tabs', { screen: 'Play' });
  };

  if (!ok || !result) {
    return (
      <Screen dark>
        <EmptyState
          dark
          emoji="😕"
          title="Score non enregistré"
          message={error?.message || 'La partie n\'a pas pu être soumise. Réessaie.'}
          action={
            <Button title="Retour à l'accueil" onPress={goHome} style={{ marginTop: spacing.lg }} />
          }
        />
      </Screen>
    );
  }

  const pct = result.total_questions
    ? Math.round((result.correct_count / result.total_questions) * 100)
    : 0;
  const review = result.review || [];

  return (
    <Screen dark scroll>
      {/* Score principal */}
      <View style={styles.hero}>
        <Label color={colors.textOnDarkMuted}>Score final</Label>
        <Text style={styles.score}>{result.score}</Text>
        <Badge label={`${result.correct_count}/${result.total_questions} bonnes · ${pct}%`} tone="gold" />
        {result.level_unlocked ? (
          <View style={styles.levelUp}>
            <Heading color={colors.gold400}>🎉 Niveau {result.level_after} atteint !</Heading>
            {result.unlocked_difficulty ? (
              <Body color={colors.cream}>
                Difficulté « {result.unlocked_difficulty} » débloquée
              </Body>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* Stats */}
      <View style={styles.stats}>
        <Stat label="XP gagné" value={`+${result.xp_earned}`} />
        <Stat label="Bonus vitesse" value={`+${result.speed_bonus ?? 0}`} />
        <Stat label="Série max" value={`🔥 ${result.streak_max ?? 0}`} />
      </View>

      {/* Récapitulatif */}
      <Heading color={colors.cream} style={styles.sectionTitle}>
        Récapitulatif
      </Heading>
      {review.length ? (
        review.map((r, i) => {
          const correct = r.is_correct;
          return (
            <Card key={r.question_id || i} style={styles.reviewCard}>
              <View style={styles.reviewHead}>
                <Body style={styles.reviewIcon}>{correct ? '✅' : '❌'}</Body>
                <Body style={styles.flex}>Question {i + 1}</Body>
                <Badge
                  label={correct ? 'Correct' : 'Faux'}
                  tone={correct ? 'green' : 'red'}
                />
              </View>
              {r.explanation ? (
                <Body muted style={styles.explanation}>
                  {r.explanation}
                </Body>
              ) : null}
            </Card>
          );
        })
      ) : (
        <Card>
          <Body muted>Récapitulatif indisponible.</Body>
        </Card>
      )}

      <View style={styles.actions}>
        <Button title="Rejouer 🔁" onPress={replay} />
        <Button
          title="Accueil"
          variant="ghost"
          onPress={goHome}
          style={{ marginTop: spacing.md }}
        />
      </View>
    </Screen>
  );
}

function Stat({ label, value }) {
  return (
    <Card dark style={styles.statCard}>
      <Heading color={colors.gold400}>{value}</Heading>
      <Label color={colors.textOnDarkMuted}>{label}</Label>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  score: {
    fontFamily: fonts.titleBold,
    fontSize: 72,
    color: colors.cream,
    lineHeight: 80,
  },
  levelUp: { alignItems: 'center', marginTop: spacing.md, gap: spacing.xs },
  stats: { flexDirection: 'row', gap: spacing.sm, marginVertical: spacing.lg },
  statCard: { flex: 1, alignItems: 'center', gap: spacing.xs },
  sectionTitle: { marginBottom: spacing.md },
  reviewCard: { marginBottom: spacing.sm },
  reviewHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reviewIcon: { fontSize: fontSizes.lg },
  explanation: { marginTop: spacing.sm, fontSize: fontSizes.sm },
  actions: { marginTop: spacing.lg },
});
