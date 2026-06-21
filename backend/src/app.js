'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const env = require('./config/env');
const logger = require('./config/logger');
const requestId = require('./middlewares/requestId');
const rateLimit = require('./middlewares/rateLimit');
const notFound = require('./middlewares/notFound');
const errorHandler = require('./middlewares/errorHandler');
const routes = require('./routes');
const { health } = require('./controllers/health.controller');

const app = express();

// Derrière un proxy/load-balancer (req.ip correct, rate limiting fiable).
app.set('trust proxy', 1);

// --- Sécurité & en-têtes ---
app.use(helmet());

// --- CORS ---
const corsOrigin =
  env.corsOrigin === '*' ? '*' : env.corsOrigin.split(',').map((o) => o.trim());
app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
    exposedHeaders: ['X-Request-Id', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'Retry-After'],
  })
);

// --- Traçabilité (avant les parsers : les erreurs de parsing ont un request_id) ---
app.use(requestId);

// --- Parsers ---
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// --- Logs HTTP ---
morgan.token('id', (req) => req.id);
const morganFormat = env.isProd
  ? ':id :method :url :status :res[content-length] - :response-time ms'
  : 'dev';
app.use(
  morgan(morganFormat, {
    skip: () => env.isTest,
    stream: { write: (msg) => logger.info(msg.trim()) },
  })
);

// --- Health check (hors préfixe versionné) ---
app.get('/health', health);

// --- Rate limiting global par défaut (spec §1) ---
// Limite « authentifiée » plus large ; affinée par route si besoin.
// Désactivé en test pour ne pas dépendre de Redis.
if (!env.isTest) {
  app.use(
    env.apiPrefix,
    rateLimit({
      max: env.rateLimit.authPerMin,
      windowSec: 60,
      prefix: 'rl:global',
    })
  );
}

// --- Routes API versionnées ---
app.use(env.apiPrefix, routes);

// --- 404 + gestion d'erreurs (toujours en dernier) ---
app.use(notFound);
app.use(errorHandler);

module.exports = app;
