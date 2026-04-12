import { audioManager } from '../audio/audio_manager.js';

/**
 * Settings menu — DOM modal accessible from the Settings button (top-right
 * of the main menu) and from the Esc key during a match.
 *
 * Persists the same `aoe-audio-settings` localStorage key the AudioManager
 * already uses, plus a new `aoe-game-settings` key for non-audio prefs
 * (game speed, language, fullscreen).
 */
class SettingsMenu {
    constructor() {
        this.root = null;
        this.gameSettings = this._load();
    }

    _load() {
        try {
            return JSON.parse(localStorage.getItem('aoe-game-settings') || '{}');
        } catch { return {}; }
    }

    _save() {
        try {
            localStorage.setItem('aoe-game-settings', JSON.stringify(this.gameSettings));
        } catch { /* ignore */ }
    }

    open() {
        if (this.root) return;
        this.root = document.createElement('div');
        this.root.id = 'aoe-settings-modal';
        this.root.style.cssText = `
            position: fixed; inset: 0;
            background: rgba(0,0,0,0.7);
            display: flex; align-items: center; justify-content: center;
            z-index: 9100;
            font-family: sans-serif;
        `;
        const card = document.createElement('div');
        card.style.cssText = `
            width: 380px; max-width: calc(100vw - 40px);
            background: #1a1a2e; color: #f5e6c4;
            border: 2px solid #c4a57b; border-radius: 8px;
            padding: 18px 22px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.6);
        `;
        card.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
                <h2 style="margin:0;color:#f4d49a;font-size:20px">Settings</h2>
                <button id="aoe-set-close" type="button" style="background:transparent;border:none;color:#fff;font-size:20px;cursor:pointer">&times;</button>
            </div>

            <h3 style="font-size:13px;color:#d8c190;margin:10px 0 4px">Audio</h3>
            <label style="display:block;margin:6px 0;font-size:13px">
                <input type="checkbox" id="aoe-set-mute"> Mute all sound
            </label>
            <label style="display:block;margin:6px 0;font-size:13px">
                Master volume <input type="range" id="aoe-set-vol" min="0" max="1" step="0.05" style="width:100%">
            </label>
            <label style="display:block;margin:6px 0;font-size:13px">
                Music volume <input type="range" id="aoe-set-mvol" min="0" max="1" step="0.05" style="width:100%">
            </label>

            <h3 style="font-size:13px;color:#d8c190;margin:14px 0 4px">Game</h3>
            <label style="display:block;margin:6px 0;font-size:13px">
                Game speed <select id="aoe-set-speed" style="margin-left:8px">
                    <option value="0.5">Slow (0.5x)</option>
                    <option value="1" selected>Normal (1x)</option>
                    <option value="1.5">Fast (1.5x)</option>
                    <option value="2">Very fast (2x)</option>
                </select>
            </label>
            <label style="display:block;margin:6px 0;font-size:13px">
                Language <select id="aoe-set-lang" style="margin-left:8px">
                    <option value="en" selected>English</option>
                    <option value="de">Deutsch</option>
                </select>
            </label>
            <label style="display:block;margin:6px 0;font-size:13px">
                <input type="checkbox" id="aoe-set-dn"> Day/night cycle (cosmetic)
            </label>
            <label style="display:block;margin:6px 0;font-size:13px">
                <input type="checkbox" id="aoe-set-dmg"> Show damage numbers
            </label>

            <div style="margin-top:18px;display:flex;justify-content:flex-end">
                <button id="aoe-set-save" type="button" style="background:#8b7355;color:#fff;border:1px solid #c4a57b;border-radius:4px;padding:8px 16px;cursor:pointer">Save</button>
            </div>
        `;
        this.root.appendChild(card);
        document.body.appendChild(this.root);

        // Hydrate fields.
        const $ = (id) => this.root.querySelector('#' + id);
        $('aoe-set-mute').checked   = audioManager.muted;
        $('aoe-set-vol').value      = audioManager.volume;
        $('aoe-set-mvol').value     = audioManager.musicVolume;
        $('aoe-set-speed').value    = String(this.gameSettings.speed ?? 1);
        $('aoe-set-lang').value     = this.gameSettings.lang ?? 'en';
        $('aoe-set-dn').checked     = !!this.gameSettings.dayNight;
        $('aoe-set-dmg').checked    = !!this.gameSettings.damageNumbers;

        $('aoe-set-mute').addEventListener('change',  (e) => audioManager.setMuted(e.target.checked));
        $('aoe-set-vol').addEventListener('input',    (e) => audioManager.setVolume(parseFloat(e.target.value)));
        $('aoe-set-mvol').addEventListener('input',   (e) => {
            audioManager.musicVolume = parseFloat(e.target.value);
            audioManager._persist();
        });

        $('aoe-set-save').addEventListener('click', () => {
            this.gameSettings.speed         = parseFloat($('aoe-set-speed').value);
            this.gameSettings.lang          = $('aoe-set-lang').value;
            this.gameSettings.dayNight      = $('aoe-set-dn').checked;
            this.gameSettings.damageNumbers = $('aoe-set-dmg').checked;
            this._save();
            // Apply game speed live: changes the engine's tick rate.
            const engine = window.game?.navigator?.gameViewer?.engine;
            if (engine) engine.frameRate = 35 * this.gameSettings.speed;
            this.close();
        });

        $('aoe-set-close').addEventListener('click', () => this.close());
    }

    close() {
        if (this.root) { this.root.remove(); this.root = null; }
    }
}

export const settingsMenu = new SettingsMenu();
