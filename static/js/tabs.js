'use strict';

const Tabs = (() => {
    const names = ['schedule', 'dashboard', 'settings'];
    const paths = { schedule: '/schedule.html', dashboard: '/', settings: '/settings.html' };
    const titles = {
        schedule: 'Розклад на тиждень - MyKep | ФКЕП ІФНТУНГ',
        dashboard: 'MyKep - розклад пар ФКЕП ІФНТУНГ',
        settings: 'Налаштування - MyKep'
    };
    let current = document.documentElement.dataset.tab || 'dashboard';
    let views, track, nav;
    let clickBlockedUntil = 0;
    const listeners = new Set();
    const androidNative = /Android/i.test(navigator.userAgent || '');
    const replaceTabHistory = document.documentElement.classList.contains('ios-standalone');
    let settleTimer = 0;
    let nativeTouching = false;
    let nativeOrigin = null;
    let nativeGesture = null;
    let nativeTarget = null;
    let nativeNavigation = null;
    let nativeSwipes = 0;
    let nativeChainFrame = 0;
    let nativeCompleting = false;
    let settleFrame = 0;
    let scrollRevision = 0;
    function diagnostics() {
        return {version:document.querySelector('meta[name="mykep-build"]')?.content,
            mode:'native',
            engine:'native',
            snap:track && getComputedStyle(track).scrollSnapType,
            current};
    }

    function isBlocked() {
        return document.getElementById('main-app').inert ||
            !!document.querySelector('dialog.modal-overlay[open], .pwa-overlay') ||
            storage.get('mykep_onboarded') !== 'true';
    }

    function clearNativeGesture() {
        cancelAnimationFrame(nativeChainFrame);
        nativeChainFrame = 0;
        nativeCompleting = false;
        track?.style.removeProperty('scroll-snap-type');
        nativeOrigin = null;
        nativeGesture = null;
        nativeTarget = null;
        nativeSwipes = 0;
    }

    function continueNativeChain(forceDestination = false) {
        // Complete interrupted series and limited edge swipes.
        // Ordinary single swipes retain browser-owned snapping.
        if (androidNative || nativeTarget === null ||
            (!nativeCompleting && nativeSwipes < 2 && !forceDestination)) return;
        nativeCompleting = true;
        track.style.scrollSnapType = 'none';
        const target = nativeTarget;
        cancelAnimationFrame(nativeChainFrame);
        nativeChainFrame = requestAnimationFrame(() => {
            nativeChainFrame = 0;
            if (nativeTouching || isBlocked() || nativeTarget !== target) return;
            track.scrollTo({left:target * track.clientWidth,
                behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
        });
    }

    function sampleNativeGesture(point) {
        if (!nativeGesture || point.identifier !== nativeGesture.id) return;
        const dx = point.clientX - nativeGesture.x;
        const dy = point.clientY - nativeGesture.y;
        if (!nativeGesture.axis && Math.max(Math.abs(dx), Math.abs(dy)) >= 8) {
            nativeGesture.axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
        }
        if (nativeGesture.axis === 'x' && Math.abs(dx) > Math.abs(nativeGesture.dx)) {
            nativeGesture.dx = dx;
        }
    }

    function show(tab, { historyMode = 'push', focus = false, fromScroll = false, immediate = false } = {}) {
        if (!names.includes(tab)) return;
        if (!fromScroll) {
            nativeNavigation = null;
            clearNativeGesture();
            nativeTouching = false;
            clearTimeout(settleTimer);
            cancelAnimationFrame(settleFrame);
            settleFrame = 0;
            if (!immediate) {
                nativeNavigation = tab;
                track.scrollTo({left: names.indexOf(tab) * track.clientWidth,
                    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
                return;
            }
        }
        const changed = current !== tab;
        const activeElement = document.activeElement;
        const moveFocus = focus || activeElement?.closest('.view')?.dataset.view !== tab &&
            !!activeElement?.closest('.view');
        current = tab;
        document.documentElement.dataset.tab = tab;
        resetScroll();
        document.title = AppBrand.text(titles[tab]);
        const activeView = track.querySelector(`[data-view="${tab}"]`);
        activeView.inert = false;
        activeView.removeAttribute('aria-hidden');
        if (moveFocus) activeView.focus({ preventScroll: true });
        for (const view of track.children) {
            const active = view === activeView;
            view.inert = !active;
            view.setAttribute('aria-hidden', String(!active));
        }
        for (const link of nav.querySelectorAll('[data-tab]')) {
            const active = link.dataset.tab === tab;
            link.classList.toggle('active', active);
            if (active) link.setAttribute('aria-current', 'page');
            else link.removeAttribute('aria-current');
        }
        if (historyMode === 'push' && changed) {
            // iOS otherwise animates stale tab snapshots during its own edge
            // navigation, independently of the live in-page carousel.
            history[replaceTabHistory ? 'replaceState' : 'pushState'](null, '', paths[tab] + location.search);
        }
        if (changed) listeners.forEach(listener => listener(tab));
        if (!fromScroll) {
            track.scrollTo({left: names.indexOf(tab) * track.clientWidth,
                behavior: immediate || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
        }
    }

    function reset() {
        resetScroll();
        if (track) {
            const destination = nativeNavigation ||
                (nativeCompleting ? names[nativeTarget] : null);
            nativeTouching = false;
            clearNativeGesture();
            clearTimeout(settleTimer);
            cancelAnimationFrame(settleFrame);
            settleFrame = 0;
            if (destination) {
                // A resize must preserve the user's last requested destination
                // of cancelling it back to the previously committed tab.
                nativeNavigation = null;
                show(destination, {immediate:true});
                return;
            }
            track.scrollTo({left: names.indexOf(current) * track.clientWidth, behavior: 'instant'});
        }
    }

    function resetScroll() {
        // Fallback for engines without overflow:clip and restored scroll state.
        if (views?.scrollLeft) views.scrollLeft = 0;
    }

    function restoreHistory() {
        const tab = names.find(name => paths[name] === location.pathname) || 'dashboard';
        show(tab, { historyMode: 'none', immediate: true });
        // The browser already animates Back/Forward; settle the app's transition.
        track.getAnimations().forEach(animation => animation.finish());
        resetScroll();
    }

    function ownsHorizontalScroll(target, boundary = views) {
        if (target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="slider"], [data-no-swipe], .day-picker')) return true;
        for (let node = target; node && node !== boundary; node = node.parentElement) {
            if (node.scrollWidth > node.clientWidth + 1 &&
                /auto|scroll/.test(getComputedStyle(node).overflowX)) return true;
        }
        return false;
    }

    function settleNative() {
        clearTimeout(settleTimer);
        if (nativeTouching || !track.clientWidth) return;
        if (isBlocked()) { reset(); return; }
        if (nativeCompleting && Math.abs(track.scrollLeft - nativeTarget * track.clientWidth) > 1) {
            continueNativeChain();
            return;
        }
        const index = Math.max(0, Math.min(names.length - 1, Math.round(track.scrollLeft / track.clientWidth)));
        if (nativeNavigation && names[index] !== nativeNavigation) return;
        // Chromium can leave a cancelled pan between snap points. Repair
        // only after idle, using the nearest visible tab, never a stale queue.
        if (androidNative && Math.abs(track.scrollLeft - index * track.clientWidth) > 1) {
            track.scrollTo({left:index * track.clientWidth,
                behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
            return;
        }
        nativeNavigation = null;
        // Restore all three snap points only after the queued destination
        // is aligned, so an old native snap cannot replay the middle tab.
        clearNativeGesture();
        if (names[index] !== current) show(names[index], {fromScroll:true});
        return;
    }

    function nativeScrollEnded() {
        // An interrupted scroll can queue its old scrollend after a new one
        // starts. Confirm two frames without scroll events before repairing it.
        cancelAnimationFrame(settleFrame);
        const revision = scrollRevision;
        settleFrame = requestAnimationFrame(() => {
            settleFrame = requestAnimationFrame(() => {
                settleFrame = 0;
                if (revision === scrollRevision) settleNative();
            });
        });
    }

    function init() {
        views = document.getElementById('views');
        track = views.querySelector('.views-track');
        nav = document.querySelector('.bottom-nav');
        window.addEventListener('touchstart', event => {
            // The Back guard is outside views. A follow-up touch on it
            // still belongs to an unfinished tab swipe, while its own
            // preventDefault continues to block browser Back.
            const edgeContinuation = nativeOrigin !== null && nativeSwipes > 0 &&
                event.target.closest?.('.swipe-edge-left');
            if (!views.contains(event.target) && !edgeContinuation) return;
            nativeNavigation = null;
            clearTimeout(settleTimer);
            cancelAnimationFrame(settleFrame);
            settleFrame = 0;
            nativeTouching = true;
            nativeGesture = null;
            cancelAnimationFrame(nativeChainFrame);
            nativeChainFrame = 0;
            if (event.touches.length !== 1 || window.visualViewport?.scale > 1) {
                clearNativeGesture();
                return;
            }
            // Chromium owns fling interruption and snap selection on Android.
            // The iOS chain workaround disables snapping and restarts smooth
            // scrolling after rapid contacts, competing with that native pan.
            if (androidNative) return;
            // Each new gesture before settlement earns another tab step.
            // Rounding the still-moving position can otherwise treat the
            // second swipe as the first one and bounce back to the middle.
            if (nativeOrigin === null) {
                nativeOrigin = Math.max(0, Math.min(names.length - 1, Math.round(track.scrollLeft / track.clientWidth)));
                nativeTarget = nativeOrigin;
                nativeSwipes = 0;
            }
            if (!isBlocked() && !ownsHorizontalScroll(event.target, track)) {
                const point = event.touches[0];
                nativeGesture = {id:point.identifier, x:point.clientX, y:point.clientY,
                    time:event.timeStamp, width:track.clientWidth, left:track.getBoundingClientRect().left,
                    axis:null, dx:0};
            }
        }, {passive: true, capture: true});
        window.addEventListener('touchmove', event => {
            if (event.touches.length === 1) sampleNativeGesture(event.touches[0]);
        }, {passive:true, capture:true});
        const releaseNative = event => {
            if (!nativeTouching) return;
            nativeTouching = event.touches.length > 0;
            if (event.type === 'touchcancel') clearNativeGesture();
            let limitedSwipe = false;
            let changedTarget = false;
            const point = nativeGesture && Array.from(event.changedTouches || []).find(touch => touch.identifier === nativeGesture.id);
            if (!nativeTouching && event.type === 'touchend' && point) {
                sampleNativeGesture(point);
                const endDx = point.clientX - nativeGesture.x;
                // A native pan may end close to its starting coordinate.
                // Preserve its observed movement instead of dropping a
                // second swipe and later undoing the browser's destination.
                const dx = Math.abs(endDx) < 8 ? nativeGesture.dx : endDx;
                // Count short native flicks without changing browser-owned
                // single-swipe motion.
                const room = dx > 0 ? nativeGesture.left + nativeGesture.width - nativeGesture.x :
                    nativeGesture.x - nativeGesture.left;
                if (nativeGesture.axis === 'x' && Math.abs(dx) >= 8) {
                    const target = Math.max(0, Math.min(names.length - 1, nativeTarget + (dx < 0 ? 1 : -1)));
                    changedTarget = target !== nativeTarget;
                    limitedSwipe = room <= 48 && changedTarget;
                    if (limitedSwipe) clickBlockedUntil = performance.now() + 400;
                    if (target !== nativeTarget) ++nativeSwipes;
                    nativeTarget = target;
                }
            }
            if (!nativeTouching && changedTarget) {
                // Further outward contacts must not restart the same
                // completion and hold a fast swipe series between pages.
                continueNativeChain(limitedSwipe);
            }
            nativeGesture = null;
            clearTimeout(settleTimer);
            settleTimer = setTimeout(settleNative, 180);
        };
        window.addEventListener('touchend', releaseNative, {passive: true, capture: true});
        window.addEventListener('touchcancel', releaseNative, {passive: true, capture: true});
        track.addEventListener('scroll', () => {
            ++scrollRevision;
            clearTimeout(settleTimer);
            // Observe idle scrolling on engines without scrollend.
            settleTimer = setTimeout(settleNative, 180);
        }, {passive: true});
        views.addEventListener('wheel', () => {
            nativeNavigation = null;
            clearNativeGesture();
        }, {passive: true});
        views.addEventListener('pointerdown', event => {
            nativeNavigation = null;
            if (event.pointerType !== 'touch') clearNativeGesture();
        }, {passive: true});
        track.addEventListener('scrollend', nativeScrollEnded);
        // Late viewport/safe-area changes must not leave the wrong tab visible.
        let width = track.clientWidth;
        new ResizeObserver(() => {
            if (width === track.clientWidth) return;
            width = track.clientWidth;
            reset();
        }).observe(track);
        views.addEventListener('scroll', resetScroll, { passive: true });
        views.addEventListener('click', event => {
            if (performance.now() < clickBlockedUntil) {
                event.preventDefault();
                event.stopImmediatePropagation();
            }
        }, true);
        nav.addEventListener('click', event => {
            const link = event.target.closest('a[data-tab]');
            if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
            event.preventDefault();
            if (!isBlocked()) show(link.dataset.tab);
        });
        window.addEventListener('popstate', () => {
            document.querySelectorAll('dialog.modal-overlay[open]').forEach(modal => Dialogs.close(modal));
            restoreHistory();
        });
        // Android height-only viewport events must not rewind an active pan.
        // The native track's ResizeObserver already resets on width changes.
        if (!androidNative) window.addEventListener('resize', reset);
        window.addEventListener('pagehide', reset);
        window.addEventListener('pageshow', restoreHistory);
        window.addEventListener('blur', reset);
        document.addEventListener('visibilitychange', reset);
        show(current, { historyMode: 'none', immediate: true });
        if (document.documentElement.classList.contains('ios-standalone')) {
            // Keep the iOS Back guard off the native scroller and right edge.
            const edge = document.createElement('div');
            edge.className = 'swipe-edge-guard swipe-edge-left';
            edge.setAttribute('aria-hidden', 'true');
            edge.addEventListener('touchstart', event => {
                if (event.cancelable) event.preventDefault();
            }, {passive:false});
            document.body.appendChild(edge);
        }
    }

    return { init, show, diagnostics, get current() { return current; }, onChange(listener) { listeners.add(listener); } };
})();
