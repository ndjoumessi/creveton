'use strict';

/**
 * Helpers de réponse pour homogénéiser les sorties HTTP.
 */

/** Réponse de succès simple. */
function ok(res, data, status = 200) {
  return res.status(status).json(data);
}

/** Réponse 201 Created. */
function created(res, data) {
  return res.status(201).json(data);
}

/** Réponse 204 No Content. */
function noContent(res) {
  return res.status(204).send();
}

/**
 * Enveloppe paginée par curseur (spec §1 — Pagination).
 * @param {Array}  data
 * @param {object} page { limit, next_cursor, has_more }
 */
function paginated(res, data, page) {
  return res.status(200).json({
    data,
    page: {
      limit: page.limit,
      next_cursor: page.next_cursor ?? null,
      has_more: Boolean(page.has_more),
    },
  });
}

module.exports = { ok, created, noContent, paginated };
