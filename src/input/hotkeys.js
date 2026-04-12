import { audioManager } from '../audio/audio_manager.js';
import { COMMANDS } from '../engine/netplay/command_queue.js';
import { STANCES } from '../engine/stances.js';

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
