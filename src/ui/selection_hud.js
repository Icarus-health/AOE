import { STANCE_NAMES } from '../engine/stances.js';

/**
 * SelectionHud — small DOM overlay that shows the current state of the
 * selected entity (stance, formation, garrison count, gate state). It is
 * a passive observer: it polls the engine on a slow interval and renders
 * read-only text. Clicks go through hotkeys, not the HUD.
 *
 * Lives in a fixed-position panel above the canvas bottom bar so it does
 * not collide with the existing in-canvas UI.
 */

class SelectionHud {
    constructor() {
        this.root = null;
        this.timer = null;
    }

    mount() {
        if (this.root) return;
        this.root = document.createElement('div');
        this.root.id = 'aoe-selection-hud';
        this.root.style.cssText = `
            position: fixed;
            left: 50%;
            bottom: 200px;
            transform: translateX(-50%);
            min-width: 220px;
            max-width: 320px;
            background: rgba(20, 16, 8, 0.85);
            color: #f4d49a;
            border: 1px solid #c4a57b;
            border-radius: 6px;
            font-family: sans-serif;
            font-size: 12px;
            padding: 8px 12px;
            line-height: 1.45;
            pointer-events: none;
            z-index: 600;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
            display: none;
        `;
        document.body.appendChild(this.root);
        this.timer = setInterval(() => this.refresh(), 200);
    }

    unmount() {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        if (this.root) {
            this.root.remove();
            this.root = null;
        }
    }

    refresh() {
        if (!this.root) return;
        const game = window.game;
        const engine = game?.navigator?.gameViewer?.engine;
        const ent = engine?.selectedEntity;
        if (!ent) {
            this.root.style.display = 'none';
            return;
        }
        this.root.style.display = 'block';

        const lines = [];
        const ctorName = ent.constructor?.name || 'Entity';
        lines.push(`<b>${escape(ctorName)}</b>`);

        if (ent.hp != null && ent.max_hp != null) {
            lines.push(`HP: ${Math.round(ent.hp)} / ${ent.max_hp}`);
        }
        if (ent.stance != null) {
            lines.push(`Stance: ${STANCE_NAMES[ent.stance] || '?'} <span style="opacity:.6">(F1-F4)</span>`);
        }
        if (ent.patrolWaypoints && ent.patrolWaypoints.length >= 2) {
            lines.push(`Patrol: ${ent.patrolWaypoints.length} waypoints`);
        }
        if (ent.garrisonedUnits && ent.garrisonedUnits.length > 0) {
            lines.push(`Garrison: ${ent.garrisonedUnits.length}/10 <span style="opacity:.6">(G to ungarrison)</span>`);
        }
        if (ctorName === 'Gate') {
            lines.push(`Gate: ${ent.isOpen ? 'open' : 'closed'} <span style="opacity:.6">(O to toggle)</span>`);
        }
        if (selectionHud.lastFormation != null) {
            const names = ['Box', 'Line', 'Flank'];
            lines.push(`Formation: ${names[selectionHud.lastFormation] || 'Box'} <span style="opacity:.6">(Shift+F)</span>`);
        }

        this.root.innerHTML = lines.join('<br>');
    }

    setFormation(idx) {
        this.lastFormation = idx;
        this.refresh();
    }
}

function escape(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

export const selectionHud = new SelectionHud();
