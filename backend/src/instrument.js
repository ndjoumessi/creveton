'use strict';

/**
 * Initialisation Sentry (crash/erreur analytics backend).
 *
 * DOIT être requis EN PREMIER, avant tout autre module applicatif (server.js /
 * app.js) — Sentry auto-instrumente Express/HTTP au chargement.
 *
 * INERTE tant qu'aucun DSN n'est fourni : sans `SENTRY_DSN`, `Sentry.init`
 * s'initialise en client no-op (aucune requête réseau). Le compte Sentry n'existe
 * pas encore ; ce fichier n'attend plus que la variable d'environnement.
 *
 * Variables (à définir par service Railway, jamais en dur) :
 *   SENTRY_DSN  — DSN du projet (absent = désactivé).
 *   SENTRY_ENV  — 'staging' | 'production' (Railway lance staging ET prod avec
 *                 NODE_ENV=production : ce tag distinct sépare les environnements).
 */

require('dotenv').config();
const Sentry = require('@sentry/node');

const dsn = process.env.SENTRY_DSN;

Sentry.init({
  dsn, // undefined ⇒ client no-op, rien n'est envoyé
  // Jamais en test ni sans DSN. En dev local (NODE_ENV=development) : seulement
  // si un DSN est explicitement posé (rare) — sinon inerte.
  enabled: !!dsn && process.env.NODE_ENV !== 'test',
  environment: process.env.SENTRY_ENV || process.env.NODE_ENV || 'development',
  // Tracing désactivé au départ (capture d'erreurs uniquement) — à remonter plus tard.
  tracesSampleRate: 0,
});

module.exports = Sentry;
