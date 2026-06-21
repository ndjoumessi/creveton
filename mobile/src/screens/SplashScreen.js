// SplashScreen — logo CREVETON, slogan, boutons Jouer / S'inscrire.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Screen, Title, Body, Button } from '../components';
import { colors, fonts, fontSizes, spacing } from '../constants/theme';

export default function SplashScreen({ navigation }) {
  return (
    <Screen dark>
      <View style={styles.container}>
        <View style={styles.brand}>
          <Text style={styles.shrimp}>🦐</Text>
          <Text style={styles.logo}>CREVETON</Text>
          <View style={styles.underline} />
          <Body style={styles.slogan} color={colors.gold400}>
            Le quiz qui réveille ton génie camerounais
          </Body>
        </View>

        <View style={styles.actions}>
          <Button
            title="S'inscrire"
            variant="primary"
            onPress={() => navigation.navigate('Register')}
          />
          <Button
            title="J'ai déjà un compte"
            variant="ghost"
            onPress={() => navigation.navigate('Login')}
            style={{ marginTop: spacing.md }}
          />
        </View>

        <Body style={styles.footer} color={colors.textOnDarkMuted}>
          🇨🇲 Fait au Cameroun · 12–30 ans
        </Body>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'space-between', paddingVertical: spacing.xxl },
  brand: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  shrimp: { fontSize: 88, marginBottom: spacing.md },
  logo: {
    fontFamily: fonts.titleBold,
    fontSize: fontSizes.display,
    color: colors.cream,
    letterSpacing: 4,
  },
  underline: {
    width: 64,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.gold400,
    marginVertical: spacing.md,
  },
  slogan: { textAlign: 'center', fontSize: fontSizes.md, maxWidth: 280 },
  actions: { width: '100%' },
  footer: { textAlign: 'center', marginTop: spacing.lg },
});
