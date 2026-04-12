/**
 * AudioManager — lightweight HTMLAudio-based sound system.
 *
 * The game ships with a hand-curated list of sound effects mapped to
 * logical event names (SOUNDS below). Callers use `audioManager.play('click')`
 * rather than referring to file paths directly, which keeps the call-sites
 * decoupled from the asset layout.
 *
 * All sounds are optional: if a file is missing or blocked by autoplay
 * policies the manager silently degrades so gameplay is never interrupted.
 */

export const SOUNDS = {
    // UI
    click:             '/audio/ui/click.mp3',
    error:             '/audio/ui/error.mp3',

    // Unit selection / movement
    villager_select:   '/audio/units/villager_select.mp3',
    villager_move:     '/audio/units/villager_move.mp3',
    military_select:   '/audio/units/military_select.mp3',
    military_move:     '/audio/units/military_move.mp3',

    // Villager actions
    chop_wood:         '/audio/actions/chop.mp3',
    mine:              '/audio/actions/mine.mp3',
    forage:            '/audio/actions/forage.mp3',
    build:             '/audio/actions/build.mp3',
    attack:            '/audio/actions/attack.mp3',

    // Buildings
    building_complete: '/audio/buildings/complete.mp3',
    building_destroy:  '/audio/buildings/destroy.mp3',

    // Music
    music_peace:       '/audio/music/peace.mp3',
    music_battle:      '/audio/music/battle.mp3',
};


class AudioManager {
    constructor() {
        /** @type {Map<string, HTMLAudioElement>} */
        this.sounds = new Map();
        this.music = null;
        this.muted = false;
        this.volume = 0.5;
        this.musicVolume = 0.3;
        this.ready = false;
        this._pendingMusic = null;

        // Restore persisted settings so mute/volume survive reloads.
        try {
            const saved = JSON.parse(localStorage.getItem('aoe-audio-settings') || 'null');
            if (saved) {
                this.muted = !!saved.muted;
                if (typeof saved.volume === 'number') this.volume = saved.volume;
                if (typeof saved.musicVolume === 'number') this.musicVolume = saved.musicVolume;
            }
        } catch (err) { /* no-op */ }
    }

    /**
     * Preload every sound declared in the SOUNDS map.
     * Returns a promise that resolves once every load attempt has settled,
     * regardless of whether individual loads succeeded or failed.
     */
    preloadAll() {
        return this.preload(SOUNDS);
    }

    /**
     * @param {Record<string, string>} soundList
     */
    async preload(soundList) {
        const promises = [];
        for (const [name, path] of Object.entries(soundList)) {
            const audio = new Audio();
            audio.preload = 'auto';
            audio.src = path;
            this.sounds.set(name, audio);
            promises.push(
                new Promise((resolve) => {
                    audio.addEventListener('canplaythrough', () => resolve(), { once: true });
                    audio.addEventListener('error', () => resolve(), { once: true });
                    // Safety net in case neither event ever fires.
                    setTimeout(resolve, 4000);
                })
            );
        }
        await Promise.all(promises);
        this.ready = true;
        if (this._pendingMusic) {
            this.playMusic(this._pendingMusic);
            this._pendingMusic = null;
        }
    }

    /**
     * Play a one-shot sound effect. Options:
     *  - volume: 0..1 multiplier (on top of the global volume)
     *  - rateJitter: randomise playbackRate to avoid a robotic feel
     */
    play(name, options = {}) {
        if (this.muted) return;
        const sound = this.sounds.get(name);
        if (!sound || !sound.src) return;

        // Using cloneNode lets overlapping sounds play simultaneously.
        const instance = sound.cloneNode();
        const v = (options.volume ?? 1) * this.volume;
        instance.volume = Math.max(0, Math.min(1, v));
        if (options.rateJitter) {
            instance.playbackRate = 1 + (Math.random() - 0.5) * options.rateJitter;
        }
        instance.play().catch(() => { /* autoplay block — ignore */ });
    }

    playMusic(name) {
        if (!this.ready) {
            this._pendingMusic = name;
            return;
        }
        if (this.music) {
            try { this.music.pause(); } catch (err) { /* ignore */ }
        }
        const track = this.sounds.get(name);
        if (!track || !track.src) return;
        this.music = track;
        this.music.loop = true;
        this.music.currentTime = 0;
        this.music.volume = this.muted ? 0 : this.volume * this.musicVolume;
        this.music.play().catch(() => { /* autoplay block — ignore */ });
    }

    stopMusic() {
        if (this.music) {
            try { this.music.pause(); } catch (err) { /* ignore */ }
            this.music = null;
        }
    }

    setMuted(muted) {
        this.muted = !!muted;
        if (this.music) this.music.volume = this.muted ? 0 : this.volume * this.musicVolume;
        this._persist();
    }

    toggleMute() {
        this.setMuted(!this.muted);
        return this.muted;
    }

    setVolume(vol) {
        this.volume = Math.max(0, Math.min(1, vol));
        if (this.music) this.music.volume = this.muted ? 0 : this.volume * this.musicVolume;
        this._persist();
    }

    _persist() {
        try {
            localStorage.setItem('aoe-audio-settings', JSON.stringify({
                muted: this.muted,
                volume: this.volume,
                musicVolume: this.musicVolume,
            }));
        } catch (err) { /* ignore */ }
    }
}

export const audioManager = new AudioManager();
// Expose on window for easy debugging from the devtools console.
if (typeof window !== 'undefined') {
    window.audioManager = audioManager;
}
