/**
 * Supabase client — optional cloud backup layer.
 *
 * This module intentionally does NOT depend on `@supabase/supabase-js`.
 * We talk to Supabase via its public REST API using plain `fetch`, which
 * means:
 *
 *   - Zero bundle overhead when cloud backup is disabled.
 *   - No runtime crash if the Supabase project is not yet configured.
 *   - The user can ship the PWA as a fully offline game; cloud backup
 *     is an opt-in feature that activates only when two env vars are
 *     present at build time.
 *
 * Required env vars (set in the Vercel dashboard → Project Settings →
 * Environment Variables, or locally in a `.env.local` file):
 *
 *   VITE_SUPABASE_URL        https://xxx.supabase.co
 *   VITE_SUPABASE_ANON_KEY   the anon (public) key — safe to ship in the client
 *
 * Because Vite only exposes variables prefixed with `VITE_`, those names
 * are mandatory. The anon key is designed to be public; security is
 * enforced by the Supabase project's Row Level Security (RLS) and/or
 * Storage bucket policies, not by hiding the key.
 *
 * We also keep a stable per-browser `device_id` in localStorage so users
 * who do not sign up still get a namespace for their replays. Multiple
 * devices can share replays later by adding a real auth layer (TODO).
 */

const URL_ENV_KEY = 'VITE_SUPABASE_URL';
const KEY_ENV_KEY = 'VITE_SUPABASE_ANON_KEY';
const DEVICE_STORAGE_KEY = 'aoe-device-id';

function readEnv(name) {
    try {
        if (typeof import.meta !== 'undefined' && import.meta.env) {
            return import.meta.env[name];
        }
    } catch (_) { /* not in a bundler */ }
    return undefined;
}

const supabaseUrl = (readEnv(URL_ENV_KEY) || '').replace(/\/+$/, '');
const anonKey = readEnv(KEY_ENV_KEY) || '';

export function isCloudEnabled() {
    return Boolean(supabaseUrl && anonKey);
}

/**
 * Stable anonymous identifier for the current browser. Persisted to
 * localStorage so reopening the app keeps the same namespace. If the
 * storage is unavailable (private mode, etc.) we fall back to a random
 * id that lives for the session only.
 */
export function getDeviceId() {
    try {
        const stored = localStorage.getItem(DEVICE_STORAGE_KEY);
        if (stored) return stored;
    } catch (_) { /* ignore */ }
    const fresh = 'dev-' + cryptoRandomHex(16);
    try { localStorage.setItem(DEVICE_STORAGE_KEY, fresh); } catch (_) {}
    return fresh;
}

function cryptoRandomHex(bytes) {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const buf = new Uint8Array(bytes);
        crypto.getRandomValues(buf);
        return Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    // Fallback — only used in ancient browsers that the PWA already
    // refuses to support.
    let out = '';
    for (let i = 0; i < bytes; i++) out += Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
    return out;
}

function headers(extra = {}) {
    return {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
        ...extra,
    };
}

/**
 * Upload a JSON object as a file into a Storage bucket. Idempotent:
 * uses the upsert flag so re-saving a replay overwrites the previous
 * version in place.
 */
export async function uploadJson(bucket, path, json) {
    if (!isCloudEnabled()) return { ok: false, reason: 'cloud-disabled' };
    const url = `${supabaseUrl}/storage/v1/object/${bucket}/${encodeURI(path)}`;
    const body = JSON.stringify(json);
    const res = await fetch(url, {
        method: 'POST',
        headers: headers({
            'Content-Type': 'application/json',
            'x-upsert': 'true',
            'Cache-Control': 'no-cache',
        }),
        body,
    });
    if (!res.ok) {
        const text = await safeText(res);
        return { ok: false, status: res.status, reason: text };
    }
    return { ok: true };
}

/**
 * Download a previously uploaded JSON object. Returns the parsed body,
 * or null if the object is missing / cloud is disabled.
 */
export async function downloadJson(bucket, path) {
    if (!isCloudEnabled()) return null;
    const url = `${supabaseUrl}/storage/v1/object/${bucket}/${encodeURI(path)}`;
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) return null;
    try { return await res.json(); } catch { return null; }
}

/**
 * List every object under a prefix. Uses the Storage list endpoint
 * (POST /storage/v1/object/list/<bucket>) and returns an array of
 * `{ name, created_at }` objects.
 */
export async function listObjects(bucket, prefix) {
    if (!isCloudEnabled()) return [];
    const url = `${supabaseUrl}/storage/v1/object/list/${bucket}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
            prefix,
            limit: 100,
            offset: 0,
            sortBy: { column: 'name', order: 'asc' },
        }),
    });
    if (!res.ok) return [];
    try {
        const items = await res.json();
        return Array.isArray(items) ? items : [];
    } catch { return []; }
}

/**
 * Delete an object. Used by the replay panel when the user removes a
 * local recording — we propagate the delete to the cloud backup.
 */
export async function deleteObject(bucket, path) {
    if (!isCloudEnabled()) return { ok: false, reason: 'cloud-disabled' };
    const url = `${supabaseUrl}/storage/v1/object/${bucket}/${encodeURI(path)}`;
    const res = await fetch(url, { method: 'DELETE', headers: headers() });
    return { ok: res.ok, status: res.status };
}

async function safeText(res) {
    try { return await res.text(); } catch { return ''; }
}

/** Exposed for the debug panel / settings screen. */
export function cloudStatus() {
    return {
        enabled: isCloudEnabled(),
        url: supabaseUrl || null,
        deviceId: isCloudEnabled() ? getDeviceId() : null,
    };
}
