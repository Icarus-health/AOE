import { WebRTCTransport, WebSocketTransport } from '../engine/netplay/transport.js';

/**
 * MultiplayerLobby — DOM overlay that drives the WebRTC handshake.
 *
 * The original Graphics.Layer-based menu in `menu.js` was painted onto a
 * canvas. Wiring multiline text inputs and clipboard buttons into a canvas
 * is painful, so the multiplayer lobby is a separate DOM modal that the
 * main menu can summon.
 *
 * Two flows:
 *
 *   HOST    1. Click "Host"           → generate WebRTC offer (base64)
 *           2. Copy offer to friend
 *           3. Paste friend's answer  → handshake completes
 *           4. Click "Start"          → engine boots with shared seed
 *
 *   JOIN    1. Click "Join"           → paste host's offer
 *           2. Generate answer        → copy to host
 *           3. Wait for "start" message from host
 *
 * The lobby is intentionally framework-free: no React, no Preact, just a
 * handful of `<div>`s glued together with vanilla JS event listeners.
 */
export class MultiplayerLobby {
    constructor({ onStart } = {}) {
        this.onStart = onStart || (() => {});
        this.transport = null;
        this.isHost = false;
        this.localPeerId = 0;
        this.peerIds = [0];
        this.seed = null;
        this.root = null;
    }

    open() {
        if (this.root) return;
        this.root = document.createElement('div');
        this.root.id = 'mp-lobby';
        this.root.innerHTML = LOBBY_HTML;
        document.body.appendChild(this.root);
        applyStyles();

        this._byId('mp-host-btn').addEventListener('click', () => this._startHosting());
        this._byId('mp-join-btn').addEventListener('click', () => this._startJoining());
        this._byId('mp-close-btn').addEventListener('click', () => this.close());

        this._byId('mp-copy-offer').addEventListener('click', () => this._copy('mp-offer-out'));
        this._byId('mp-accept-answer').addEventListener('click', () => this._hostAcceptAnswer());

        this._byId('mp-accept-offer').addEventListener('click', () => this._joinAcceptOffer());
        this._byId('mp-copy-answer').addEventListener('click', () => this._copy('mp-answer-out'));

        this._byId('mp-start-btn').addEventListener('click', () => this._startMatch());
    }

    close() {
        if (this.transport) {
            try { this.transport.close(); } catch (e) { /* ignore */ }
            this.transport = null;
        }
        if (this.root) {
            this.root.remove();
            this.root = null;
        }
    }

    // ----------------------- HOST -------------------------------------
    async _startHosting() {
        this.isHost = true;
        this.localPeerId = 0;
        this.peerIds = [0, 1];
        this.seed = (Date.now() ^ 0x9e3779b9) >>> 0;

        this._show('mp-host-pane');
        this._setStatus('Generating offer…');
        this.transport = new WebRTCTransport({ isHost: true, peerId: 0 });
        this.transport.onConnect = () => {
            this._setStatus('Peer connected. Click Start when ready.');
            this._byId('mp-start-btn').disabled = false;
        };
        this.transport.onDisconnect = () => this._setStatus('Peer disconnected.');
        this.transport.onError = (err) => this._setStatus(`Error: ${err.message || err}`);

        try {
            const offer = await this.transport.createOffer();
            this._byId('mp-offer-out').value = offer;
            this._setStatus('Send the offer to your friend, then paste their answer below.');
        } catch (err) {
            this._setStatus(`Failed to create offer: ${err.message || err}`);
        }
    }

    async _hostAcceptAnswer() {
        if (!this.transport || !this.isHost) return;
        const ans = this._byId('mp-answer-in').value.trim();
        if (!ans) return;
        try {
            await this.transport.acceptAnswer(ans);
            this._setStatus('Answer accepted, waiting for connection…');
        } catch (err) {
            this._setStatus(`Failed to accept answer: ${err.message || err}`);
        }
    }

    // ----------------------- JOIN -------------------------------------
    async _startJoining() {
        this.isHost = false;
        this.localPeerId = 1;
        this.peerIds = [0, 1];

        this._show('mp-join-pane');
        this._setStatus('Paste the host offer below and click Generate Answer.');

        this.transport = new WebRTCTransport({ isHost: false, peerId: 1 });
        this.transport.onConnect = () => this._setStatus('Connected. Waiting for host to start…');
        this.transport.onDisconnect = () => this._setStatus('Disconnected.');
        this.transport.onError = (err) => this._setStatus(`Error: ${err.message || err}`);
        this.transport.onMessage = (msg) => {
            if (msg.type === 'start') {
                this.seed = msg.seed >>> 0;
                this.peerIds = msg.peerIds;
                this._launch();
            }
        };
    }

    async _joinAcceptOffer() {
        if (!this.transport || this.isHost) return;
        const offer = this._byId('mp-offer-in').value.trim();
        if (!offer) return;
        try {
            const answer = await this.transport.acceptOfferAndAnswer(offer);
            this._byId('mp-answer-out').value = answer;
            this._setStatus('Send this answer back to the host.');
        } catch (err) {
            this._setStatus(`Failed to accept offer: ${err.message || err}`);
        }
    }

    // ----------------------- START ------------------------------------
    _startMatch() {
        if (!this.transport || !this.isHost || !this.transport.connected) return;
        // Tell the joiner to launch with the shared seed.
        this.transport.sendMessage({ type: 'start', seed: this.seed, peerIds: this.peerIds });
        this._launch();
    }

    _launch() {
        const networking = {
            transport: this.transport,
            localPeerId: this.localPeerId,
            peerIds: this.peerIds,
            seed: this.seed,
            isHost: this.isHost,
        };
        this.close();
        this.onStart(networking);
    }

    // ----------------------- helpers ----------------------------------
    _byId(id) { return this.root.querySelector('#' + id); }
    _show(id) {
        for (const pane of this.root.querySelectorAll('.mp-pane')) pane.style.display = 'none';
        const el = this._byId(id);
        if (el) el.style.display = 'block';
    }
    _setStatus(msg) {
        const el = this._byId('mp-status');
        if (el) el.textContent = msg;
    }
    async _copy(textareaId) {
        const ta = this._byId(textareaId);
        if (!ta) return;
        ta.select();
        try {
            await navigator.clipboard.writeText(ta.value);
            this._setStatus('Copied to clipboard.');
        } catch {
            document.execCommand('copy');
        }
    }
}


const LOBBY_HTML = `
<div class="mp-modal">
  <div class="mp-card">
    <header>
      <h2>Multiplayer</h2>
      <button id="mp-close-btn" type="button">&times;</button>
    </header>

    <p class="mp-help">
      Pick <b>Host</b> if you want to invite a friend, or <b>Join</b> if a
      friend has shared their offer with you. The handshake is peer-to-peer
      via WebRTC — no server required.
    </p>

    <div class="mp-row">
      <button id="mp-host-btn" type="button">Host game</button>
      <button id="mp-join-btn" type="button">Join game</button>
    </div>

    <div id="mp-host-pane" class="mp-pane">
      <h3>1. Send this offer to your friend</h3>
      <textarea id="mp-offer-out" rows="4" readonly></textarea>
      <button id="mp-copy-offer" type="button">Copy offer</button>

      <h3>2. Paste their answer here</h3>
      <textarea id="mp-answer-in" rows="4" placeholder="paste answer…"></textarea>
      <button id="mp-accept-answer" type="button">Accept answer</button>

      <h3>3. Start the match</h3>
      <button id="mp-start-btn" type="button" disabled>Start</button>
    </div>

    <div id="mp-join-pane" class="mp-pane">
      <h3>1. Paste the host offer</h3>
      <textarea id="mp-offer-in" rows="4" placeholder="paste offer…"></textarea>
      <button id="mp-accept-offer" type="button">Generate answer</button>

      <h3>2. Send this answer back to the host</h3>
      <textarea id="mp-answer-out" rows="4" readonly></textarea>
      <button id="mp-copy-answer" type="button">Copy answer</button>
    </div>

    <p id="mp-status" class="mp-status"></p>
  </div>
</div>
`;

let stylesApplied = false;
function applyStyles() {
    if (stylesApplied) return;
    stylesApplied = true;
    const style = document.createElement('style');
    style.textContent = `
#mp-lobby .mp-modal {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.7);
    display: flex; align-items: center; justify-content: center;
    z-index: 9000;
    font-family: sans-serif;
}
#mp-lobby .mp-card {
    width: 480px; max-width: calc(100vw - 40px);
    max-height: calc(100vh - 40px);
    overflow: auto;
    background: #1a1a2e; color: #f5e6c4;
    border: 2px solid #c4a57b; border-radius: 8px;
    padding: 20px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.6);
}
#mp-lobby header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
#mp-lobby h2 { margin: 0; font-size: 22px; color: #f4d49a; }
#mp-lobby h3 { margin: 16px 0 6px; font-size: 14px; color: #d8c190; }
#mp-lobby button {
    background: #8b7355; color: #fff; border: 1px solid #c4a57b;
    border-radius: 4px; padding: 6px 12px; cursor: pointer;
    font-size: 14px;
}
#mp-lobby button:disabled { opacity: 0.5; cursor: not-allowed; }
#mp-lobby button:hover:not(:disabled) { background: #a08868; }
#mp-lobby #mp-close-btn { background: transparent; border: none; font-size: 20px; padding: 0 6px; color: #f5e6c4; }
#mp-lobby textarea {
    width: 100%; box-sizing: border-box;
    background: #0d0d1a; color: #b8d4ff;
    border: 1px solid #444; border-radius: 4px;
    padding: 6px; font-family: ui-monospace, Menlo, monospace; font-size: 11px;
    resize: vertical;
}
#mp-lobby .mp-pane { display: none; margin-top: 10px; }
#mp-lobby .mp-row { display: flex; gap: 10px; margin: 12px 0; }
#mp-lobby .mp-row button { flex: 1; padding: 10px; font-size: 16px; }
#mp-lobby .mp-help { font-size: 13px; line-height: 1.4; opacity: 0.85; }
#mp-lobby .mp-status { margin-top: 14px; font-size: 13px; color: #ffd966; min-height: 1em; }
    `;
    document.head.appendChild(style);
}
