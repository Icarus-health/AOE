/**
 * Latency / netplay diagnostics HUD.
 *
 * Shown only when an active match has a non-local transport (i.e. real
 * multiplayer). Displays:
 *   - Current turn / frame counter
 *   - Number of pending bundles in the buffer (proxy for stall risk)
 *   - Last bundle round-trip estimate (frames since last remote bundle)
 *   - Connection state from the transport
 */
class LatencyHud {
    constructor() {
        this.root = null;
        this.timer = null;
        this.lastRemoteFrame = 0;
    }

    mount() {
        if (this.root) return;
        this.root = document.createElement('div');
        this.root.id = 'aoe-latency-hud';
        this.root.style.cssText = `
            position: fixed;
            top: 60px;
            right: 12px;
            min-width: 160px;
            background: rgba(20, 16, 8, 0.78);
            border: 1px solid #555;
            border-radius: 4px;
            color: #d0e8ff;
            font-family: ui-monospace, Menlo, monospace;
            font-size: 11px;
            line-height: 1.5;
            padding: 6px 10px;
            display: none;
            z-index: 700;
            pointer-events: none;
        `;
        document.body.appendChild(this.root);
        this.timer = setInterval(() => this.refresh(), 250);
    }

    unmount() {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        if (this.root) { this.root.remove(); this.root = null; }
    }

    refresh() {
        const engine = window.game?.navigator?.gameViewer?.engine;
        if (!engine || !engine.commandQueue) {
            this.root.style.display = 'none';
            return;
        }
        const q = engine.commandQueue;
        if (q.isLocalOnly()) {
            this.root.style.display = 'none';
            return;
        }
        this.root.style.display = 'block';

        const transport = q.transport;
        const state = transport && transport.connected ? 'connected' : 'disconnected';
        const stateColor = transport && transport.connected ? '#7fff7f' : '#ff7f7f';
        const pendingTurns = q.bundles.size;
        const turn = q.currentTurn;
        const frame = engine.framesCount;
        const peers = q.peerIds.length;

        // Approximate latency: frames since the most recent successfully
        // applied turn. Higher = the simulation is stalling on a peer.
        const stallFrames = frame - (q._lastAppliedFrame || 0);

        this.root.innerHTML = `
            <div>turn: ${turn} &nbsp; frame: ${frame}</div>
            <div>peers: ${peers} &nbsp; pending: ${pendingTurns}</div>
            <div>stall: ${stallFrames}f</div>
            <div>net: <span style="color:${stateColor}">${state}</span></div>
        `;
    }
}

export const latencyHud = new LatencyHud();
