# Multiplayer test walkthrough

This file is the hand-on test guide for the WebRTC peer-to-peer multiplayer
flow. Read it once before playing your first game with a friend so the
manual signalling step does not catch you off guard.

## TL;DR

1. Both players visit the same deployment URL (or `npm run preview` on the
   same network).
2. Host clicks **Multiplayer → Host game**, copies the offer, sends it to
   the friend.
3. Friend clicks **Multiplayer → Join game**, pastes the offer, copies the
   answer, sends it back.
4. Host pastes the answer, clicks **Accept answer → Start**.
5. Both clients run the same deterministic simulation. Have fun.

## Requirements

| Requirement                        | Why                                              |
|------------------------------------|--------------------------------------------------|
| Modern browser with WebRTC         | Chrome / Edge / Firefox / Safari ≥ 14            |
| Stable internet on at least one side | STUN punches through most home NATs            |
| The same build of the game          | Determinism breaks across versions               |
| A side-channel chat (Discord etc.) | To paste the offer/answer strings during setup   |

There is **no signalling server** involved by default. The two clients
exchange WebRTC SDP via copy-paste, then talk to each other directly.

## Step-by-step

### Host

1. Open the game URL.
2. Wait for the loader to finish ("100%" → main menu).
3. Click the **Multiplayer** button (top-right).
4. In the modal, click **Host game**.
5. The "Generating offer…" status appears, then a base64 blob fills the
   first textarea. Click **Copy offer** and paste it to your friend.
6. Wait. Your friend will reply with an answer string.
7. Paste it into the **answer** textarea and click **Accept answer**.
8. Once the status shows "Peer connected", click **Start**.

### Joiner

1. Open the same game URL.
2. Wait for the loader.
3. Click **Multiplayer → Join game**.
4. Paste the host's offer into the textarea, click **Generate answer**.
5. Click **Copy answer** and send the resulting blob back to the host.
6. Wait. The status changes to "Connected. Waiting for host to start…",
   then the engine boots automatically when the host clicks Start.

## What "lockstep" means in practice

- Every command (move, build, recruit, stance, garrison, gate toggle…)
  is enqueued locally and broadcast to peers.
- The simulation only advances once **every** peer has submitted their
  command bundle for the current turn. If your friend's connection
  hiccups, your game pauses for a moment instead of desyncing.
- Default turn length: 4 simulation frames (~115 ms at 35 FPS).
- Default input delay: 3 turns (~345 ms). Adjust in
  `src/engine/netplay/command_queue.js` if your latency is much higher.

## Troubleshooting

| Symptom                                          | Likely cause                              | Fix                                                              |
|--------------------------------------------------|-------------------------------------------|------------------------------------------------------------------|
| Status stuck on "Generating offer…"              | Browser blocked WebRTC                    | Allow camera/mic permissions; some adblockers strip RTC support  |
| Offer generated but friend cannot connect        | Symmetric NAT on one side                 | Use the WebSocket relay (see below)                              |
| Console: `[netplay] DESYNC at turn N`            | Determinism violation (different builds)  | Both players run `git pull && npm run build && npm run preview`  |
| Game freezes after a peer disconnects            | Bundle never arrives for current turn     | Reload the page — single-player still works                      |
| Joiner sees only their own cursor moving         | The answer never reached the host         | Re-paste; make sure no extra whitespace got into the blob        |

## Optional: WebSocket relay (for hard NATs)

If WebRTC P2P fails (mobile / corporate networks), boot the bundled
relay server:

```bash
npm install ws        # one-off
node scripts/relay_server.js 8787
```

The relay forwards every message in a "room" to every other client in
the same room. Wire format is identical to the WebRTC transport. To use
it from the lobby code, swap the `WebRTCTransport` import in
`src/ui/multiplayer_lobby.js` for `WebSocketTransport` and supply
`{ url: 'ws://your.relay.host:8787', room: 'my-room' }`.

A pre-configured swap-in is left as a follow-up so the default flow
stays server-free.

## Optional: TURN server (for symmetric NATs that even relays cannot
  reach)

The shipped STUN servers (Google's public ones) are enough for most
home networks. If a peer is behind a strict symmetric NAT, the only way
through is a TURN server. We do **not** ship one because it has to be
hosted somewhere; the easiest path is `coturn`:

```bash
# Debian / Ubuntu host with public IP
sudo apt install coturn
sudo systemctl enable --now coturn
```

Then add the TURN URL to the `iceServers` array in
`src/engine/netplay/transport.js`:

```js
const config = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: 'turn:your.host:3478',
      username: 'aoe',
      credential: 'super-secret'
    },
  ],
};
```

Free hosted TURN servers exist (e.g. Open Relay Project) but they go
down regularly — running your own is the only durable option.

## What stays deterministic

| Source of randomness                         | Synced via `seedGameRandom`? |
|----------------------------------------------|------------------------------|
| Map generation (terrain, forests, lakes)     | Yes                          |
| Initial unit rotation                        | Yes                          |
| AI build-order pick                          | Yes                          |
| Pathfinding tie-breakers                     | Yes                          |
| Combat ticks_waited variance                 | Yes                          |
| Audio playback rate jitter                   | No (cosmetic)                |
| Tree / mine sprite variant                   | No (cosmetic)                |
| Projectile trace image index                 | No (cosmetic)                |

If you ever introduce a new random call inside the simulation loop, use
`gameRandom()` from `src/engine/rng.js` — never `Math.random()`.

## Reporting desyncs

When the console shouts `[netplay] DESYNC at turn N`, capture:

1. The output of `git rev-parse HEAD` on both machines.
2. A screenshot of both clients (the visual divergence is usually obvious).
3. The console log entries leading up to the desync.

Open an issue with that information attached. The most common cause is
a freshly added `Math.random()` call inside game logic that should have
been `gameRandom()`.
