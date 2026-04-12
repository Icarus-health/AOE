# AOE — Age of Emperors PWA

A modernised, installable PWA build of the open-source Age of Empires 1
clone [`epoch-of-emperors`](https://github.com/andrzejkrecicki/epoch-of-emperors).
The original project ships ~13k lines of vanilla ES6/7 with a hand-rolled
Canvas renderer; this repository wraps it in a Vite toolchain, adds a CPU
opponent, sound effects, hotkeys and offline support.

## What's new

| Area              | Module                                 | Description                                                          |
|-------------------|----------------------------------------|----------------------------------------------------------------------|
| Build toolchain   | `vite.config.js`, `package.json`       | Webpack 3 + Babel 6 → Vite 5 + `vite-plugin-pwa`                     |
| AI opponent       | `src/engine/ai/ai_player.js`           | Three-state machine: building → expanding → attacking                |
| Sound             | `src/audio/audio_manager.js`           | Preloaded HTMLAudio with persisted volume, music + SFX channels      |
| Hotkeys           | `src/input/hotkeys.js`                 | Camera scroll, control groups (Ctrl+1..9), `M` to mute               |
| Responsive canvas | `src/input/viewport.js`, `src/app.js`  | Stage scales to `window.innerWidth/Height` at boot                   |
| HUD minimap       | `src/ui/minimap.js`                    | Optional DOM-canvas minimap overlay                                  |
| PWA install       | `src/pwa/install.js`                   | Captures `beforeinstallprompt` and surfaces an install button        |
| Frame limiting    | `src/engine/engine.js`                 | requestAnimationFrame loop targeting the engine's `FPS` constant     |

## Quick start

```bash
# 1. Install JS deps
npm install

# 2. Bundle the original sprite atlas (one-off — outputs public/gfx.bin/.json)
npm run bundle-images

# 3. Start the dev server
npm run dev
# → http://localhost:5173

# 4. Production build (with PWA service worker)
npm run build
npm run preview
```

The first build needs Python 3 because `scripts/bundle_images.py` walks the
`public/img` directory and concatenates every PNG into a single binary blob
the runtime decodes via `createImageBitmap` — that's how the original game
avoids 7000+ HTTP requests for sprite frames.

## AI opponent

The CPU player runs a three-state machine evaluated every N engine frames
(N depends on the configured difficulty). On each tick it:

1. **building** — produces villagers, builds town centres / houses /
   storage pits, and routes idle villagers to the closest food → wood →
   gold → stone resource.
2. **expanding** — adds barracks and an archery range, then mass-produces
   infantry and bowmen.
3. **attacking** — once the army is large enough, the AI picks the nearest
   enemy building (or unit, if the enemy has no buildings) and orders
   every soldier at it via the engine's existing `interactOrder` API.

Difficulty (`easy` / `normal` / `hard`) controls how often the AI thinks
and is wired through the in-game difficulty selector in the menu.

## Sound

`audioManager` preloads every entry in the `SOUNDS` map. Failures are
non-fatal: if an asset is missing the call simply no-ops, so the game can
ship without bundled audio and gain it incrementally. Settings (mute,
volume) are persisted to `localStorage` under `aoe-audio-settings`.

Drop royalty-free sounds into `public/audio/{ui,units,actions,buildings,music}/`
to enable them. Sources: OpenGameArt.org, Freesound.org, or AI generation.

## Offline / PWA

`vite-plugin-pwa` is configured with workbox runtime caching for images,
audio and the gfx bundle. After the first visit the app boots fully
offline. The install prompt is wired up in `src/pwa/install.js`.

## Acknowledgements

This is a downstream, modernised fork of
[`andrzejkrecicki/epoch-of-emperors`](https://github.com/andrzejkrecicki/epoch-of-emperors)
— all credit for the underlying RTS engine, art pipeline and game logic
goes to the original author. The original project licence is preserved
in `LICENSE_ORIGINAL`.
