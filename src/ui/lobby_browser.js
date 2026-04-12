import { WebSocketTransport } from '../engine/netplay/transport.js';

/**
 * Lobby browser — DOM modal that polls a relay server's `/rooms`
 * endpoint and lets the user click a room to join.
 *
 * The relay server (`scripts/relay_server.js`) exposes:
 *   GET  /rooms       → JSON list of active rooms
 *   WS   /            → join a room and exchange command bundles
 *
 * The relay URL is read from `localStorage.aoe-relay-url`. If empty the
 * browser shows an input field for the user to enter their own relay
 * (so we never hard-code a server we do not own).
 */

class LobbyBrowser {
    constructor({ onJoin } = {}) {
        this.onJoin = onJoin || (() => {});
        this.root = null;
        this.relayUrl = '';
        this.pollTimer = null;
    }

    open() {
        if (this.root) return;
        this.root = document.createElement('div');
        this.root.id = 'aoe-lobby-browser';
        this.root.style.cssText = `
            position: fixed; inset: 0;
            background: rgba(0,0,0,0.7);
            display: flex; align-items: center; justify-content: center;
            z-index: 9100;
            font-family: sans-serif;
        `;
        const card = document.createElement('div');
        card.style.cssText = `
            width: 480px; max-width: calc(100vw - 40px);
            max-height: calc(100vh - 60px);
            overflow: auto;
            background: #1a1a2e; color: #f5e6c4;
            border: 2px solid #c4a57b; border-radius: 8px;
            padding: 18px 22px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.6);
        `;
        const saved = localStorage.getItem('aoe-relay-url') || '';
        this.relayUrl = saved;
        card.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
                <h2 style="margin:0;color:#f4d49a;font-size:20px">Server Browser</h2>
                <button id="lb-close" type="button" style="background:transparent;border:none;color:#fff;font-size:20px;cursor:pointer">&times;</button>
            </div>
            <p style="font-size:12px;opacity:0.85;line-height:1.4">
                Optional WebSocket relay for hosting and discovering matches.
                Leave blank to use the default WebRTC P2P flow instead.
            </p>
            <label style="display:block;margin:8px 0;font-size:12px">
                Relay URL (e.g. <code>ws://your.host:8787</code>)
                <input id="lb-url" type="text" value="${escape(saved)}"
                    placeholder="ws://localhost:8787"
                    style="width:100%;box-sizing:border-box;background:#0d0d1a;color:#b8d4ff;border:1px solid #444;border-radius:4px;padding:6px 8px;margin-top:4px;font-family:ui-monospace,Menlo,monospace;font-size:11px">
            </label>
            <div style="display:flex;gap:8px;margin:10px 0">
                <button id="lb-refresh" type="button" style="flex:1;background:#8b7355;color:#fff;border:1px solid #c4a57b;border-radius:4px;padding:8px;cursor:pointer">Refresh</button>
                <button id="lb-host" type="button" style="flex:1;background:#444;color:#fff;border:1px solid #888;border-radius:4px;padding:8px;cursor:pointer">Host new room</button>
            </div>
            <div id="lb-list" style="margin-top:8px;font-size:13px"></div>
        `;
        this.root.appendChild(card);
        document.body.appendChild(this.root);

        const $ = (id) => this.root.querySelector('#' + id);
        $('lb-close').addEventListener('click', () => this.close());
        $('lb-url').addEventListener('change', (e) => {
            this.relayUrl = e.target.value.trim();
            localStorage.setItem('aoe-relay-url', this.relayUrl);
        });
        $('lb-refresh').addEventListener('click', () => this.refreshRooms());
        $('lb-host').addEventListener('click', () => this.hostRoom());

        this.refreshRooms();
        this.pollTimer = setInterval(() => this.refreshRooms(), 5000);
    }

    close() {
        if (this.pollTimer) clearInterval(this.pollTimer);
        this.pollTimer = null;
        if (this.root) { this.root.remove(); this.root = null; }
    }

    async refreshRooms() {
        const list = this.root?.querySelector('#lb-list');
        if (!list) return;
        if (!this.relayUrl) {
            list.innerHTML = '<i style="opacity:.6">No relay configured.</i>';
            return;
        }
        const httpUrl = this.relayUrl.replace(/^ws/, 'http') + '/rooms';
        try {
            const res = await fetch(httpUrl, { cache: 'no-store' });
            const rooms = await res.json();
            if (!Array.isArray(rooms) || rooms.length === 0) {
                list.innerHTML = '<i style="opacity:.6">No active rooms. Click "Host new room" to start one.</i>';
                return;
            }
            list.innerHTML = rooms.map((r) => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #333">
                    <span><b>${escape(r.name || r.id)}</b> &nbsp;<span style="opacity:.6">(${r.players}/${r.maxPlayers || 4})</span></span>
                    <button type="button" data-room="${escape(r.id)}" style="background:#444;color:#fff;border:1px solid #888;border-radius:4px;padding:4px 12px;cursor:pointer;font-size:12px">Join</button>
                </div>
            `).join('');
            list.querySelectorAll('button[data-room]').forEach((btn) => {
                btn.addEventListener('click', () => this.joinRoom(btn.dataset.room));
            });
        } catch (err) {
            list.innerHTML = `<span style="color:#ff8888">Failed to reach relay: ${escape(err.message || err)}</span>`;
        }
    }

    hostRoom() {
        if (!this.relayUrl) { alert('Set a relay URL first.'); return; }
        const room = 'r' + Date.now().toString(36) + Math.floor(Math.random() * 999).toString(36);
        const transport = new WebSocketTransport({
            url: this.relayUrl,
            peerId: 0,
            room,
        });
        // Send the join with metadata so /rooms picks it up.
        transport.ws.addEventListener('open', () => {
            transport.sendMessage({
                type: 'join',
                peerId: 0,
                room,
                roomName: 'My game',
                hostName: 'Host',
                maxPlayers: 4,
            });
        }, { once: true });
        this._launchWith(transport, 0, [0, 1]);
    }

    joinRoom(room) {
        if (!this.relayUrl) return;
        const transport = new WebSocketTransport({
            url: this.relayUrl,
            peerId: 1,
            room,
        });
        this._launchWith(transport, 1, [0, 1]);
    }

    _launchWith(transport, localPeerId, peerIds) {
        const seed = (Date.now() ^ 0x9e3779b9) >>> 0;
        const networking = {
            transport,
            localPeerId,
            peerIds,
            seed,
            isHost: localPeerId === 0,
        };
        this.close();
        this.onJoin(networking);
    }
}

function escape(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

export const lobbyBrowser = new LobbyBrowser();
