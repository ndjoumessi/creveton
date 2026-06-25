import process from 'node:process';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

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
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.png', 'favicon.svg', 'icons/*.png'],
        manifest: {
          name: 'Creveton Admin',
          short_name: 'Creveton',
          description: "Console d'administration Creveton — Cockpit Émeraude",
          lang: 'fr',
          theme_color: '#0b2e1a',
          background_color: '#0b2e1a',
          display: 'standalone',
          orientation: 'landscape',
          scope: '/',
          start_url: '/',
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            {
              src: 'icons/icon-512-maskable.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          // SPA : toute route inconnue retombe sur index.html (coquille hors-ligne).
          navigateFallback: '/index.html',
          // Sécurité : ne JAMAIS mettre en cache les réponses API sensibles depuis
          // le SW. NetworkFirst = on tente toujours le réseau d'abord ; le cache
          // (5 min max) ne sert que de repli court en cas de perte réseau.
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/creveton-staging\.up\.railway\.app\/api/,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-cache',
                networkTimeoutSeconds: 10,
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 60 * 5, // 5 minutes
                },
              },
            },
          ],
        },
      }),
    ],
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
        // Fichiers statiques (avatars uploadés) servis par le backend hors /api/v1.
        '/uploads': {
          target: 'http://localhost:4000',
          changeOrigin: true,
        },
      },
    },
  };
});
