// ChallengeScreen — modale « Challenges » présentée depuis Jouer.
// Défier un ami (opponent_id) ou un adversaire aléatoire (opponent_id: null)
// sur un thème/niveau. Le challenger joue en premier (set figé, même seed — API §9).

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t: tr } = useTranslation();
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
      setInputError(tr('challenge.validation.friendIdHint'));
      toast.show({ type: 'error', message: tr('challenge.validation.friendIdRequired') });
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
        {tr('challenge.title')}
      </Title>
      <Body color={colors.textOnDarkMuted} style={styles.subtitle}>
        {tr('challenge.misc.subtitle')}
      </Body>

      {/* Option : défier un ami */}
      <AppCard tone="dark" style={styles.optionCard}>
        <Text style={styles.optionEmoji}>🤝</Text>
        <Text style={styles.optionTitleDark}>{tr('challenge.friend.cardTitle')}</Text>
        <Body color={colors.textOnDarkMuted} style={styles.optionDesc}>
          {tr('challenge.friend.subtitle')}
        </Body>
        {mode === 'friend' ? (
          <View style={styles.friendInput}>
            <AppInput
              label={tr('challenge.placeholder.friendId')}
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
          title={mode === 'friend' ? tr('challenge.friend.send') : tr('challenge.friend.button')}
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
        <Text style={styles.optionTitleCream}>{tr('challenge.random.subtitle')}</Text>
        <AppButton
          variant="secondary"
          title={tr('challenge.random.button')}
          loading={launching && mode === 'random'}
          onPress={() => {
            setMode('random');
            setOpponentId('');
            launch('random');
          }}
        />
      </AppCard>

      {/* Thème */}
      <Text style={styles.sectionTitle}>{tr('challenge.misc.theme')}</Text>
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
      <Text style={styles.sectionTitle}>{tr('challenge.misc.level')}</Text>
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
      <Text style={styles.sectionTitle}>{tr('challenge.active')}</Text>
      <View style={styles.emptyBox}>
        <Text style={styles.emptyEmoji}>⚔️</Text>
        <Body color={colors.textOnDarkMuted} style={styles.emptyText}>
          {tr('challenge.empty.active')}
        </Body>
      </View>

      {/* Défis récents */}
      <Text style={styles.sectionTitle}>{tr('challenge.recent')}</Text>
      <View style={styles.emptyBox}>
        <Text style={styles.emptyEmoji}>🏁</Text>
        <Body color={colors.textOnDarkMuted} style={styles.emptyText}>
          {tr('challenge.empty.recent')}
        </Body>
      </View>

      <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
        <Body color={colors.textOnDarkMuted} style={styles.cancel}>
          {tr('common.cancel')}
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
