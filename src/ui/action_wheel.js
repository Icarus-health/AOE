/**
 * Mobile Action Wheel — radial context menu for touch input.
 *
 * On phones the standard AoE2 hotkey strip at the bottom of the screen
 * is unusable: the buttons are 32×32 px and there are too many. This
 * module ships a radial menu that pops up next to a long-pressed entity
 * and shows the most useful contextual actions in a touch-first layout.
 *
 * The wheel is intentionally a *thin DOM overlay*, not a Konva layer,
 * so it survives a renderer swap (Phase 4 PixiJS migration).
 *
 * Activation:
 *   - Long-press anywhere → opens with no entity (camera-only commands).
 *   - Long-press a selected entity → opens with that entity's actions.
 *
 * Each slice is one of:
 *   - { label, hotkey, run() }            — single action
 *   - { label, hotkey, submenu: [...] }   — opens a child wheel
 *
 * The wheel reads its action list from a static `entityActions(entity)`
 * helper so adding new commands is one-line per entity type.
 */

const RADIUS = 110;          // px from centre to slice midpoint
const SLICE_SIZE = 64;       // px square per slice
const STYLE_ID = 'aoe-action-wheel-style';

function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const css = document.createElement('style');
    css.id = STYLE_ID;
    css.textContent = `
.aoe-action-wheel {
    position: fixed;
    z-index: 9999;
    pointer-events: none;
    transition: opacity 0.12s ease-out;
    opacity: 0;
}
.aoe-action-wheel.open { opacity: 1; }
.aoe-action-wheel .slice {
    position: absolute;
    width: ${SLICE_SIZE}px;
    height: ${SLICE_SIZE}px;
    margin-left: -${SLICE_SIZE / 2}px;
    margin-top: -${SLICE_SIZE / 2}px;
    border-radius: 50%;
    background: rgba(20, 20, 20, 0.86);
    color: #f4d35e;
    border: 2px solid #f4d35e;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: ui-sans-serif, system-ui, sans-serif;
    font-size: 12px;
    line-height: 1.1;
    text-align: center;
    pointer-events: auto;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6);
    user-select: none;
    -webkit-user-select: none;
    touch-action: manipulation;
    cursor: pointer;
}
.aoe-action-wheel .slice:active {
    background: #f4d35e;
    color: #181818;
}
.aoe-action-wheel .centre {
    position: absolute;
    left: -${SLICE_SIZE / 2}px;
    top: -${SLICE_SIZE / 2}px;
    width: ${SLICE_SIZE}px;
    height: ${SLICE_SIZE}px;
    border-radius: 50%;
    background: rgba(20, 20, 20, 0.5);
    border: 2px dashed rgba(244, 211, 94, 0.5);
    pointer-events: auto;
    cursor: pointer;
}
`;
    document.head.appendChild(css);
}

class ActionWheel {
    constructor() {
        this.root = null;
        this.open = false;
        this.dispatchKey = null;
    }
    install() {
        ensureStyle();
        this.root = document.createElement('div');
        this.root.className = 'aoe-action-wheel';
        document.body.appendChild(this.root);
        // Close on outside touch (the centre button captures inside taps).
        document.addEventListener('touchstart', (e) => {
            if (!this.open) return;
            if (this.root.contains(e.target)) return;
            this.close();
        }, { capture: true });
    }
    show(x, y, actions) {
        if (!this.root) this.install();
        this.root.innerHTML = '';
        this.root.style.left = `${x}px`;
        this.root.style.top = `${y}px`;
        // Centre button — closes the wheel.
        const centre = document.createElement('div');
        centre.className = 'centre';
        centre.addEventListener('click', () => this.close());
        this.root.appendChild(centre);
        // Slices arranged on a circle.
        const n = Math.max(1, actions.length);
        actions.forEach((action, idx) => {
            const angle = (idx / n) * Math.PI * 2 - Math.PI / 2;
            const sx = Math.cos(angle) * RADIUS;
            const sy = Math.sin(angle) * RADIUS;
            const slice = document.createElement('div');
            slice.className = 'slice';
            slice.style.left = `${sx}px`;
            slice.style.top = `${sy}px`;
            slice.textContent = action.label;
            slice.title = action.hotkey ? `${action.label} (${action.hotkey})` : action.label;
            slice.addEventListener('click', () => {
                this.close();
                if (typeof action.run === 'function') action.run();
                else if (action.hotkey) this.dispatchHotkey(action.hotkey);
            });
            this.root.appendChild(slice);
        });
        this.root.classList.add('open');
        this.open = true;
    }
    close() {
        if (!this.root) return;
        this.root.classList.remove('open');
        this.open = false;
    }
    dispatchHotkey(key) {
        // Synthesise a keydown so the existing hotkey layer handles the
        // command — keeps mobile and desktop on the same code path.
        const evt = new KeyboardEvent('keydown', { key, bubbles: true });
        document.dispatchEvent(evt);
    }
}

const wheel = new ActionWheel();

/**
 * Build a context-sensitive action list. Falls back to global camera /
 * stance commands when no entity is selected.
 */
export function entityActions(entity) {
    if (!entity) {
        return [
            { label: 'Idle\nVill', hotkey: '.' },
            { label: 'Town\nBell', hotkey: '`' },
            { label: 'Mute', hotkey: 'm' },
            { label: 'Menu', hotkey: 'Escape' },
        ];
    }
    // Villager — building / gathering shortcuts.
    if (entity.constructor && entity.constructor.name === 'Villager') {
        return [
            { label: 'Build', hotkey: 'b' },
            { label: 'Repair', hotkey: 'r' },
            { label: 'Stop', hotkey: 's' },
            { label: 'Aggr.', hotkey: 'F1' },
            { label: 'Defen.', hotkey: 'F2' },
            { label: 'Hold', hotkey: 'F3' },
            { label: 'Bell', hotkey: '`' },
        ];
    }
    // Building — production / research shortcuts. Most actions on
    // buildings live in the bottom action strip; we surface a generic
    // "Cancel" + stance-equivalent for towers/walls (garrison).
    if (entity.constructor && /Building|TownCenter|Tower|Castle/.test(entity.constructor.name)) {
        return [
            { label: 'Garr.', hotkey: 'g' },
            { label: 'Bell', hotkey: '`' },
            { label: 'Stop', hotkey: 's' },
        ];
    }
    // Generic combat unit fallback — stances + attack-move.
    return [
        { label: 'Aggr.', hotkey: 'F1' },
        { label: 'Defen.', hotkey: 'F2' },
        { label: 'Hold', hotkey: 'F3' },
        { label: 'No\nAtk', hotkey: 'F4' },
        { label: 'Patrol', hotkey: 'p' },
        { label: 'Stop', hotkey: 's' },
    ];
}

/**
 * Public API.
 *
 * Call `openActionWheel(x, y)` from the touch input layer when a
 * long-press is detected. The wheel reads the currently selected entity
 * from `window.game.engine.selectedEntity` so the call site does not
 * need to know about the simulation state.
 */
export function openActionWheel(x, y) {
    const engine = window.game && window.game.engine;
    const selected = engine ? engine.selectedEntity : null;
    wheel.show(x, y, entityActions(selected));
}

export function closeActionWheel() {
    wheel.close();
}

export function isActionWheelOpen() {
    return wheel.open;
}

/**
 * Detect a touch-first device. Used by the bootstrap code so the wheel
 * is only auto-installed on phones / tablets — desktop users keep their
 * hotkey strip without the radial overlay.
 */
export function isTouchDevice() {
    if (typeof window === 'undefined') return false;
    return ('ontouchstart' in window) ||
        (navigator.maxTouchPoints && navigator.maxTouchPoints > 1);
}
