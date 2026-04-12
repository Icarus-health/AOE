import { Sprites } from './sprites.js';
import './graphics/graphics.js';
// Phase 1 renderer abstraction. Currently a thin shim around the canvas
// renderer; the PixiJS migration will swap the implementation in Phase 4.
// Imported here so the bootstrap order matches the engine's window.Graphics
// expectations and `getRenderer()` is callable from anywhere.
import { getRenderer } from './graphics/renderer.js';
import { MenuNavigator } from './navigator.js';
import { TestRunner } from './tests/runner.js';
import './magic.js';

import { audioManager } from './audio/audio_manager.js';
import { initHotkeys } from './input/hotkeys.js';
import { initInstallPrompt } from './pwa/install.js';
import { initViewport } from './input/viewport.js';
import { initTouchInput } from './input/touch_input.js';
import { MultiplayerLobby } from './ui/multiplayer_lobby.js';
import { lobbyBrowser } from './ui/lobby_browser.js';
import { selectionHud } from './ui/selection_hud.js';
import { chatWidget } from './ui/chat_widget.js';
import { idleVillagerIndicator } from './ui/idle_villager_indicator.js';
import { settingsMenu } from './ui/settings_menu.js';
import { damageOverlay } from './ui/damage_text.js';
import { latencyHud } from './ui/latency_hud.js';
import { replayPanel } from './ui/replay_panel.js';
import { fogRenderer } from './engine/fog_of_war.js';
import { dayNightCycle } from './ui/day_night.js';
import { selectionRingOverlay } from './ui/selection_ring.js';
import { pauseOverlay } from './ui/pause_overlay.js';
import { tutorial } from './ui/tutorial.js';
import { loadReplay } from './engine/netplay/replay.js';
import { ReplayTransport } from './engine/netplay/replay.js';
import { PlayerDefinition } from './utils.js';


class Game {
    constructor(container) {
        // Pick a responsive stage size that at least matches the window,
        // but stays within sensible bounds so the minimum UI still fits.
        const w = Math.max(Game.STAGE_MIN_WIDTH, window.innerWidth);
        const h = Math.max(Game.STAGE_MIN_HEIGHT, window.innerHeight);

        this.stage_width = w;
        this.stage_height = h;

        const renderer = getRenderer();
        this.renderer = renderer;
        this.stage = renderer.createStage({
            container: container,
            width: this.stage_width,
            height: this.stage_height
        });

        this.layers = {
            terrain: new Graphics.HitlessLayer(),
            entities: new Graphics.Layer(),
            // grid: new Graphics.GridPreview(this.stage),
            interface: new Graphics.Layer()
        };

        this.stage.add(this.layers.terrain);
        this.stage.add(this.layers.entities);
        // this.stage.add(this.layers.grid);
        this.stage.add(this.layers.interface);

        this.navigator = new MenuNavigator(this.stage, this.layers);
    }
    draw() {
        this.stage.draw();
    }
}
Game.STAGE_MIN_WIDTH = 800;
Game.STAGE_MIN_HEIGHT = 600;
// Legacy fixed size — kept for backwards compatibility with code that still
// references Game.STAGE_WIDTH / STAGE_HEIGHT.
Game.STAGE_WIDTH = Math.max(800, window.innerWidth);
Game.STAGE_HEIGHT = Math.max(600, window.innerHeight);
Game.CURSORS = [
    ["arrow", Sprites.Sprite("img/interface/cursors/arrow.png")],
    ["pointer", Sprites.Sprite("img/interface/cursors/pointer.png")],
    ["attack", Sprites.Sprite("img/interface/cursors/attack.png")],
    ["affect", Sprites.Sprite("img/interface/cursors/affect.png")],
];

document.oncontextmenu = function () { return false; };

if (window.loader) {
    window.loader.style.width = `${Game.STAGE_WIDTH}px`;
}

// Boot the PWA install prompt handler ASAP so we do not miss the
// `beforeinstallprompt` event.
initInstallPrompt();

Sprites.ready.then(async function () {
    const offset_x = 40;
    const offset_y = 20;

    let sheet = document.head.querySelector("style").sheet;
    for (let [className, sprite] of Game.CURSORS) {
        try {
            sheet.addRule(
                `#container.${className}`,
                `cursor: url("${sprite.toDataURL()}") ${offset_x} ${offset_y}, auto`
            );
        } catch (err) {
            // Some browsers prefer insertRule over the legacy addRule API.
            sheet.insertRule(
                `#container.${className} { cursor: url("${sprite.toDataURL()}") ${offset_x} ${offset_y}, auto; }`,
                sheet.cssRules.length
            );
        }
    }

    let game = new Game('container');
    window.game = game;

    // Make sure the container actually tracks the viewport.
    initViewport(document.getElementById('container'));
    // Touch / pinch / long-press for mobile devices.
    initTouchInput(document.getElementById('container'));

    // Register the hotkey layer — it reads the latest engine state on demand
    // via window.game, so it works even before a match actually starts.
    initHotkeys(game);

    // Wire the DOM-based multiplayer lobby button. The original Graphics-
    // layer main menu lives on a canvas, so we overlay a simple HTML button
    // for entering the multiplayer flow without having to refactor menu.js.
    mountMultiplayerButton(game);

    // Mount every DOM overlay we ship: selection HUD, chat, idle villager
    // indicator, damage numbers + low-HP health bars, and the netplay
    // diagnostics HUD. They are all polling-based, no engine refactor.
    selectionHud.mount();
    chatWidget.mount();
    idleVillagerIndicator.mount();
    damageOverlay.mount();
    latencyHud.mount();
    fogRenderer.mount();
    dayNightCycle.mount();
    selectionRingOverlay.mount();
    pauseOverlay.mount();

    // Auto-launch the tutorial if either the URL says so or this is the
    // user's first ever visit.
    const params2 = new URLSearchParams(location.search);
    if (params2.get('tutorial') === '1' || (!tutorial.isCompleted() && params2.get('replay') == null)) {
        // Defer until the engine has actually been instantiated by the
        // menu navigator. The tutorial polls window.game so it can wait.
        setTimeout(() => tutorial.start(), 2000);
    }
    // Expose the damage overlay so the engine's takeHit hook can find it
    // without needing a circular import.
    window.__damageOverlay = damageOverlay;

    // Settings button next to the multiplayer button.
    mountSettingsButton();
    mountReplaysButton();

    // If the URL carries `?replay=NAME`, boot directly into a saved
    // replay instead of waiting for the user to pick a menu option.
    const params = new URLSearchParams(location.search);
    const replayName = params.get('replay');
    if (replayName) bootReplay(game, replayName);

    // Begin preloading sound assets. Failures are non-fatal: if an asset is
    // missing the manager simply skips playing it.
    audioManager.preloadAll().catch((err) => {
        console.warn('[audio] preloadAll failed (non-fatal):', err);
    });

    game.draw();

    if (/test/.test(document.location.search)) {
        let runner = new TestRunner(game, 'results');
        runner.run(true);
    }
});


/**
 * Mount the DOM-only "Multiplayer" button. When clicked it opens the
 * MultiplayerLobby modal; when the lobby reports a connection it kicks
 * off the match by handing the existing menu navigator a fresh game
 * definition with the networking parameters baked in.
 */
function mountReplaysButton() {
    const btn = document.createElement('button');
    btn.id = 'aoe-replays-btn';
    btn.type = 'button';
    btn.textContent = 'Replays';
    btn.style.cssText = `
        position: fixed; top: 16px; right: 240px; z-index: 800;
        padding: 10px 16px; font-size: 14px; font-weight: bold;
        background: #444; color: #fff;
        border: 2px solid #888; border-radius: 6px; cursor: pointer;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    `;
    btn.addEventListener('click', () => replayPanel.open());
    document.body.appendChild(btn);
}

async function bootReplay(game, name) {
    const snapshot = await loadReplay(name);
    if (!snapshot) {
        alert(`Replay "${name}" not found.`);
        return;
    }
    const transport = new ReplayTransport(snapshot);
    const definition = {
        ...snapshot.gameDefinition,
        networking: {
            seed: snapshot.seed,
            replayTransport: transport,
            localPeerId: -1,             // spectate
            peerIds: [-1],
        },
    };
    // Patch the PlayerDefinition prototype back onto each player.
    if (definition.players) {
        definition.players = definition.players.map((p) => Object.assign(new PlayerDefinition(p.index, p.name, p.civ, p.color, p.team, p.is_cpu), p));
    }
    document.getElementById('mp-open-btn')?.style && (document.getElementById('mp-open-btn').style.display = 'none');
    game.navigator.startGame(definition);
}

function mountSettingsButton() {
    const btn = document.createElement('button');
    btn.id = 'aoe-settings-btn';
    btn.type = 'button';
    btn.textContent = 'Settings';
    btn.style.cssText = `
        position: fixed; top: 16px; right: 144px; z-index: 800;
        padding: 10px 16px; font-size: 14px; font-weight: bold;
        background: #444; color: #fff;
        border: 2px solid #888; border-radius: 6px; cursor: pointer;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    `;
    btn.addEventListener('click', () => settingsMenu.open());
    document.body.appendChild(btn);

    // Esc opens settings during a match.
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && e.target?.tagName !== 'INPUT') {
            settingsMenu.open();
        }
    });
}

function mountMultiplayerButton(game) {
    const btn = document.createElement('button');
    btn.id = 'mp-open-btn';
    btn.type = 'button';
    btn.textContent = 'Multiplayer';
    btn.style.cssText = `
        position: fixed; top: 16px; right: 16px; z-index: 800;
        padding: 10px 16px; font-size: 14px; font-weight: bold;
        background: #8b7355; color: #fff;
        border: 2px solid #c4a57b; border-radius: 6px; cursor: pointer;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    `;
    document.body.appendChild(btn);

    const lobby = new MultiplayerLobby({
        onStart: (networking) => startMultiplayerMatch(game, networking),
    });
    btn.addEventListener('click', () => lobby.open());

    // Server-browser button (relay-based room discovery).
    const browseBtn = document.createElement('button');
    browseBtn.id = 'lb-open-btn';
    browseBtn.type = 'button';
    browseBtn.textContent = 'Server Browser';
    browseBtn.style.cssText = `
        position: fixed; top: 16px; right: 360px; z-index: 800;
        padding: 10px 16px; font-size: 14px; font-weight: bold;
        background: #444; color: #fff;
        border: 2px solid #888; border-radius: 6px; cursor: pointer;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    `;
    document.body.appendChild(browseBtn);
    lobbyBrowser.onJoin = (networking) => startMultiplayerMatch(game, networking);
    browseBtn.addEventListener('click', () => lobbyBrowser.open());
}

function startMultiplayerMatch(game, networking) {
    // Build a minimal two-human game definition. Player 0 = host, player 1 = joiner.
    // is_cpu = false so neither player gets an AI controller.
    const players = [
        new PlayerDefinition(0, 'Host',   null, 0, null, false),
        new PlayerDefinition(1, 'Friend', null, 1, null, false),
    ];
    for (const p of players) p.startingAge = 0;

    const definition = {
        players,
        map: {
            size: 1,
            type: 0,
            startingAge: 0,
            resources: 1,
            difficulty: 1,
            revealMap: false,
            fullTech: false,
            addSampleUnits: true,
        },
        networking,
    };
    // Hide the multiplayer button while in-game.
    const mpBtn = document.getElementById('mp-open-btn');
    if (mpBtn) mpBtn.style.display = 'none';
    // Hand off to the existing menu navigator → spins up GameViewer + Engine.
    game.navigator.startGame(definition);
}
