import { listReplays, loadReplay, saveReplay } from '../engine/netplay/replay.js';

/**
 * Replay panel — DOM overlay listing saved replays from IndexedDB and
 * letting the user save the current match. Reachable from the in-game
 * settings menu (Esc → Save replay) and from a "Replays" button on the
 * main menu.
 *
 * Loading a replay reboots the engine with a ReplayTransport in place
 * of any networking transport. The current page is reloaded with a
 * `?replay=NAME` query string and the bootstrap code in app.js picks
 * the replay up from there.
 */

class ReplayPanel {
    constructor() {
        this.root = null;
    }

    async open() {
        if (this.root) return;
        this.root = document.createElement('div');
        this.root.id = 'aoe-replay-panel';
        this.root.style.cssText = `
            position: fixed; inset: 0;
            background: rgba(0,0,0,0.7);
            display: flex; align-items: center; justify-content: center;
            z-index: 9050;
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

        const header = document.createElement('div');
        header.style.cssText = `display:flex;justify-content:space-between;align-items:center;margin-bottom:10px`;
        header.innerHTML = `<h2 style="margin:0;color:#f4d49a;font-size:20px">Replays</h2>`;
        const close = document.createElement('button');
        close.type = 'button';
        close.textContent = '×';
        close.style.cssText = 'background:transparent;border:none;color:#fff;font-size:22px;cursor:pointer';
        close.addEventListener('click', () => this.close());
        header.appendChild(close);
        card.appendChild(header);

        // "Save current match" button if there's an active engine.
        const engine = window.game?.navigator?.gameViewer?.engine;
        if (engine && engine._recorder) {
            const saveBtn = document.createElement('button');
            saveBtn.type = 'button';
            saveBtn.textContent = 'Save current match as replay';
            saveBtn.style.cssText = 'background:#8b7355;color:#fff;border:1px solid #c4a57b;border-radius:4px;padding:8px 14px;cursor:pointer;margin-bottom:14px;width:100%';
            saveBtn.addEventListener('click', async () => {
                const name = prompt('Replay name', 'replay-' + new Date().toISOString().slice(0, 19));
                if (!name) return;
                const snap = engine._recorder.snapshot({ durationFrames: engine.framesCount });
                const ok = await saveReplay(name, snap);
                alert(ok ? 'Saved.' : 'Failed to save replay.');
                this.refreshList(card);
            });
            card.appendChild(saveBtn);
        }

        // Saved replay list.
        const list = document.createElement('div');
        list.id = 'aoe-replay-list';
        card.appendChild(list);
        this.root.appendChild(card);
        document.body.appendChild(this.root);

        await this.refreshList(card);
    }

    async refreshList(card) {
        const list = card.querySelector('#aoe-replay-list');
        list.innerHTML = '<i style="opacity:.6">Loading…</i>';
        const items = await listReplays();
        if (items.length === 0) {
            list.innerHTML = '<i style="opacity:.6">No saved replays yet.</i>';
            return;
        }
        list.innerHTML = '';
        for (const it of items) {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #333';
            row.innerHTML = `<span>${escape(it.name)}</span>`;
            const watch = document.createElement('button');
            watch.type = 'button';
            watch.textContent = 'Watch';
            watch.style.cssText = 'background:#444;color:#fff;border:1px solid #888;border-radius:4px;padding:4px 12px;cursor:pointer;font-size:12px';
            watch.addEventListener('click', () => {
                location.href = location.pathname + '?replay=' + encodeURIComponent(it.name);
            });
            row.appendChild(watch);
            list.appendChild(row);
        }
    }

    close() {
        if (this.root) { this.root.remove(); this.root = null; }
    }
}

function escape(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

export const replayPanel = new ReplayPanel();
