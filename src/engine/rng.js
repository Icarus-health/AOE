/**
 * Deterministic seeded PRNG (mulberry32) for the engine simulation.
 *
 * Lockstep multiplayer requires that every client produce the *exact* same
 * gameplay events from the same input stream — that means we cannot rely
 * on `Math.random()`, which seeds itself per JavaScript context.
 *
 * Game-logic call sites import `gameRandom`, `randomInt`, `randomChoice`
 * and `randomAngle` from this module. The active simulation seeds the
 * RNG via `seedGameRandom(seed)` before the first frame; net commands
 * arrive in lockstep order so subsequent calls remain in sync.
 *
 * Cosmetic call sites (audio jitter, sprite variants for tree / mine art)
 * can keep using `Math.random()` because they have no effect on the sim.
 */

let _state = (Date.now() ^ 0x9e3779b9) >>> 0;
let _seedValue = _state;

/** Seed (or re-seed) the global game RNG. */
export function seedGameRandom(seed) {
    if (seed == null) seed = (Date.now() ^ 0x9e3779b9) >>> 0;
    _seedValue = seed >>> 0;
    _state = _seedValue;
}

// Late-bind the deterministic RNG into utils.rand_choice so map generators
// and action helpers go through it without creating an import cycle.
import { _setGameRandomImpl } from '../utils.js';
_setGameRandomImpl(gameRandom);

/** Get the seed currently used (so we can checksum / sync between peers). */
export function getGameSeed() {
    return _seedValue;
}

/**
 * Drop-in replacement for `Math.random()`. Returns a float in [0, 1).
 * Implementation: mulberry32 — fast, decent statistical quality, identical
 * results across every JS engine because it only uses 32-bit integer ops.
 */
export function gameRandom() {
    _state = (_state + 0x6D2B79F5) >>> 0;
    let t = _state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randomInt(maxExclusive) {
    return Math.floor(gameRandom() * maxExclusive);
}

export function randomChoice(arr) {
    if (!arr || arr.length === 0) return undefined;
    return arr[Math.floor(gameRandom() * arr.length)];
}

export function randomAngle() {
    return gameRandom() * Math.PI * 2;
}

/**
 * Tiny FNV-1a hash, useful for taking turn checksums of the simulation
 * state to detect desyncs early.
 */
export function fnv1a(str) {
    let h = 0x811c9dc5 >>> 0;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
}
