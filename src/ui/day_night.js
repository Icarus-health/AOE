/**
 * Day/Night cycle — purely cosmetic colour-tint overlay.
 *
 * A fixed-position semi-transparent <div> covers the canvas with a
 * blue-shifted hue at "night" and clears at "day". The cycle period is
 * 4 minutes wall-clock so a full match sees several rotations.
 *
 * Toggleable via the Settings menu (`aoe-game-settings.dayNight`). The
 * overlay is `pointer-events: none` so it never interferes with input.
 */

class DayNightCycle {
    constructor() {
        this.root = null;
        this.timer = null;
        this.startedAt = Date.now();
    }

    mount() {
        if (this.root) return;
        this.root = document.createElement('div');
        this.root.id = 'aoe-daynight';
        this.root.style.cssText = `
            position: fixed; left: 0; top: 0; right: 0; bottom: 0;
            pointer-events: none;
            z-index: 530;
            transition: background 4s linear;
            background: rgba(0,0,0,0);
        `;
        document.body.appendChild(this.root);
        this.timer = setInterval(() => this.tick(), 1000);
    }

    unmount() {
        if (this.timer) clearInterval(this.timer);
        if (this.root) { this.root.remove(); this.root = null; }
    }

    isEnabled() {
        try {
            const s = JSON.parse(localStorage.getItem('aoe-game-settings') || '{}');
            return !!s.dayNight;
        } catch { return false; }
    }

    tick() {
        if (!this.root) return;
        if (!this.isEnabled()) {
            this.root.style.background = 'rgba(0,0,0,0)';
            return;
        }
        // Sinusoidal day/night, period = 4 minutes.
        const elapsed = (Date.now() - this.startedAt) / 1000;
        const phase = (Math.sin((elapsed / 240) * Math.PI * 2) + 1) / 2; // 0..1
        const darkness = phase * 0.45;
        const blueTint = phase * 60;
        this.root.style.background = `rgba(${20 - blueTint/3}, ${20 - blueTint/3}, ${60 + blueTint}, ${darkness})`;
    }
}

export const dayNightCycle = new DayNightCycle();
