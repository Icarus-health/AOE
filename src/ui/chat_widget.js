import { COMMANDS } from '../engine/netplay/command_queue.js';

/**
 * In-game chat widget.
 *
 * Visible bottom-left of the screen. The chat history is sourced from
 * `engine.chatLog`, which is appended to deterministically by the
 * COMMANDS.CHAT handler in engine.js — that means every peer sees the
 * exact same chat scrollback in the exact same order.
 *
 * Pressing Enter focuses the input; pressing Enter again sends the
 * message and unfocuses. Escape cancels.
 *
 * The widget polls every 250 ms and re-renders only when the chat log
 * length grows.
 */

class ChatWidget {
    constructor() {
        this.root = null;
        this.log = null;
        this.input = null;
        this.timer = null;
        this.lastRenderedLength = 0;
        this.focused = false;
    }

    mount() {
        if (this.root) return;
        this.root = document.createElement('div');
        this.root.id = 'aoe-chat';
        this.root.style.cssText = `
            position: fixed;
            left: 12px;
            bottom: 70px;
            width: 320px;
            max-height: 200px;
            background: rgba(20, 16, 8, 0.78);
            border: 1px solid #c4a57b;
            border-radius: 6px;
            color: #f4d49a;
            font-family: sans-serif;
            font-size: 12px;
            display: none;
            flex-direction: column;
            z-index: 700;
            overflow: hidden;
        `;
        this.log = document.createElement('div');
        this.log.style.cssText = `
            flex: 1;
            overflow-y: auto;
            padding: 6px 8px;
            line-height: 1.4;
            max-height: 160px;
        `;
        this.input = document.createElement('input');
        this.input.type = 'text';
        this.input.maxLength = 200;
        this.input.placeholder = 'Press Enter to chat…';
        this.input.style.cssText = `
            width: 100%;
            box-sizing: border-box;
            background: rgba(0,0,0,0.5);
            border: none;
            border-top: 1px solid #555;
            color: #fff;
            padding: 6px 8px;
            font-family: inherit;
            font-size: 12px;
            outline: none;
        `;
        this.input.addEventListener('keydown', (e) => {
            // Stop event so the global hotkey layer does not also react
            // to letters typed inside the chat box.
            e.stopPropagation();
            if (e.key === 'Enter') {
                this.send();
            } else if (e.key === 'Escape') {
                this.input.value = '';
                this.input.blur();
            }
        });
        this.input.addEventListener('focus', () => { this.focused = true; });
        this.input.addEventListener('blur', () => { this.focused = false; });

        this.root.appendChild(this.log);
        this.root.appendChild(this.input);
        document.body.appendChild(this.root);

        // Global Enter key — focus the input from anywhere on the page.
        this._globalHandler = (e) => {
            if (this.focused) return;
            if (e.key === 'Enter') {
                this.show();
                this.input.focus();
                e.preventDefault();
            }
        };
        window.addEventListener('keydown', this._globalHandler);

        this.timer = setInterval(() => this.refresh(), 250);
    }

    unmount() {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        if (this._globalHandler) window.removeEventListener('keydown', this._globalHandler);
        if (this.root) { this.root.remove(); this.root = null; }
    }

    show() {
        if (!this.root) return;
        this.root.style.display = 'flex';
    }

    hide() {
        if (!this.root) return;
        this.root.style.display = 'none';
    }

    send() {
        const text = this.input.value.trim();
        this.input.value = '';
        this.input.blur();
        if (!text) return;
        const engine = window.game?.navigator?.gameViewer?.engine;
        if (!engine) return;
        engine.submitCommand({
            type: COMMANDS.CHAT,
            playerIndex: engine.current_player.index,
            text,
        });
    }

    refresh() {
        const engine = window.game?.navigator?.gameViewer?.engine;
        if (!engine || !engine.chatLog) {
            // No active match — keep the widget hidden.
            if (!this.focused) this.hide();
            return;
        }
        // Auto-show during a match so the user knows chat is available.
        if (this.root.style.display === 'none' && !this.focused) {
            this.root.style.display = 'flex';
        }
        if (engine.chatLog.length === this.lastRenderedLength) return;

        this.log.innerHTML = engine.chatLog
            .slice(-30)
            .map((e) => {
                const colors = ['#7fb8ff', '#ff8888', '#88ff88', '#ffff88'];
                const c = colors[e.playerIndex] || '#ffffff';
                return `<div><span style="color:${c}"><b>${escape(e.playerName)}:</b></span> ${escape(e.text)}</div>`;
            })
            .join('');
        this.log.scrollTop = this.log.scrollHeight;
        this.lastRenderedLength = engine.chatLog.length;
    }
}

function escape(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

export const chatWidget = new ChatWidget();
