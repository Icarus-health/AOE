/**
 * Garrisoning system.
 *
 * AoE2 lets infantry, archers and villagers shelter inside Town Centers,
 * Towers and Castles. Garrisoned archers fire extra arrows; villagers
 * become safe from harm; the player can ungarrison everything in one
 * click. This module ports a stripped-down version of that to the
 * existing engine.
 *
 * Implementation notes:
 *   - Each garrison-capable building gains a `garrisonedUnits` array.
 *   - When a unit enters, we remove it from the simulation grid (so it
 *     no longer collides or pathfinds) and hide its sprite. The unit is
 *     not destroyed; ungarrisoning re-emits it on a free adjacent tile.
 *   - The tower's attack damage scales with garrison count (+2 per unit
 *     up to a +12 cap), modelling AoE2's "garrisoned archer arrows"
 *     without having to spawn extra projectile entities.
 *   - All transitions go through the lockstep command queue
 *     (COMMANDS.GARRISON / COMMANDS.UNGARRISON) so multiplayer peers stay
 *     in sync.
 */

const MAX_GARRISON = 10;
const ATTACK_BONUS_PER_UNIT = 2;
const ATTACK_BONUS_CAP = 12;

/** True if a building can host garrisoned units. */
export function canGarrison(building) {
    if (!building) return false;
    const name = building.constructor.name;
    return name === 'TownCenter' || name === 'Tower';
}

/** True if a unit can be garrisoned (no animals, no ships). */
export function canBeGarrisoned(unit) {
    if (!unit) return false;
    const t = unit.TYPE;
    return t === 'villager' || t === 'infantry' || t === 'archer' || t === 'priest';
}

/**
 * Move a unit into a building. Returns true on success.
 * Both arguments must already be on the same map (engine.map).
 */
export function garrisonUnit(engine, unit, building) {
    if (!canGarrison(building) || !canBeGarrisoned(unit)) return false;
    if (!building.garrisonedUnits) building.garrisonedUnits = [];
    if (building.garrisonedUnits.length >= MAX_GARRISON) return false;
    if (unit.player !== building.player) return false;

    // Free the subtile area the unit currently occupies.
    if (typeof engine.map.fillSubtilesWith === 'function') {
        engine.map.fillSubtilesWith(unit.subtile_x, unit.subtile_y, unit.SUBTILE_WIDTH, null);
    }
    // Detach the sprite from the rendering layer.
    if (engine.viewer && engine.viewer.entitiesHolder && unit.parent) {
        try { unit.remove(); } catch (err) { /* ignore */ }
    }
    unit._garrisonedIn = building;
    unit.path = null;
    unit.path_progress = 0;
    if (typeof unit.stopInteraction === 'function') unit.stopInteraction();
    building.garrisonedUnits.push(unit);

    refreshAttackBonus(building);
    return true;
}

/**
 * Empty the garrison of a building. Units re-emerge on free adjacent
 * subtiles in deterministic order; if the area is fully blocked the unit
 * stays in the building.
 */
export function ungarrisonAll(engine, building) {
    if (!building.garrisonedUnits || building.garrisonedUnits.length === 0) return;
    const remaining = [];
    for (const unit of building.garrisonedUnits) {
        const pos = findFreeAdjacent(engine, building, unit.SUBTILE_WIDTH || 1);
        if (!pos) { remaining.push(unit); continue; }
        unit.subtile_x = pos.x;
        unit.subtile_y = pos.y;
        unit._garrisonedIn = null;
        if (engine.viewer && engine.viewer.mapDrawable) {
            try {
                const screen = engine.viewer.mapDrawable.tileCoordsToScreen(pos.x / 2, pos.y / 2);
                unit.position(screen);
            } catch (err) { /* ignore */ }
        }
        engine.map.fillSubtilesWith(pos.x, pos.y, unit.SUBTILE_WIDTH, unit);
        if (engine.viewer && engine.viewer.entitiesHolder && typeof engine.viewer.addEntity === 'function') {
            try { engine.viewer.addEntity(unit); } catch (err) { /* ignore */ }
        }
    }
    building.garrisonedUnits = remaining;
    refreshAttackBonus(building);
}

/**
 * Recompute the attack bonus a tower / town center receives from its
 * garrisoned units. Stored as `building.attributes.garrisonBonus` and
 * read by the modified attack interaction.
 */
export function refreshAttackBonus(building) {
    if (!building.garrisonedUnits) return;
    const count = building.garrisonedUnits.length;
    const bonus = Math.min(count * ATTACK_BONUS_PER_UNIT, ATTACK_BONUS_CAP);
    if (!building.attributes) building.attributes = {};
    building.attributes.garrisonBonus = bonus;
}

function findFreeAdjacent(engine, building, width) {
    const map = engine.map;
    if (!map || !map.subtiles) return null;
    const w = building.SUBTILE_WIDTH || 1;
    const cx = building.subtile_x;
    const cy = building.subtile_y;

    for (let r = 1; r <= 4; r++) {
        for (let i = -r; i <= w + r; i++) {
            const candidates = [
                { x: cx + i,         y: cy - r       },
                { x: cx + i,         y: cy + w + r - 1 },
                { x: cx - r,         y: cy + i       },
                { x: cx + w + r - 1, y: cy + i       },
            ];
            for (const c of candidates) {
                if (c.x < 0 || c.y < 0) continue;
                if (typeof map.areSubtilesEmpty === 'function' && map.areSubtilesEmpty(c.x, c.y, width)) {
                    return c;
                }
            }
        }
    }
    return null;
}

export const GARRISON_LIMITS = {
    MAX_GARRISON,
    ATTACK_BONUS_PER_UNIT,
    ATTACK_BONUS_CAP,
};
