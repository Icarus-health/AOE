/**
 * Replay system — record and play back a multiplayer / single-player match.
 *
 * Lockstep makes this almost free: the simulation is fully determined by
 * the seed plus the ordered command stream. We just have to capture both,
 * write them to IndexedDB and provide a transport that re-emits them.
 *
 * Wire format (JSON, version 1):
 *   {
 *     version: 1,
 *     seed: <uint32>,
 *     gameDefinition: <subset of the engine definition, no transport>,
 *     turns: [
 *       { turn, peerId, commands, checksum? },
 *       …
 *     ],
 *     meta: { createdAt, durationFrames, players: [{name, civ}] }
 *   }
 *
 * Two transports are exported:
 *   - RecordingTransport: wraps another transport, captures every bundle.
 *   - ReplayTransport: feeds a captured turn list back to a fresh engine.
 */

class BaseShim {
    constructor() {
        this.onCommandBundle = null;
        this.onConnect = null;
        this.onDisconnect = null;
        this.onMessage = null;
        this.connected = true;
    }
    sendMessage() {}
}

/**
 * Transparent recorder. Use it as the engine's transport directly (it
 * pretends to be a single-player local transport that simply collects
 * everything that passes through).
 */
export class RecordingTransport extends BaseShim {
    constructor(seed, definitionSnapshot) {
        super();
        this.seed = seed >>> 0;
        this.definition = definitionSnapshot;
        this.turns = [];
        this.startedAt = Date.now();
    }

    sendCommandBundle(turn, peerId, commands, checksum) {
        // Record both directions even though for single-player there is
        // only the local peer.
        this.turns.push({ turn, peerId, commands: cloneCommands(commands), checksum });
        // Loop the bundle back so the engine can apply it.
        if (this.onCommandBundle) {
            this.onCommandBundle(turn, peerId, commands, checksum);
        }
    }

    /** Serialise the recording to a plain JSON-friendly object. */
    snapshot(extra = {}) {
        return {
            version: 1,
            seed: this.seed,
            gameDefinition: stripDefinition(this.definition),
            turns: this.turns,
            meta: {
                createdAt: this.startedAt,
                durationFrames: extra.durationFrames || 0,
                players: (this.definition?.players || []).map((p) => ({
                    name: p.name, civ: p.civ, is_cpu: p.is_cpu,
                })),
            },
        };
    }
}

/**
 * Replay transport. Constructed from a snapshot; on every
 * `sendCommandBundle` it ignores the local input and instead emits the
 * next recorded bundle whose turn matches.
 *
 * Practically: when used in playback the engine submits empty bundles
 * (because the human player is not allowed to act) and we substitute the
 * recorded ones in their place. The simulation must be seeded identically
 * for the deterministic replay to match.
 */
export class ReplayTransport extends BaseShim {
    constructor(snapshot) {
        super();
        this.snapshot = snapshot;
        this.cursor = 0;
        this.connected = true;
    }

    sendCommandBundle(turn /*, peerId, commands, checksum */) {
        // Drain every recorded bundle whose turn is <= the engine's
        // current turn so the simulation never stalls.
        while (this.cursor < this.snapshot.turns.length) {
            const next = this.snapshot.turns[this.cursor];
            if (next.turn > turn) break;
            this.cursor++;
            if (this.onCommandBundle) {
                this.onCommandBundle(next.turn, next.peerId, next.commands, next.checksum ?? null);
            }
        }
    }
}

/**
 * Persist a snapshot under a friendly name. Uses IndexedDB if available,
 * falls back to localStorage for tiny replays. When the optional cloud
 * backup layer is enabled (VITE_SUPABASE_* env vars at build time), the
 * same snapshot is additionally mirrored to Supabase Storage in the
 * background — failures are non-fatal so offline saves still work.
 */
export async function saveReplay(name, snapshot) {
    const json = JSON.stringify(snapshot);
    let localOk = false;
    try {
        const db = await openDb();
        await dbPut(db, 'replays', { name, snapshot, savedAt: Date.now() });
        localOk = true;
    } catch (err) {
        try {
            localStorage.setItem('aoe-replay-' + name, json);
            localOk = true;
        } catch { localOk = false; }
    }
    // Fire-and-forget cloud backup. Dynamic import keeps the cloud
    // module out of the initial bundle for users without Supabase env.
    try {
        const { backupReplayToCloud } = await import('../../cloud/replay_backup.js');
        backupReplayToCloud(name, snapshot).catch(() => {});
    } catch (_) { /* cloud module missing — ignore */ }
    return localOk;
}

export async function loadReplay(name) {
    try {
        const db = await openDb();
        const row = await dbGet(db, 'replays', name);
        if (row) return row.snapshot;
    } catch { /* ignore */ }
    try {
        const raw = localStorage.getItem('aoe-replay-' + name);
        if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    // Last-ditch: try fetching from the cloud. Useful when the user
    // wipes their browser storage or opens the PWA on a new device.
    try {
        const { fetchReplayFromCloud } = await import('../../cloud/replay_backup.js');
        const snapshot = await fetchReplayFromCloud(name);
        if (snapshot) return snapshot;
    } catch (_) { /* cloud module missing — ignore */ }
    return null;
}

export async function listReplays() {
    try {
        const db = await openDb();
        return await dbList(db, 'replays');
    } catch {
        const out = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('aoe-replay-')) {
                out.push({ name: k.slice('aoe-replay-'.length) });
            }
        }
        return out;
    }
}

// ---------------- helpers ----------------
function cloneCommands(commands) {
    if (!commands) return [];
    return commands.map((c) => ({ ...c }));
}

function stripDefinition(def) {
    if (!def) return null;
    const out = { ...def };
    if (out.networking) {
        // Drop the live transport — the snapshot only needs the seed.
        const { transport, ...rest } = out.networking;
        out.networking = rest;
    }
    return out;
}

function openDb() {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') return reject(new Error('no IDB'));
        const req = indexedDB.open('aoe-pwa', 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains('replays')) {
                db.createObjectStore('replays', { keyPath: 'name' });
            }
            if (!db.objectStoreNames.contains('saves')) {
                db.createObjectStore('saves', { keyPath: 'name' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function dbPut(db, store, value) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put(value);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

function dbGet(db, store, key) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readonly');
        const req = tx.objectStore(store).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function dbList(db, store) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readonly');
        const req = tx.objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
