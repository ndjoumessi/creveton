// SessionDetailScreen — détail d'une partie jouée (API GET /sessions/:id).
// En-tête (thème/niveau/mode, date, score, ✓ X/N, XP) puis review par question :
// options rendues via AnswerOption en LECTURE SEULE (mêmes couleurs que le quiz —
// vert = bonne réponse, rouge = choix erroné), temps de réponse, explication.
// Contenu localisé FR/EN (repli FR) via utils/i18n. La révélation des bonnes
// réponses/explications est autorisée ici (partie déjà soumise — même règle
// anti-triche que le review[] de /sessions/submit).

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Clock, Lightbulb } from 'lucide-react-native';
import Icon from '../components/Icon';
import {
  Screen,
  Title,
  Heading,
  Body,
  Label,
  AppCard,
  ThemeBadge,
  LevelBadge,
  AnswerOption,
  Skeleton,
  ErrorScreen,
} from '../components';
import { sessions } from '../services/endpoints';
import { parseApiError } from '../services/api';
import { useTheme } from '../hooks/useTheme';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { getQuestionText, getOptionText, normalizeLang } from '../utils/i18n';
import { themeEmoji, themeLabel, formatDateTime } from '../utils/format';
import { radius, spacing } from '../constants/theme';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const fmt = (n) => Number(n || 0).toLocaleString('fr-FR');

// État visuel d'une option en relecture : bonne réponse → vert, choix erroné du
// joueur → rouge, reste neutre. Aucune interaction (disabled).
function optionState(optionIndex, correctIndex, selectedIndex) {
  if (optionIndex === correctIndex) return 'correct';
  if (optionIndex === selectedIndex) return 'incorrect';
  return 'idle';
}

// Une question relue : énoncé + options colorées + méta (temps, explication).
function ReviewQuestion({ item, index, lang, styles, colors }) {
  const { t } = useTranslation();
  const questionText = getQuestionText(item, lang) || t('sessionDetail.questionN', { n: index + 1 });
  const options = Array.isArray(item.options) ? item.options : [];
  const explanation =
    lang === 'en' && item.explanation_en ? item.explanation_en : item.explanation;
  const elapsed = item.elapsed_ms != null ? (item.elapsed_ms / 1000).toFixed(1) : null;
  const skipped = item.selected_index == null;

  return (
    <AppCard tone="light" padding="md" radius={radius.lg} style={styles.qCard}>
      <View style={styles.qHead}>
        <Label color={colors.textMuted}>{t('sessionDetail.questionN', { n: index + 1 })}</Label>
        {skipped ? (
          <Label color={colors.red400}>{t('sessionDetail.skipped')}</Label>
        ) : null}
      </View>
      <Body weight="semibold" style={styles.qText}>{questionText}</Body>

      <View style={styles.options}>
        {options.map((opt, i) => {
          const idx = opt.index ?? i;
          return (
            <AnswerOption
              key={idx}
              letter={LETTERS[i] || '•'}
              text={getOptionText(opt, lang)}
              state={optionState(idx, item.correct_index, item.selected_index)}
              selected={idx === item.selected_index}
              disabled
            />
          );
        })}
      </View>

      {elapsed != null ? (
        <View style={styles.metaRow}>
          <Icon icon={Clock} size={13} color={colors.textFaint} />
          <Label color={colors.textFaint}>{t('sessionDetail.answerTime', { s: elapsed })}</Label>
        </View>
      ) : null}

      {explanation ? (
        <View style={styles.explRow}>
          <Icon icon={Lightbulb} size={14} color={colors.textMuted} />
          <Body size="sm" color={colors.textMuted} style={styles.explFlex}>{explanation}</Body>
        </View>
      ) : null}
    </AppCard>
  );
}

export default function SessionDetailScreen({ navigation, route }) {
  const { t, i18n } = useTranslation();
  const lang = normalizeLang(i18n.language);
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { isOffline } = useNetworkStatus();
  const sessionId = route.params?.sessionId;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!sessionId) {
      setError(t('sessionDetail.notFound'));
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await sessions.detail(sessionId);
      setData(res);
    } catch (e) {
      setError(parseApiError(e).message);
    } finally {
      setLoading(false);
    }
  }, [sessionId, t]);

  useEffect(() => { load(); }, [load]);

  const review = Array.isArray(data?.review) ? data.review : [];
  const hasTheme = !!data?.theme;

  return (
    <Screen dark={false} scroll padded edges={['top']} statusBarStyle="dark-content">
      {/* En-tête de navigation */}
      <View style={styles.nav}>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          hitSlop={10}
          style={styles.back}
        >
          <Icon icon={ChevronLeft} size={26} color={colors.textDark} />
        </Pressable>
        <Heading>{t('sessionDetail.title')}</Heading>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <Skeleton width="100%" height={120} radius={radius.lg} />
          <Skeleton width="100%" height={160} radius={radius.lg} style={styles.skelGap} />
          <Skeleton width="100%" height={160} radius={radius.lg} style={styles.skelGap} />
        </View>
      ) : error ? (
        <ErrorScreen
          inline
          dark={false}
          message={isOffline ? t('sessionDetail.offline') : error}
          onRetry={isOffline ? undefined : load}
        />
      ) : (
        <>
          {/* En-tête de partie */}
          <AppCard tone="light" padding="md" radius={radius.xl} style={styles.header}>
            <View style={styles.headTop}>
              {hasTheme ? (
                <ThemeBadge theme={data.theme} />
              ) : (
                <View style={styles.modeTag}>
                  <Body weight="semibold" size="sm" color={colors.green700}>
                    {t(`gameStart.modes.${data.mode}.name`, { defaultValue: data.mode })}
                  </Body>
                </View>
              )}
              {data.level ? <LevelBadge level={data.level} variant="soft" /> : null}
            </View>
            {hasTheme ? (
              <Body size="sm" color={colors.textMuted}>
                {themeEmoji(data.theme)} {themeLabel(data.theme)}
              </Body>
            ) : null}
            <Label color={colors.textFaint} style={styles.date}>
              {formatDateTime(data.played_at)}
            </Label>

            <View style={styles.stats}>
              <View style={styles.stat}>
                <Title size="xl" color={colors.gold500}>{fmt(data.score)}</Title>
                <Label color={colors.textMuted}>{t('sessionDetail.score')}</Label>
              </View>
              <View style={styles.stat}>
                <Title size="xl">{data.correct_count}/{data.question_count}</Title>
                <Label color={colors.textMuted}>{t('sessionDetail.correct')}</Label>
              </View>
              <View style={styles.stat}>
                <Title size="xl" color={colors.green500}>+{fmt(data.xp_earned)}</Title>
                <Label color={colors.textMuted}>{t('common.xp')}</Label>
              </View>
            </View>
          </AppCard>

          {/* Review par question */}
          {review.length ? (
            review.map((item, i) => (
              <ReviewQuestion
                key={item.question_id || i}
                item={item}
                index={i}
                lang={lang}
                styles={styles}
                colors={colors}
              />
            ))
          ) : (
            <Body muted style={styles.emptyReview}>{t('sessionDetail.noReview')}</Body>
          )}
        </>
      )}
    </Screen>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
    nav: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
    back: { marginLeft: -spacing.xs },
    loadingWrap: { gap: 0 },
    skelGap: { marginTop: spacing.md },
    header: { marginBottom: spacing.md },
    headTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
    modeTag: {
      backgroundColor: colors.successBgSoft,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xxs,
    },
    date: { marginTop: spacing.xs },
    stats: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    stat: { alignItems: 'center', gap: spacing.xxs },
    qCard: { marginBottom: spacing.md },
    qHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
    qText: { marginBottom: spacing.md, lineHeight: 22 },
    options: { gap: spacing.sm },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md },
    explRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs, marginTop: spacing.sm },
    explFlex: { flex: 1, lineHeight: 18 },
    emptyReview: { textAlign: 'center', marginTop: spacing.xl },
  });
