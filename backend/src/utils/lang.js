'use strict';

const { SUPPORTED_LANGS, DEFAULT_LANG } = require('./errorCodes');

/**
 * Langue de réponse d'une requête.
 *
 * ─ Une seule source : `Accept-Language` ─
 * C'est la langue de l'interface que l'utilisateur a SOUS LES YEUX. Les deux
 * clients l'envoient explicitement depuis leur propre état i18n, et non depuis
 * les réglages du système : le message d'erreur doit s'accorder avec l'écran qui
 * l'affiche, pas avec la configuration du téléphone.
 *
 * J'avais d'abord prévu un repli sur `req.user.lang` pour les appels
 * authentifiés sans en-tête. Il ne peut pas fonctionner : `authenticate`
 * reconstruit `req.user` depuis le JWT, qui porte `{ sub, role, lvl, sid }` — pas
 * la langue. L'obtenir exigerait une lecture en base à CHAQUE requête, pour un
 * cas de repli. Un repli qui ne se déclenche jamais est pire qu'aucun : il
 * laisse croire que le cas est couvert. Retiré ; le défaut français suffit.
 *
 * ─ Analyse volontairement simple ─
 * On ne gère ni les poids `q=`, ni les sous-tags régionaux au-delà du préfixe :
 * l'API sert deux langues et les clients envoient un code nu. Un parseur RFC
 * 4647 complet serait du code non exercé. `fr-FR`, `en-GB`, `en-US,en;q=0.9`
 * tombent tous juste avec ce simple préfixe.
 */
function langOf(req) {
  const header = req && typeof req.get === 'function' ? req.get('accept-language') : null;
  if (header) {
    for (const part of String(header).split(',')) {
      const tag = part.split(';')[0].trim().toLowerCase();
      const base = tag.split('-')[0];
      if (SUPPORTED_LANGS.includes(base)) return base;
    }
  }

  return DEFAULT_LANG;
}

module.exports = { langOf };
