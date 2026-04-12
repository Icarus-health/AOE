/**
 * initInstallPrompt — wires up the PWA install flow.
 *
 * The browser fires `beforeinstallprompt` once when the app is eligible
 * for installation. We stash the event, surface an install button in the
 * UI and trigger the prompt on demand.
 */
let deferredPrompt = null;

export function initInstallPrompt() {
    if (typeof window === 'undefined') return;

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        showInstallButton();
    });

    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        removeInstallButton();
    });
}

function showInstallButton() {
    let btn = document.getElementById('install-button');
    if (btn) {
        btn.hidden = false;
        return;
    }
    btn = document.createElement('button');
    btn.id = 'install-button';
    btn.type = 'button';
    btn.textContent = 'Install App';
    btn.onclick = async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        try {
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                removeInstallButton();
            }
        } catch (err) { /* ignore */ }
        deferredPrompt = null;
    };
    document.body.appendChild(btn);
}

function removeInstallButton() {
    const btn = document.getElementById('install-button');
    if (btn) btn.remove();
}
