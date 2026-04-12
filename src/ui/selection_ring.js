/**
 * Animated selection ring overlay.
 *
 * The original engine draws a static rectangle around the selected
 * entity. This module adds a pulsing circular ring on top via a fixed
 * canvas overlay, sourced from `engine.selectedEntity` every animation
 * frame. Pure cosmetic — no engine code change required.
 */

class SelectionRingOverlay {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.raf = null;
    }

    mount() {
        if (this.canvas) return;
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'aoe-selection-ring';
        this.canvas.style.cssText = `
            position: fixed; left: 0; top: 0; right: 0; bottom: 0;
            pointer-events: none;
            z-index: 545;
        `;
        this._resize();
        window.addEventListener('resize', () => this._resize());
        document.body.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
        const loop = () => {
            this.tick();
            this.raf = requestAnimationFrame(loop);
        };
        this.raf = requestAnimationFrame(loop);
    }

    _resize() {
        if (!this.canvas) return;
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    tick() {
        const c = this.ctx;
        if (!c) return;
        c.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const engine = window.game?.navigator?.gameViewer?.engine;
        const viewer = window.game?.navigator?.gameViewer;
        const ent = engine?.selectedEntity;
        if (!ent || !viewer || !viewer.viewPort || !viewer.mapDrawable) return;

        try {
            const screen = viewer.mapDrawable.tileCoordsToScreen(ent.subtile_x / 2, ent.subtile_y / 2);
            const x = screen.x - viewer.viewPort.x;
            const y = screen.y - viewer.viewPort.y;
            const t = (Date.now() % 1500) / 1500;
            const radius = 18 + Math.sin(t * Math.PI * 2) * 3;
            // Outer faint ring + inner bright ring.
            c.lineWidth = 2;
            c.strokeStyle = `rgba(255, 230, 120, ${0.8 - t * 0.6})`;
            c.beginPath();
            c.arc(x, y, radius + 4, 0, Math.PI * 2);
            c.stroke();
            c.strokeStyle = '#ffe678';
            c.lineWidth = 1.5;
            c.beginPath();
            c.arc(x, y, radius, 0, Math.PI * 2);
            c.stroke();
        } catch (err) { /* ignore */ }
    }
}

export const selectionRingOverlay = new SelectionRingOverlay();
