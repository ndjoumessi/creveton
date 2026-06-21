import process from 'node:process';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Le backend Creveton écoute par défaut sur :4000 (cf. backend/src/config/env.js).
// En dev, les appels relatifs /api sont proxifiés vers ce backend (évite le CORS).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // GARDE-FOU SÉCURITÉ : les mocks (et la session démo hors-ligne) ne doivent
  // JAMAIS finir dans un build de production. api.js les borne déjà à
  // import.meta.env.DEV ; on échoue ici de manière bruyante si quelqu'un tente
  // un build prod avec VITE_USE_MOCKS=true (mauvaise configuration).
  if (mode === 'production' && env.VITE_USE_MOCKS === 'true') {
    throw new Error(
      'VITE_USE_MOCKS=true est interdit en build de production (contournement d’authentification). ' +
        'Retirez la variable ou positionnez-la à false avant `npm run build`.',
    );
  }

  return {
    plugins: [react()],
    server: {
      port: 5174,
      proxy: {
        '/api': {
          target: 'http://localhost:4000',
          changeOrigin: true,
        },
        // /health est hors /api/v1 (liveness + infos système pour les Paramètres).
        '/health': {
          target: 'http://localhost:4000',
          changeOrigin: true,
        },
      },
    },
  };
});
