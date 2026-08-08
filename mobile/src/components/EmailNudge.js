// EmailNudge — rappel « confirme ton adresse email », posé en haut de l'accueil.
//
// ─ Pourquoi ici et pas ailleurs ─
// La pastille du profil est passive : elle n'est vue que par qui va déjà dans
// ses réglages, c'est-à-dire pas les joueurs concernés. Le rappel doit venir à
// eux. Trois canaux étaient possibles :
//  · push — demande un ORDONNANCEUR côté serveur, qui n'existe pas dans le
//    projet ; en introduire un pour un seul message est disproportionné ;
//  · email de relance — envoyé à l'adresse justement non prouvée : sans effet
//    dans le cas qui compte (la faute de frappe), et adressé à une boîte qui
//    n'est peut-être pas celle du joueur ;
//  · bandeau dans l'app — vu par définition (le joueur est là), gratuit, et à
//    un geste de la correction. Retenu.
//
// ─ Pression calibrée ─
// Jamais bloquant, jamais rouge : rien n'est cassé, il manque une confirmation.
// Fermable — mais il REVIENT après une semaine, parce que la conséquence, elle,
// ne disparaît pas : sans adresse prouvée, la récupération de mot de passe est
// refusée. Un rappel qu'on peut éteindre définitivement laisserait le joueur
// découvrir le problème le jour où il a perdu son mot de passe.
//
// Se retire tout seul dès que `email_verified` passe à vrai (aucun état local à
// nettoyer : l'affichage est dérivé du profil).

import React, { useEffect, useMemo, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { MailWarning, X } from 'lucide-react-native';
import Icon from './Icon';
import { Body, Label } from './Text';
import { radius, spacing } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';

const DISMISS_KEY = 'crv.email_nudge_dismissed_at';
const SNOOZE_MS = 7 * 24 * 3600 * 1000;

export default function EmailNudge({ user, onPress, style }) {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // Vert du CTA : mesuré sur le voile d'or, `green700` donne 7.67:1 en clair
  // mais 1.55:1 en sombre — invisible. `green300` fait l'inverse (1.72 / 6.92).
  // D'où la bascule, et non un vert unique.
  const ctaColor = isDark ? colors.green300 : colors.green700;

  // `null` = on ne sait pas encore (lecture async) → on n'affiche rien, plutôt
  // qu'un bandeau qui apparaîtrait puis disparaîtrait au premier rendu.
  const [snoozedUntil, setSnoozedUntil] = useState(null);

  const concerned = !!user?.email && user?.email_verified === false;

  useEffect(() => {
    if (!concerned) return;
    let alive = true;
    AsyncStorage.getItem(DISMISS_KEY)
      .then((raw) => {
        if (!alive) return;
        const at = Number(raw) || 0;
        setSnoozedUntil(at ? at + SNOOZE_MS : 0);
      })
      .catch(() => alive && setSnoozedUntil(0));
    return () => {
      alive = false;
    };
  }, [concerned]);

  const dismiss = () => {
    setSnoozedUntil(Date.now() + SNOOZE_MS);
    AsyncStorage.setItem(DISMISS_KEY, String(Date.now())).catch(() => {});
  };

  if (!concerned || snoozedUntil === null || Date.now() < snoozedUntil) return null;

  return (
    <View style={[styles.wrap, style]}>
      <Pressable
        style={styles.main}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${t('home.emailNudge.title')}. ${t('home.emailNudge.body')}`}
        accessibilityHint={t('home.emailNudge.cta')}
      >
        <View style={styles.icon}>
          <Icon icon={MailWarning} size={18} color={colors.green900} />
        </View>
        <View style={styles.text}>
          <Body weight="semibold" size="md" color={colors.textDark}>
            {t('home.emailNudge.title')}
          </Body>
          {/* Le « pourquoi » plutôt que l'injonction : « confirme ton adresse »
              tout court se lit comme une formalité qu'on repousse. */}
          <Label color={colors.textBody} style={styles.body}>
            {t('home.emailNudge.body')}
          </Label>
          <Label weight="bold" color={ctaColor} style={styles.cta}>
            {t('home.emailNudge.cta')}
          </Label>
        </View>
      </Pressable>

      {/* Fermeture séparée du corps : un tap n'importe où ouvrirait la
          vérification, y compris quand on voulait juste écarter le bandeau. */}
      <Pressable
        onPress={dismiss}
        hitSlop={10}
        style={styles.close}
        accessibilityRole="button"
        accessibilityLabel={t('home.emailNudge.dismiss')}
      >
        <Icon icon={X} size={16} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
    // Voile d'or : l'idiome de bandeau d'attention déjà en place dans l'app
    // (bannière hors-ligne des Défis, bandeau gratuit des Tournois). Signale sans
    // alarmer — jamais rouge, rien n'est en panne.
    //
    // Le premier essai posait `surfaceCream`, qui vaut EXACTEMENT le fond de page
    // en clair (#fdf6e9 sur #fdf6e9, ratio 1.00) : le bandeau n'aurait pas existé
    // visuellement, avec pour seule limite une bordure à 1.72:1. Le voile se
    // détache dans les deux thèmes et garde le texte lisible (textDark : 12.4:1
    // en clair, 13.0:1 en sombre).
    wrap: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      backgroundColor: colors.goldVeil,
      borderWidth: 1,
      borderColor: colors.goldVeilBorder,
      borderRadius: radius.lg,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
    },
    main: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, flex: 1 },
    icon: {
      width: 32,
      height: 32,
      borderRadius: radius.pill,
      backgroundColor: colors.pastelYellow,
      alignItems: 'center',
      justifyContent: 'center',
    },
    text: { flex: 1, gap: 2 },
    body: { lineHeight: 18 },
    cta: { marginTop: spacing.xs },
    close: { padding: spacing.xxs },
  });
