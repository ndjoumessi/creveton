'use strict';

const ERROR_CODES = require('./errorCodes');
const { messageFor, DEFAULT_LANG } = require('./errorCodes');

/**
 * Erreur applicative normalisée, alignée sur le modèle d'erreur de la spec (§3).
 * Levée partout dans les services/contrôleurs ; capturée par le middleware
 * d'erreurs qui produit l'enveloppe JSON finale.
 *
 * ─ Le message n'est PAS figé à la construction ─
 * Il l'était : `super(opts.message || known.message)` gelait le français au
 * moment du `throw`. Or un service ne connaît pas la requête, donc pas la langue
 * du lecteur. L'instance transporte désormais de quoi RÉSOUDRE le message plus
 * tard (`localize(lang)`), et `.message` garde la version française — c'est elle
 * qui part dans les journaux et les traces Sentry, où le français est la langue
 * de l'équipe.
 *
 * ─ Surcharge de message ─
 * `opts.message` accepte :
 *  · une chaîne — message monolingue. Réservé à ce que l'utilisateur final ne
 *    lit pas (diagnostic technique, contexte opérateur) ;
 *  · un objet `{ fr, en }` — message contextuel traduit, à préférer dès qu'un
 *    joueur ou un administrateur peut le lire.
 *
 * Un objet plutôt qu'une clé de catalogue : ces messages sont contextuels (ils
 * interpolent un nom de tournoi, un statut, un minimum de joueurs) et leur texte
 * doit rester lisible LÀ où il est levé. Les extraire dans une table de clés
 * aurait éloigné le texte de son contexte pour un bénéfice nul — ils ne sont
 * réutilisés nulle part.
 */
class ApiError extends Error {
  /**
   * @param {string} code    Code stable du catalogue (§16).
   * @param {object} [opts]
   * @param {string|{fr:string,en:string}} [opts.message] Surcharge du message.
   * @param {Array}  [opts.details] Détails par champ : [{ field, issue, expected }].
   * @param {number} [opts.http]    Surcharge du statut HTTP.
   */
  constructor(code, opts = {}) {
    const known = ERROR_CODES[code] || ERROR_CODES.INTERNAL_ERROR;
    const resolvedCode = ERROR_CODES[code] ? code : 'INTERNAL_ERROR';
    const override = opts.message;

    // `.message` (celui d'Error) = version française : journaux, Sentry, `stack`.
    const frMessage =
      (override && (typeof override === 'string' ? override : override[DEFAULT_LANG])) ||
      known[DEFAULT_LANG];

    super(frMessage);
    this.name = 'ApiError';
    this.code = resolvedCode;
    this.httpStatus = opts.http || known.http;
    this.details = opts.details;
    this.messageOverride = override || null;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Message destiné à l'utilisateur, dans la langue demandée.
   * Une surcharge monolingue est renvoyée telle quelle — c'est le contrat de la
   * forme « chaîne » : l'appelant a choisi de ne pas traduire.
   */
  localize(lang = DEFAULT_LANG) {
    const o = this.messageOverride;
    if (!o) return messageFor(this.code, lang);
    if (typeof o === 'string') return o;
    return o[lang] || o[DEFAULT_LANG] || messageFor(this.code, lang);
  }

  /** Raccourci de construction. */
  static from(code, opts) {
    return new ApiError(code, opts);
  }
}

module.exports = ApiError;
