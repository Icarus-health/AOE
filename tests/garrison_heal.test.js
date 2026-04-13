/**
 * Garrison heal smoke test.
 *
 * Reproduces the tickGarrisonHeal arithmetic against a stub building +
 * garrisoned units. Verifies:
 *
 *   1. Missing HP ticks upward deterministically.
 *   2. Full-HP units are left alone.
 *   3. HP never exceeds max_hp (clamping).
 *   4. Empty / undefined garrisonedUnits arrays are a no-op.
 *   5. Destroyed units are skipped.
 */

import { tickGarrisonHeal, GARRISON_LIMITS } from '../src/engine/garrison.js';

function makeUnit(hp, max_hp) {
    return { hp, max_hp, destroyed: false };
}

function assert(cond, msg) {
    if (!cond) {
        console.error('FAIL:', msg);
        process.exit(1);
    }
}

// 1) A damaged unit slowly regenerates.
{
    const b = { garrisonedUnits: [makeUnit(10, 40)] };
    // At 0.4 HP/tick it takes 3 ticks to register the first integer gain.
    for (let i = 0; i < 3; i++) tickGarrisonHeal(b);
    assert(b.garrisonedUnits[0].hp === 11, `after 3 ticks expected hp 11, got ${b.garrisonedUnits[0].hp}`);
    // 25 ticks total ≈ 10 HP.
    for (let i = 0; i < 22; i++) tickGarrisonHeal(b);
    assert(b.garrisonedUnits[0].hp === 20, `after 25 ticks expected hp 20, got ${b.garrisonedUnits[0].hp}`);
}

// 2) Full HP is a no-op.
{
    const b = { garrisonedUnits: [makeUnit(40, 40)] };
    for (let i = 0; i < 100; i++) tickGarrisonHeal(b);
    assert(b.garrisonedUnits[0].hp === 40, 'full-HP unit should not tick');
}

// 3) HP is clamped to max_hp.
{
    const b = { garrisonedUnits: [makeUnit(38, 40)] };
    for (let i = 0; i < 100; i++) tickGarrisonHeal(b);
    assert(b.garrisonedUnits[0].hp === 40, `clamp failed, got ${b.garrisonedUnits[0].hp}`);
}

// 4) Missing / empty garrison is a no-op.
{
    const b1 = {};
    const b2 = { garrisonedUnits: [] };
    tickGarrisonHeal(b1);
    tickGarrisonHeal(b2);
    // Nothing to check — we just ensured no throw.
}

// 5) Destroyed units are skipped.
{
    const dead = makeUnit(5, 40);
    dead.destroyed = true;
    const alive = makeUnit(5, 40);
    const b = { garrisonedUnits: [dead, alive] };
    for (let i = 0; i < 3; i++) tickGarrisonHeal(b);
    assert(dead.hp === 5, 'destroyed unit should not heal');
    assert(alive.hp === 6, `alive unit expected hp 6, got ${alive.hp}`);
}

// 6) The constant is exported so callers can reference it.
assert(GARRISON_LIMITS.HEAL_PER_TICK === 0.4,
       `HEAL_PER_TICK export expected 0.4, got ${GARRISON_LIMITS.HEAL_PER_TICK}`);

console.log('PASS: garrison heal test (6 sub-tests)');
