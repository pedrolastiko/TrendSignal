import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectRegister: false,
      registerType: 'prompt',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
      },
      devOptions: {
        enabled: false,
        type: 'module',
      },
      includeAssets: ['icons/favicon-16.png', 'icons/favicon-32.png'],
      manifest: {
        id: '.',
        name: 'TrendSignal',
        short_name: 'TrendSignal',
        description:
          'Veille de marché pilotée par mots-clés pour les cabinets de conseil, la tech et la cybersécurité.',
        lang: 'fr',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'portrait-primary',
        background_color: '#F8FAFC',
        theme_color: '#0F172A',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icons/icon-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  base: mode === 'production' ? (process.env.VITE_BASE_PATH ?? '/') : '/',
}));
