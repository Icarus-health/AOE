/**
 * Civilization bonus tables — Medieval roster (Age of Empires 2 style).
 *
 * Eight playable civs with AoE2-inspired identity bonuses. Each bonus is
 * implemented purely through the existing `player.attributeBonus[…]`,
 * `player.interactionBonus[…]` (additive, used by the tech tree) and
 * `player.interactionMultiplier[…]` (multiplicative, added in Phase 2 so
 * civs can give real fractional rate bonuses) buckets so the engine
 * itself does not have to learn new fields. A handful of civs also stash
 * a marker on the player (`player._civ…Bonus`) which the unit /
 * interaction code reads when it is initialised.
 *
 * Civ IDs are stable: 0..3 keep the original AoE1-era slots so existing
 * AI hard-codings (which never reference these by name anyway) and any
 * persisted player.civ values remain valid. IDs 4..7 are new.
 *
 * The values are an opinionated rebalance, NOT lifted from any commercial
 * AoE installer. Tune via AI vs AI matches.
 *
 * Multiplier convention: a lower value = faster. 0.85 = 15% faster.
 */

export const CIV_BONUSES = {
    // 0 — Britons. Foot archers reach further, sheep/berries picked fast.
    0: {
        name: 'Britons',
        description: 'Archers +1 range per Age, Town Centers +2 LOS, Shepherds gather food 25% faster',
        apply(player) {
            // Per-age archer range bonus is summed in the bow unit init.
            player._civArcherRangeBonus = 1;
            player.interactionMultiplier.ForageInteraction *= 0.75;
            player.interactionMultiplier.ButcherInteraction *= 0.75;
            // LOS bonus is read by the building constructor when set.
            player._civTownCenterLosBonus = 2;
        },
    },
    // 1 — Franks. Cavalry tougher, cheaper Castles, Foragers work fast.
    1: {
        name: 'Franks',
        description: 'Cavalry +20% HP, Foragers gather food 15% faster, Castle build 25% faster',
        apply(player) {
            player.attributeBonus.cavalry.hp_multiplier *= 1.2;
            player.interactionMultiplier.ForageInteraction *= 0.85;
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
            // Hunt slightly faster on top of the capacity bonus so the
            // Goth early-game boar strategy feels right.
            player.interactionMultiplier.HunterInteraction *= 0.9;
            player.interactionMultiplier.ButcherInteraction *= 0.9;
        },
    },
    // 4 — Saracens. Trade & gold focus, fast camels, transport boats stronger.
    4: {
        name: 'Saracens',
        description: 'Gold gather 20% faster, Market trade +30%, Transport ships HP & speed +50%',
        apply(player) {
            player.interactionMultiplier.GoldMineInteraction *= 0.8;
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
        description: 'Hunters work 40% faster, Cavalry archers +25% RoF, Light cavalry +30% HP',
        apply(player) {
            player.interactionMultiplier.HunterInteraction *= 0.6;
            player.interactionMultiplier.ButcherInteraction *= 0.6;
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
