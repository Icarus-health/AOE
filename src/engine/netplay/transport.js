/**
 * Transport interfaces for the lockstep command queue.
 *
 * Two implementations ship in the box:
 *   1. `LocalTransport`   — single-process, used for hot-seat / AI matches
 *                           and for the deterministic playback unit tests.
 *   2. `WebRTCTransport`  — peer-to-peer over a WebRTC data channel,
 *                           with manual copy/paste signalling so no
 *                           central server is required for offline LAN
 *                           or quick online games with a friend.
 *
 * The `WebSocketTransport` shim is intentionally minimal — it points at a
 * tiny Node.js relay (scripts/relay_server.js) for installations that
 * prefer central matchmaking. Both transports speak the same wire format,
 * so the engine code never has to care.
 *
 * Wire format (JSON, one message per data-channel send):
 *   { type: 'cmds', turn, peerId, commands, checksum? }
 *   { type: 'hello', peerId, name }
 *   { type: 'start', seed, players }
 */

class BaseTransport {
    constructor() {
        this.onCommandBundle = null;
        this.onConnect = null;
        this.onDisconnect = null;
        this.onError = null;
        this.onMessage = null;
        this.connected = false;
    }

    sendCommandBundle(turn, peerId, commands, checksum) {
        this._sendRaw({ type: 'cmds', turn, peerId, commands, checksum });
    }

    _deliverCommandBundle(msg) {
        if (this.onCommandBundle) {
            this.onCommandBundle(msg.turn, msg.peerId, msg.commands || [], msg.checksum ?? null);
        }
    }

    _sendRaw(_msg) { /* override */ }
}


/**
 * In-process pass-through. Hosts and clients all share the same instance,
 * which loops messages straight back into the same engine. Used for AI
 * matches and as the default for the engine's local-only mode.
 */
export class LocalTransport extends BaseTransport {
    constructor() {
        super();
        this.connected = true;
    }
    _sendRaw(msg) {
        if (msg.type === 'cmds') this._deliverCommandBundle(msg);
    }
}


/**
 * WebRTC peer-to-peer transport using a single unordered, unreliable-ish
 * data channel (configured for "max retransmits = 4" so commands have a
 * chance to make it through but never block the simulation forever).
 *
 * Signalling is manual — the host generates an SDP offer + ICE candidates,
 * the user copies it into the joiner's UI, the joiner returns an answer,
 * and the connection is established. No server involved.
 *
 * For server-mediated signalling drop in a WebSocketTransport instead.
 */
export class WebRTCTransport extends BaseTransport {
    constructor({ isHost, peerId } = {}) {
        super();
        this.isHost = !!isHost;
        this.peerId = peerId ?? (isHost ? 0 : 1);

        const config = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
            ],
        };
        this.pc = new RTCPeerConnection(config);
        this.channel = null;
        this.iceComplete = new Promise((resolve) => {
            this.pc.onicegatheringstatechange = () => {
                if (this.pc.iceGatheringState === 'complete') resolve();
            };
        });
        this.pc.onconnectionstatechange = () => {
            const s = this.pc.connectionState;
            if (s === 'connected') {
                this.connected = true;
                if (this.onConnect) this.onConnect();
            } else if (s === 'failed' || s === 'disconnected' || s === 'closed') {
                this.connected = false;
                if (this.onDisconnect) this.onDisconnect();
            }
        };

        if (this.isHost) {
            this.channel = this.pc.createDataChannel('aoe', {
                ordered: false,
                maxRetransmits: 4,
            });
            this._wireChannel(this.channel);
        } else {
            this.pc.ondatachannel = (e) => {
                this.channel = e.channel;
                this._wireChannel(this.channel);
            };
        }
    }

    _wireChannel(ch) {
        ch.binaryType = 'arraybuffer';
        ch.onopen = () => {
            this.connected = true;
            if (this.onConnect) this.onConnect();
        };
        ch.onclose = () => {
            this.connected = false;
            if (this.onDisconnect) this.onDisconnect();
        };
        ch.onerror = (err) => {
            if (this.onError) this.onError(err);
        };
        ch.onmessage = (e) => {
            try {
                const msg = JSON.parse(e.data);
                if (msg.type === 'cmds') {
                    this._deliverCommandBundle(msg);
                } else if (this.onMessage) {
                    this.onMessage(msg);
                }
            } catch (err) {
                console.warn('[netplay] bad message', err);
            }
        };
    }

    /** Host: generate the offer string the joiner needs to paste in. */
    async createOffer() {
        if (!this.isHost) throw new Error('createOffer is host-only');
        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        await this.iceComplete;
        return btoa(JSON.stringify(this.pc.localDescription));
    }

    /** Host: consume the answer string the joiner sent back. */
    async acceptAnswer(answerBlob) {
        const desc = JSON.parse(atob(answerBlob));
        await this.pc.setRemoteDescription(desc);
    }

    /** Joiner: consume the host's offer and produce an answer. */
    async acceptOfferAndAnswer(offerBlob) {
        if (this.isHost) throw new Error('acceptOfferAndAnswer is joiner-only');
        const desc = JSON.parse(atob(offerBlob));
        await this.pc.setRemoteDescription(desc);
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        await this.iceComplete;
        return btoa(JSON.stringify(this.pc.localDescription));
    }

    /** Send arbitrary control messages (lobby chat, ready, start signal). */
    sendMessage(msg) {
        this._sendRaw(msg);
    }

    _sendRaw(msg) {
        if (!this.channel || this.channel.readyState !== 'open') return;
        try {
            this.channel.send(JSON.stringify(msg));
        } catch (err) {
            if (this.onError) this.onError(err);
        }
    }

    close() {
        try { this.channel && this.channel.close(); } catch (e) { /* ignore */ }
        try { this.pc.close(); } catch (e) { /* ignore */ }
    }
}


/**
 * Optional: thin WebSocket transport for users who run the bundled relay
 * server (scripts/relay_server.js). Same wire format as WebRTCTransport,
 * just routed through a central socket. Useful when both peers are behind
 * NATs that even STUN cannot punch through.
 */
export class WebSocketTransport extends BaseTransport {
    constructor({ url, peerId, room }) {
        super();
        this.peerId = peerId;
        this.room = room;
        this.ws = new WebSocket(url);
        this.ws.onopen = () => {
            this.connected = true;
            this._sendRaw({ type: 'join', room, peerId });
            if (this.onConnect) this.onConnect();
        };
        this.ws.onclose = () => {
            this.connected = false;
            if (this.onDisconnect) this.onDisconnect();
        };
        this.ws.onerror = (err) => { if (this.onError) this.onError(err); };
        this.ws.onmessage = (e) => {
            try {
                const msg = JSON.parse(e.data);
                if (msg.type === 'cmds') this._deliverCommandBundle(msg);
                else if (this.onMessage) this.onMessage(msg);
            } catch (err) { /* ignore */ }
        };
    }
    _sendRaw(msg) {
        if (this.ws.readyState !== WebSocket.OPEN) return;
        try { this.ws.send(JSON.stringify(msg)); } catch (err) { /* ignore */ }
    }
    sendMessage(msg) { this._sendRaw(msg); }
    close() { try { this.ws.close(); } catch (e) { /* ignore */ } }
}
