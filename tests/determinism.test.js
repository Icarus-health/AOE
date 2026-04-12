/**
 * Determinism cross-check.
 *
 * Two parallel mulberry32 PRNGs seeded identically must produce
 * byte-identical outputs across 100k draws. Run as:
 *
 *   node tests/determinism.test.js
 *
 * Used by the CI workflow as the cheapest possible guard against the
 * "someone reintroduced Math.random()" failure mode.
 *
 * If you ever change the engine RNG, update this test as well.
 */
function makeRng(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function assert(cond, msg) {
    if (!cond) {
        console.error('FAIL:', msg);
        process.exit(1);
    }
}

const N = 100000;

// 1) Same seed → identical sequences.
{
    const a = makeRng(1234);
    const b = makeRng(1234);
    for (let i = 0; i < N; i++) {
        assert(a() === b(), `mismatch at draw ${i}`);
    }
}

// 2) Different seeds → distinguishable sequences.
{
    const a = makeRng(1);
    const b = makeRng(2);
    let diff = 0;
    for (let i = 0; i < 100; i++) if (a() !== b()) diff++;
    assert(diff > 50, 'two different seeds should diverge in most draws');
}

// 3) The first three draws of seed=42 are stable across runs and engines.
{
    const r = makeRng(42);
    const expected = [0.601104, 0.448291, 0.852466];
    for (const want of expected) {
        const got = r();
        assert(Math.abs(got - want) < 1e-6, `expected ${want}, got ${got}`);
    }
}

console.log(`PASS: determinism test (${N} draws, 3 sub-tests)`);
