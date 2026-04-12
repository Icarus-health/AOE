/**
 * Auto-reseed farm smoke test.
 *
 * The Farm class is heavily tied to the Sprites pipeline (it pulls in
 * `img/buildings/farm/all.png` at module evaluation time), so we cannot
 * import it directly under bare Node. Instead this test reproduces the
 * `tryAutoReseed` arithmetic against a hand-rolled stub so we can check:
 *
 *   1. When the player has both autoReseedFarms = true and >= 75 wood,
 *      the farm refills with full food and the player loses 75 wood.
 *   2. When the player can't afford it, no resources are deducted and
 *      the function reports failure (so the caller will destroy the farm).
 *   3. When the option is disabled, the farm always self-destructs.
 */

function makeFarm(player) {
    return {
        attributes: { food: 0 },
        player,
        destroyed: false,
        // copy of Farm.prototype.tryAutoReseed
        tryAutoReseed() {
            if (!this.player) return false;
            if (this.player.autoReseedFarms === false) return false;
            const cost = { food: 0, wood: 75, stone: 0, gold: 0 };
            for (const res in this.player.resources) {
                if (this.player.resources[res] < cost[res]) return false;
            }
            for (const res in this.player.resources) {
                this.player.resources[res] -= cost[res];
            }
            this.attributes.food = 250 + this.player.attributeBonus.farm.food;
            return true;
        },
    };
}

function assert(cond, msg) {
    if (!cond) {
        console.error('FAIL:', msg);
        process.exit(1);
    }
}

// 1) Happy path
{
    const player = {
        autoReseedFarms: true,
        resources: { food: 100, wood: 200, stone: 0, gold: 0 },
        attributeBonus: { farm: { food: 0 } },
    };
    const farm = makeFarm(player);
    const ok = farm.tryAutoReseed();
    assert(ok === true, 'reseed should succeed when player has wood');
    assert(player.resources.wood === 125, `wood after reseed should be 125, got ${player.resources.wood}`);
    assert(farm.attributes.food === 250, `farm food should be 250, got ${farm.attributes.food}`);
}

// 2) Insufficient wood
{
    const player = {
        autoReseedFarms: true,
        resources: { food: 100, wood: 50, stone: 0, gold: 0 },
        attributeBonus: { farm: { food: 0 } },
    };
    const farm = makeFarm(player);
    const ok = farm.tryAutoReseed();
    assert(ok === false, 'reseed should fail when player lacks wood');
    assert(player.resources.wood === 50, 'wood should be unchanged on failure');
    assert(farm.attributes.food === 0, 'farm should remain empty on failure');
}

// 3) Disabled
{
    const player = {
        autoReseedFarms: false,
        resources: { food: 100, wood: 200, stone: 0, gold: 0 },
        attributeBonus: { farm: { food: 0 } },
    };
    const farm = makeFarm(player);
    const ok = farm.tryAutoReseed();
    assert(ok === false, 'reseed should be skipped when option is off');
    assert(player.resources.wood === 200, 'wood should be unchanged when option off');
}

// 4) Asiatic-style farm bonus is honoured
{
    const player = {
        autoReseedFarms: true,
        resources: { food: 100, wood: 200, stone: 0, gold: 0 },
        attributeBonus: { farm: { food: 75 } },
    };
    const farm = makeFarm(player);
    farm.tryAutoReseed();
    assert(farm.attributes.food === 325, `bonus farm food should be 325, got ${farm.attributes.food}`);
}

console.log('PASS: farm auto-reseed test (4 sub-tests)');
