/**
 * Tutorial mission — guided first-run experience.
 *
 * The tutorial is data-driven: an ordered list of steps, each with a
 * `text` to show in the overlay and a `check(engine, state)` predicate
 * that returns true once the user has completed the step. The runner
 * polls every 400 ms, advances to the next step when the predicate
 * fires, and dismisses itself when the list is exhausted.
 *
 * Triggered by appending `?tutorial=1` to the URL or by clicking the
 * "Tutorial" button on the main menu. Sets `localStorage.aoe-tutorial-done`
 * so it does not nag returning users.
 */

const STEPS = [
    {
        text: 'Welcome! Press the arrow keys to pan the camera around the map.',
        check: () => true, // auto-advance after a short delay
        delay: 4000,
    },
    {
        text: 'Click on one of your villagers to select it.',
        check: (engine) => engine.selectedEntity && engine.selectedEntity.TYPE === 'villager',
    },
    {
        text: 'Right-click on a tree, bush or gold mine to send the villager to gather resources.',
        check: (engine) => {
            return engine.units.some((u) =>
                u.player === engine.current_player
                && u.TYPE === 'villager'
                && u.interactionObject != null
            );
        },
    },
    {
        text: 'Open the Build menu (B) and try placing a House to support more villagers.',
        check: (engine) => {
            return engine.buildings.some((b) =>
                b.player === engine.current_player
                && b.constructor.name === 'House'
            );
        },
    },
    {
        text: 'Now build a Barracks — military buildings unlock combat units.',
        check: (engine) => {
            return engine.buildings.some((b) =>
                b.player === engine.current_player
                && b.constructor.name === 'Barracks'
            );
        },
    },
    {
        text: 'Recruit a soldier from the Barracks (Click the Barracks → ClubMan icon).',
        check: (engine) => {
            return engine.units.some((u) =>
                u.player === engine.current_player
                && u.TYPE === 'infantry'
            );
        },
    },
    {
        text: 'Try the AoE2 stances: select your soldier and press F1 (Aggressive) or F2 (Defensive).',
        check: (engine) => engine.selectedEntity && engine.selectedEntity.stance != null,
    },
    {
        text: 'Press the backtick key (`) to ring the Town Bell — every villager will rush home to safety.',
        check: () => false,
        manualAdvance: true,
        delay: 6000,
    },
    {
        text: 'You finished the tutorial! Open Multiplayer in the top-right to play a friend, or keep practising.',
        check: () => false,
        delay: 6000,
        last: true,
    },
];

class Tutorial {
    constructor() {
        this.root = null;
        this.timer = null;
        this.stepIndex = 0;
        this.stepStartedAt = 0;
        this.active = false;
    }

    isCompleted() {
        try { return !!localStorage.getItem('aoe-tutorial-done'); } catch { return false; }
    }

    markCompleted() {
        try { localStorage.setItem('aoe-tutorial-done', '1'); } catch { /* ignore */ }
    }

    start() {
        if (this.active) return;
        this.active = true;
        this.stepIndex = 0;
        this.stepStartedAt = Date.now();
        this._mountUi();
        this.timer = setInterval(() => this.tick(), 400);
    }

    stop() {
        this.active = false;
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        if (this.root) { this.root.remove(); this.root = null; }
    }

    _mountUi() {
        this.root = document.createElement('div');
        this.root.id = 'aoe-tutorial';
        this.root.style.cssText = `
            position: fixed;
            top: 80px;
            left: 50%;
            transform: translateX(-50%);
            min-width: 360px;
            max-width: 540px;
            background: rgba(20, 16, 8, 0.92);
            color: #f4d49a;
            border: 2px solid #c4a57b;
            border-radius: 8px;
            font-family: sans-serif;
            font-size: 14px;
            line-height: 1.45;
            padding: 14px 22px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.6);
            z-index: 750;
        `;
        document.body.appendChild(this.root);
        this._render();
    }

    _render() {
        const step = STEPS[this.stepIndex];
        if (!step) {
            this.markCompleted();
            this.stop();
            return;
        }
        const dismiss = step.last ? '' : '<div style="font-size:11px;opacity:0.6;margin-top:8px">Step ' + (this.stepIndex + 1) + ' of ' + STEPS.length + '</div>';
        this.root.innerHTML = `
            <div style="font-weight:bold;color:#f4d49a;margin-bottom:4px">Tutorial</div>
            <div>${escape(step.text)}</div>
            ${dismiss}
            <button type="button" id="aoe-tut-skip" style="position:absolute;top:6px;right:8px;background:transparent;border:none;color:#fff;font-size:16px;cursor:pointer;opacity:0.7">&times;</button>
        `;
        const skip = this.root.querySelector('#aoe-tut-skip');
        if (skip) skip.addEventListener('click', () => { this.markCompleted(); this.stop(); });
    }

    tick() {
        const engine = window.game?.navigator?.gameViewer?.engine;
        if (!engine) return;
        const step = STEPS[this.stepIndex];
        if (!step) { this.stop(); return; }

        const now = Date.now();
        const elapsed = now - this.stepStartedAt;

        let advance = false;
        if (step.check && step.check(engine)) advance = true;
        if (step.delay && elapsed >= step.delay) advance = true;

        if (advance) {
            if (step.last) { this.markCompleted(); this.stop(); return; }
            this.stepIndex++;
            this.stepStartedAt = now;
            this._render();
        }
    }
}

function escape(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

export const tutorial = new Tutorial();
