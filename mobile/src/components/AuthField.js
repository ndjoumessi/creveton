// AuthField — champ de formulaire stable au clavier (fix BUG 1).
//  - Label STATIQUE au-dessus (pas d'animation flottante → pas de re-render).
//  - TextInput NON CONTRÔLÉ (defaultValue) : la frappe n'entraîne aucun
//    re-render du parent, donc le formulaire ne se réinitialise jamais quand
//    le clavier apparaît. La valeur est remontée via onChangeText (à stocker
//    dans un ref côté écran).
//  - Seul l'état de focus (bordure) est local à ce champ.

import React, { forwardRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { colors, fonts, fontSizes, radius, spacing } from '../constants/theme';

const AuthField = forwardRef(function AuthField(
  {
    label,
    defaultValue,
    onChangeText,
    error,
    rightToggle, // { active, onToggle, on:'🙈', off:'👁' }
    style,
    ...inputProps
  },
  ref
) {
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
          placeholderTextColor={colors.textFaint}
          style={styles.input}
          {...inputProps}
        />
        {rightToggle ? (
          <Pressable onPress={rightToggle.onToggle} hitSlop={10} style={styles.toggle}>
            <Text style={styles.toggleIcon}>
              {rightToggle.active ? rightToggle.on || '🙈' : rightToggle.off || '👁'}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { marginBottom: spacing.lg },
  label: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.sm,
    color: colors.textBody,
    marginBottom: spacing.sm,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1.5,
    backgroundColor: '#f9fafb',
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
  toggleIcon: { fontSize: fontSizes.lg },
  error: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,
    color: colors.red400,
    marginTop: spacing.xs,
    marginLeft: spacing.xs,
  },
});

export default AuthField;
