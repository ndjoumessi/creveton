import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Le backend Creveton écoute par défaut sur :4000 (cf. backend/src/config/env.js).
// En dev, les appels relatifs /api sont proxifiés vers ce backend (évite le CORS).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
