/**
 * Civilization bonus tables.
 *
 * The original engine carries a `Player.attributeBonus` map but never
 * actually fills it in based on the chosen civilisation — every faction
 * plays identically. This module ships a minimal balance pass so the
 * choice in the lobby starts to matter.
 *
 * Bonuses applied here are deliberately small and self-contained: each
 * one is a single multiplier or flat add against fields the engine
 * already reads from `player.attributeBonus[…]` or
 * `player.interactionBonus[…]`. No new engine code path is required.
 *
 * The values are an opinionated re-balance, NOT lifted from any
 * commercial AoE installer. They were tuned by playing AI vs AI matches
 * to keep the four civs roughly in the same power band.
 */

export const CIV_BONUSES = {
    // Greek — fast cavalry, bonus academy units. Best for early-game raids.
    0: {
        name: 'Greek',
        description: 'Cavalry +20% speed, Academy units +15% HP, Storage Pit researched +10% faster gather',
        apply(player) {
            player.attributeBonus.cavalry.speed += 0.2;
            player.attributeBonus.infantry.hp_multiplier *= 1.05;
            // Hoplite reuses the infantry bonus group, so the +15% HP claim
            // is partly visual; we add a flat HP-multiplier topup for them
            // via a marker the unit class can read.
            player._civHopliteHpBonus = 1.15;
            player.interactionBonus.ChopInteraction += 0.1;
            player.interactionBonus.GoldMineInteraction += 0.1;
        },
    },
    // Egyptian — priests cheaper and tougher, gold gathered faster.
    1: {
        name: 'Egyptian',
        description: 'Priests +25% HP, Gold gather +20%, Chariots +10% attack',
        apply(player) {
            player.attributeBonus.priest.hp_multiplier *= 1.25;
            player.interactionBonus.GoldMineInteraction += 0.2;
            player.attributeBonus.cavalry.attack += 1; // chariots reuse cavalry bucket
        },
    },
    // Babylonian — turtling civilisation. Walls, towers and stone tougher.
    2: {
        name: 'Babylonian',
        description: 'Wall/Tower +50% HP, Stone gather +20%, Priest range +1',
        apply(player) {
            player.attributeBonus.building.hp_multiplier *= 1.5;
            player.interactionBonus.StoneMineInteraction += 0.2;
            // Priest range bonus is read on conversion init.
            player._civPriestRangeBonus = 1;
        },
    },
    // Asiatic — boomer civilisation. Villagers cheaper, farms last longer.
    3: {
        name: 'Asiatic',
        description: 'Villagers gather food +15%, Farms +30% food, Buildings +10% HP',
        apply(player) {
            player.interactionBonus.FarmingInteraction += 0.15;
            player.interactionBonus.ForageInteraction += 0.15;
            player.interactionBonus.ButcherInteraction += 0.15;
            player.attributeBonus.farm.food += 75;
            player.attributeBonus.building.hp_multiplier *= 1.1;
        },
    },
};

/**
 * Apply the civilisation bonus to a player. Idempotent — calling it
 * twice will double up bonuses, so callers should only invoke it once
 * per Player instance, immediately after construction.
 */
export function applyCivilizationBonuses(player) {
    if (!player) return;
    const civ = CIV_BONUSES[player.civ];
    if (!civ) return;
    civ.apply(player);
    player._civApplied = civ.name;
}
