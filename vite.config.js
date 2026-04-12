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
    rollupOptions: {
      output: {
        // Split rarely-used UI panels and the netplay layer into their
        // own chunks so the first-paint payload only ships the engine
        // and the menu code path.
        manualChunks: {
          'netplay': [
            'src/engine/netplay/transport.js',
            'src/engine/netplay/replay.js',
            'src/engine/netplay/command_queue.js',
          ],
          'ui-panels': [
            'src/ui/multiplayer_lobby.js',
            'src/ui/lobby_browser.js',
            'src/ui/replay_panel.js',
            'src/ui/settings_menu.js',
            'src/ui/qr_code.js',
          ],
          'engine-fog': [
            'src/engine/fog_of_war.js',
          ],
          'tests': [
            'src/tests/runner.js',
            'src/tests/test.js',
            'src/tests/buildings_tests.js',
            'src/tests/interaction_tests.js',
            'src/tests/resource_tests.js',
          ],
        },
      },
    },
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
