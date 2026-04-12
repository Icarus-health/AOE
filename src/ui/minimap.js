/**
 * DomMinimap — optional DOM-level minimap overlay.
 *
 * The built-in Graphics-layer minimap (rendered inside the bottom bar by
 * `viewer.js`) remains the default. This helper exposes a secondary, fixed
 * DOM `<canvas>` minimap that is easier to style and position independently
 * of the Graphics layer hierarchy, as described in the modernisation plan.
 *
 * Usage:
 *   import { DomMinimap } from './ui/minimap.js';
 *   const m = new DomMinimap(engine);
 *   setInterval(() => m.render(), 1000 / 10);
 */
export class DomMinimap {
    constructor(engine, { width = 220, height = 160, anchor = 'bottom-right' } = {}) {
        this.engine = engine;
        this.canvas = document.createElement('canvas');
        this.canvas.width = width;
        this.canvas.height = height;
        this.ctx = this.canvas.getContext('2d');

        this.canvas.style.cssText = `
            position: fixed;
            ${anchor.includes('bottom') ? 'bottom: 12px' : 'top: 12px'};
            ${anchor.includes('right')  ? 'right: 12px'  : 'left: 12px'};
            border: 2px solid #8B7355;
            background: #0d1a0d;
            box-shadow: 0 2px 8px rgba(0,0,0,0.6);
            z-index: 500;
            pointer-events: none;
        `;
        document.body.appendChild(this.canvas);
    }

    destroy() {
        this.canvas.remove();
    }

    render() {
        const { engine } = this;
        if (!engine || !engine.map) return;

        const map = engine.map;
        const size = map.edge_size * 2;
        const scaleX = this.canvas.width / size;
        const scaleY = this.canvas.height / size;

        // Terrain backdrop.
        this.ctx.fillStyle = '#2d4a2d';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Buildings first (larger dots).
        for (const b of engine.buildings) {
            if (b.destroyed) continue;
            this.ctx.fillStyle = this.playerColor(b.player);
            this.ctx.fillRect(
                Math.floor(b.subtile_x * scaleX),
                Math.floor(b.subtile_y * scaleY),
                Math.max(3, Math.round((b.SUBTILE_WIDTH || 2) * scaleX)),
                Math.max(3, Math.round((b.SUBTILE_WIDTH || 2) * scaleY))
            );
        }

        // Units on top.
        for (const u of engine.units) {
            if (u.destroyed) continue;
            this.ctx.fillStyle = this.playerColor(u.player);
            this.ctx.fillRect(
                Math.floor(u.subtile_x * scaleX),
                Math.floor(u.subtile_y * scaleY),
                2,
                2
            );
        }

        // Viewport indicator.
        const viewer = engine.viewer;
        if (viewer && viewer.viewPort && viewer.mapDrawable) {
            const vp = viewer.viewPort;
            const tileW = viewer.mapDrawable.TILE_SIZE?.width || 32;
            const tileH = viewer.mapDrawable.TILE_SIZE?.height || 16;
            const cx = (vp.x + vp.w / 2) / (tileW * map.edge_size) * this.canvas.width;
            const cy = (vp.y + vp.h / 2) / (tileH * map.edge_size) * this.canvas.height;
            const w = (vp.w / (tileW * map.edge_size)) * this.canvas.width;
            const h = (vp.h / (tileH * map.edge_size)) * this.canvas.height;
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
        }
    }

    playerColor(player) {
        const colors = ['#2b5cd5', '#d52b2b', '#ffeb3b', '#8b5a2b', '#ff7f15', '#2b7a2b', '#b3b3b3', '#2bbf93'];
        return colors[player?.color] || '#ffffff';
    }
}
