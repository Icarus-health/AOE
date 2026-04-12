/**
 * Effective interaction rate smoke test.
 *
 * Replicates the formula used by Interaction.prototype.effectiveRate so
 * we can test it without pulling the whole sprite pipeline in. The
 * implementation under test in src/engine/interactions.js must stay
 * consistent with this mirror.
 *
 *     effectiveRate = (RATE - interactionBonus[name]) * interactionMultiplier[name]
 *
 * Validates:
 *   1. No bonus & no multiplier → raw rate.
 *   2. Flat bonus alone → additive reduction (legacy tech tree behaviour).
 *   3. Multiplier alone → fractional reduction (new civ bonus behaviour).
 *   4. Flat + multiplier compose in the expected order (subtract first).
 *   5. Missing multiplier map falls back to 1.
 */

function effectiveRate(RATE, name, interactionBonus, interactionMultiplier) {
    const flat = (interactionBonus && interactionBonus[name]) || 0;
    const mult = (interactionMultiplier && interactionMultiplier[name]);
    const rate = RATE - flat;
    return typeof mult === 'number' ? rate * mult : rate;
}

function assert(cond, msg) {
    if (!cond) {
        console.error('FAIL:', msg);
        process.exit(1);
    }
}

// 1) Baseline
{
    const r = effectiveRate(60, 'FarmingInteraction', {}, {});
    assert(r === 60, `baseline expected 60, got ${r}`);
}

// 2) Flat bonus
{
    const r = effectiveRate(60, 'FarmingInteraction', { FarmingInteraction: 20 }, {});
    assert(r === 40, `flat bonus expected 40, got ${r}`);
}

// 3) Multiplier alone
{
    const r = effectiveRate(60, 'GoldMineInteraction', {}, { GoldMineInteraction: 0.8 });
    assert(Math.abs(r - 48) < 1e-9, `multiplier expected 48, got ${r}`);
}

// 4) Flat + multiplier compose (-16 flat then 0.8x)
{
    const r = effectiveRate(60, 'ChopInteraction',
                            { ChopInteraction: 16 },
                            { ChopInteraction: 0.8 });
    assert(Math.abs(r - (60 - 16) * 0.8) < 1e-9, `compose expected 35.2, got ${r}`);
}

// 5) Missing multiplier falls back
{
    const r = effectiveRate(60, 'HunterInteraction', { HunterInteraction: 10 }, null);
    assert(r === 50, `missing mult fallback expected 50, got ${r}`);
}

// 6) Saracen gold is 20% faster than baseline
{
    const r = effectiveRate(60, 'GoldMineInteraction', {}, { GoldMineInteraction: 0.8 });
    const base = effectiveRate(60, 'GoldMineInteraction', {}, {});
    assert(r < base, 'Saracen rate should be lower (= faster)');
    assert(Math.abs(r / base - 0.8) < 1e-9, 'Saracen should be 0.8x baseline');
}

console.log('PASS: interaction rate test (6 sub-tests)');
