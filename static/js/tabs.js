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
    let views, track, nav, gesture;
    let frame = 0;
    let clickBlockedUntil = 0;
    const listeners = new Set();
    const native = document.documentElement.dataset.swipe === 'native';
    const originalNative = native && document.documentElement.dataset.nativeFlow === 'original';
    const pointer = document.documentElement.dataset.swipe === 'pointer';
    const replaceTabHistory = (native || pointer) && document.documentElement.classList.contains('ios-standalone');
    let settleTimer = 0;
    let nativeTouching = false;
    let nativeOrigin = null;
    let nativeSteps = 0;
    let nativeGesture = null;
    let nativeTarget = null;
    let nativeNavigation = null;
    let nativeSwipes = 0;
    let settleFrame = 0;
    let scrollRevision = 0;
    const nativeTrace = [];

    function traceNative(kind, details = {}) {
        if (!native || !track) return;
        if (nativeTrace.length === 120) nativeTrace.shift();
        nativeTrace.push({time:Math.round(performance.now()), kind, current,
            left:Math.round(track.scrollLeft), width:track.clientWidth,
            outerLeft:Math.round(views.scrollLeft), touching:nativeTouching,
            origin:nativeOrigin, steps:nativeSteps, target:nativeTarget, swipes:nativeSwipes, ...details});
    }

    function diagnostics() {
        return {version:document.querySelector('meta[name="mykep-build"]')?.content,
            mode:document.documentElement.dataset.swipeChoice || document.documentElement.dataset.swipe, userAgent:navigator.userAgent,
            snap:track && getComputedStyle(track).scrollSnapType,
            current, events:nativeTrace.slice()};
    }

    function isBlocked() {
        return document.getElementById('main-app').inert ||
            !!document.querySelector('.modal-overlay.active, .pwa-overlay') ||
            storage.get('mykep_onboarded') !== 'true';
    }

    function show(tab, { historyMode = 'push', focus = false, fromScroll = false, immediate = false } = {}) {
        if (!names.includes(tab)) return;
        traceNative('show', {tab, fromScroll, immediate});
        if (native && !fromScroll) {
            nativeNavigation = null;
            nativeOrigin = null;
            nativeSteps = 0;
            nativeGesture = null;
            nativeTarget = null;
            nativeSwipes = 0;
            nativeTouching = false;
            clearTimeout(settleTimer);
            cancelAnimationFrame(settleFrame);
            settleFrame = 0;
            if (!immediate) {
                if (originalNative) nativeNavigation = tab;
                track.scrollTo({left: names.indexOf(tab) * track.clientWidth,
                    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
                return;
            }
        }
        cancelDrag();
        const changed = current !== tab;
        const activeElement = document.activeElement;
        const moveFocus = focus || activeElement?.closest('.view')?.dataset.view !== tab &&
            !!activeElement?.closest('.view');
        current = tab;
        document.documentElement.dataset.tab = tab;
        track.classList.remove('is-dragging');
        track.style.transform = '';
        resetScroll();
        document.title = titles[tab];
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
        if (native && !fromScroll) {
            track.scrollTo({left: names.indexOf(tab) * track.clientWidth,
                behavior: immediate || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
        }
    }

    function cancelDrag() {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        gesture = null;
    }

    function reset(event) {
        traceNative('reset', {reason:event?.type || 'manual'});
        cancelDrag();
        track?.classList.remove('is-dragging');
        if (track) track.style.transform = '';
        resetScroll();
        if (native && track) {
            nativeTouching = false;
            nativeOrigin = null;
            nativeSteps = 0;
            nativeGesture = null;
            nativeTarget = null;
            nativeSwipes = 0;
            clearTimeout(settleTimer);
            cancelAnimationFrame(settleFrame);
            settleFrame = 0;
            if (nativeNavigation) {
                // A resize must preserve the user's last navigation tap instead
                // of cancelling it back to the previously committed tab.
                const destination = nativeNavigation;
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

    function renderDrag() {
        frame = 0;
        if (!gesture || gesture.axis !== 'x') return;
        if (isBlocked()) { reset(); return; }
        track.style.transform = `translate3d(${gesture.position}px, 0, 0)`;
    }

    function ownsHorizontalScroll(target, boundary = views) {
        if (target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="slider"], [data-no-swipe], .day-picker')) return true;
        for (let node = target; node && node !== boundary; node = node.parentElement) {
            if (node.scrollWidth > node.clientWidth + 1 &&
                /auto|scroll/.test(getComputedStyle(node).overflowX)) return true;
        }
        return false;
    }

    function start(event) {
        if (gesture) reset();
        if (event.touches.length !== 1 || isBlocked() || ownsHorizontalScroll(event.target)) return;
        const point = event.touches[0];
        const width = document.documentElement.clientWidth;
        if (point.clientX <= 20 || point.clientX >= width - 20) return;
        const viewWidth = views.clientWidth;
        if (!viewWidth) return;
        gesture = { id: point.identifier, x: point.clientX, y: point.clientY,
            index: names.indexOf(current), width: viewWidth, axis: null,
            origin: 0, position: 0, samples: [[event.timeStamp, point.clientX]] };
    }

    function move(event) {
        if (!gesture) return;
        // An uncancelable move belongs to the browser, not our tab carousel.
        if (!event.cancelable) { reset(); return; }
        if (event.touches.length !== 1) { reset(); return; }
        const point = event.touches[0];
        if (point.identifier !== gesture.id) { reset(); return; }
        const dx = point.clientX - gesture.x;
        const dy = point.clientY - gesture.y;
        if (!gesture.axis) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) return;
            if (Math.abs(dx) <= Math.abs(dy) * 1.2) { reset(); return; }
            if (isBlocked()) { reset(); return; }
            gesture.axis = 'x';
            gesture.origin = new DOMMatrixReadOnly(getComputedStyle(track).transform).m41;
            track.style.transform = `translate3d(${gesture.origin}px, 0, 0)`;
            track.classList.add('is-dragging');
        }
        if (!pointer && event.cancelable) event.preventDefault();
        gesture.samples.push([event.timeStamp, point.clientX]);
        while (gesture.samples.length > 2 && gesture.samples[1][0] < event.timeStamp - 100) gesture.samples.shift();
        const { index, width, origin } = gesture;
        const min = -Math.min(names.length - 1, index + 1) * width;
        const max = -Math.max(0, index - 1) * width;
        gesture.position = Math.max(min, Math.min(max, origin + dx));
        if (!frame) frame = requestAnimationFrame(renderDrag);
    }

    function end(event) {
        if (!gesture || gesture.axis !== 'x') { reset(); return; }
        if (isBlocked()) { reset(); return; }
        const { width, samples, index } = gesture;
        const point = [...event.changedTouches].find(touch => touch.identifier === gesture.id);
        if (!point || event.touches.length) { reset(); return; }
        const dx = point.clientX - gesture.x;
        const first = samples[0];
        const velocity = (point.clientX - first[1]) / Math.max(event.timeStamp - first[0], 1);
        clickBlockedUntil = performance.now() + 400;
        const passed = Math.abs(dx) >= width * 0.25 ||
            Math.abs(dx) >= 30 && Math.abs(velocity) > 0.35 && Math.sign(velocity) === Math.sign(dx);
        const target = names[index + (dx < 0 ? 1 : -1)];
        show(passed && target ? target : current);
    }

    function settleNative() {
        clearTimeout(settleTimer);
        if (nativeTouching || !track.clientWidth) return;
        if (isBlocked()) { reset(); return; }
        if (originalNative) {
            // Restore the first phone-tested native flow: observe the browser's
            // settled page without clamping, snapping or scrolling it again.
            const index = Math.max(0, Math.min(names.length - 1, Math.round(track.scrollLeft / track.clientWidth)));
            if (nativeNavigation && names[index] !== nativeNavigation) return;
            nativeNavigation = null;
            traceNative('native-observed', {index});
            if (names[index] !== current) show(names[index], {fromScroll:true});
            return;
        }
        const width = track.clientWidth;
        const min = nativeOrigin === null ? 0 : Math.max(0, nativeOrigin - nativeSteps);
        const max = nativeOrigin === null ? names.length - 1 : Math.min(names.length - 1, nativeOrigin + nativeSteps);
        // Every recognised swipe has a queued destination. Only this controller
        // settles the track; CSS snapping must not replay a previous target.
        const index = nativeSwipes > 0 ? nativeTarget :
            Math.max(min, Math.min(max, Math.round(track.scrollLeft / width)));
        traceNative('settle', {index});
        nativeOrigin = null;
        nativeSteps = 0;
        nativeGesture = null;
        nativeTarget = null;
        nativeSwipes = 0;
        // A second touch can cancel the browser's snap at a fractional offset.
        // Recover only once scrolling has stopped, never fight live momentum or
        // rubber-banding from the per-scroll handler.
        if (Math.abs(track.scrollLeft - index * width) > 1) {
            traceNative('repair', {index});
            track.scrollTo({left:index * width, behavior:'instant'});
        }
        if (names[index] !== current) show(names[index], {fromScroll: true});
    }

    function nativeScrollEnded() {
        traceNative('scrollend');
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

    function pointerEvent(event, ended = false) {
        // Reuse touch recognition; CSS touch-action owns browser cancellation.
        const point = {identifier: event.pointerId, clientX: event.clientX, clientY: event.clientY};
        return {target: event.target, touches: ended ? [] : [point], changedTouches: [point],
            timeStamp: event.timeStamp, cancelable: true};
    }

    function init() {
        views = document.getElementById('views');
        track = views.querySelector('.views-track');
        nav = document.querySelector('.bottom-nav');
        if (native) {
            for (const kind of ['touchstart','touchend','touchcancel','pointerdown','pointerup','pointercancel']) {
                window.addEventListener(kind, event => {
                    if (!views.contains(event.target) && !nativeTouching) return;
                    traceNative(kind, {surface:event.target.closest?.('.view')?.dataset.view || event.target.id || event.target.tagName});
                }, {passive:true, capture:true});
            }
            views.addEventListener('touchstart', event => {
                nativeNavigation = null;
                clearTimeout(settleTimer);
                cancelAnimationFrame(settleFrame);
                settleFrame = 0;
                nativeTouching = true;
                nativeGesture = null;
                if (originalNative) return;
                if (event.touches.length !== 1) return;
                // Each new gesture before settlement earns another tab step.
                // Rounding the still-moving position can otherwise treat the
                // second swipe as the first one and bounce back to the middle.
                if (nativeOrigin === null) {
                    nativeOrigin = Math.max(0, Math.min(names.length - 1, Math.round(track.scrollLeft / track.clientWidth)));
                    nativeSteps = 1;
                    nativeTarget = nativeOrigin;
                    nativeSwipes = 0;
                } else nativeSteps = Math.min(names.length - 1, nativeSteps + 1);
                if (!isBlocked() && !ownsHorizontalScroll(event.target, track)) {
                    const point = event.touches[0];
                    nativeGesture = {id:point.identifier, x:point.clientX, y:point.clientY,
                        time:event.timeStamp, width:track.clientWidth};
                }
            }, {passive: true, capture: true});
            const releaseNative = event => {
                if (!nativeTouching) return;
                nativeTouching = event.touches.length > 0;
                if (originalNative) {
                    clearTimeout(settleTimer);
                    settleTimer = setTimeout(settleNative, 180);
                    return;
                }
                const point = nativeGesture && Array.from(event.changedTouches || []).find(touch => touch.identifier === nativeGesture.id);
                if (!nativeTouching && event.type === 'touchend' && point) {
                    const dx = point.clientX - nativeGesture.x;
                    const dy = point.clientY - nativeGesture.y;
                    const velocity = Math.abs(dx) / Math.max(event.timeStamp - nativeGesture.time, 1);
                    if (Math.abs(dx) > Math.abs(dy) * 1.2 &&
                        (Math.abs(dx) >= nativeGesture.width * .25 || Math.abs(dx) >= 30 && velocity > .35)) {
                        nativeTarget = Math.max(0, Math.min(names.length - 1, nativeTarget + (dx < 0 ? 1 : -1)));
                        ++nativeSwipes;
                        traceNative('release-target');
                    }
                    // A short drag returns smoothly too; a tap during an
                    // unfinished transition resumes the existing destination.
                    track.scrollTo({left:nativeTarget * track.clientWidth,
                        behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
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
                // Fallback for engines without scrollend. Does not drive movement.
                settleTimer = setTimeout(settleNative, 180);
            }, {passive: true});
            views.addEventListener('wheel', () => { nativeNavigation = null; }, {passive: true});
            views.addEventListener('pointerdown', () => { nativeNavigation = null; }, {passive: true});
            track.addEventListener('scrollend', nativeScrollEnded);
            // Late viewport/safe-area changes must not leave the wrong tab visible.
            let width = track.clientWidth;
            new ResizeObserver(() => {
                if (width === track.clientWidth) return;
                width = track.clientWidth;
                reset();
            }).observe(track);
        } else if (pointer) {
            views.addEventListener('pointerdown', event => {
                if (!event.isPrimary) { reset(); return; }
                if (event.pointerType === 'mouse' && event.button !== 0) return;
                start(pointerEvent(event));
            });
            views.addEventListener('pointermove', event => {
                if (!event.isPrimary) { reset(); return; }
                move(pointerEvent(event));
                if (gesture?.axis === 'x' && !views.hasPointerCapture(event.pointerId)) views.setPointerCapture(event.pointerId);
            });
            window.addEventListener('pointerup', event => end(pointerEvent(event, true)));
            window.addEventListener('pointercancel', reset);
            views.addEventListener('lostpointercapture', event => {
                // Moving implicit touch capture from a child to views also emits
                // this event on the child; it must not cancel the live drag.
                if (event.target === views && gesture) reset();
            });
        } else {
            views.addEventListener('touchstart', start, { passive: true });
            views.addEventListener('touchmove', move, { passive: false });
            window.addEventListener('touchend', end, { passive: true });
            document.addEventListener('touchcancel', reset, { passive: true, capture: true });
        }
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
            document.querySelectorAll('.modal-overlay.active').forEach(modal => modal.classList.remove('active'));
            restoreHistory();
        });
        window.addEventListener('resize', reset);
        window.addEventListener('pagehide', reset);
        window.addEventListener('pageshow', restoreHistory);
        window.addEventListener('blur', reset);
        document.addEventListener('visibilitychange', reset);
        show(current, { historyMode: 'none', immediate: true });
        if (document.documentElement.classList.contains('ios-standalone') && (native || pointer)) {
            // Keep cancelable listeners in the two edge strips, not over the
            // entire native scroller. This restores the former iOS edge guard.
            for (const side of ['left', 'right']) {
                const edge = document.createElement('div');
                edge.className = `swipe-edge-guard swipe-edge-${side}`;
                edge.setAttribute('aria-hidden', 'true');
                edge.addEventListener('touchstart', event => {
                    if (event.cancelable) event.preventDefault();
                }, {passive:false});
                document.body.appendChild(edge);
            }
        }
    }

    return { init, show, diagnostics, get current() { return current; }, onChange(listener) { listeners.add(listener); } };
})();
