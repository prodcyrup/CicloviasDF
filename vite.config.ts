import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ command }) => {
  // Deploy cleanly on GitHub Pages (/EixoVerde/) while keeping local dev at /
  const base = process.env.VITE_BASE_PATH ?? (command === 'build' ? '/EixoVerde/' : '/');

  return {
    base,
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icons/eixoverde-icon.svg', 'data/ciclomapa-df-pois.geojson'],
        manifest: {
          name: 'EixoVerde — Navegação & Ciclovias',
          short_name: 'EixoVerde',
          description:
            'Navegação GPS inteligente, planejamento seguro em ciclovias e telemetria para patinetes elétricos, e-bikes e bicicletas.',
          theme_color: '#064e3b',
          background_color: '#0b1116',
          display: 'standalone',
          orientation: 'portrait-primary',
          lang: 'pt-BR',
          start_url: base,
          scope: base,
          icons: [
            {
              src: 'icons/eixoverde-icon.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any maskable',
            },
          ],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          runtimeCaching: [
            {
              urlPattern: /\/data\/ciclomapa-df-.*\.geojson$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'eixoverde-geodata-v1',
                expiration: { maxEntries: 6, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
          ],
        },
      }),
    ],
    build: {
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            maplibre: ['maplibre-gl'],
            react: ['react', 'react-dom'],
          },
        },
      },
    },
  };
});
