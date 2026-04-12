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

const httpServer = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('AoE PWA relay\n');
});

const wss = new WebSocketServer({ server: httpServer });
const rooms = new Map(); // room id -> Set<WebSocket>

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
            if (set.size === 0) rooms.delete(joinedRoom);
        }
    });
});

httpServer.listen(PORT, () => {
    console.log(`[relay] listening on ws://0.0.0.0:${PORT}`);
});
