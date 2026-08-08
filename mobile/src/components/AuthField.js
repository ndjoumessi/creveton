// AuthField — champ de formulaire stable au clavier (fix BUG 1).
//  - Label STATIQUE au-dessus (pas d'animation flottante → pas de re-render).
//  - TextInput NON CONTRÔLÉ (defaultValue) : la frappe n'entraîne aucun
//    re-render du parent, donc le formulaire ne se réinitialise jamais quand
//    le clavier apparaît. La valeur est remontée via onChangeText (à stocker
//    dans un ref côté écran).
//  - Seul l'état de focus (bordure) est local à ce champ.

import React, { forwardRef, useState, useMemo } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff } from 'lucide-react-native';
import Icon from './Icon';
import { fonts, fontSizes, radius, spacing } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';

const AuthField = forwardRef(function AuthField(
  {
    label,
    defaultValue,
    onChangeText,
    error,
    rightToggle, // { active, onToggle } — active = mot de passe visible
    style,
    ...inputProps
  },
  ref
) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [focused, setFocused] = useState(false);
  const borderColor = error
    ? colors.red400
    : focused
      ? colors.green500
      : colors.borderInput;

  return (
    <View style={[styles.container, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.field, { borderColor }]}>
        <TextInput
          ref={ref}
          defaultValue={defaultValue}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          {...inputProps}
        />
        {rightToggle ? (
          // Le libellé était figé en français ET annonçait les deux actions à la
          // fois (« Afficher/Masquer ») : un lecteur d'écran ne disait donc jamais
          // ce que l'appui allait réellement faire. Localisé, et l'état courant
          // décide du verbe.
          <Pressable
            onPress={rightToggle.onToggle}
            hitSlop={10}
            style={styles.toggle}
            accessibilityRole="button"
            accessibilityLabel={t(rightToggle.active ? 'a11y.hidePassword' : 'a11y.showPassword')}
          >
            <Icon
              icon={rightToggle.active ? EyeOff : Eye}
              size={20}
              color={colors.textDark}
            />
          </Pressable>
        ) : null}
      </View>
      {/* L'erreur apparaît APRÈS coup, sous un champ que l'utilisateur vient de
          quitter : sans région live, elle n'est jamais annoncée et la validation
          reste purement visuelle. */}
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
});

const makeStyles = (colors) => StyleSheet.create({
  container: { marginBottom: spacing.lg },
  label: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1.5,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
  },
  input: {
    flex: 1,
    height: '100%',
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.base,
    color: colors.textDark,
  },
  toggle: { paddingLeft: spacing.sm },
  error: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,
    color: colors.red400,
    marginTop: spacing.xs,
    marginLeft: spacing.xs,
  },
});

export default AuthField;
