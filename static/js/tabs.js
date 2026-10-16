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
    const diagnostic = new URLSearchParams(location.search).get('swipe-debug') === '1';
    const trace = [];

    function sample(type, position, event = null) {
        if (!diagnostic) return;
        const point = event?.touches[0] || event?.changedTouches[0];
        trace.push({type,ms:Math.round(performance.now()*100)/100,position,
            ...(point ? {x:point.clientX,y:point.clientY,cancelable:event.cancelable} : {})});
        if (trace.length > 360) trace.shift();
    }
    if (diagnostic) window.mykepSwipeReport = () => ({
        version:document.querySelector('meta[name="mykep-build"]')?.content,
        width:views?.clientWidth, samples:trace.slice()
    });

    function isBlocked() {
        return document.getElementById('main-app').inert ||
            !!document.querySelector('.modal-overlay.active, .pwa-overlay') ||
            storage.get('mykep_onboarded') !== 'true';
    }

    function show(tab, { historyMode = 'push', focus = false } = {}) {
        if (!names.includes(tab)) return;
        cancelDrag();
        freeze();
        // Commit the visible start before restoring the CSS transition.
        getComputedStyle(track).transform;
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
            link.classList.toggle('center-action', active);
            if (active) link.setAttribute('aria-current', 'page');
            else link.removeAttribute('aria-current');
        }
        if (historyMode === 'push' && changed) {
            history.pushState(null, '', paths[tab] + location.search);
        }
        if (changed) listeners.forEach(listener => listener(tab, historyMode !== 'none'));
    }

    function cancelDrag() {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        gesture = null;
    }

    function reset() {
        if (gesture) sample('cancel', gesture.position);
        if (track) show(current, { historyMode: 'none' });
        else cancelDrag();
    }

    function freeze() {
        const position = new DOMMatrixReadOnly(getComputedStyle(track).transform).m41;
        sample('anchor', position);
        track.classList.add('is-dragging');
        track.style.transform = `translate3d(${position}px, 0, 0)`;
        return position;
    }

    function resetScroll() {
        // Fallback for engines without overflow:clip and restored scroll state.
        if (views?.scrollLeft) views.scrollLeft = 0;
    }

    function restoreHistory(event) {
        const tab = names.find(name => paths[name] === location.pathname) || 'dashboard';
        show(tab, { historyMode: event?.type === 'popstate' ? 'pop' : 'none' });
        // The browser already animates Back/Forward; settle the app's transition.
        track.getAnimations().forEach(animation => animation.finish());
        resetScroll();
    }

    function renderDrag() {
        frame = 0;
        if (!gesture || gesture.axis !== 'x') return;
        if (isBlocked()) { reset(); return; }
        track.style.transform = `translate3d(${gesture.position}px, 0, 0)`;
        sample('frame', gesture.position);
    }

    function ownsHorizontalScroll(target) {
        if (target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="slider"], [data-no-swipe], .day-picker')) return true;
        for (let node = target; node && node !== views; node = node.parentElement) {
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
        // Contact anchors a running transition even before direction lock.
        const origin = freeze();
        sample('start', origin, event);
        gesture = { id: point.identifier, x: point.clientX, y: point.clientY,
            index: names.indexOf(current), width: viewWidth, axis: null,
            origin, position: origin, samples: [[event.timeStamp, point.clientX]] };
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
            const axis = getMyKepGestureAxis(dx, dy);
            if (!axis) return;
            if (axis === 'y') { reset(); return; }
            if (isBlocked()) { reset(); return; }
            gesture.axis = 'x';
        }
        if (event.cancelable) event.preventDefault();
        gesture.samples.push([event.timeStamp, point.clientX]);
        while (gesture.samples.length > 2 && gesture.samples[1][0] < event.timeStamp - 100) gesture.samples.shift();
        const { index, width, origin } = gesture;
        const min = -Math.min(names.length - 1, index + 1) * width;
        const max = -Math.max(0, index - 1) * width;
        gesture.position = Math.max(min, Math.min(max, origin + dx));
        sample('move', gesture.position, event);
        if (!frame) frame = requestAnimationFrame(renderDrag);
    }

    function end(event) {
        if (!gesture || gesture.axis !== 'x') { reset(); return; }
        if (isBlocked()) { reset(); return; }
        const { width, samples, index } = gesture;
        const point = [...event.changedTouches].find(touch => touch.identifier === gesture.id);
        if (!point || event.touches.length) { reset(); return; }
        const dx = point.clientX - gesture.x;
        const distance = Math.max(-(names.length - 1) * width,
            Math.min(0, gesture.origin + dx)) + index * width;
        const first = samples[0];
        const velocity = (point.clientX - first[1]) / Math.max(event.timeStamp - first[0], 1);
        clickBlockedUntil = performance.now() + 400;
        const passed = Math.abs(distance) >= width * 0.25 ||
            Math.abs(dx) >= 30 && Math.abs(velocity) > 0.35 && Math.sign(velocity) === Math.sign(distance);
        const target = names[index + (distance < 0 ? 1 : -1)];
        sample('end', gesture.position, event);
        show(passed && target ? target : current);
    }

    function init() {
        views = document.getElementById('views');
        track = views.querySelector('.views-track');
        nav = document.querySelector('.bottom-nav');
        views.addEventListener('touchstart', start, { passive: true });
        views.addEventListener('touchmove', move, { passive: false });
        window.addEventListener('touchend', end, { passive: true });
        document.addEventListener('touchcancel', reset, { passive: true, capture: true });
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
        window.addEventListener('popstate', event => {
            document.querySelectorAll('.modal-overlay.active').forEach(modal => modal.classList.remove('active'));
            restoreHistory(event);
        });
        window.addEventListener('resize', reset);
        window.addEventListener('pagehide', reset);
        window.addEventListener('pageshow', restoreHistory);
        window.addEventListener('blur', reset);
        document.addEventListener('visibilitychange', reset);
        show(current, { historyMode: 'none' });
    }

    return { init, show, get current() { return current; }, onChange(listener) { listeners.add(listener); } };
})();
