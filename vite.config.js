import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/world-cup-2026-predictor/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'World Cup Predictor',
        short_name: 'WC Predictor',
        description: 'Transparent World Cup 2026 predictions with Dixon-Coles model',
        theme_color: '#0d1f14',
        background_color: '#0d1f14',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/world-cup-2026-predictor/',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /\/data\/.+\.json$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'data-cache',
              expiration: {
                maxAgeSeconds: 1800, // 30 minutes
              },
            },
          },
        ],
      },
    }),
  ],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  test: {
    // vitest configuration
    include: ['src/**/__tests__/**/*.test.js', 'scripts/**/__tests__/**/*.test.js'],
  },
});
