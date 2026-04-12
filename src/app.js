import { Sprites } from './sprites.js';
import './graphics/graphics.js';
import { MenuNavigator } from './navigator.js';
import { TestRunner } from './tests/runner.js';
import './magic.js';

import { audioManager } from './audio/audio_manager.js';
import { initHotkeys } from './input/hotkeys.js';
import { initInstallPrompt } from './pwa/install.js';
import { initViewport } from './input/viewport.js';
import { MultiplayerLobby } from './ui/multiplayer_lobby.js';
import { selectionHud } from './ui/selection_hud.js';
import { PlayerDefinition } from './utils.js';


class Game {
    constructor(container) {
        // Pick a responsive stage size that at least matches the window,
        // but stays within sensible bounds so the minimum UI still fits.
        const w = Math.max(Game.STAGE_MIN_WIDTH, window.innerWidth);
        const h = Math.max(Game.STAGE_MIN_HEIGHT, window.innerHeight);

        this.stage_width = w;
        this.stage_height = h;

        this.stage = new Graphics.Stage({
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

    // Register the hotkey layer — it reads the latest engine state on demand
    // via window.game, so it works even before a match actually starts.
    initHotkeys(game);

    // Wire the DOM-based multiplayer lobby button. The original Graphics-
    // layer main menu lives on a canvas, so we overlay a simple HTML button
    // for entering the multiplayer flow without having to refactor menu.js.
    mountMultiplayerButton(game);

    // Mount the selection HUD overlay (stance / garrison / gate state).
    selectionHud.mount();

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
