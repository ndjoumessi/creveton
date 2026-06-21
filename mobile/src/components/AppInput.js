// AppInput — label flottant animé, états focus/error/success, helper text,
// slot d'icône à droite (ex. œil pour mot de passe).

import React, { useRef, useState, useEffect } from 'react';
import {
  Animated,
  View,
  TextInput,
  Pressable,
  Text,
  StyleSheet,
} from 'react-native';
import { colors, fonts, fontSizes, radius, spacing } from '../constants/theme';

export default function AppInput({
  label,
  value,
  onChangeText,
  error,
  success = false,
  helperText,
  rightIcon = null,
  onRightIconPress,
  containerStyle,
  style,
  ...props
}) {
  const [focused, setFocused] = useState(false);
  const hasValue = value !== undefined && value !== null && String(value).length > 0;
  const float = useRef(new Animated.Value(hasValue ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(float, {
      toValue: focused || hasValue ? 1 : 0,
      duration: 160,
      useNativeDriver: false,
    }).start();
  }, [focused, hasValue, float]);

  const borderColor = error
    ? colors.errorBorder
    : success
      ? colors.successBorder
      : focused
        ? colors.green500
        : colors.borderInput;

  const labelTop = float.interpolate({ inputRange: [0, 1], outputRange: [17, 7] });
  const labelSize = float.interpolate({
    inputRange: [0, 1],
    outputRange: [fontSizes.base, fontSizes.xs],
  });
  const labelColor = error
    ? colors.errorText
    : focused
      ? colors.green500
      : colors.textMuted;

  return (
    <View style={[styles.container, containerStyle]}>
      <View style={[styles.field, { borderColor }, focused && styles.fieldFocused]}>
        {label ? (
          <Animated.Text
            style={[
              styles.label,
              { top: labelTop, fontSize: labelSize, color: labelColor },
            ]}
            pointerEvents="none"
          >
            {label}
          </Animated.Text>
        ) : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholderTextColor={colors.textFaint}
          style={[styles.input, label && styles.inputWithLabel, style]}
          {...props}
        />
        {rightIcon ? (
          <Pressable onPress={onRightIconPress} hitSlop={10} style={styles.rightIcon}>
            {rightIcon}
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text style={[styles.helper, styles.helperError]}>{error}</Text>
      ) : helperText ? (
        <Text style={styles.helper}>{helperText}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.lg },
  field: {
    minHeight: 56,
    borderRadius: radius.base,
    borderWidth: 1.5,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
  },
  fieldFocused: {
    shadowColor: colors.green500,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 2,
  },
  label: {
    position: 'absolute',
    left: spacing.lg,
    fontFamily: fonts.bodyMedium,
    backgroundColor: 'transparent',
  },
  input: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.base,
    color: colors.textDark,
    paddingVertical: spacing.md,
  },
  inputWithLabel: { paddingTop: 18, paddingBottom: 6 },
  rightIcon: { paddingLeft: spacing.sm },
  helper: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
    marginLeft: spacing.xs,
  },
  helperError: { color: colors.errorText },
});
