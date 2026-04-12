import { Villager } from '../units/villager.js';
import { ClubMan } from '../units/clubman.js';
import { BowMan } from '../units/bowman.js';
import { Unit } from '../units/unit.js';
import { Building } from '../buildings/building.js';
import { TownCenter } from '../buildings/town_center.js';
import { House } from '../buildings/house.js';
import { Barracks } from '../buildings/barracks.js';
import { ArcheryRange } from '../buildings/archery_range.js';
import { StoragePit } from '../buildings/storage_pit.js';
import { Granary } from '../buildings/granary.js';
import { Bush } from '../resources/bush.js';
import { GoldMine } from '../resources/gold.js';
import { StoneMine } from '../resources/stone.js';
import { LeafTree } from '../trees.js';
import { UNIT_TYPES } from '../../utils.js';


/**
 * AIPlayer — drives a single CPU player with a simple three-state machine.
 *
 * States:
 *   - building:   produce villagers, gather resources, build the economy
 *   - expanding:  build military structures, recruit fighters
 *   - attacking:  send the army at the nearest human enemy
 *
 * The AI uses the same public Engine methods that the human-player UI uses
 * (`interactOrder`, `moveOrder`, `addBuilding`, `addUnit`) so its actions
 * honour the same rules as player actions.
 */
export class AIPlayer {
    constructor(player, engine, difficulty = 'normal') {
        this.player = player;
        this.engine = engine;
        this.difficulty = difficulty;
        this.tickInterval = AIPlayer.TICK_INTERVALS[difficulty] ?? AIPlayer.TICK_INTERVALS.normal;
        this.state = 'building';

        // internal bookkeeping
        this.lastAttackFrame = 0;
        this.lastBuildFrame = 0;
        this.armyRallyPoint = null;
    }

    // How often the AI re-evaluates its plan (in engine frames).
    static TICK_INTERVALS = {
        easy: 140,
        normal: 70,
        hard: 35,
    };

    // Map the in-game difficulty setting (0..2) to an AI difficulty label.
    static difficultyFromIndex(idx) {
        return ['easy', 'normal', 'hard'][idx] || 'normal';
    }

    tick(frameCount) {
        if (frameCount % this.tickInterval !== 0) return;

        this.evaluateState();

        switch (this.state) {
            case 'building':
                this.doBuildingPhase();
                break;
            case 'expanding':
                this.doExpansionPhase();
                break;
            case 'attacking':
                this.doAttackPhase();
                break;
        }
    }

    // ------------------------------------------------------------------
    // State machine
    // ------------------------------------------------------------------
    evaluateState() {
        const units = this.getMyUnits();
        const buildings = this.getMyBuildings();
        const villagers = units.filter((u) => u.TYPE === UNIT_TYPES.VILLAGER);
        const military = units.filter((u) => u.TYPE !== UNIT_TYPES.VILLAGER && u.TYPE !== UNIT_TYPES.ANIMAL);

        if (villagers.length < 8 || buildings.length < 3) {
            this.state = 'building';
        } else if (military.length < 10) {
            this.state = 'expanding';
        } else {
            this.state = 'attacking';
        }
    }

    // ------------------------------------------------------------------
    // Phase: building — economy bootstrap
    // ------------------------------------------------------------------
    doBuildingPhase() {
        const villagers = this.getMyUnits().filter((u) => u.TYPE === UNIT_TYPES.VILLAGER);
        const buildings = this.getMyBuildings();
        const resources = this.player.resources || {};

        // 1. Ensure there is at least one Town Center.
        if (!buildings.some((b) => b instanceof TownCenter)) {
            this.tryBuildNear(TownCenter, null);
        }

        // 2. Ensure population headroom.
        if (this.player.population + 2 >= this.player.max_population) {
            this.tryBuildNear(House, null);
        }

        // 3. Storage for resources.
        if (!buildings.some((b) => b instanceof StoragePit) && (resources.wood ?? 0) >= 150) {
            this.tryBuildNear(StoragePit, null);
        }
        if (!buildings.some((b) => b instanceof Granary) && (resources.wood ?? 0) >= 150) {
            this.tryBuildNear(Granary, null);
        }

        // 4. Produce villagers from the Town Center (direct spawn — we are
        //    bypassing the UI-driven queue).
        if (villagers.length < 12 && (resources.food ?? 0) >= 50) {
            this.spawnUnitNear(Villager, TownCenter, { food: 50 });
        }

        // 5. Assign idle villagers to gather resources with the goal of
        //    balancing food > wood > gold > stone.
        this.assignIdleVillagers(villagers);
    }

    // ------------------------------------------------------------------
    // Phase: expanding — military production
    // ------------------------------------------------------------------
    doExpansionPhase() {
        const buildings = this.getMyBuildings();
        const units = this.getMyUnits();
        const resources = this.player.resources || {};

        // Make sure we keep up on population supply.
        if (this.player.population + 3 >= this.player.max_population) {
            this.tryBuildNear(House, null);
        }

        if (!buildings.some((b) => b instanceof Barracks)) {
            this.tryBuildNear(Barracks, null);
        }
        if (units.length > 12 && !buildings.some((b) => b instanceof ArcheryRange)) {
            this.tryBuildNear(ArcheryRange, null);
        }

        // Produce a mix of infantry and archers.
        const military = units.filter((u) => u.TYPE !== UNIT_TYPES.VILLAGER && u.TYPE !== UNIT_TYPES.ANIMAL);
        if (military.length < 10 && (resources.food ?? 0) >= 50) {
            const barracks = buildings.find((b) => b instanceof Barracks);
            if (barracks) {
                this.spawnUnitNear(ClubMan, Barracks, { food: 50 });
            }
            const range = buildings.find((b) => b instanceof ArcheryRange);
            if (range && (resources.wood ?? 0) >= 20) {
                this.spawnUnitNear(BowMan, ArcheryRange, { food: 40, wood: 20 });
            }
        }

        // Keep the economy ticking in the background.
        this.assignIdleVillagers(
            this.getMyUnits().filter((u) => u.TYPE === UNIT_TYPES.VILLAGER)
        );
    }

    // ------------------------------------------------------------------
    // Phase: attacking — coordinated push
    // ------------------------------------------------------------------
    doAttackPhase() {
        const army = this.getMyUnits().filter(
            (u) => u.CAN_ATTACK && u.TYPE !== UNIT_TYPES.VILLAGER && u.TYPE !== UNIT_TYPES.ANIMAL
        );
        if (army.length < 6) {
            // Not enough troops yet — drop back to expansion.
            this.state = 'expanding';
            return;
        }

        // Pick a target: nearest enemy building, falling back to any enemy unit.
        const target = this.findAttackTarget();
        if (!target) {
            // No one to fight — retreat to expansion.
            this.state = 'expanding';
            return;
        }

        for (const soldier of army) {
            try {
                this.engine.interactOrder(soldier, target);
            } catch (err) {
                // Interactions occasionally fail if path-finding gives up;
                // we just keep going with the other units.
            }
        }
        this.lastAttackFrame = this.engine.framesCount;
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------
    getMyUnits() {
        return this.engine.units.filter((u) => u.player === this.player && !u.destroyed);
    }

    getMyBuildings() {
        return this.engine.buildings.filter((b) => b.player === this.player && !b.destroyed);
    }

    findNearestEntity(predicate, from) {
        let best = null;
        let bestDist = Infinity;
        const entities = this.engine.map?.entities || [];
        for (const e of entities) {
            if (!predicate(e)) continue;
            const dx = (e.subtile_x ?? 0) - (from?.subtile_x ?? 0);
            const dy = (e.subtile_y ?? 0) - (from?.subtile_y ?? 0);
            const d = Math.abs(dx) + Math.abs(dy);
            if (d < bestDist) {
                bestDist = d;
                best = e;
            }
        }
        return best;
    }

    findAttackTarget() {
        const mine = this.getMyBuildings()[0] || this.getMyUnits()[0];
        if (!mine) return null;

        // Nearest enemy building.
        const enemyBuilding = this.findNearestEntity(
            (e) => e instanceof Building && e.player && e.player !== this.player && !e.destroyed,
            mine
        );
        if (enemyBuilding) return enemyBuilding;

        // Else nearest enemy unit.
        return this.findNearestEntity(
            (e) => e instanceof Unit && e.player && e.player !== this.player && !e.destroyed,
            mine
        );
    }

    /**
     * Assign villagers that are currently idle to the nearest resource.
     * Priority follows Food → Wood → Gold → Stone.
     */
    assignIdleVillagers(villagers) {
        for (const v of villagers) {
            // "idle" ≈ no path, no active interaction.
            const isIdle = !v.path && !v.interactionObject;
            if (!isIdle) continue;

            const priorities = [Bush, LeafTree, GoldMine, StoneMine];
            for (const ResourceClass of priorities) {
                const target = this.findNearestEntity(
                    (e) => e instanceof ResourceClass && !e.destroyed,
                    v
                );
                if (target) {
                    try {
                        this.engine.interactOrder(v, target);
                    } catch (err) { /* ignore */ }
                    break;
                }
            }
        }
    }

    /**
     * Try to build a structure by directly placing it near an existing
     * friendly building (or, if we have none yet, near the first villager).
     * Bypasses the UI's construction-indicator flow.
     */
    tryBuildNear(BuildingClass, AnchorClass) {
        if (this.engine.framesCount - this.lastBuildFrame < 30) return;
        const cost = BuildingClass.prototype.COST || {};
        if (this.player.deficitResource(cost)) return;

        // Find an anchor (existing friendly building or a villager).
        let anchor = null;
        if (AnchorClass) {
            anchor = this.getMyBuildings().find((b) => b instanceof AnchorClass);
        }
        if (!anchor) anchor = this.getMyBuildings()[0];
        if (!anchor) anchor = this.getMyUnits().find((u) => u.TYPE === UNIT_TYPES.VILLAGER);
        if (!anchor) return;

        const width = BuildingClass.prototype.SUBTILE_WIDTH || 3;
        const pos = this.findFreeArea(anchor.subtile_x, anchor.subtile_y, width, 6);
        if (!pos) return;

        this.player.subtractResources(cost);
        const building = new BuildingClass(pos.x, pos.y, this.player);
        if (typeof building.setComplete === 'function') building.setComplete();
        this.engine.addBuilding(building);
        if (this.engine.viewer && typeof this.engine.viewer.addEntity === 'function') {
            try { this.engine.viewer.addEntity(building); } catch (err) { /* ignore */ }
        }
        this.lastBuildFrame = this.engine.framesCount;
    }

    /**
     * Spawn a unit directly next to the first matching production building.
     * This bypasses the Action queue but lets the AI produce units without
     * having to drive the BottomBar UI.
     */
    spawnUnitNear(UnitClass, AnchorClass, costOverride = null) {
        if (this.player.population >= this.player.max_population) return;
        const cost = costOverride || UnitClass.prototype.COST || {};
        if (this.player.deficitResource(cost)) return;

        const anchor = this.getMyBuildings().find((b) => b instanceof AnchorClass);
        if (!anchor) return;

        const width = UnitClass.prototype.SUBTILE_WIDTH || 1;
        const pos = this.findFreeArea(
            anchor.subtile_x + (anchor.SUBTILE_WIDTH || 3),
            anchor.subtile_y + (anchor.SUBTILE_WIDTH || 3),
            width,
            4
        );
        if (!pos) return;

        this.player.subtractResources(cost);
        const unit = new UnitClass(pos.x, pos.y, this.player);
        this.engine.addUnit(unit);
        if (this.engine.viewer && typeof this.engine.viewer.addEntity === 'function') {
            try { this.engine.viewer.addEntity(unit); } catch (err) { /* ignore */ }
        }
    }

    /**
     * Find a subtile rectangle of the requested width that is free on the
     * map, searching in an outward-expanding ring around (cx, cy).
     */
    findFreeArea(cx, cy, width, maxRadius = 5) {
        const map = this.engine.map;
        if (!map || !map.subtiles) return null;

        const canPlace = (x, y) => {
            if (x < 0 || y < 0) return false;
            if (x + width >= map.edge_size * 2) return false;
            if (y + width >= map.edge_size * 2) return false;
            if (typeof map.areSubtilesEmpty === 'function') {
                return map.areSubtilesEmpty(x, y, width);
            }
            for (let ix = x; ix < x + width; ix++) {
                for (let iy = y; iy < y + width; iy++) {
                    if (map.subtiles[ix]?.[iy] != null) return false;
                }
            }
            return true;
        };

        for (let r = 1; r <= maxRadius; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dy = -r; dy <= r; dy++) {
                    if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                    const x = cx + dx;
                    const y = cy + dy;
                    if (canPlace(x, y)) return { x, y };
                }
            }
        }
        return null;
    }
}
