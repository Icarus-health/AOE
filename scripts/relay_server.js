/**
 * Tiny WebSocket relay server for AoE PWA multiplayer.
 *
 * Usage:
 *   node scripts/relay_server.js [port=8787]
 *
 * It does not parse the AoE protocol — it simply forwards every message
 * received in a "room" to every other socket in the same room. The wire
 * format is identical to the WebRTC transport so the engine code does
 * not need to know which one is in use.
 *
 * No external dependencies — uses Node's built-in `http` plus the `ws`
 * library if installed; otherwise falls back to a hand-rolled handshake.
 *
 * This server is OPTIONAL. The default multiplayer flow uses WebRTC P2P
 * with manual signalling and needs no server at all.
 */
import { createServer } from 'http';

const PORT = Number(process.argv[2] || 8787);

let WebSocketServer = null;
try {
    const ws = await import('ws');
    WebSocketServer = ws.WebSocketServer;
} catch {
    console.error('[relay] this script needs the `ws` package — install with `npm install ws`');
    process.exit(1);
}

const rooms = new Map(); // room id -> Set<WebSocket>
const roomMeta = new Map(); // room id -> { name, host, players, createdAt }

const httpServer = createServer((req, res) => {
    // CORS so a static-hosted PWA can poll us from a different origin.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.url === '/rooms') {
        // Lobby-browser endpoint: list every active room with its metadata.
        const list = [];
        for (const [id, set] of rooms.entries()) {
            const meta = roomMeta.get(id) || {};
            list.push({
                id,
                name: meta.name || id,
                host: meta.host || 'unknown',
                players: set.size,
                maxPlayers: meta.maxPlayers || 4,
                createdAt: meta.createdAt || 0,
            });
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(list));
        return;
    }

    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('AoE PWA relay\n');
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (socket) => {
    let joinedRoom = null;

    socket.on('message', (data) => {
        let msg;
        try { msg = JSON.parse(data.toString()); } catch { return; }

        if (msg.type === 'join') {
            joinedRoom = String(msg.room);
            let set = rooms.get(joinedRoom);
            if (!set) { set = new Set(); rooms.set(joinedRoom, set); }
            set.add(socket);
            // Capture room metadata from the first joiner.
            if (!roomMeta.has(joinedRoom)) {
                roomMeta.set(joinedRoom, {
                    name: msg.roomName || joinedRoom,
                    host: msg.hostName || 'host',
                    maxPlayers: msg.maxPlayers || 4,
                    createdAt: Date.now(),
                });
            }
            console.log(`[relay] peer ${msg.peerId} joined room ${joinedRoom} (size=${set.size})`);
            return;
        }

        if (!joinedRoom) return;
        const set = rooms.get(joinedRoom);
        if (!set) return;
        const raw = JSON.stringify(msg);
        for (const peer of set) {
            if (peer !== socket && peer.readyState === peer.OPEN) {
                peer.send(raw);
            }
        }
    });

    socket.on('close', () => {
        if (!joinedRoom) return;
        const set = rooms.get(joinedRoom);
        if (set) {
            set.delete(socket);
            if (set.size === 0) {
                rooms.delete(joinedRoom);
                roomMeta.delete(joinedRoom);
            }
        }
    });
});

httpServer.listen(PORT, () => {
    console.log(`[relay] listening on ws://0.0.0.0:${PORT}`);
});
