import { Wall } from './wall.js';
import { Sprites } from '../../sprites.js';

/**
 * Gate — a Wall variant with an open/closed state.
 *
 * AoE2 gates let allied units walk straight through and slam shut on
 * enemies. The original epoch-of-emperors engine has no per-subtile
 * permeability layer, so the cleanest approximation is to release the
 * gate's subtile area while it is open and re-occupy it when closed.
 *
 * This means an OPEN gate is functionally invisible to pathfinding —
 * enemy units will happily walk through it. That's a known limitation
 * compared to AoE2's "ally only" behaviour, but it's a single-subtile
 * tradeoff that lets the feature ship without rewriting the entire
 * pathfinder. Closing the gate immediately rebuilds the wall.
 *
 * Reuses Wall art and stats — no new sprite assets required.
 */
class Gate extends Wall {
    constructor() {
        super(...arguments);
        this.isOpen = false;
    }

    getName() {
        return this.isOpen ? 'Gate (open)' : 'Gate (closed)';
    }

    /**
     * Toggle the gate. Called from the lockstep command queue so every
     * peer sees the same state transition on the same simulation turn.
     */
    toggleGate(engine) {
        if (this.isOpen) this.closeGate(engine);
        else this.openGate(engine);
    }

    openGate(engine) {
        if (this.isOpen) return;
        this.isOpen = true;
        // Free the subtile area so units can walk through.
        if (engine && engine.map) {
            engine.map.fillSubtilesWith(this.subtile_x, this.subtile_y, this.SUBTILE_WIDTH, null);
        }
        // Visually fade out via a low opacity (sprite stays for hit-testing).
        this.attrs.opacity = 0.4;
    }

    closeGate(engine) {
        if (!this.isOpen) return;
        this.isOpen = false;
        if (engine && engine.map) {
            // Only re-occupy if no other entity has taken the area.
            const free = engine.map.areSubtilesEmpty(
                this.subtile_x, this.subtile_y, this.SUBTILE_WIDTH
            );
            if (free) {
                engine.map.fillSubtilesWith(this.subtile_x, this.subtile_y, this.SUBTILE_WIDTH, this);
            } else {
                // Area is blocked by a unit standing on the gate — keep
                // ourselves "open" until they move off.
                this.isOpen = true;
                return;
            }
        }
        this.attrs.opacity = 1;
    }

    static isResearched(player) {
        return player.possessions.SmallWall;
    }
}

Gate.prototype.NAME = ['Gate'];
Gate.prototype.SUBTILE_WIDTH = 2;
Gate.prototype.MAX_HP = [200, 300];
Gate.prototype.ACTION_KEY = 'G';
Gate.prototype.COST = {
    food: 0, wood: 0, stone: 30, gold: 0,
};

// Reuse the wall avatars / images so we don't need new art.
Gate.prototype.AVATAR = Wall.prototype.AVATAR;
Gate.prototype.IMAGES = Wall.prototype.IMAGES;
Gate.prototype.IMAGE_OFFSETS = Wall.prototype.IMAGE_OFFSETS;
Gate.prototype.STATE = Wall.prototype.STATE;
Gate.prototype.LEVELS_UP_ON_AGE = false;
Gate.prototype.CONTINUOUS_PREVIEW = false;
Gate.prototype.FLAME_POSITIONS = [];
Gate.prototype.EXPLOSION = null;

export { Gate };
