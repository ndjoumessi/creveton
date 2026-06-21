'use strict';

module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  clearMocks: true,
  // Le scaffold n'ouvre pas de connexions persistantes dans les tests, mais on
  // force la sortie au cas où un module en ouvrirait une à l'avenir.
  forceExit: true,
  collectCoverageFrom: ['src/**/*.js', '!src/server.js'],
};
