'use strict';

const os = require('os');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const settingsModel = require('../models/settings.model');
const { pool } = require('../config/database');
const { redis } = require('../config/redis');

/**
 * Paramètres applicatifs & feature flags (console §Paramètres).
 *
 * Flags ÉDITABLES (persistés en base) : maintenance, inscriptions, delta sync,
 * mode démo. Flag VERROUILLÉ : tournois payants — piloté par variable d'env
 * (FEATURE_TOURNAMENTS_PAID_ENABLED), non modifiable depuis l'admin tant que la
 * licence n'est pas obtenue (CDC §3.6 / §6).
 */

const FLAG_DEFS = [
  { key: 'maintenance_mode', label: 'Mode maintenance', default: false, editable: true,
    desc: 'Les joueurs voient une page de maintenance. Bannière rouge dans l’admin.' },
  { key: 'registration_open', label: 'Inscription ouverte', default: true, editable: true,
    desc: 'Désactiver pour fermer temporairement les inscriptions joueurs.' },
  { key: 'delta_sync_enabled', label: 'Delta sync questions', default: true, editable: true,
    desc: 'Synchronisation automatique des questions sur les appareils.' },
  { key: 'demo_mode', label: 'Mode démo', default: false, editable: true,
    desc: 'Utilise des données de démonstration pour les présentations produit.' },
];

/** Liste tous les flags (valeurs persistées + verrou tournois payants depuis l'env). */
async function getFlags() {
  const stored = await settingsModel.getAll();
  const map = Object.fromEntries(stored.map((r) => [r.key, r.value]));
  const editable = FLAG_DEFS.map((f) => ({
    key: f.key,
    label: f.label,
    description: f.desc,
    editable: true,
    enabled: typeof map[f.key] === 'boolean' ? map[f.key] : f.default,
  }));
  // Flag verrouillé (lecture seule) — source : variable d'environnement.
  editable.push({
    key: 'tournaments_paid_enabled',
    label: 'Tournois payants',
    description: 'Requiert une licence du Ministère des Finances (CDC §6).',
    editable: false,
    locked: true,
    enabled: env.features.tournamentsPaidEnabled,
  });
  return editable;
}

/** Modifie un flag éditable (valeur booléenne). */
async function setFlag(key, enabled, actorId) {
  const def = FLAG_DEFS.find((f) => f.key === key);
  if (!def) throw new ApiError('VALIDATION_ERROR', { message: `Flag inconnu ou verrouillé : ${key}.` });
  await settingsModel.set(key, !!enabled, actorId);
  return getFlags();
}

/** Métriques système temps réel (carte « État des services » & « Ressources »). */
async function getSystemMetrics() {
  const out = {
    node: { version: process.version, uptime_s: Math.floor(process.uptime()) },
    memory: {},
    db: { pool_total: pool.totalCount, pool_idle: pool.idleCount, pool_waiting: pool.waitingCount, max: env.db.poolMax },
    redis: { status: redis.status, keys: null, latency_ms: null },
    pg: { version: null, latency_ms: null, connections: null },
  };

  const mem = process.memoryUsage();
  out.memory = {
    rss: mem.rss,
    heap_used: mem.heapUsed,
    heap_total: mem.heapTotal,
    system_total: os.totalmem(),
  };

  // Postgres : version + latence + connexions actives.
  try {
    const t0 = Date.now();
    const v = await pool.query('SELECT version() AS v, (SELECT count(*)::int FROM pg_stat_activity) AS conns');
    out.pg.latency_ms = Date.now() - t0;
    out.pg.version = (v.rows[0].v || '').split(' ').slice(0, 2).join(' ');
    out.pg.connections = v.rows[0].conns;
  } catch (e) {
    out.pg.error = e.message;
  }

  // Redis : latence (PING) + nombre de clés (DBSIZE).
  try {
    const t0 = Date.now();
    await redis.ping();
    out.redis.latency_ms = Date.now() - t0;
    out.redis.keys = await redis.dbsize();
    out.redis.status = 'ready';
  } catch (e) {
    out.redis.error = e.message;
  }

  return out;
}

/** Statut des intégrations (présence de configuration, sans exposer de secret). */
function getIntegrations() {
  const tw = env.twilio || {};
  const push = env.push || {};
  const pay = env.payments || {};
  const configured = (...vals) => vals.every((v) => !!v);
  return [
    {
      key: 'twilio',
      label: 'Twilio (SMS OTP)',
      configured: configured(tw.accountSid, tw.authToken),
      detail: tw.fromNumber ? `Numéro émetteur : ${tw.fromNumber}` : 'Numéro émetteur non défini',
      testable: 'sms',
    },
    {
      key: 'fcm',
      label: 'Firebase FCM (Push)',
      configured: configured(push.fcmServerKey),
      detail: push.fcmProjectId ? `Projet : ${push.fcmProjectId}` : 'Projet FCM non défini',
      testable: 'push',
    },
    {
      key: 'campay',
      label: 'Campay / CinetPay (Paiements)',
      configured: configured(pay.campay && pay.campay.apiKey),
      detail: 'Sera configuré à l’activation des tournois payants.',
      testable: null,
    },
  ];
}

module.exports = { FLAG_DEFS, getFlags, setFlag, getSystemMetrics, getIntegrations };
