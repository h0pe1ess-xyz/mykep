document.documentElement.dataset.tab = location.pathname === '/schedule.html' ? 'schedule' : location.pathname === '/settings.html' ? 'settings' : 'dashboard';
/* Run in <head>: only installed iOS gets the legacy full-height app shell.
 * Safari tabs, Android and the installation/onboarding UI keep their layout.
 */
function getMyKepDisplayMode(nav = navigator, view = window) {
    const ua = nav.userAgent || '';
    const ios = /iPad|iPhone|iPod/i.test(ua) || (/Macintosh/i.test(ua) && nav.maxTouchPoints > 1);
    const standalone = nav.standalone === true || view.matchMedia('(display-mode: standalone)').matches;
    return { ios, standalone };
}
function updateMyKepDisplayMode() {
    const mode = getMyKepDisplayMode();
    document.documentElement.classList.toggle('ios-standalone', mode.ios && mode.standalone);
}
updateMyKepDisplayMode();
window.matchMedia('(display-mode: standalone)').addEventListener?.('change', updateMyKepDisplayMode);
window.addEventListener('pageshow', updateMyKepDisplayMode);

/* Optional local diagnosis from Safari's console; never sends anything.
 * No group, URL, credentials, localStorage or other user data is included.
 */
window.mykepViewportReport = function() {
    function rect(selector) {
        const node = document.querySelector(selector);
        if (!node) return null;
        const r = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        return { top: r.top, bottom: r.bottom, height: r.height,
            paddingTop: style.paddingTop, paddingBottom: style.paddingBottom,
            position: style.position };
    }
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;width:0;top:0;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px);';
    document.body.appendChild(probe);
    const safeStyle = window.getComputedStyle(probe);
    const safeArea = { top: safeStyle.paddingTop, bottom: safeStyle.paddingBottom };
    probe.style.padding = '0';
    const units = {};
    for (const unit of ['vh', 'dvh', 'lvh']) {
        probe.style.height = '';
        probe.style.height = `100${unit}`;
        units[unit] = probe.style.height ? probe.getBoundingClientRect().height : null;
    }
    probe.remove();
    const viewport = window.visualViewport;
    return { version: '2.8.0', mode: getMyKepDisplayMode(),
        iosFixActive: document.documentElement.classList.contains('ios-standalone'),
        innerHeight: window.innerHeight, clientHeight: document.documentElement.clientHeight,
        visualViewport: viewport ? { height: viewport.height, offsetTop: viewport.offsetTop, scale: viewport.scale } : null,
        units, safeArea, body: rect('body'), app: rect('.app-container'), nav: rect('.bottom-nav') };
};

/* Android only: reserve navigation space inside the measured visible viewport.
 * Do not subtract a guessed system-bar height, and do not alter iOS safe areas.
 */
(function () {
    if (!/Android/i.test(navigator.userAgent || '')) return;
    var root = document.documentElement;
    root.classList.add('android-viewport');
    var frame = 0;
    function writePx(name, value) {
        var text = Math.round(value * 100) / 100 + 'px';
        if (root.style.getPropertyValue(name) !== text) root.style.setProperty(name, text);
    }
    function update() {
        frame = 0;
        var height = window.innerHeight;
        var visual = window.visualViewport;
        if (visual && visual.height > 0 && Math.abs((visual.scale || 1) - 1) < 0.01) {
            height = height > 0 ? Math.min(height, visual.height) : visual.height;
        }
        if (height > 0) writePx('--android-viewport-height', height);
        var nav = document.querySelector('.app-container > .bottom-nav');
        if (nav) {
            var navHeight = nav.getBoundingClientRect().height;
            if (navHeight > 0) writePx('--android-nav-height', navHeight);
        }
    }
    function schedule() {
        if (!frame) frame = window.requestAnimationFrame(update);
    }
    update();
    window.addEventListener('resize', schedule);
    window.addEventListener('pageshow', schedule);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', schedule);
    document.addEventListener('DOMContentLoaded', function () {
        update();
        var nav = document.querySelector('.app-container > .bottom-nav');
        if (nav && typeof ResizeObserver !== 'undefined') new ResizeObserver(schedule).observe(nav);
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
    });
})();

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
        // WebKit owns gestures that start at the screen edge.
        if (edge) state = null;
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
        if (!canScroll(state.target, axis, axis === 'x' ? dx : dy)) {
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

/* Fit contents to the actual main track, without viewport/safe-area overrides. */
(() => {
    let frame = 0;
    function fit() {
        frame = 0;
        const main = document.getElementById('dashboard-main');
        if (!main || !main.clientHeight) return;
        main.dataset.overflow = 'false';
        let fits = false;
        for (let density = 0; density <= 4; density++) {
            main.dataset.density = String(density);
            const style = getComputedStyle(main);
            const children = [...main.children].filter(node => getComputedStyle(node).display !== 'none');
            const needed = children.reduce((height, node) => {
                const css = getComputedStyle(node);
                return height + node.getBoundingClientRect().height + parseFloat(css.marginTop || 0) + parseFloat(css.marginBottom || 0);
            }, 0) + Math.max(0, children.length - 1) * (parseFloat(style.rowGap) || 0)
                + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
            if (needed <= main.clientHeight + 1) { fits = true; break; }
        }
        main.dataset.overflow = String(!fits);
    }
    window.requestDashboardFit = () => {
        if (!frame) frame = requestAnimationFrame(fit);
    };
    document.addEventListener('DOMContentLoaded', () => {
        const main = document.getElementById('dashboard-main');
        if (!main) return;
        if (typeof ResizeObserver !== 'undefined') new ResizeObserver(window.requestDashboardFit).observe(main);
        new MutationObserver(window.requestDashboardFit).observe(main, { childList: true, subtree: true, characterData: true });
        document.fonts?.ready.then(window.requestDashboardFit);
        window.requestDashboardFit();
    });
    window.addEventListener('resize', window.requestDashboardFit);
    window.addEventListener('pageshow', window.requestDashboardFit);
})();
