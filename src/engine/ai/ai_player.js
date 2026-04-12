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
import { Tower } from '../buildings/tower.js';
import { Wall } from '../buildings/wall.js';
import { Stable } from '../buildings/stable.js';
import { Bush } from '../resources/bush.js';
import { GoldMine } from '../resources/gold.js';
import { StoneMine } from '../resources/stone.js';
import { LeafTree } from '../trees.js';
import { UNIT_TYPES } from '../../utils.js';
import { gameRandom } from '../rng.js';


/**
 * AIPlayer — drives a single CPU player with a build-order driven state
 * machine, scout, and reactive defence.
 *
 * Phases:
 *   - building   produce villagers, gather resources, follow a build order
 *   - expanding  add military buildings & train units
 *   - attacking  group army & strike
 *
 * Difficulty controls:
 *   - tick interval (how snappy the AI feels)
 *   - villager target (economy ceiling)
 *   - army size threshold for switching to attack
 *   - build order length & variety
 *
 * The AI also reacts to enemy proximity ("danger near base") by spawning
 * defensive militia and recalling scouts. Build orders are picked at game
 * start using the seeded RNG so multiplayer matches stay deterministic.
 */
export class AIPlayer {
    constructor(player, engine, difficulty = 'normal', personality = null) {
        this.player = player;
        this.engine = engine;
        this.difficulty = difficulty;
        // Personality overrides difficulty if it names an existing profile,
        // otherwise it just becomes a label. This lets the lobby pass either
        // ("hard") or ("normal" + "rusher") and get sensible behaviour.
        let profile = AIPlayer.PROFILES[personality] || AIPlayer.PROFILES[difficulty] || AIPlayer.PROFILES.normal;
        this.tickInterval = profile.tickInterval;
        this.profile = profile;
        this.personality = profile.personality || 'balanced';
        this.state = 'building';

        // Pick a deterministic build order from the difficulty's pool.
        this.buildOrder = profile.buildOrders[
            Math.floor(gameRandom() * profile.buildOrders.length)
        ];
        this.buildStep = 0;

        // Bookkeeping.
        this.lastAttackFrame = 0;
        this.lastBuildFrame = 0;
        this.lastDefenceFrame = 0;
        this.scoutAssigned = false;
    }

    // Difficulty profiles. The build orders use building class names so the
    // AI can pick a strategy at start without holding hard refs to classes.
    //
    // Each profile may declare a `personality` ("balanced" | "rusher" |
    // "turtle" | "boomer") which is used by the new personality-specific
    // helpers below to bias decisions like "build walls early" or "skip
    // economy and tech-rush militia". Personalities mix freely with the
    // existing easy/normal/hard speed knobs.
    static PROFILES = {
        easy: {
            tickInterval: 140,
            villagerTarget: 8,
            attackArmySize: 12,
            defenceArmySize: 4,
            personality: 'balanced',
            buildOrders: [
                ['StoragePit', 'House', 'Granary', 'Barracks', 'House', 'Barracks'],
            ],
        },
        normal: {
            tickInterval: 70,
            villagerTarget: 14,
            attackArmySize: 10,
            defenceArmySize: 6,
            personality: 'balanced',
            buildOrders: [
                ['StoragePit', 'House', 'Granary', 'Barracks', 'House', 'ArcheryRange', 'Barracks', 'House'],
                ['Granary', 'StoragePit', 'House', 'Barracks', 'Barracks', 'ArcheryRange', 'House'],
            ],
        },
        hard: {
            tickInterval: 35,
            villagerTarget: 20,
            attackArmySize: 8,
            defenceArmySize: 8,
            personality: 'balanced',
            buildOrders: [
                ['StoragePit', 'House', 'Barracks', 'Granary', 'Barracks', 'ArcheryRange', 'House', 'ArcheryRange', 'House'],
                ['StoragePit', 'Granary', 'Barracks', 'House', 'Barracks', 'House', 'ArcheryRange', 'ArcheryRange', 'House'],
            ],
        },
        // ----- personalities (Tier-A roadmap item #7) -----
        rusher: {
            tickInterval: 50,
            villagerTarget: 9,           // bare minimum economy
            attackArmySize: 6,           // attack with anything you have
            defenceArmySize: 3,
            personality: 'rusher',
            buildOrders: [
                ['House', 'Barracks', 'Barracks', 'House'],
            ],
        },
        turtle: {
            tickInterval: 80,
            villagerTarget: 16,
            attackArmySize: 18,          // never attacks unless heavily over-powered
            defenceArmySize: 10,
            personality: 'turtle',
            buildOrders: [
                ['StoragePit', 'House', 'Granary', 'Tower', 'House', 'Wall', 'Wall',
                 'Tower', 'Barracks', 'House', 'ArcheryRange', 'Tower'],
            ],
        },
        boomer: {
            tickInterval: 60,
            villagerTarget: 24,           // huge economy first
            attackArmySize: 14,
            defenceArmySize: 6,
            personality: 'boomer',
            buildOrders: [
                ['StoragePit', 'Granary', 'House', 'House', 'House', 'StoragePit',
                 'House', 'Barracks', 'House', 'ArcheryRange', 'Stable', 'House'],
            ],
        },
    };

    static get TICK_INTERVALS() {
        return {
            easy: AIPlayer.PROFILES.easy.tickInterval,
            normal: AIPlayer.PROFILES.normal.tickInterval,
            hard: AIPlayer.PROFILES.hard.tickInterval,
        };
    }

    // Map the in-game difficulty setting (0..2) to an AI difficulty label.
    static difficultyFromIndex(idx) {
        return ['easy', 'normal', 'hard'][idx] || 'normal';
    }

    static BUILDING_CLASSES = {
        StoragePit, Granary, Barracks, ArcheryRange, House, TownCenter,
        Tower, Wall, Stable,
    };

    tick(frameCount) {
        if (frameCount % this.tickInterval !== 0) return;

        // Reactive defence runs on every tick regardless of phase — if an
        // enemy is detected near a friendly building we drop everything
        // and recall available units to deal with it.
        this.checkDefence();

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

        const villagerTarget = this.profile.villagerTarget;
        const armyTarget = this.profile.attackArmySize;

        // Personality-specific biases.
        switch (this.personality) {
            case 'rusher':
                // Skip the long building phase as soon as we have a token economy.
                if (villagers.length < 6) this.state = 'building';
                else if (military.length < armyTarget) this.state = 'expanding';
                else this.state = 'attacking';
                return;
            case 'turtle':
                // Never voluntarily attack — only push when massively over-armed.
                if (villagers.length < villagerTarget * 0.7 || buildings.length < 5) this.state = 'building';
                else if (military.length < armyTarget * 1.5) this.state = 'expanding';
                else this.state = 'attacking';
                return;
            case 'boomer':
                // Maximise economy first, then a giant single push.
                if (villagers.length < villagerTarget) this.state = 'building';
                else if (military.length < armyTarget) this.state = 'expanding';
                else this.state = 'attacking';
                return;
            default:
                // 'balanced' / unspecified.
                if (villagers.length < villagerTarget * 0.6 || buildings.length < 3) {
                    this.state = 'building';
                } else if (military.length < armyTarget) {
                    this.state = 'expanding';
                } else {
                    this.state = 'attacking';
                }
        }
    }

    /**
     * Reactive defence — scan for enemy units within striking distance of
     * any friendly building. If we find some, recall the nearest available
     * military and pull villagers to safety. Cooldown prevents thrash.
     */
    checkDefence() {
        if (this.engine.framesCount - this.lastDefenceFrame < this.tickInterval) return;
        const myBuildings = this.getMyBuildings();
        if (myBuildings.length === 0) return;

        let threat = null;
        let threatBuilding = null;
        outer: for (const b of myBuildings) {
            for (const u of this.engine.units) {
                if (u.destroyed || !u.player || u.player === this.player) continue;
                if (u.TYPE === UNIT_TYPES.ANIMAL || u.TYPE === UNIT_TYPES.VILLAGER) continue;
                const dx = u.subtile_x - b.subtile_x;
                const dy = u.subtile_y - b.subtile_y;
                if (Math.abs(dx) + Math.abs(dy) < 18) {
                    threat = u;
                    threatBuilding = b;
                    break outer;
                }
            }
        }
        if (!threat) return;

        this.lastDefenceFrame = this.engine.framesCount;

        // Mobilise every soldier we already have.
        const army = this.getMyUnits().filter(
            (u) => u.CAN_ATTACK && u.TYPE !== UNIT_TYPES.VILLAGER && u.TYPE !== UNIT_TYPES.ANIMAL
        );
        for (const soldier of army) {
            try { this.engine.interactOrder(soldier, threat); } catch (err) { /* ignore */ }
        }

        // If we have nothing to fight back with, panic-spawn militia and
        // ring the (private) town bell so villagers garrison the town.
        const military = army.length;
        if (military < this.profile.defenceArmySize) {
            const tc = myBuildings.find((b) => b instanceof TownCenter);
            if (tc) {
                this.spawnUnitNear(ClubMan, TownCenter, { food: 50 });
            }
            // Recall villagers (mirrors the player TOWN_BELL command).
            const villagers = this.getMyUnits().filter((u) => u.TYPE === UNIT_TYPES.VILLAGER);
            for (const v of villagers) {
                try { this.engine.interactOrder(v, threatBuilding); } catch (err) { /* ignore */ }
            }
        }
    }

    // ------------------------------------------------------------------
    // Phase: building — economy bootstrap (follows the build order)
    // ------------------------------------------------------------------
    doBuildingPhase() {
        const villagers = this.getMyUnits().filter((u) => u.TYPE === UNIT_TYPES.VILLAGER);
        const buildings = this.getMyBuildings();
        const resources = this.player.resources || {};

        // 1. Ensure there is at least one Town Center.
        if (!buildings.some((b) => b instanceof TownCenter)) {
            this.tryBuildNear(TownCenter, null);
        }

        // 2. Pop headroom — preempt the food / wood spend on military.
        if (this.player.population + 2 >= this.player.max_population) {
            this.tryBuildNear(House, null);
        }

        // 3. Walk the build order one step at a time.
        this.advanceBuildOrder();

        // 4. Produce villagers up to the difficulty cap.
        if (villagers.length < this.profile.villagerTarget && (resources.food ?? 0) >= 50) {
            this.spawnUnitNear(Villager, TownCenter, { food: 50 });
        }

        // 5. Assign a scout if we have enough villagers — sends one to a
        //    random map subtile so the AI gathers map intel.
        this.maybeSendScout();

        // 6. Idle villagers gather resources, biased food → wood → gold → stone.
        this.assignIdleVillagers(villagers);
    }

    advanceBuildOrder() {
        if (this.buildStep >= this.buildOrder.length) return;
        const nextName = this.buildOrder[this.buildStep];
        const Class = AIPlayer.BUILDING_CLASSES[nextName];
        if (!Class) { this.buildStep++; return; }
        const cost = Class.prototype.COST || {};
        if (this.player.deficitResource(cost)) return;
        const before = this.getMyBuildings().length;
        this.tryBuildNear(Class, null);
        // If something was actually built, advance the cursor.
        if (this.getMyBuildings().length > before) this.buildStep++;
    }

    maybeSendScout() {
        if (this.scoutAssigned) return;
        const villagers = this.getMyUnits().filter((u) => u.TYPE === UNIT_TYPES.VILLAGER);
        if (villagers.length < 6) return;
        // Pick the villager furthest from any resource (least busy proxy).
        const v = villagers[0];
        const map = this.engine.map;
        if (!map) return;
        const target = {
            x: Math.floor(gameRandom() * map.edge_size * 2),
            y: Math.floor(gameRandom() * map.edge_size * 2),
        };
        try { this.engine.moveOrder(v, target); this.scoutAssigned = true; } catch (err) { /* ignore */ }
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
