'use strict';

const env = require('../src/config/env');
const { resolveTemplateLang } = require('../src/services/whatsappService');

/**
 * Choix de la traduction du modèle WhatsApp.
 *
 * Test unitaire pur (ni Postgres ni Redis) : il tourne donc TOUJOURS, y compris
 * là où les suites d'intégration se sautent faute d'infra. C'est voulu — cette
 * résolution décide si un joueur reçoit son code ou pas, et une erreur ici ne se
 * verrait qu'en production, sous la forme d'un OTP jamais arrivé.
 *
 * La règle est conservatrice : on ne suit la langue du joueur que si une
 * traduction correspondante est DÉCLARÉE approuvée. Meta refuse un modèle dans
 * une langue inconnue de lui, et `otpChannel` basculerait alors sur le canal
 * suivant — un OTP dans la mauvaise langue reste lisible, un OTP absent non.
 */

describe('whatsappService.resolveTemplateLang', () => {
  const initial = {
    lang: env.whatsapp.templateLang,
    langs: env.whatsapp.templateLangs,
  };

  const setup = ({ fallback = 'fr', approved = ['fr'] }) => {
    env.whatsapp.templateLang = fallback;
    env.whatsapp.templateLangs = approved;
  };

  afterAll(() => {
    env.whatsapp.templateLang = initial.lang;
    env.whatsapp.templateLangs = initial.langs;
  });

  test('sans traduction déclarée, le comportement d’avant est préservé', () => {
    // Défaut de `env` : `templateLangs` vaut la seule langue de repli. Un joueur
    // anglophone reçoit donc du français — comme avant ce changement. La
    // régression à éviter serait d’envoyer « en » à un compte Meta qui ne
    // connaît que « fr » : le message serait refusé, pas traduit.
    setup({ fallback: 'fr', approved: ['fr'] });
    expect(resolveTemplateLang('en')).toBe('fr');
    expect(resolveTemplateLang('fr')).toBe('fr');
  });

  test('la langue du joueur est suivie dès qu’elle est approuvée', () => {
    setup({ fallback: 'fr', approved: ['fr', 'en'] });
    expect(resolveTemplateLang('en')).toBe('en');
    expect(resolveTemplateLang('fr')).toBe('fr');
  });

  test('une traduction régionale couvre la langue nue', () => {
    // Meta laisse créer « en_US » plutôt que « en » ; le compte, lui, ne stocke
    // que « en ». Comparer les chaînes entières ferait manquer la traduction et
    // renverrait silencieusement au français.
    setup({ fallback: 'fr', approved: ['fr', 'en_US'] });
    expect(resolveTemplateLang('en')).toBe('en_US');
  });

  test('une langue sans traduction retombe sur le repli', () => {
    setup({ fallback: 'fr', approved: ['fr', 'en'] });
    expect(resolveTemplateLang('de')).toBe('fr');
  });

  test('langue absente, vide ou nulle → repli', () => {
    setup({ fallback: 'fr', approved: ['fr', 'en'] });
    expect(resolveTemplateLang(undefined)).toBe('fr');
    expect(resolveTemplateLang(null)).toBe('fr');
    expect(resolveTemplateLang('   ')).toBe('fr');
  });

  test('le repli n’est pas forcément le français', () => {
    // `WHATSAPP_TEMPLATE_LANG` est un réglage : rien ne doit coder « fr » en dur
    // dans la résolution.
    setup({ fallback: 'en', approved: ['en'] });
    expect(resolveTemplateLang('fr')).toBe('en');
  });
});
