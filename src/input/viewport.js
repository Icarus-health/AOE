/**
 * initViewport — keep the game container sized to the browser viewport.
 *
 * The underlying Graphics.Stage allocates fixed-size canvases when layers
 * are first added, so mid-game canvas resizing is not fully supported by
 * the original engine. This helper instead:
 *
 *  1. Sizes the #container wrapper div to fill the window.
 *  2. Emits a `viewport-resize` CustomEvent so other modules can react.
 *  3. Invalidates the stale pointerlock pointer capture on orientation change.
 */
export function initViewport(container) {
    if (!container) return;
    const resize = () => {
        const width = window.innerWidth;
        const height = window.innerHeight;
        container.style.width = `${width}px`;
        container.style.height = `${height}px`;
        window.dispatchEvent(
            new CustomEvent('viewport-resize', { detail: { width, height } })
        );
    };
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    resize();

    // Prevent the iOS pull-to-refresh and rubber-band scrolling from
    // interfering with gameplay gestures.
    document.addEventListener(
        'touchmove',
        (e) => {
            if (e.touches.length > 1) e.preventDefault();
        },
        { passive: false }
    );
}
