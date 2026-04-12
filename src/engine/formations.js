/**
 * Simple AoE2-style group formations.
 *
 * When the player issues a single move order with multiple units selected,
 * we want them to arrive in a coherent shape rather than as a chaotic mob
 * around a single subtile. The functions here compute target positions
 * for each unit; the engine still hands those off to the regular A*
 * pathfinder one at a time.
 *
 * Formations supported:
 *   LINE   — units arranged in a single row perpendicular to the move
 *            direction (good for shield walls and bowmen)
 *   BOX    — square block of rows, useful for moving large mixed armies
 *   FLANK  — two short rows offset on the left and right (cavalry rush)
 *
 * The formation is purely a layout helper — units do not stay in formation
 * after they reach the target subtile. AoE2 calls that "loose follow",
 * which is the default in this implementation.
 */

export const FORMATIONS = {
    LINE:  0,
    BOX:   1,
    FLANK: 2,
};

/**
 * Compute target subtiles for `units` heading toward `center`, laid out in
 * the given formation. The returned array is parallel to `units`.
 *
 * `center` is `{x, y}` in subtile coordinates.
 */
export function computeFormationTargets(units, center, formation = FORMATIONS.BOX) {
    const n = units.length;
    if (n === 0) return [];

    const spacing = 2; // subtiles between unit slots

    // Use the first unit's current position to derive a heading vector.
    const first = units[0];
    let dx = center.x - first.subtile_x;
    let dy = center.y - first.subtile_y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    // Perpendicular vector (rotate 90°).
    const px = -dy, py = dx;

    const positions = new Array(n);

    switch (formation) {
        case FORMATIONS.LINE: {
            const half = (n - 1) / 2;
            for (let i = 0; i < n; i++) {
                const offset = (i - half) * spacing;
                positions[i] = {
                    x: Math.round(center.x + px * offset),
                    y: Math.round(center.y + py * offset),
                };
            }
            break;
        }
        case FORMATIONS.FLANK: {
            const halfN = Math.ceil(n / 2);
            for (let i = 0; i < n; i++) {
                const isLeft = i < halfN;
                const idx = isLeft ? i : (i - halfN);
                const sign = isLeft ? -1 : 1;
                const lateral = sign * (3 + (idx % 3) * spacing);
                const longitudinal = -Math.floor(idx / 3) * spacing;
                positions[i] = {
                    x: Math.round(center.x + px * lateral + dx * longitudinal),
                    y: Math.round(center.y + py * lateral + dy * longitudinal),
                };
            }
            break;
        }
        case FORMATIONS.BOX:
        default: {
            const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
            for (let i = 0; i < n; i++) {
                const col = i % cols;
                const row = Math.floor(i / cols);
                const lateral = (col - (cols - 1) / 2) * spacing;
                const longitudinal = -row * spacing;
                positions[i] = {
                    x: Math.round(center.x + px * lateral + dx * longitudinal),
                    y: Math.round(center.y + py * lateral + dy * longitudinal),
                };
            }
            break;
        }
    }

    return positions;
}
