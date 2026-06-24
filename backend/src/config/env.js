'use strict';

const dotenv = require('dotenv');

dotenv.config();

/**
 * Lecture centralisée et typée des variables d'environnement.
 * Toute la config passe par ce module — pas de process.env ailleurs.
 */

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function int(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? fallback : n;
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
  port: int(process.env.PORT, 4000),
  apiPrefix: process.env.API_PREFIX || '/api/v1',
  corsOrigin: process.env.CORS_ORIGIN || '*',

  db: {
    url: process.env.DATABASE_URL || null,
    host: process.env.PGHOST || 'localhost',
    port: int(process.env.PGPORT, 5432),
    user: process.env.PGUSER || 'creveton',
    password: process.env.PGPASSWORD || 'creveton',
    database: process.env.PGDATABASE || 'creveton',
    ssl: bool(process.env.PG_SSL, false),
    poolMax: int(process.env.PG_POOL_MAX, 10),
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '1h',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },

  otp: {
    expiresMinutes: int(process.env.OTP_EXPIRES_MINUTES, 10),
    maxAttempts: int(process.env.OTP_MAX_ATTEMPTS, 3),
    resendLimitPerHour: int(process.env.OTP_RESEND_LIMIT_PER_HOUR, 5),
  },

  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    verifyServiceSid: process.env.TWILIO_VERIFY_SERVICE_SID || '',
    fromNumber: process.env.TWILIO_FROM_NUMBER || '',
  },

  // Email transactionnel (Resend) — invitations équipe + parrainage joueur.
  email: {
    apiKey: process.env.RESEND_API_KEY || '',
    from: process.env.EMAIL_FROM || 'Creveton <noreply@creveton.cm>',
    // Base de la console admin pour les liens d'invitation (ADMIN_URL ou legacy ADMIN_BASE_URL).
    adminUrl: (process.env.ADMIN_URL || process.env.ADMIN_BASE_URL || 'https://admin.creveton.cm').replace(/\/$/, ''),
    // Lien profond / store pour le parrainage joueur (?ref=CODE est ajouté).
    appDeepLinkUrl: (process.env.APP_DEEP_LINK_URL || 'https://creveton.cm').replace(/\/$/, ''),
    referralLimitPerDay: int(process.env.REFERRAL_LIMIT_PER_DAY, 10),
  },

  features: {
    tournamentsPaidEnabled: bool(process.env.FEATURE_TOURNAMENTS_PAID_ENABLED, false),
  },

  payments: {
    orangeMoney: {
      apiKey: process.env.ORANGE_MONEY_API_KEY || '',
      apiSecret: process.env.ORANGE_MONEY_API_SECRET || '',
      webhookSecret: process.env.ORANGE_MONEY_WEBHOOK_SECRET || '',
    },
    mtnMomo: {
      apiKey: process.env.MTN_MOMO_API_KEY || '',
      apiSecret: process.env.MTN_MOMO_API_SECRET || '',
      webhookSecret: process.env.MTN_MOMO_WEBHOOK_SECRET || '',
    },
    campay: {
      apiKey: process.env.CAMPAY_API_KEY || '',
      apiSecret: process.env.CAMPAY_API_SECRET || '',
      webhookSecret: process.env.CAMPAY_WEBHOOK_SECRET || '',
    },
  },

  push: {
    fcmServerKey: process.env.FCM_SERVER_KEY || '',
    fcmProjectId: process.env.FCM_PROJECT_ID || '',
  },

  rateLimit: {
    publicPerMin: int(process.env.RATE_LIMIT_PUBLIC_PER_MIN, 100),
    authPerMin: int(process.env.RATE_LIMIT_AUTH_PER_MIN, 500),
  },

  uploads: {
    maxSizeMb: int(process.env.UPLOAD_MAX_SIZE_MB, 5),
    dir: process.env.UPLOAD_DIR || './uploads',
  },
};

module.exports = env;
