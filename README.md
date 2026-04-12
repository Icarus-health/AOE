# AOE — Age of Emperors PWA

A modernised, installable PWA build of the open-source Age of Empires 1
clone [`epoch-of-emperors`](https://github.com/andrzejkrecicki/epoch-of-emperors).
The original project ships ~13k lines of vanilla ES6/7 with a hand-rolled
Canvas renderer; this repository wraps it in a Vite toolchain, adds a CPU
opponent, sound effects, hotkeys and offline support.

## What's new

| Area               | Module                                       | Description                                                                |
|--------------------|----------------------------------------------|----------------------------------------------------------------------------|
| Build toolchain    | `vite.config.js`, `package.json`             | Webpack 3 + Babel 6 → Vite 5 + `vite-plugin-pwa`                           |
| AI opponent        | `src/engine/ai/ai_player.js`                 | Build-order driven: building → expanding → attacking + reactive defence   |
| **Lockstep netplay** | `src/engine/netplay/command_queue.js`      | Deterministic command queue with input delay & checksum desync detection   |
| **WebRTC P2P**     | `src/engine/netplay/transport.js`            | Manual-signalling P2P transport (no server) + optional WebSocket relay     |
| **Multiplayer lobby** | `src/ui/multiplayer_lobby.js`             | DOM-overlay lobby with host/join offer-answer flow                         |
| **Seeded RNG**     | `src/engine/rng.js`                          | Mulberry32 PRNG seeded by the host so peers stay in sync                   |
| **Stances**        | `src/engine/stances.js`                      | AoE2-style aggressive / defensive / stand-ground / no-attack               |
| **Town Bell**      | `src/engine/engine.js`                       | Recall every villager to the nearest Town Center with one keystroke       |
| **Formations**     | `src/engine/formations.js`                   | Box / line / flank layout helpers for group moves                          |
| Sound              | `src/audio/audio_manager.js`                 | Preloaded HTMLAudio + procedurally-generated SFX bank                     |
| Hotkeys            | `src/input/hotkeys.js`                       | Camera, control groups, F1..F4 stances, `` ` `` town bell, `M` mute       |
| Responsive canvas  | `src/input/viewport.js`, `src/app.js`        | Stage scales to `window.innerWidth/Height` at boot                         |
| HUD minimap        | `src/ui/minimap.js`                          | Optional DOM-canvas minimap overlay                                        |
| PWA install        | `src/pwa/install.js`                         | Captures `beforeinstallprompt` and surfaces an install button              |
| Frame limiting     | `src/engine/engine.js`                       | requestAnimationFrame loop targeting the engine's `FPS` constant           |

## Multiplayer

The game uses a **lockstep simulation** model — every client runs the same
deterministic engine and only sends commands over the wire (move, build,
recruit, stance, town bell, etc.). Bandwidth scales with player count, not
with simulation complexity, and the model is robust to high latency.

### Connection modes

| Mode             | Setup                                        | When to use                          |
|------------------|----------------------------------------------|--------------------------------------|
| **WebRTC P2P**   | manual offer/answer copy-paste, no server    | default — fast, free, no infra       |
| WebSocket relay  | `node scripts/relay_server.js`               | when both peers are behind hard NAT  |
| Local AI match   | none                                         | single-player, drives the same lockstep code path |

### Hosting a game

1. Click **Multiplayer → Host game** in the top-right of the main menu.
2. Copy the generated offer string and send it to your friend (any chat).
3. When they paste it back as an answer, click **Accept answer → Start**.

### Joining

1. Click **Multiplayer → Join game**.
2. Paste the host's offer string, click **Generate Answer**.
3. Send the answer back to the host. The host clicks **Start** and the
   match begins on both clients.

### Why lockstep needs determinism

Every random call that affects the simulation goes through the seeded
RNG in `src/engine/rng.js`. The host shares its seed in the lobby's
`start` message; all peers re-seed identically before frame 0 and stay
in sync until either side issues a non-deterministic operation. To
catch desyncs early the command queue exchanges turn-checksums and
fires `console.error('[netplay] DESYNC at turn ...')` if peers disagree.

## AoE2-style gameplay

See `docs/HOTKEYS.md` for the full key reference.

| Feature       | How to use                                                                       |
|---------------|----------------------------------------------------------------------------------|
| Stances       | Select unit → **F1** Aggressive / **F2** Defensive / **F3** Stand Ground / **F4** No Attack |
| Patrol        | Select unit → **P** → click destination on the map                              |
| Formations    | **Shift+F** cycles Box → Line → Flank for the next group move                   |
| Garrison      | Select unit → **G** to garrison into nearest Tower / Town Center                 |
| Ungarrison    | Select Tower / Town Center → **G** to release everyone                           |
| Town Bell     | Press backtick (**`** `) to recall every villager to the nearest Town Center     |
| Gate          | Build via villager build menu page 2; select gate → **O** to toggle open/closed  |

## Multiplayer

Lockstep WebRTC P2P with manual offer/answer signalling — no server
required. Step-by-step walkthrough, troubleshooting and TURN/relay
docs in `docs/MULTIPLAYER.md`.

Additional multiplayer features:

- **QR-code signalling** — host's offer / joiner's answer renders as a
  QR code so phones can scan instead of pasting base64.
- **Server browser** — optional WebSocket relay (`scripts/relay_server.js`)
  exposes `/rooms` so peers can discover each other without copy-paste.
- **Spectator mode** — replays boot with `localPeerId = -1`; the
  spectator can never submit commands but sees the same simulation.
- **Replay system** — every match is automatically recorded by the
  `RecordingTransport`. Save via the in-game Replays button → IndexedDB.
- **Pause overlay** — kicks in after 500 ms of stalled simulation so the
  user knows the freeze is the network, not a crash.
- **Latency HUD** — top-right network diagnostics during a real match.
- **Determinism CI** — `tests/determinism.test.js` runs in GitHub Actions
  on every push to guard against `Math.random()` regressions.

## Single-player & UX features

| Feature                | How                                                                          |
|------------------------|------------------------------------------------------------------------------|
| Tutorial               | Auto-launches on first visit; `?tutorial=1` to replay                        |
| Settings menu          | Top-right "Settings" button or **Esc**                                       |
| Save/Load replays      | "Replays" button → save current match, watch any saved replay                |
| In-game chat           | Press **Enter** to focus the chat input (multiplayer only)                    |
| Idle Villager indicator | Bottom-left counter; press **.** to jump to the next idle villager           |
| Build queue            | Hold **Shift** while issuing orders to chain them (move → gather → return)   |
| Damage numbers         | Toggleable in Settings; floats appear over hit entities                       |
| Health bars            | Drawn over every damaged unit / building, not just the selected one          |
| Fog of war             | Subtile-level visibility per player; toggleable via revealMap                |
| Day/night cycle        | Cosmetic blue tint, toggleable in Settings                                   |
| Animated selection ring | Pulsing yellow ring around the selected entity                              |
| Touch / pinch / long-press | Mobile input adapter for the PWA on phones and tablets                  |
| AI personalities       | Balanced / Rusher / Turtle / Boomer profiles with distinct build orders      |
| Civ bonuses            | Greek / Egyptian / Babylonian / Asiatic — each with stat tweaks              |

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
