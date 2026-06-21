'use strict';

const ApiError = require('./ApiError');

/**
 * Helpers de synchronisation incrémentale (delta sync — spec §5, CDC §2.8).
 *
 * Le client envoie `since` (son `last_sync_at`). Le serveur renvoie ce qui a
 * changé : new[] (créées après), updated[] (modifiées depuis), deleted_ids[]
 * (soft-deletées / dé-publiées), et `synced_at` à restocker comme nouveau
 * `last_sync_at`.
 */

/**
 * Parse et valide un timestamp ISO 8601.
 * @param {string|Date} value
 * @returns {Date}
 * @throws {ApiError} INVALID_TIMESTAMP si absent ou mal formé (spec §5).
 */
function parseSince(value) {
  if (value === undefined || value === null || value === '') {
    throw new ApiError('INVALID_TIMESTAMP', { message: 'Le paramètre « since » est requis.' });
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError('INVALID_TIMESTAMP');
  }
  return date;
}

/** Normalise une date (Date | string | timestamp pg) en chaîne ISO 8601. */
function toIso(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/**
 * Classe les lignes « visibles » modifiées depuis `since` en new[] / updated[].
 *  - new      : created_at > since (la question n'existait pas chez le client)
 *  - updated  : created_at <= since (le client la possède déjà, version à jour)
 *
 * @param {Array<object>} rows  lignes SQL brutes (doivent porter `created_at`).
 * @param {Date|string} since
 * @param {(row:object)=>object} project  projection en vue publique (anti-triche).
 * @returns {{ new: object[], updated: object[] }}
 */
function splitNewUpdated(rows, since, project) {
  const sinceMs = (since instanceof Date ? since : new Date(since)).getTime();
  const fresh = [];
  const updated = [];
  for (const row of rows) {
    const createdMs = new Date(row.created_at).getTime();
    (createdMs > sinceMs ? fresh : updated).push(project(row));
  }
  return { new: fresh, updated };
}

/**
 * Assemble la réponse complète du delta sync (contrat §5).
 * @returns {{ new: object[], updated: object[], deleted_ids: string[], synced_at: string }}
 */
function buildDeltaResponse({ rows, deletedIds, since, syncedAt, project }) {
  const { new: fresh, updated } = splitNewUpdated(rows, since, project);
  return {
    new: fresh,
    updated,
    deleted_ids: deletedIds,
    synced_at: toIso(syncedAt),
  };
}

module.exports = { parseSince, toIso, splitNewUpdated, buildDeltaResponse };
