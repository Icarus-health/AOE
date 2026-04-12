/**
 * AoE2-style combat stances.
 *
 * Each unit carries a `stance` property that decides how the auto-acquire
 * tick reacts to nearby enemies. The engine reads it inside its per-unit
 * processing loop (see Unit.process / Engine.processUnits).
 *
 *   AGGRESSIVE   chase any enemy in sight, even abandoning the current task
 *   DEFENSIVE    return fire, but only chase a short distance from base
 *   STAND_GROUND attack enemies in range, never move
 *   NO_ATTACK    ignore enemies entirely (useful for scouts and trade carts)
 *
 * The stance is a pure data field — every peer in a multiplayer game must
 * see the same value, which is why changes go through the lockstep
 * command queue (see COMMANDS.STANCE in command_queue.js).
 */

export const STANCES = {
    AGGRESSIVE:    0,
    DEFENSIVE:     1,
    STAND_GROUND:  2,
    NO_ATTACK:     3,
};

export const STANCE_NAMES = ['Aggressive', 'Defensive', 'Stand Ground', 'No Attack'];

/**
 * Decide whether a unit in the given stance should react to a target at
 * the given subtile distance from its "home" position.
 *
 * The thresholds are deliberately conservative — pathfinding and chase
 * logic are expensive and we want the AI to feel snappy, not chaotic.
 */
export function shouldEngage(stance, distance, homeDistance) {
    switch (stance) {
        case STANCES.AGGRESSIVE:    return distance <= 12;
        case STANCES.DEFENSIVE:     return distance <= 6 && homeDistance <= 14;
        case STANCES.STAND_GROUND:  return distance <= 4;
        case STANCES.NO_ATTACK:     return false;
        default:                    return distance <= 8;
    }
}

/** Default stance for newly created units. */
export const DEFAULT_STANCE = STANCES.DEFENSIVE;
