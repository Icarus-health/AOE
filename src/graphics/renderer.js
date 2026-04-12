/**
 * Renderer abstraction.
 *
 * The original engine talks directly to a hand-rolled Konva-like graphics
 * API in `src/graphics/graphics.js` (Node, Layer, Stage). That module
 * does NOT use ES module exports — it attaches everything to the global
 * `window.Graphics`. The whole engine then references `Graphics.*`.
 *
 * Phase 4 of the AoE2 modernisation roadmap migrates the visual layer to
 * PixiJS for WebGL acceleration, batched draw calls and better mobile
 * performance. To make that migration safe we route every renderer
 * resolution through the factory in this module, so a future PixiJS
 * implementation can either:
 *
 *   1. Replace the contents of `window.Graphics` (drop-in for legacy code),
 *      or
 *   2. Provide a parallel API the engine progressively migrates onto.
 *
 * In Phase 1 the factory simply returns the canvas-backed `window.Graphics`
 * with a small `name` field plus a couple of convenience constructors.
 * Setting `localStorage.aoeRenderer = 'pixi'` (or `?renderer=pixi`) opts
 * in to the experimental path; today it logs a warning and falls back.
 */

// Importing for side effects: graphics.js installs `window.Graphics`.
import './graphics.js';

const RENDERER_KEY = 'aoeRenderer';

function readPreference() {
    if (typeof window === 'undefined') return 'canvas';
    try {
        const url = new URL(window.location.href);
        const q = url.searchParams.get('renderer');
        if (q) return q;
    } catch (_) { /* ignore */ }
    try {
        return window.localStorage?.getItem(RENDERER_KEY) || 'canvas';
    } catch (_) {
        return 'canvas';
    }
}

function getCanvasRenderer() {
    const G = (typeof window !== 'undefined' && window.Graphics) || {};
    return {
        name: 'canvas',
        primitives: G,
        createStage(options) { return new G.Stage(options); },
        createLayer(options) { return new G.Layer(options); },
    };
}

/**
 * Pixi renderer stub. Phase 4 swaps the implementation in for real.
 *
 * Right now it logs a friendly fallback warning and returns the canvas
 * renderer so the game still boots if the user accidentally enables the
 * experimental flag before the migration ships.
 */
function getPixiRenderer() {
    if (typeof window !== 'undefined') {
        console.warn('[renderer] PixiJS renderer is not yet implemented (Phase 4 of the AoE2 roadmap). Falling back to canvas renderer.');
    }
    return getCanvasRenderer();
}

let _activeRenderer = null;

export function getRenderer() {
    if (_activeRenderer) return _activeRenderer;
    const pref = readPreference();
    if (pref === 'pixi') {
        _activeRenderer = getPixiRenderer();
    } else {
        _activeRenderer = getCanvasRenderer();
    }
    return _activeRenderer;
}

export function setRendererPreference(name) {
    if (typeof window === 'undefined') return;
    try { window.localStorage?.setItem(RENDERER_KEY, name); } catch (_) {}
    // Force re-resolution on next call.
    _activeRenderer = null;
}

export function getActiveRendererName() {
    return getRenderer().name;
}
