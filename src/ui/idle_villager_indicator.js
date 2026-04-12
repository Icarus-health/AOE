/**
 * Idle Villager Indicator (AoE2 ".") + jump-to-next-idle button.
 *
 * Polls the active engine every 400 ms, counts villagers belonging to
 * the human player whose state is IDLE and whose path / interaction
 * are empty. Renders a small DOM button bottom-left of the canvas with
 * the count; clicking it (or pressing the period key) selects the next
 * idle villager and centres the camera on them.
 *
 * Pure DOM, no canvas refactor required.
 */
class IdleVillagerIndicator {
    constructor() {
        this.root = null;
        this.timer = null;
        this.idleVillagers = [];
        this.cursor = 0;
    }

    mount() {
        if (this.root) return;
        this.root = document.createElement('button');
        this.root.id = 'aoe-idle-villager';
        this.root.type = 'button';
        this.root.style.cssText = `
            position: fixed;
            left: 12px;
            bottom: 280px;
            min-width: 64px;
            padding: 8px 14px;
            background: rgba(20, 16, 8, 0.85);
            color: #f4d49a;
            border: 1px solid #c4a57b;
            border-radius: 6px;
            cursor: pointer;
            font-family: sans-serif;
            font-size: 13px;
            font-weight: bold;
            display: none;
            z-index: 700;
            box-shadow: 0 2px 6px rgba(0,0,0,0.4);
        `;
        this.root.addEventListener('click', () => this.jumpToNext());
        document.body.appendChild(this.root);

        // "." hotkey — same as AoE2.
        this._handler = (e) => {
            if (e.target?.tagName === 'INPUT') return;
            if (e.code === 'Period') {
                e.preventDefault();
                this.jumpToNext();
            }
        };
        window.addEventListener('keydown', this._handler);

        this.timer = setInterval(() => this.refresh(), 400);
    }

    unmount() {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        if (this._handler) window.removeEventListener('keydown', this._handler);
        if (this.root) { this.root.remove(); this.root = null; }
    }

    refresh() {
        const engine = window.game?.navigator?.gameViewer?.engine;
        if (!engine) { this.root.style.display = 'none'; return; }
        const player = engine.current_player;
        if (!player) { this.root.style.display = 'none'; return; }

        this.idleVillagers = engine.units.filter((u) =>
            !u.destroyed
            && u.player === player
            && u.TYPE === 'villager'
            && !u.path
            && !u.interactionObject
        );

        if (this.idleVillagers.length === 0) {
            this.root.style.display = 'none';
            return;
        }
        this.root.style.display = 'block';
        this.root.textContent = `Idle: ${this.idleVillagers.length}`;
    }

    jumpToNext() {
        if (this.idleVillagers.length === 0) return;
        const engine = window.game?.navigator?.gameViewer?.engine;
        const viewer = window.game?.navigator?.gameViewer;
        if (!engine || !viewer) return;

        this.cursor = (this.cursor + 1) % this.idleVillagers.length;
        const v = this.idleVillagers[this.cursor];
        if (!v) return;

        if (engine.selectedEntity && typeof engine.selectedEntity.setSelected === 'function') {
            engine.selectedEntity.setSelected(false);
        }
        engine.selectedEntity = v;
        if (typeof v.setSelected === 'function') v.setSelected(true);

        // Centre the camera on the picked villager.
        if (viewer.viewPort && viewer.mapDrawable && viewer.mapDrawable.tileCoordsToScreen) {
            try {
                const screen = viewer.mapDrawable.tileCoordsToScreen(v.subtile_x / 2, v.subtile_y / 2);
                viewer.viewPort.x = screen.x - viewer.viewPort.w / 2;
                viewer.viewPort.y = screen.y - viewer.viewPort.h / 2;
                if (typeof viewer.resetEntitiesCoords === 'function') viewer.resetEntitiesCoords();
            } catch (err) { /* ignore */ }
        }
    }
}

export const idleVillagerIndicator = new IdleVillagerIndicator();
