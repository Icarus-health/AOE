/**
 * Floating damage numbers + low-HP health bars.
 *
 * Two pieces in one module:
 *   - DamageText: a single fixed canvas overlay that draws short-lived
 *     "+12" floats over hit positions. Hooked into Engine via
 *     `engine.onHit(victim, amount)`.
 *   - HealthBars: when an entity drops below 100 % HP we draw a small
 *     coloured bar above it. The original engine only shows a bar for
 *     the *selected* entity; this overlay shows them for everything
 *     under attack.
 *
 * Both readers poll window.game on a 50 ms interval (~20 FPS) — fast
 * enough to feel live without competing with the engine for budget.
 *
 * Settings: respects `aoe-game-settings.damageNumbers`.
 */
class DamageOverlay {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.floats = [];
        this.timer = null;
    }

    mount() {
        if (this.canvas) return;
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'aoe-dmg-overlay';
        this.canvas.style.cssText = `
            position: fixed; left: 0; top: 0; right: 0; bottom: 0;
            pointer-events: none;
            z-index: 550;
        `;
        this._resize();
        window.addEventListener('resize', () => this._resize());
        document.body.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
        this.timer = setInterval(() => this._tick(), 50);
    }

    _resize() {
        if (!this.canvas) return;
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    spawn(x, y, text, color = '#ff5c5c') {
        const enabled = this._isEnabled();
        if (!enabled) return;
        this.floats.push({
            x, y, text, color, life: 1,
        });
    }

    _isEnabled() {
        try {
            const s = JSON.parse(localStorage.getItem('aoe-game-settings') || '{}');
            return !!s.damageNumbers;
        } catch { return false; }
    }

    _tick() {
        if (!this.ctx) return;
        const c = this.ctx;
        c.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Decay existing floats.
        const next = [];
        for (const f of this.floats) {
            f.life -= 0.04;
            f.y -= 1.2;
            if (f.life > 0) {
                c.globalAlpha = Math.max(0, f.life);
                c.font = 'bold 14px sans-serif';
                c.fillStyle = '#000';
                c.fillText(f.text, f.x + 1, f.y + 1);
                c.fillStyle = f.color;
                c.fillText(f.text, f.x, f.y);
                next.push(f);
            }
        }
        c.globalAlpha = 1;
        this.floats = next;

        // Health bars over damaged units.
        const engine = window.game?.navigator?.gameViewer?.engine;
        const viewer = window.game?.navigator?.gameViewer;
        if (engine && viewer && viewer.viewPort && viewer.mapDrawable) {
            this._drawHealthBars(engine, viewer);
        }
    }

    _drawHealthBars(engine, viewer) {
        const c = this.ctx;
        const md = viewer.mapDrawable;
        const vp = viewer.viewPort;
        const drawOne = (e) => {
            if (e.destroyed) return;
            if (e.hp == null || e.max_hp == null || e.hp >= e.max_hp) return;
            try {
                const screen = md.tileCoordsToScreen(e.subtile_x / 2, e.subtile_y / 2);
                const x = Math.round(screen.x - vp.x);
                const y = Math.round(screen.y - vp.y) - 28;
                const w = 24;
                const h = 3;
                const ratio = Math.max(0, Math.min(1, e.hp / e.max_hp));
                c.fillStyle = '#000';
                c.fillRect(x - w/2 - 1, y - 1, w + 2, h + 2);
                c.fillStyle = ratio > 0.6 ? '#3aef3a' : ratio > 0.3 ? '#ffc62a' : '#ff3030';
                c.fillRect(x - w/2, y, w * ratio, h);
            } catch (err) { /* ignore tiles outside viewport */ }
        };
        for (const u of engine.units) drawOne(u);
        for (const b of engine.buildings) drawOne(b);
    }
}

export const damageOverlay = new DamageOverlay();
