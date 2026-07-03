// Configuration Metro — enveloppe la config Expo par défaut avec le sérialiseur
// Sentry (émet les debug IDs nécessaires à l'upload des source maps au build EAS
// via le plugin @sentry/react-native). Inoffensif sans compte Sentry : sans
// SENTRY_AUTH_TOKEN au build, l'upload est simplement ignoré.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);
