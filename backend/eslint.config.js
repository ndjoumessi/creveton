'use strict';

const js = require('@eslint/js');
const globals = require('globals');

/**
 * Configuration ESLint (flat config) — Creveton backend.
 * Node.js / CommonJS. Règles pragmatiques : on s'appuie sur l'ensemble
 * « recommended » d'ESLint, avec quelques ajustements adaptés au code existant
 * (vars/args préfixés `_` ignorés, await-in-loop toléré là où c'est explicité).
 */
module.exports = [
  {
    ignores: ['node_modules/**', 'coverage/**'],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        fetch: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // Les `await` séquentiels en boucle sont intentionnels ici (migrations,
      // inserts d'import en lot, payout par participant) — règle stylistique off.
      'no-await-in-loop': 'off',
    },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
  },
];
