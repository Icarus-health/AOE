/**
 * Touch input adapter.
 *
 * The original engine binds mouse events directly on the canvas
 * container. To make the game playable on phones we install a thin
 * adapter that translates touch gestures into the engine's existing
 * MouseEvent shape, plus a handful of mobile-only conveniences:
 *
 *   - Single tap            → left click (select / move target)
 *   - Long press (≥500 ms)  → right click (issue order context)
 *   - Two-finger drag       → camera pan (replaces edge-scroll)
 *   - Pinch                 → zoom (writes window.__aoeZoom)
 *
 * Drag-selection (single-finger box) is intentionally NOT mapped to
 * touch — fat fingers + the existing tiny selection rectangle would be
 * frustrating. Use tap to select individual entities and the camera-
 * locked control groups (Ctrl+1..9) for everything else.
 *
 * The adapter is no-op on devices without TouchEvent; it never replaces
 * existing mouse handlers, so desktop users see no difference.
 */

const LONG_PRESS_MS = 500;
const TAP_SLOP = 12;            // px movement allowed before a touch is no longer a "tap"
const PAN_FRICTION = 1;

export function initTouchInput(container) {
    if (!container) return;
    if (typeof window.TouchEvent === 'undefined') return;

    let pressTimer = null;
    let startX = 0, startY = 0;
    let moved = false;
    let lastTwoTouchCentre = null;
    let lastPinchDistance = null;

    const dispatchMouse = (type, touch, button = 0) => {
        const evt = new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX: touch.clientX,
            clientY: touch.clientY,
            button,
            buttons: button === 0 ? 1 : 2,
        });
        // The engine uses event.offsetX/Y; MouseEvent does not let us set
        // those directly so we patch them on after construction.
        const rect = container.getBoundingClientRect();
        Object.defineProperty(evt, 'offsetX', { value: touch.clientX - rect.left });
        Object.defineProperty(evt, 'offsetY', { value: touch.clientY - rect.top });
        Object.defineProperty(evt, 'which', { value: button === 0 ? 1 : 3 });
        container.dispatchEvent(evt);
    };

    container.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            const t = e.touches[0];
            startX = t.clientX;
            startY = t.clientY;
            moved = false;
            // Schedule a long-press → right click. Cancelled if the user
            // moves too far or lifts before the timer fires.
            pressTimer = setTimeout(() => {
                dispatchMouse('mousedown', t, 2);
                dispatchMouse('mouseup', t, 2);
                pressTimer = null;
            }, LONG_PRESS_MS);
            // Mirror the touch as a mousemove so the engine's hover
            // tracking knows where the cursor "is".
            dispatchMouse('mousemove', t);
        } else if (e.touches.length === 2) {
            // Cancel any pending long-press once a second finger lands.
            if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
            lastTwoTouchCentre = midpoint(e.touches[0], e.touches[1]);
            lastPinchDistance = distance(e.touches[0], e.touches[1]);
        }
    }, { passive: false });

    container.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1) {
            const t = e.touches[0];
            if (Math.abs(t.clientX - startX) > TAP_SLOP || Math.abs(t.clientY - startY) > TAP_SLOP) {
                moved = true;
                if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
            }
            dispatchMouse('mousemove', t);
        } else if (e.touches.length === 2) {
            e.preventDefault();
            const newCentre = midpoint(e.touches[0], e.touches[1]);
            const newDist = distance(e.touches[0], e.touches[1]);

            // Pan the engine viewport by the centre delta.
            if (lastTwoTouchCentre) {
                const dx = newCentre.x - lastTwoTouchCentre.x;
                const dy = newCentre.y - lastTwoTouchCentre.y;
                panCamera(-dx * PAN_FRICTION, -dy * PAN_FRICTION);
            }
            // Pinch ratio → zoom hint (the renderer reads this).
            if (lastPinchDistance && newDist > 0) {
                const ratio = newDist / lastPinchDistance;
                window.__aoeZoom = (window.__aoeZoom || 1) * ratio;
                window.__aoeZoom = Math.max(0.5, Math.min(2.0, window.__aoeZoom));
            }
            lastTwoTouchCentre = newCentre;
            lastPinchDistance = newDist;
        }
    }, { passive: false });

    container.addEventListener('touchend', (e) => {
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
        if (e.touches.length === 0) {
            // Single-finger lift → tap = left click.
            if (!moved && e.changedTouches.length > 0) {
                const t = e.changedTouches[0];
                dispatchMouse('mousedown', t, 0);
                dispatchMouse('mouseup', t, 0);
                dispatchMouse('click', t, 0);
            }
            lastTwoTouchCentre = null;
            lastPinchDistance = null;
        } else if (e.touches.length === 1) {
            // Dropped from two-finger gesture to one — restart the centre.
            lastTwoTouchCentre = null;
            lastPinchDistance = null;
        }
    });

    container.addEventListener('touchcancel', () => {
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
        lastTwoTouchCentre = null;
        lastPinchDistance = null;
    });
}

function midpoint(a, b) {
    return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
}

function distance(a, b) {
    const dx = a.clientX - b.clientX;
    const dy = a.clientY - b.clientY;
    return Math.hypot(dx, dy);
}

function panCamera(dx, dy) {
    const viewer = window.game?.navigator?.gameViewer;
    if (!viewer || !viewer.viewPort) return;
    viewer.viewPort.x += dx;
    viewer.viewPort.y += dy;
    if (typeof viewer.resetEntitiesCoords === 'function') {
        try { viewer.resetEntitiesCoords(); } catch (err) { /* ignore */ }
    }
}
