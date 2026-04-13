/**
 * Cloud backup for match replays.
 *
 * Wraps the Supabase Storage helpers so `saveReplay` / `loadReplay` can
 * transparently mirror to the cloud when configured. If Supabase is not
 * enabled (no env vars present in the build), every function becomes a
 * no-op so the rest of the game is untouched.
 *
 * Storage layout:
 *
 *   bucket:  "aoe-replays"
 *   object:  <device_id>/<replay_name>.json
 *
 * The JSON payload is the same snapshot shape used by IndexedDB, so
 * restoring a cloud replay is a straight round-trip through the existing
 * ReplayTransport.
 *
 * Security model: the anon key + a public bucket with a write-restricted
 * RLS policy is the minimum viable setup. See docs/DEPLOY.md for the
 * schema / policy SQL you paste into the Supabase dashboard.
 */

import {
    isCloudEnabled,
    uploadJson,
    downloadJson,
    listObjects,
    deleteObject,
    getDeviceId,
} from './supabase_client.js';

const BUCKET = 'aoe-replays';

function pathFor(name) {
    const safe = name.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${getDeviceId()}/${safe}.json`;
}

/**
 * Mirror a replay snapshot to Supabase Storage. Non-blocking from the
 * caller's perspective — errors are logged but swallowed so a network
 * failure never prevents the local save.
 */
export async function backupReplayToCloud(name, snapshot) {
    if (!isCloudEnabled()) return { ok: false, reason: 'cloud-disabled' };
    try {
        const result = await uploadJson(BUCKET, pathFor(name), {
            version: 1,
            name,
            savedAt: Date.now(),
            snapshot,
        });
        if (!result.ok) {
            console.warn('[cloud] replay backup failed:', result.reason);
        }
        return result;
    } catch (err) {
        console.warn('[cloud] replay backup threw:', err);
        return { ok: false, reason: String(err) };
    }
}

/** Fetch a single replay from the cloud by name. */
export async function fetchReplayFromCloud(name) {
    if (!isCloudEnabled()) return null;
    const envelope = await downloadJson(BUCKET, pathFor(name));
    if (!envelope || !envelope.snapshot) return null;
    return envelope.snapshot;
}

/**
 * List every replay currently backed up on the cloud for this device.
 * Returns an array of `{ name, savedAt }` — enough for the replay panel
 * to render a "restore" button next to each entry.
 */
export async function listCloudReplays() {
    if (!isCloudEnabled()) return [];
    const objects = await listObjects(BUCKET, getDeviceId() + '/');
    return objects
        .filter((o) => o && o.name && o.name.endsWith('.json'))
        .map((o) => ({
            name: o.name.replace(/\.json$/, ''),
            savedAt: o.created_at ? Date.parse(o.created_at) : null,
        }));
}

/** Remove a cloud copy (best-effort). */
export async function deleteCloudReplay(name) {
    if (!isCloudEnabled()) return { ok: false, reason: 'cloud-disabled' };
    return deleteObject(BUCKET, pathFor(name));
}
