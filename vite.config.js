import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Serve static assets under /img/ etc. directly from public/
  publicDir: 'public',
  server: {
    host: true,
    port: 5173,
  },
  build: {
    outDir: 'dist',
    // Do not inline assets — keep the gfx.bin / png files as-is so the
    // service worker can cache them efficiently.
    assetsInlineLimit: 0,
    target: 'es2018',
    chunkSizeWarningLimit: 2048,
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: [
        'favicon.svg',
        'icon-192.png',
        'icon-512.png',
      ],
      manifest: {
        name: 'Age of Emperors',
        short_name: 'AoE',
        description:
          'Age of Empires 1 style real-time strategy game, playable offline as a PWA.',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'fullscreen',
        orientation: 'landscape',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // Cache everything the game needs to run offline, including the
        // large gfx.bin asset bundle.
        globPatterns: [
          '**/*.{js,css,html,png,jpg,jpeg,svg,webp,bin,json,mp3,ogg,wav}',
        ],
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|webp|gif)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'aoe-images',
              expiration: {
                maxEntries: 2000,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
          {
            urlPattern: /\.(?:mp3|ogg|wav)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'aoe-audio',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
          {
            urlPattern: /gfx\.(bin|json)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'aoe-gfx-bundle',
              expiration: {
                maxEntries: 4,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
});
