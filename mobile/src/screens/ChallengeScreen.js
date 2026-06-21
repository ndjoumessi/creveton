// ChallengeScreen — modale « Challenges » présentée depuis Jouer.
// Défier un ami (opponent_id) ou un adversaire aléatoire (opponent_id: null)
// sur un thème/niveau. Le challenger joue en premier (set figé, même seed — API §9).

import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Text,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Screen, Title, Body, AppCard, AppButton, AppInput, useToast } from '../components';
import { THEMES, LEVELS } from '../constants/config';
import { challenges } from '../services/endpoints';
import { useGameStore } from '../store/gameStore';
import { parseApiError } from '../services/api';
import { colors, fonts, fontSizes, radius, spacing } from '../constants/theme';

export default function ChallengeScreen({ navigation }) {
  const toast = useToast();
  const startGame = useGameStore((s) => s.startGame);

  const [mode, setMode] = useState(null); // 'friend' | 'random' | null
  const [opponentId, setOpponentId] = useState('');
  const [theme, setTheme] = useState(THEMES[0].key);
  const [level, setLevel] = useState(LEVELS[1].key);
  const [inputError, setInputError] = useState(null);
  const [launching, setLaunching] = useState(false);

  const launch = async (selectedMode) => {
    setInputError(null);
    const friend = selectedMode === 'friend';
    const oppId = friend ? opponentId.trim() : null;

    if (friend && !oppId) {
      setInputError("Indique l'identifiant de ton ami.");
      toast.show({ type: 'error', message: "Identifiant de l'ami requis." });
      return;
    }

    setLaunching(true);
    try {
      const res = await challenges.create({
        opponent_id: oppId,
        theme,
        level,
        stake: 0,
      });
      startGame({ mode: 'challenge', theme, level, questions: res.questions || [] });
      setLaunching(false);
      navigation.replace('Quiz');
    } catch (e) {
      setLaunching(false);
      toast.show({ type: 'error', message: parseApiError(e).message });
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Screen dark scroll>
        <View style={styles.handle} />

      <Title color={colors.cream} style={styles.title}>
        Challenges
      </Title>
      <Body color={colors.textOnDarkMuted} style={styles.subtitle}>
        Affronte un ami ou un joueur de ton niveau sur les mêmes questions.
      </Body>

      {/* Option : défier un ami */}
      <AppCard tone="dark" style={styles.optionCard}>
        <Text style={styles.optionEmoji}>🤝</Text>
        <Text style={styles.optionTitleDark}>Envoie un défi à un ami</Text>
        <Body color={colors.textOnDarkMuted} style={styles.optionDesc}>
          Partagez les mêmes questions.
        </Body>
        {mode === 'friend' ? (
          <View style={styles.friendInput}>
            <AppInput
              label="Identifiant de l'ami"
              value={opponentId}
              onChangeText={setOpponentId}
              error={inputError}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        ) : null}
        <AppButton
          variant="primary"
          title={mode === 'friend' ? 'Envoyer le défi' : 'Choisir un ami'}
          loading={launching && mode === 'friend'}
          onPress={() => {
            if (mode !== 'friend') {
              setMode('friend');
              setInputError(null);
              return;
            }
            launch('friend');
          }}
        />
      </AppCard>

      {/* Option : adversaire aléatoire */}
      <AppCard tone="cream" style={styles.optionCard}>
        <Text style={styles.optionEmoji}>🎲</Text>
        <Text style={styles.optionTitleCream}>Affronte un joueur de ton niveau</Text>
        <AppButton
          variant="secondary"
          title="Lancer"
          loading={launching && mode === 'random'}
          onPress={() => {
            setMode('random');
            setOpponentId('');
            launch('random');
          }}
        />
      </AppCard>

      {/* Thème */}
      <Text style={styles.sectionTitle}>Thème</Text>
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
      <Text style={styles.sectionTitle}>Niveau</Text>
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

      {/* Mes challenges en cours */}
      <Text style={styles.sectionTitle}>Mes challenges en cours</Text>
      <View style={styles.emptyBox}>
        <Text style={styles.emptyEmoji}>⚔️</Text>
        <Body color={colors.textOnDarkMuted} style={styles.emptyText}>
          Aucun défi en cours pour l’instant.
        </Body>
      </View>

      {/* Défis récents */}
      <Text style={styles.sectionTitle}>Défis récents</Text>
      <View style={styles.emptyBox}>
        <Text style={styles.emptyEmoji}>🏁</Text>
        <Body color={colors.textOnDarkMuted} style={styles.emptyText}>
          Tes derniers défis apparaîtront ici.
        </Body>
      </View>

      <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
        <Body color={colors.textOnDarkMuted} style={styles.cancel}>
          Annuler
        </Body>
      </Pressable>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderOnDark,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  title: { marginBottom: spacing.sm },
  subtitle: { marginBottom: spacing.xl },

  optionCard: { gap: spacing.sm, marginBottom: spacing.lg, alignItems: 'flex-start' },
  optionEmoji: { fontSize: 48 },
  optionTitleDark: {
    fontFamily: fonts.titleBold,
    fontSize: fontSizes.lg,
    color: colors.cream,
  },
  optionTitleCream: {
    fontFamily: fonts.titleBold,
    fontSize: fontSizes.lg,
    color: colors.green900,
    marginBottom: spacing.xs,
  },
  optionDesc: { marginBottom: spacing.xs },
  friendInput: { alignSelf: 'stretch', marginTop: spacing.xs },

  sectionTitle: {
    fontFamily: fonts.titleSemiBold,
    fontSize: fontSizes.base,
    color: colors.cream,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
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

  emptyBox: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderOnDark,
    backgroundColor: colors.cardOnDark,
    paddingVertical: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyEmoji: { fontSize: 28, opacity: 0.85 },
  emptyText: { textAlign: 'center' },

  cancel: { textAlign: 'center', marginTop: spacing.xl, marginBottom: spacing.sm },
});
