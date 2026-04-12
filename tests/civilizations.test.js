/**
 * Civilisation bonus smoke test.
 *
 * Sanity-checks that every entry in CIV_BONUSES applies cleanly to a
 * minimal Player stand-in without throwing, and that the public side
 * effects (max_population for Goths, attribute multipliers) land in the
 * expected fields. Run as:
 *
 *   node tests/civilizations.test.js
 *
 * Designed to fail fast if a future refactor renames a `attributeBonus`
 * bucket the civ tables reference.
 */

import { CIV_BONUSES, applyCivilizationBonuses } from '../src/engine/civilizations.js';

function makePlayer(civId) {
    return {
        civ: civId,
        max_population: 50,
        attributeBonus: {
            infantry: { attack: 0, armor: 0, missile_armor: 0, hp_multiplier: 1, speed: 0 },
            archer:   { attack: 0, armor: 0, missile_armor: 0, hp_multiplier: 1, speed: 0 },
            cavalry:  { attack: 0, armor: 0, missile_armor: 0, hp_multiplier: 1, speed: 0 },
            siege:    { attack: 0, armor: 0, missile_armor: 0, hp_multiplier: 1, speed: 0 },
            priest:   { attack: 0, armor: 0, missile_armor: 0, hp_multiplier: 1, speed: 0 },
            farm: { food: 0 },
            villager: { attack: 0, armor: 0, missile_armor: 0, hp_multiplier: 1, speed: 0,
                        capacity: { food: 0, wood: 0, stone: 0, gold: 0 } },
            fishing_boat: { attack: 0, armor: 0, missile_armor: 0, hp_multiplier: 1, speed: 0,
                            capacity: { food: 0, wood: 0, stone: 0, gold: 0 } },
            ship: { attack: 0, armor: 0, missile_armor: 0, hp_multiplier: 1, speed: 0 },
            building: { hp_multiplier: 1 },
            animal: { attack: 0, armor: 0, missile_armor: 0, hp_multiplier: 1, speed: 0 },
        },
        interactionBonus: {
            BuilderInteraction: 0, RepairInteraction: 0, ShipRepairInteraction: 0,
            FarmingInteraction: 0, ChopInteraction: 0, ForageInteraction: 0,
            GoldMineInteraction: 0, StoneMineInteraction: 0, FisherInteraction: 0,
            HunterInteraction: 0, ButcherInteraction: 0, FishingInteraction: 0,
            ConversionInteraction: 0,
        },
    };
}

function assert(cond, msg) {
    if (!cond) {
        console.error('FAIL:', msg);
        process.exit(1);
    }
}

const expectedNames = ['Britons', 'Franks', 'Byzantines', 'Goths',
                       'Saracens', 'Vikings', 'Teutons', 'Mongols'];

for (let civId = 0; civId < 8; civId++) {
    assert(CIV_BONUSES[civId], `civ ${civId} missing from CIV_BONUSES`);
    assert(CIV_BONUSES[civId].name === expectedNames[civId],
           `civ ${civId} name mismatch (expected ${expectedNames[civId]}, got ${CIV_BONUSES[civId].name})`);
    const p = makePlayer(civId);
    applyCivilizationBonuses(p);
    assert(p._civApplied === expectedNames[civId],
           `civ ${civId} _civApplied marker not set`);
    // Sanity: every civ should leave the player with at least one bucket
    // touched. We measure that as "any non-default field changed".
    const touched =
        p.max_population !== 50 ||
        p.attributeBonus.cavalry.hp_multiplier !== 1 ||
        p.attributeBonus.infantry.hp_multiplier !== 1 ||
        p.attributeBonus.building.hp_multiplier !== 1 ||
        p.attributeBonus.farm.food !== 0 ||
        p.attributeBonus.ship.hp_multiplier !== 1 ||
        Object.values(p.interactionBonus).some(v => v !== 0) ||
        Object.keys(p).some(k => k.startsWith('_civ') && k !== '_civApplied');
    assert(touched, `civ ${expectedNames[civId]} did not actually apply any bonus`);
}

// Goths get +10 max population — explicit check.
{
    const p = makePlayer(3);
    applyCivilizationBonuses(p);
    assert(p.max_population === 60, `Goth max_population expected 60, got ${p.max_population}`);
}

// Vikings get the free-carts marker.
{
    const p = makePlayer(5);
    applyCivilizationBonuses(p);
    assert(p._civFreeCarts === true, 'Vikings should set _civFreeCarts');
}

console.log('PASS: civilizations test (8 civs)');
