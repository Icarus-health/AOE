/**
 * Pause / reconnect overlay.
 *
 * Polls the active engine's command queue every 100 ms and counts how
 * many simulation frames in a row the queue has refused to advance
 * (because a peer's command bundle has not arrived). Once that count
 * crosses a threshold (~1.5 seconds at 35 FPS) we put up a "Waiting
 * for peer…" overlay so the user knows the freeze is the network and
 * not a crash.
 *
 * The overlay disappears automatically the instant the queue advances
 * again — there is nothing to click. Reconnect itself is handled by
 * WebRTCTransport's auto-reconnect (data channel `onclose` will fire
 * `onDisconnect`, the user can then reload the lobby).
 */

class PauseOverlay {
    constructor() {
        this.root = null;
        this.timer = null;
        this.lastTurn = -1;
        this.stallTicks = 0;
    }

    mount() {
        if (this.root) return;
        this.root = document.createElement('div');
        this.root.id = 'aoe-pause-overlay';
        this.root.style.cssText = `
            position: fixed; inset: 0;
            background: rgba(0,0,0,0.55);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 8800;
            font-family: sans-serif;
            color: #f5e6c4;
            text-align: center;
            pointer-events: none;
        `;
        this.root.innerHTML = `
            <div style="background:#1a1a2e;border:2px solid #c4a57b;border-radius:8px;padding:24px 36px;box-shadow:0 10px 40px rgba(0,0,0,0.6)">
                <div style="font-size:20px;color:#f4d49a;margin-bottom:6px">Waiting for peer…</div>
                <div id="aoe-pause-detail" style="font-size:13px;opacity:0.75"></div>
            </div>
        `;
        document.body.appendChild(this.root);
        this.timer = setInterval(() => this.tick(), 100);
    }

    unmount() {
        if (this.timer) clearInterval(this.timer);
        if (this.root) { this.root.remove(); this.root = null; }
    }

    tick() {
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
        if (q.currentTurn !== this.lastTurn) {
            this.lastTurn = q.currentTurn;
            this.stallTicks = 0;
            this.root.style.display = 'none';
            return;
        }
        this.stallTicks++;
        // 5 ticks × 100 ms = 500 ms before we show the overlay.
        if (this.stallTicks >= 5) {
            this.root.style.display = 'flex';
            const detail = this.root.querySelector('#aoe-pause-detail');
            if (detail) {
                const transport = q.transport;
                const state = transport && transport.connected ? 'still connected' : 'disconnected';
                detail.textContent = `Stalled ${this.stallTicks * 100}ms · network ${state}`;
            }
        }
    }
}

export const pauseOverlay = new PauseOverlay();
