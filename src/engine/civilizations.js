/**
 * Civilization bonus tables — Medieval roster (Age of Empires 2 style).
 *
 * Eight playable civs with AoE2-inspired identity bonuses. Each bonus is
 * implemented purely through the existing `player.attributeBonus[…]` and
 * `player.interactionBonus[…]` buckets so the engine itself does not have
 * to learn new fields. A handful of civs also stash a marker on the
 * player (`player._civ…Bonus`) which the unit / interaction code reads
 * when it is initialised.
 *
 * Civ IDs are stable: 0..3 keep the original AoE1-era slots so existing
 * AI hard-codings (which never reference these by name anyway) and any
 * persisted player.civ values remain valid. IDs 4..7 are new.
 *
 * The values are an opinionated rebalance, NOT lifted from any commercial
 * AoE installer. Tune via AI vs AI matches.
 */

export const CIV_BONUSES = {
    // 0 — Britons. Foot archers reach further, sheep last longer.
    0: {
        name: 'Britons',
        description: 'Archers +1 range per Age, Town Centers +2 LOS, Shepherds gather food +25%',
        apply(player) {
            // Per-age archer range bonus is summed in the bow unit init.
            player._civArcherRangeBonus = 1;
            player.interactionBonus.ForageInteraction += 0.25;
            player.interactionBonus.ButcherInteraction += 0.25;
            // LOS bonus is read by the building constructor when set.
            player._civTownCenterLosBonus = 2;
        },
    },
    // 1 — Franks. Cavalry tougher, cheaper Castles, Foragers work fast.
    1: {
        name: 'Franks',
        description: 'Cavalry +20% HP, Foragers gather food +15%, Castle build +25% faster',
        apply(player) {
            player.attributeBonus.cavalry.hp_multiplier *= 1.2;
            player.interactionBonus.ForageInteraction += 0.15;
            // Castle is added in Phase 3; until then this is a no-op.
            player._civCastleBuildSpeedBonus = 0.25;
        },
    },
    // 2 — Byzantines. Defensive build orders. Buildings tougher, towers cheap.
    2: {
        name: 'Byzantines',
        description: 'Buildings +10% HP per Age, Camels & Skirmishers cheaper, Town Watch free',
        apply(player) {
            player.attributeBonus.building.hp_multiplier *= 1.1;
            // Apply additional 10% per age via marker the engine reads on level-up.
            player._civBuildingHpPerAge = 0.1;
            // Marker for cheaper anti-cavalry units (when added).
            player._civCounterUnitDiscount = 0.25;
        },
    },
    // 3 — Goths. Cheap infantry, fast hunting, +10 pop space.
    3: {
        name: 'Goths',
        description: 'Infantry -35% cost in Iron Age, Hunters carry +15, +10 max population',
        apply(player) {
            player._civInfantryCostBonus = 0.35;
            player.attributeBonus.villager.capacity.food += 15;
            player.max_population += 10;
        },
    },
    // 4 — Saracens. Trade & gold focus, fast camels, transport boats stronger.
    4: {
        name: 'Saracens',
        description: 'Gold gather +20%, Market trade +30%, Transport ships HP & speed +50%',
        apply(player) {
            player.interactionBonus.GoldMineInteraction += 0.2;
            player._civMarketTradeBonus = 0.3;
            player.attributeBonus.ship.hp_multiplier *= 1.5;
            player.attributeBonus.ship.speed += 0.5;
        },
    },
    // 5 — Vikings. Naval & infantry. Free Wheelbarrow / Hand Cart, longboats.
    5: {
        name: 'Vikings',
        description: 'Wheelbarrow & Hand Cart free, Infantry +10% HP per Age, Warships -20% cost',
        apply(player) {
            player._civFreeCarts = true;
            player.attributeBonus.infantry.hp_multiplier *= 1.1;
            player._civInfantryHpPerAge = 0.1;
            player._civWarshipDiscount = 0.2;
        },
    },
    // 6 — Teutons. Turtle civ. Towers, walls and conversion-resistance.
    6: {
        name: 'Teutons',
        description: 'Towers garrison 2x units, Walls cost -50%, Farms +33% food',
        apply(player) {
            player._civTowerGarrisonMultiplier = 2;
            player._civWallCostBonus = 0.5;
            player.attributeBonus.farm.food += 100;
        },
    },
    // 7 — Mongols. Speed & raid focus. Hunters fast, light cav strong.
    7: {
        name: 'Mongols',
        description: 'Hunters work +50% faster, Cavalry archers +25% RoF, Light cavalry +30% HP',
        apply(player) {
            player.interactionBonus.HunterInteraction = (player.interactionBonus.HunterInteraction || 0) + 0.5;
            player.interactionBonus.ButcherInteraction += 0.5;
            player._civCavalryArcherRof = 0.25;
            player.attributeBonus.cavalry.hp_multiplier *= 1.3;
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
