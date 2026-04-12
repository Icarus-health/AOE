import { manhatan_subtile_distance } from '../utils.js';
import { applyCivilizationBonuses } from './civilizations.js';

class Player {
    constructor(definition) {
        this.index = definition.index;
        this.name = definition.name;
        this.civ = definition.civ;
        this.color = definition.color;
        this.team = definition.team;
        this.is_cpu = definition.is_cpu;
        this.resources = { ...definition.resources };
        this.population = 0;
        this.max_population = Player.prototype.DEFAULT_POPULATION;

        this.age = 0;

        this.units = [];
        this.buildings = [];
        this.possessions = {};
        // AoE2 QoL: when a farm is exhausted, automatically pay the wood
        // cost and refill the same tile so the farmer never goes idle.
        // Toggleable from the in-game settings menu.
        this.autoReseedFarms = true;
        this.defaultEntityLevel = {
            Tower: 0,
            Wall: 0
        };

        this.attributeBonus = {
            infantry: new UnitAttributeBonus(),
            archer: new UnitAttributeBonus(),
            cavalry: new UnitAttributeBonus(),
            siege: new UnitAttributeBonus(),
            priest: new UnitAttributeBonus(),
            farm: {
                food: 0
            },
            villager: new CarrierAttributeBonus(),
            fishing_boat: new CarrierAttributeBonus(),
            ship: new UnitAttributeBonus(),
            building: {
                hp_multiplier: 1
            },
            animal: new UnitAttributeBonus()
        }
        this.interactionBonus = {
            BuilderInteraction: 0,
            RepairInteraction: 0,
            ShipRepairInteraction: 0,
            FarmingInteraction: 0,
            ChopInteraction: 0,
            ForageInteraction: 0,
            GoldMineInteraction: 0,
            StoneMineInteraction: 0,
            FisherInteraction: 0,
            HunterInteraction: 0,
            ButcherInteraction: 0,
            FishingInteraction: 0,
            ConversionInteraction: 0
        }
        // Multiplicative bucket used by civ bonuses and Phase 2 eco techs.
        // Values are factors applied to the effective rate AFTER the flat
        // interactionBonus subtraction, so 0.8 = -20% rate (20% faster)
        // and 1.0 = no change. Multiplying two bonuses composes them.
        this.interactionMultiplier = {
            BuilderInteraction: 1,
            RepairInteraction: 1,
            ShipRepairInteraction: 1,
            FarmingInteraction: 1,
            ChopInteraction: 1,
            ForageInteraction: 1,
            GoldMineInteraction: 1,
            StoneMineInteraction: 1,
            FisherInteraction: 1,
            HunterInteraction: 1,
            ButcherInteraction: 1,
            FishingInteraction: 1,
            ConversionInteraction: 1
        }

        // Apply civilisation-specific stat bonuses (data lives in
        // src/engine/civilizations.js so the balance pass can be tuned
        // without touching engine code).
        applyCivilizationBonuses(this);
    }
    addBuilding(building) {
        this.buildings.push(building);
    }
    addUnit(unit) {
        this.units.push(unit)
    }
    deficitResource(cost) {
        for (let res in this.resources) if (this.resources[res] < cost[res]) return res;
        return null;
    }
    subtractResources(cost) {
        for (let res in this.resources) this.resources[res] -= cost[res];
    }
    getNearestBuilding(entity, filters={}) {
        let nearest = null;
        let min_dist = Infinity;
        for (let building of this.buildings) {
            let match = true;
            for (let attr in filters) {
                let attr_match = false;
                for (let attr_val of filters[attr]) {
                    if (building[attr] == attr_val) {
                        attr_match = true;
                        break;
                    }
                }
                if (!attr_match) {
                    match = false;
                    break;
                }
            }
            let curr_dist = manhatan_subtile_distance(entity, building);
            if (match && min_dist > curr_dist) {
                nearest = building;
                min_dist = curr_dist;
            }
        }
        return nearest;
    }
}
Player.prototype.DEFAULT_POPULATION = 4;


class UnitAttributeBonus {
    constructor() {
        this.attack = 0;
        this.armor = 0;
        this.missile_armor = 0;
        this.hp_multiplier = 1;
        this.speed = 0;
    }
}

class CarrierAttributeBonus extends UnitAttributeBonus {
    constructor() {
        super();
        this.capacity = {
            food: 0,
            wood: 0,
            stone: 0,
            gold: 0
        };
    }
}




export { Player }
