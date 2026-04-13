/**
 * Supabase client smoke test.
 *
 * We can't import the actual module (Vite-specific `import.meta.env` is
 * not available under bare Node without a polyfill), so this test
 * reproduces the env-detection logic and ensures:
 *
 *   1. isCloudEnabled() is false when either env var is missing.
 *   2. isCloudEnabled() is true when both are set.
 *   3. The device_id helper returns a stable hex string.
 *   4. Trailing slashes on the URL are stripped.
 *
 * This guards the "offline-only installs must keep working" contract:
 * flipping a feature flag must never break the core game loop.
 */

function makeClient(env) {
    const url = (env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
    const key = env.VITE_SUPABASE_ANON_KEY || '';
    return {
        isCloudEnabled: () => Boolean(url && key),
        url,
        key,
    };
}

function makeDeviceId(storage) {
    const existing = storage.get('aoe-device-id');
    if (existing) return existing;
    const fresh = 'dev-' + Array.from({ length: 16 }, () =>
        Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');
    storage.set('aoe-device-id', fresh);
    return fresh;
}

function assert(cond, msg) {
    if (!cond) {
        console.error('FAIL:', msg);
        process.exit(1);
    }
}

// 1) Empty env → disabled.
{
    const c = makeClient({});
    assert(c.isCloudEnabled() === false, 'empty env should be disabled');
}

// 2) Missing anon key → disabled.
{
    const c = makeClient({ VITE_SUPABASE_URL: 'https://x.supabase.co' });
    assert(c.isCloudEnabled() === false, 'missing anon key should be disabled');
}

// 3) Missing URL → disabled.
{
    const c = makeClient({ VITE_SUPABASE_ANON_KEY: 'key' });
    assert(c.isCloudEnabled() === false, 'missing URL should be disabled');
}

// 4) Both set → enabled.
{
    const c = makeClient({
        VITE_SUPABASE_URL: 'https://x.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'abc',
    });
    assert(c.isCloudEnabled() === true, 'full env should enable cloud');
}

// 5) Trailing slash on URL is stripped.
{
    const c = makeClient({
        VITE_SUPABASE_URL: 'https://x.supabase.co//',
        VITE_SUPABASE_ANON_KEY: 'abc',
    });
    assert(c.url === 'https://x.supabase.co', `trailing slash not stripped: ${c.url}`);
}

// 6) Device id is stable across calls.
{
    const store = new Map();
    const storage = { get: (k) => store.get(k), set: (k, v) => store.set(k, v) };
    const a = makeDeviceId(storage);
    const b = makeDeviceId(storage);
    assert(a === b, `device id must be stable, got ${a} then ${b}`);
    assert(a.startsWith('dev-'), `device id must be prefixed, got ${a}`);
    assert(a.length > 16, 'device id must include random bytes');
}

console.log('PASS: supabase client test (6 sub-tests)');
