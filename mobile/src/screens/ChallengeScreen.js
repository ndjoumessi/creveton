// ChallengeScreen — défier un ami (opponent_id) ou un adversaire aléatoire
// (opponent_id: null) sur un thème/niveau (API §9).

import React, { useState } from 'react';
import { View, StyleSheet, Pressable, Text } from 'react-native';
import {
  Screen,
  Title,
  Heading,
  Body,
  Label,
  Card,
  Button,
  Input,
} from '../components';
import { THEMES, LEVELS } from '../constants/config';
import { challenges as challengesApi } from '../services/endpoints';
import { useGameStore } from '../store/gameStore';
import { parseApiError } from '../services/api';
import { colors, fonts, fontSizes, radius, spacing } from '../constants/theme';

export default function ChallengeScreen({ navigation }) {
  const [mode, setMode] = useState('random'); // random | friend
  const [opponentId, setOpponentId] = useState('');
  const [theme, setTheme] = useState('culture');
  const [level, setLevel] = useState('intermediate');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const startGame = useGameStore((s) => s.startGame);

  const onCreate = async () => {
    setError(null);
    if (mode === 'friend' && !opponentId.trim()) {
      setError("Indique l'identifiant de ton ami.");
      return;
    }
    setLoading(true);
    try {
      const resp = await challengesApi.create({
        opponent_id: mode === 'friend' ? opponentId.trim() : null,
        theme,
        level,
        stake: 0, // stake > 0 réservé v2 (flag payant)
      });
      // Le challenger joue en premier avec le set figé (même seed).
      const questions = resp.questions || [];
      startGame({ mode: 'challenge', theme, level, questions });
      setLoading(false);
      navigation.replace('Quiz');
    } catch (e) {
      setLoading(false);
      setError(parseApiError(e).message);
    }
  };

  return (
    <Screen dark scroll>
      <View style={styles.handle} />
      <Title color={colors.cream} style={styles.title}>
        ⚔️ Lancer un défi
      </Title>
      <Body color={colors.textOnDarkMuted} style={styles.subtitle}>
        Affronte un ami ou un adversaire de ton niveau. Le gagnant empoche +25 % d'XP.
      </Body>

      {/* Type d'adversaire */}
      <View style={styles.modeRow}>
        <ModeCard
          active={mode === 'random'}
          emoji="🎲"
          label="Aléatoire"
          desc="Même niveau"
          onPress={() => setMode('random')}
        />
        <ModeCard
          active={mode === 'friend'}
          emoji="🤝"
          label="Un ami"
          desc="Par identifiant"
          onPress={() => setMode('friend')}
        />
      </View>

      {mode === 'friend' ? (
        <Input
          label="Identifiant de l'ami"
          placeholder="ex. a77b-..."
          value={opponentId}
          onChangeText={setOpponentId}
          autoCapitalize="none"
          style={styles.input}
        />
      ) : null}

      {/* Thème */}
      <Heading color={colors.cream} style={styles.sectionTitle}>
        Thème
      </Heading>
      <View style={styles.chips}>
        {THEMES.map((t) => {
          const active = t.key === theme;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTheme(t.key)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {t.emoji} {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Niveau */}
      <Heading color={colors.cream} style={styles.sectionTitle}>
        Niveau
      </Heading>
      <View style={styles.chips}>
        {LEVELS.map((l) => {
          const active = l.key === level;
          return (
            <Pressable
              key={l.key}
              onPress={() => setLevel(l.key)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {l.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {error ? (
        <Body color={colors.red400} style={styles.error}>
          {error}
        </Body>
      ) : null}

      <Button
        title="Créer le défi ⚔️"
        onPress={onCreate}
        loading={loading}
        style={styles.cta}
      />
      <Pressable onPress={() => navigation.goBack()}>
        <Body color={colors.textOnDarkMuted} style={styles.cancel}>
          Annuler
        </Body>
      </Pressable>
    </Screen>
  );
}

function ModeCard({ active, emoji, label, desc, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.modeCard, active && styles.modeCardActive]}
    >
      <Text style={styles.modeEmoji}>{emoji}</Text>
      <Text style={[styles.modeLabel, active && styles.modeLabelActive]}>
        {label}
      </Text>
      <Text style={styles.modeDesc}>{desc}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderOnDark,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  title: { marginBottom: spacing.sm },
  subtitle: { marginBottom: spacing.lg },
  modeRow: { flexDirection: 'row', gap: spacing.sm },
  modeCard: {
    flex: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.cardOnDark,
    borderWidth: 1.5,
    borderColor: colors.borderOnDark,
    padding: spacing.md,
    alignItems: 'center',
    gap: 4,
  },
  modeCardActive: { borderColor: colors.gold400, backgroundColor: colors.green700 },
  modeEmoji: { fontSize: 32 },
  modeLabel: {
    fontFamily: fonts.titleSemiBold,
    fontSize: fontSizes.md,
    color: colors.cream,
  },
  modeLabelActive: { color: colors.gold400 },
  modeDesc: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,
    color: colors.textOnDarkMuted,
  },
  input: { marginTop: spacing.md },
  sectionTitle: { marginTop: spacing.lg, marginBottom: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.cardOnDark,
    borderWidth: 1.5,
    borderColor: colors.borderOnDark,
  },
  chipActive: { borderColor: colors.gold400, backgroundColor: colors.green700 },
  chipText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.sm,
    color: colors.textOnDarkMuted,
  },
  chipTextActive: { color: colors.gold400 },
  error: { marginTop: spacing.md },
  cta: { marginTop: spacing.lg },
  cancel: { textAlign: 'center', marginTop: spacing.md },
});
