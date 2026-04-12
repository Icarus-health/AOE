import { audioManager } from '../audio/audio_manager.js';
import { COMMANDS } from '../engine/netplay/command_queue.js';
import { STANCES, STANCE_NAMES } from '../engine/stances.js';
import { FORMATIONS, computeFormationTargets } from '../engine/formations.js';
import { selectionHud } from '../ui/selection_hud.js';

/**
 * Simple hotkey layer — bound on window.keydown.
 *
 * The bindings intentionally use `event.code` (physical key identifiers)
 * so they work across keyboard layouts. All handlers no-op if there is no
 * active match (e.g. while still in the main menu).
 *
 * Conventions borrowed from classic AoE / StarCraft:
 *   - Arrow keys           → camera scroll
 *   - 1-9                  → recall control group
 *   - Ctrl+1-9             → store the current selection as a control group
 *   - A / S / H            → attack-move / stop / hold-position
 *   - B                    → build menu (villager)
 *   - M                    → toggle mute
 */

const CAMERA_STEP = 40;
const unitGroups = new Map();

export function initHotkeys(game) {
    const handler = (e) => {
        // Ignore hotkeys while the user is typing in a form field.
        const tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        if (e.repeat) return;

        const engine = getEngine(game);
        const viewer = getViewer(game);

        switch (e.code) {
            // ---------- camera ----------
            case 'ArrowUp':    scrollCamera(viewer, 0, -CAMERA_STEP); break;
            case 'ArrowDown':  scrollCamera(viewer, 0,  CAMERA_STEP); break;
            case 'ArrowLeft':  scrollCamera(viewer, -CAMERA_STEP, 0); break;
            case 'ArrowRight': scrollCamera(viewer,  CAMERA_STEP, 0); break;

            // ---------- actions ----------
            case 'KeyA':
                if (engine?.selectedEntity) audioManager.play('attack', { volume: 0.4 });
                break;
            case 'KeyS':
                if (engine?.selectedEntity && typeof engine.selectedEntity.stopInteraction === 'function') {
                    engine.selectedEntity.stopInteraction();
                }
                break;
            case 'KeyH':
                // Hold position — leaves the unit idle but facing any threat.
                if (engine?.selectedEntity && typeof engine.selectedEntity.setBaseState === 'function') {
                    engine.selectedEntity.setBaseState(1 /* STATE.IDLE */);
                }
                break;

            // ---------- AoE2-style stances (F1..F4) ----------
            case 'F1': submitStance(engine, STANCES.AGGRESSIVE);   e.preventDefault(); break;
            case 'F2': submitStance(engine, STANCES.DEFENSIVE);    e.preventDefault(); break;
            case 'F3': submitStance(engine, STANCES.STAND_GROUND); e.preventDefault(); break;
            case 'F4': submitStance(engine, STANCES.NO_ATTACK);    e.preventDefault(); break;

            // ---------- patrol (P) ----------
            case 'KeyP':
                if (engine && engine.selectedEntity && engine.selectedEntity.netId != null) {
                    armPatrolMode(engine);
                }
                break;

            // ---------- cycle formation (Shift+F) ----------
            case 'KeyF':
                if (e.shiftKey) {
                    cycleFormation(engine);
                    e.preventDefault();
                }
                break;

            // ---------- toggle a selected gate ----------
            case 'KeyO': {
                if (engine && engine.selectedEntity && engine.selectedEntity.constructor.name === 'Gate') {
                    engine.submitCommand({
                        type: COMMANDS.GATE_TOGGLE,
                        playerIndex: engine.current_player.index,
                        subjectId: engine.selectedEntity.netId,
                    });
                    audioManager.play('click');
                }
                break;
            }

            // ---------- garrison / ungarrison ----------
            case 'KeyG': {
                // If a unit is selected, garrison it into the nearest
                // friendly Tower / TownCenter. If a tower or town center
                // is selected instead, ungarrison everything inside.
                if (!engine || !engine.selectedEntity) break;
                const ent = engine.selectedEntity;
                if (ent.constructor && (ent.constructor.name === 'Tower' || ent.constructor.name === 'TownCenter')) {
                    engine.submitCommand({
                        type: COMMANDS.UNGARRISON,
                        playerIndex: engine.current_player.index,
                        subjectId: ent.netId,
                    });
                } else if (ent.netId != null) {
                    const target = findNearestGarrisonHost(engine, ent);
                    if (target) {
                        engine.submitCommand({
                            type: COMMANDS.GARRISON,
                            playerIndex: engine.current_player.index,
                            subjectId: ent.netId,
                            targetId: target.netId,
                        });
                        audioManager.play('build', { volume: 0.4 });
                    }
                }
                break;
            }

            // ---------- town bell — recall every villager ----------
            case 'Backquote':
                if (engine && engine.current_player) {
                    engine.submitCommand({
                        type: COMMANDS.TOWN_BELL,
                        playerIndex: engine.current_player.index,
                    });
                    audioManager.play('click');
                }
                break;

            // ---------- audio ----------
            case 'KeyM':
                audioManager.toggleMute();
                audioManager.play('click');
                break;

            default:
                // ---------- control groups ----------
                if (e.code.startsWith('Digit')) {
                    const n = Number(e.code.replace('Digit', ''));
                    if (e.ctrlKey || e.metaKey) {
                        // Store current selection.
                        if (viewer && Array.isArray(viewer.selectedUnits)) {
                            unitGroups.set(n, [...viewer.selectedUnits]);
                        } else if (engine?.selectedEntity) {
                            unitGroups.set(n, [engine.selectedEntity]);
                        }
                    } else {
                        // Recall the group.
                        const group = unitGroups.get(n);
                        if (group && group.length > 0 && engine) {
                            // Select the first member — the engine only tracks
                            // a single `selectedEntity` internally.
                            const survivor = group.find((u) => !u.destroyed);
                            if (survivor && typeof survivor.setSelected === 'function') {
                                if (engine.selectedEntity) engine.selectedEntity.setSelected(false);
                                survivor.setSelected(true);
                                engine.selectedEntity = survivor;
                            }
                            audioManager.play('click');
                        }
                    }
                }
        }
    };

    window.addEventListener('keydown', handler);
}

function getEngine(game) {
    return game?.navigator?.gameViewer?.engine || null;
}

function getViewer(game) {
    return game?.navigator?.gameViewer || null;
}

// Patrol mode: when armed, the next left-click on the map issues a patrol
// command to the selected unit. We capture the click via a one-shot
// listener attached to the document so it works regardless of which UI
// layer the click hits first.
let patrolArmed = false;
function armPatrolMode(engine) {
    if (patrolArmed) return;
    patrolArmed = true;
    audioManager.play('click');
    const onClick = (clickEvent) => {
        patrolArmed = false;
        document.removeEventListener('mousedown', onClick, true);
        // Convert pixel coords into the engine's subtile system via the
        // viewer's mapDrawable helper, if available.
        const viewer = engine.viewer;
        if (!viewer || !viewer.mapDrawable) return;
        const rect = viewer.stage.container.getBoundingClientRect();
        const x = clickEvent.clientX - rect.left;
        const y = clickEvent.clientY - rect.top;
        let sub;
        try {
            sub = viewer.mapDrawable.screenCoordsToSubtile(x + viewer.viewPort.x, y + viewer.viewPort.y);
        } catch (err) { return; }
        if (!sub) return;
        engine.submitCommand({
            type: COMMANDS.PATROL,
            playerIndex: engine.current_player.index,
            subjectId: engine.selectedEntity.netId,
            point: { x: sub.x, y: sub.y },
        });
    };
    document.addEventListener('mousedown', onClick, true);
}

const FORMATION_ORDER = [FORMATIONS.BOX, FORMATIONS.LINE, FORMATIONS.FLANK];
let _formationIdx = 0;
function cycleFormation(engine) {
    _formationIdx = (_formationIdx + 1) % FORMATION_ORDER.length;
    selectionHud.setFormation(FORMATION_ORDER[_formationIdx]);
    audioManager.play('click');
    // The chosen formation is read by the next group move order — see the
    // viewer's selection-rectangle move handler. We expose it on a global
    // namespace because the original viewer.js does not import this module.
    window.__aoeSelectedFormation = FORMATION_ORDER[_formationIdx];
}

function findNearestGarrisonHost(engine, unit) {
    if (!engine.buildings) return null;
    let best = null;
    let bestDist = Infinity;
    for (const b of engine.buildings) {
        if (b.destroyed || b.player !== unit.player) continue;
        const name = b.constructor && b.constructor.name;
        if (name !== 'Tower' && name !== 'TownCenter') continue;
        const dx = (b.subtile_x ?? 0) - (unit.subtile_x ?? 0);
        const dy = (b.subtile_y ?? 0) - (unit.subtile_y ?? 0);
        const d = Math.abs(dx) + Math.abs(dy);
        if (d < bestDist) { bestDist = d; best = b; }
    }
    return best;
}

function submitStance(engine, stance) {
    if (!engine || !engine.selectedEntity) return;
    if (engine.selectedEntity.netId == null) return;
    engine.submitCommand({
        type: COMMANDS.STANCE,
        playerIndex: engine.current_player.index,
        subjectId: engine.selectedEntity.netId,
        stance,
    });
}

function scrollCamera(viewer, dx, dy) {
    if (!viewer || !viewer.viewPort) return;
    viewer.viewPort.x += dx;
    viewer.viewPort.y += dy;
    if (typeof viewer.resetEntitiesCoords === 'function') {
        try { viewer.resetEntitiesCoords(); } catch (err) { /* ignore */ }
    }
}
