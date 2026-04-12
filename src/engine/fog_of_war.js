/**
 * Fog of War.
 *
 * Per-player visibility map plus a DOM-canvas overlay that darkens
 * unexplored / out-of-sight areas. Three states per subtile:
 *   - 0  unexplored  → fully black
 *   - 1  explored    → dim (terrain visible, units NOT visible)
 *   - 2  visible     → fully bright
 *
 * Each owned unit / building emits a circular sight kernel during the
 * engine's `processFog` step. The visibility map is rebuilt every N
 * frames; in between we just down-grade "visible" to "explored".
 *
 * The overlay is a fixed-position DOM canvas painted via `globalCompositeOperation
 * = destination-out` so it punches holes through a black backdrop. This
 * keeps it cheap and means the fog renders ON TOP of the existing game
 * stage without touching the Graphics layer.
 *
 * Determinism: the visibility update only mutates `_fogVisibility` and
 * does NOT call gameRandom(), so it is safe to skip on spectator /
 * replay clients (cosmetic only).
 */

const STATE_UNEXPLORED = 0;
const STATE_EXPLORED   = 1;
const STATE_VISIBLE    = 2;

const SIGHT_RANGE = {
    villager: 6,
    infantry: 7,
    archer:   8,
    cavalry:  10,
    priest:   8,
    siege:    8,
    ship:     10,
    fishing_boat: 8,
    animal:   4,
    building: 9,
};

export class FogOfWar {
    constructor(engine, viewerPlayer) {
        this.engine = engine;
        this.player = viewerPlayer;
        const size = engine.map.edge_size * 2;
        this.size = size;
        // Single Uint8Array, row-major. Allows fast scanline reads from
        // the renderer.
        this.grid = new Uint8Array(size * size);
        this.lastUpdateFrame = -9999;
        this.enabled = true;
    }

    isEnabled() {
        // Allow disabling via the lobby revealMap flag, or via the
        // `aoe-game-settings.fogDisabled` setting.
        if (!this.enabled) return false;
        if (this.engine?.definition?.map?.revealMap) return false;
        try {
            const s = JSON.parse(localStorage.getItem('aoe-game-settings') || '{}');
            if (s.fogDisabled) return false;
        } catch { /* ignore */ }
        return true;
    }

    /**
     * Rebuild the visibility grid from the player's currently alive units
     * and buildings. Down-grades any tile that is currently VISIBLE but
     * out of sight to EXPLORED, then re-emits sight kernels.
     */
    update() {
        if (!this.isEnabled()) return;
        if (this.engine.framesCount - this.lastUpdateFrame < 10) return;
        this.lastUpdateFrame = this.engine.framesCount;

        // Demote visible → explored.
        for (let i = 0; i < this.grid.length; i++) {
            if (this.grid[i] === STATE_VISIBLE) this.grid[i] = STATE_EXPLORED;
        }

        // Emit sight from each owned entity.
        for (const u of this.engine.units) {
            if (u.destroyed || u.player !== this.player) continue;
            this._emit(u.subtile_x, u.subtile_y, sightFor(u));
        }
        for (const b of this.engine.buildings) {
            if (b.destroyed || b.player !== this.player) continue;
            const cx = b.subtile_x + (b.SUBTILE_WIDTH || 1) / 2;
            const cy = b.subtile_y + (b.SUBTILE_WIDTH || 1) / 2;
            this._emit(Math.floor(cx), Math.floor(cy), sightFor(b));
        }
    }

    _emit(cx, cy, radius) {
        const r2 = radius * radius;
        const minX = Math.max(0, cx - radius);
        const maxX = Math.min(this.size - 1, cx + radius);
        const minY = Math.max(0, cy - radius);
        const maxY = Math.min(this.size - 1, cy + radius);
        for (let y = minY; y <= maxY; y++) {
            const dy = y - cy;
            for (let x = minX; x <= maxX; x++) {
                const dx = x - cx;
                if (dx * dx + dy * dy <= r2) {
                    this.grid[y * this.size + x] = STATE_VISIBLE;
                }
            }
        }
    }

    /**
     * @param {number} subtileX
     * @param {number} subtileY
     * @returns 0/1/2
     */
    state(subtileX, subtileY) {
        if (subtileX < 0 || subtileY < 0 || subtileX >= this.size || subtileY >= this.size) return STATE_UNEXPLORED;
        return this.grid[subtileY * this.size + subtileX];
    }

    /** True if the entity should be drawn at all. */
    isEntityVisible(entity) {
        if (!this.isEnabled()) return true;
        if (entity.player === this.player) return true;
        const state = this.state(entity.subtile_x, entity.subtile_y);
        // Buildings remain visible after first sighting (the player
        // remembers seeing them); units only when currently visible.
        if (entity._isBuildingType) return state >= STATE_EXPLORED;
        return state === STATE_VISIBLE;
    }
}

function sightFor(entity) {
    if (entity._isBuildingType) return SIGHT_RANGE.building;
    return SIGHT_RANGE[entity.TYPE] || 6;
}

// ----------------------------------------------------------------------
// DOM canvas overlay renderer
// ----------------------------------------------------------------------
class FogRenderer {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.timer = null;
    }

    mount() {
        if (this.canvas) return;
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'aoe-fog-overlay';
        this.canvas.style.cssText = `
            position: fixed; left: 0; top: 0; right: 0; bottom: 0;
            pointer-events: none;
            z-index: 540;
            mix-blend-mode: multiply;
        `;
        this._resize();
        window.addEventListener('resize', () => this._resize());
        document.body.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
        this.timer = setInterval(() => this.tick(), 100);
    }

    _resize() {
        if (!this.canvas) return;
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    tick() {
        const engine = window.game?.navigator?.gameViewer?.engine;
        const viewer = window.game?.navigator?.gameViewer;
        if (!engine || !viewer || !viewer.viewPort || !viewer.mapDrawable) {
            this.ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
            return;
        }
        // Lazy-init the per-player fog grid.
        if (!engine._fog) {
            engine._fog = new FogOfWar(engine, engine.current_player);
        }
        engine._fog.update();
        if (!engine._fog.isEnabled()) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            return;
        }
        this._draw(engine, viewer);
    }

    _draw(engine, viewer) {
        const c = this.ctx;
        const W = this.canvas.width;
        const H = this.canvas.height;
        c.clearRect(0, 0, W, H);

        // Pixel-art style: paint a dark backdrop, then for every visible
        // subtile draw a small bright square at the corresponding screen
        // location. Coarse but cheap.
        c.fillStyle = '#000';
        c.fillRect(0, 0, W, H);
        c.globalCompositeOperation = 'destination-out';

        const fog = engine._fog;
        const md = viewer.mapDrawable;
        const vp = viewer.viewPort;
        const tw = md.TILE_SIZE?.width || 32;
        const th = md.TILE_SIZE?.height || 16;

        // Iterate every subtile in the visible viewport region only.
        // Convert viewport corners to subtile coords for a tight loop.
        const tlSub = md.screenCoordsToSubtile(vp.x - tw, vp.y - th);
        const brSub = md.screenCoordsToSubtile(vp.x + vp.w + tw, vp.y + vp.h + th);
        if (!tlSub || !brSub) return;

        const minX = Math.max(0, Math.min(tlSub.x, brSub.x) - 1);
        const maxX = Math.min(fog.size - 1, Math.max(tlSub.x, brSub.x) + 1);
        const minY = Math.max(0, Math.min(tlSub.y, brSub.y) - 1);
        const maxY = Math.min(fog.size - 1, Math.max(tlSub.y, brSub.y) + 1);

        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const s = fog.grid[y * fog.size + x];
                if (s === 0) continue;
                const screen = md.tileCoordsToScreen(x / 2, y / 2);
                const sx = screen.x - vp.x - 16;
                const sy = screen.y - vp.y - 8;
                c.globalAlpha = s === 2 ? 1.0 : 0.55;
                c.fillRect(sx, sy, 32, 16);
            }
        }
        c.globalAlpha = 1;
        c.globalCompositeOperation = 'source-over';
    }
}

export const fogRenderer = new FogRenderer();
