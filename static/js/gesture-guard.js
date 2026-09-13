/* App gestures: preserve one-finger scrolling, suppress page zoom and overscroll.
 * Browser/OS-owned gestures are best-effort; no history traps or synthetic clicks.
 */
(() => {
    'use strict';
    const ua = navigator.userAgent || '';
    const ios = /iPad|iPhone|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
    const options = { passive: false, capture: true };
    const EDGE = 20;
    let state = null;

    function cancel(event) {
        if (event.cancelable) event.preventDefault();
    }

    function canScroll(target, axis, delta) {
        let node = target && target.nodeType === 1 ? target : target?.parentElement;
        while (node && node !== document.documentElement && node !== document.body) {
            const style = window.getComputedStyle(node);
            const overflow = axis === 'y' ? style.overflowY : style.overflowX;
            if (/^(auto|scroll|overlay)$/.test(overflow)) {
                const size = axis === 'y' ? node.clientHeight : node.clientWidth;
                const total = axis === 'y' ? node.scrollHeight : node.scrollWidth;
                const position = axis === 'y' ? node.scrollTop : node.scrollLeft;
                if (total > size + 1 && ((delta > 0 && position > 0) ||
                    (delta < 0 && position < total - size - 1))) return true;
                // Match CSS scroll-chain boundaries instead of moving the page behind a modal.
                const behavior = axis === 'y' ? style.overscrollBehaviorY : style.overscrollBehaviorX;
                if (behavior === 'none' || behavior === 'contain') return false;
            }
            node = node.parentElement;
        }
        return false;
    }

    document.addEventListener('touchstart', event => {
        if (event.touches.length !== 1) {
            state = null;
            cancel(event);
            return;
        }
        const touch = event.touches[0];
        const width = document.documentElement.clientWidth || window.innerWidth;
        const edge = ios && (touch.clientX <= EDGE || touch.clientX >= width - EDGE);
        state = { id: touch.identifier, x: touch.clientX, y: touch.clientY,
            target: event.target, edge };
        // iOS needs cancellation at touchstart to suppress its edge-swipe recognizer.
        // Real controls keep their taps. Their edge drags are cancelled in touchmove.
        const control = event.target.closest?.('a, button, input, textarea, select, label, summary, [role="button"], [contenteditable="true"]');
        if (edge && !control) cancel(event);
    }, options);

    document.addEventListener('touchmove', event => {
        if (event.touches.length > 1) {
            cancel(event);
            return;
        }
        if (!state || event.touches.length !== 1) return;
        const touch = event.touches[0];
        if (touch.identifier !== state.id) return;
        const dx = touch.clientX - state.x;
        const dy = touch.clientY - state.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 2) return;
        const axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        if ((state.edge && axis === 'x') || !canScroll(state.target, axis, axis === 'x' ? dx : dy)) {
            cancel(event);
        }
        state.x = touch.clientX;
        state.y = touch.clientY;
    }, options);

    const reset = () => { state = null; };
    document.addEventListener('touchend', reset, { passive: true, capture: true });
    document.addEventListener('touchcancel', reset, { passive: true, capture: true });
    window.addEventListener('pageshow', reset);
    window.addEventListener('pagehide', reset);
    document.addEventListener('visibilitychange', reset);
    // Older iOS WebKit may ignore the viewport's user-scalable flag.
    for (const name of ['gesturestart', 'gesturechange', 'gestureend']) {
        document.addEventListener(name, cancel, options);
    }
})();
