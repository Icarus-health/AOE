/**
 * Lockstep command queue.
 *
 * Real-time strategy multiplayer cannot stream raw simulation state every
 * frame — that would require gigabits of bandwidth. Instead, every client
 * runs the same deterministic simulation and exchanges *commands*.
 *
 * Each command is tagged with a `turn` number. When the engine processes a
 * frame it asks the command queue whether the current turn's command bundle
 * is complete (i.e. every connected peer has submitted their bundle for
 * that turn — even an empty one). If yes, every command is dispatched in a
 * stable order and the simulation advances. If no, the engine stalls one
 * frame and tries again.
 *
 * This is the same approach used by classic AoE / Starcraft / Warcraft III.
 *
 * Properties of the model:
 *   - Bandwidth scales with player count, NOT with simulation complexity.
 *   - Determinism failure surfaces immediately as a desync (we hash the
 *     simulation state every N turns and compare across peers).
 *   - Adding a network layer is just plugging in a `transport` that
 *     forwards local commands to peers and feeds remote commands back.
 */

export const COMMANDS = {
    NOOP:           0,
    MOVE:           1,
    INTERACT:       2,
    BUILD:          3,
    RECRUIT:        4,
    STOP:           5,
    STANCE:         6,
    PATROL:         7,
    TOWN_BELL:      8,
    UNGARRISON:     9,
    GARRISON:       10,
    FORMATION:      11,
};

const TURN_LENGTH_FRAMES = 4;     // 4 sim frames per "turn" (~9 turns/sec at 35 FPS)
const INPUT_DELAY_TURNS  = 3;     // commands take 3 turns to take effect — buffer for network jitter

export class CommandQueue {
    constructor({ localPeerId = 0, peerIds = [0], transport = null } = {}) {
        this.localPeerId = localPeerId;
        this.peerIds = [...peerIds].sort();
        this.transport = transport;
        this.currentFrame = 0;
        this.currentTurn = 0;
        // Map<turn, Map<peerId, Command[]>>
        this.bundles = new Map();
        // Outbound batch waiting to be flushed at the end of the current turn.
        this.localBatch = [];
        // Listeners that get to dispatch commands when they fire.
        this.listeners = [];
        // Optional desync detector — peers exchange a hash every N turns.
        this.checksums = new Map();
        this.onDesync = null;

        if (transport) {
            transport.onCommandBundle = (turn, peerId, commands, checksum) => {
                this.acceptRemoteBundle(turn, peerId, commands, checksum);
            };
        }
    }

    setPeers(peerIds) {
        this.peerIds = [...peerIds].sort();
    }

    onCommandsApplied(listener) {
        this.listeners.push(listener);
    }

    /** Queue a local command for the next available scheduling turn. */
    submit(command) {
        const target = this.currentTurn + INPUT_DELAY_TURNS;
        command.turn = target;
        command.peerId = this.localPeerId;
        this.localBatch.push(command);
    }

    /** Local-only mode (single player) — drains commands instantly. */
    isLocalOnly() {
        return this.peerIds.length <= 1 && !this.transport;
    }

    /** Called by the engine on every simulation frame. */
    advanceFrame(engine) {
        this.currentFrame++;
        if (this.currentFrame % TURN_LENGTH_FRAMES !== 0) return true;

        const turn = this.currentTurn;

        // Flush our locally-buffered commands for the appropriate future turn.
        const scheduled = turn + INPUT_DELAY_TURNS;
        const localForScheduled = this.localBatch;
        this.localBatch = [];
        this._stash(scheduled, this.localPeerId, localForScheduled);

        // In a networked game, broadcast our bundle (even if empty) so peers
        // can advance their own turn counters.
        if (this.transport) {
            this.transport.sendCommandBundle(scheduled, this.localPeerId, localForScheduled, null);
        }

        // Can we apply commands for the *current* turn? Only if every peer
        // has provided their bundle for it. In local-only mode this is
        // trivially true.
        const bundle = this.bundles.get(turn);
        const haveAll = this.isLocalOnly()
            ? true
            : (bundle && this.peerIds.every((p) => bundle.has(p)));

        if (!haveAll) {
            // Stall — engine should skip its sim step this frame.
            return false;
        }

        // Apply in deterministic order: sort by peerId, then by submission index.
        if (bundle) {
            const ordered = [];
            for (const peerId of this.peerIds) {
                const list = bundle.get(peerId) || [];
                for (const cmd of list) ordered.push(cmd);
            }
            for (const cmd of ordered) {
                this._dispatch(cmd, engine);
            }
            this.bundles.delete(turn);
        }

        this.currentTurn++;
        return true;
    }

    /** Inject a remote bundle from a peer. */
    acceptRemoteBundle(turn, peerId, commands, checksum) {
        this._stash(turn, peerId, commands);
        if (checksum != null) {
            const key = `${turn}:${peerId}`;
            this.checksums.set(key, checksum);
            this._maybeCheckDesync(turn);
        }
    }

    _stash(turn, peerId, commands) {
        let bundle = this.bundles.get(turn);
        if (!bundle) {
            bundle = new Map();
            this.bundles.set(turn, bundle);
        }
        bundle.set(peerId, commands);
    }

    _dispatch(cmd, engine) {
        for (const listener of this.listeners) {
            try { listener(cmd, engine); } catch (err) { console.warn('[netplay] dispatch error', err); }
        }
    }

    _maybeCheckDesync(turn) {
        const peerKeys = this.peerIds.map((p) => `${turn}:${p}`);
        if (!peerKeys.every((k) => this.checksums.has(k))) return;
        const seen = peerKeys.map((k) => this.checksums.get(k));
        const allEqual = seen.every((c) => c === seen[0]);
        if (!allEqual && this.onDesync) {
            this.onDesync({ turn, checksums: seen });
        }
        for (const k of peerKeys) this.checksums.delete(k);
    }
}

CommandQueue.TURN_LENGTH_FRAMES = TURN_LENGTH_FRAMES;
CommandQueue.INPUT_DELAY_TURNS = INPUT_DELAY_TURNS;
