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
    let clickBlockedUntil = 0;
    const listeners = new Set();

    function isBlocked() {
        return document.getElementById('main-app').inert ||
            !!document.querySelector('.modal-overlay.active, .pwa-overlay') ||
            storage.get('mykep_onboarded') !== 'true';
    }

    function show(tab, { historyMode = 'push', focus = false } = {}) {
        if (!names.includes(tab)) return;
        gesture = null;
        track.style.transform = '';
        track.classList.remove('is-dragging');
        const changed = current !== tab;
        const activeElement = document.activeElement;
        const moveFocus = focus || activeElement?.closest('.view')?.dataset.view !== tab &&
            !!activeElement?.closest('.view');
        current = tab;
        document.documentElement.dataset.tab = tab;
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
        if (changed) listeners.forEach(listener => listener(tab));
    }

    function reset() {
        gesture = null;
        track?.classList.remove('is-dragging');
        if (track) track.style.transform = '';
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
        reset();
        if (event.touches.length !== 1 || isBlocked() || ownsHorizontalScroll(event.target)) return;
        const point = event.touches[0];
        const width = document.documentElement.clientWidth;
        if (point.clientX <= 20 || point.clientX >= width - 20) return;
        gesture = { id: point.identifier, x: point.clientX, y: point.clientY,
            width: views.clientWidth, dx: 0, axis: null, samples: [[event.timeStamp, point.clientX]] };
    }

    function move(event) {
        if (!gesture) return;
        if (event.touches.length !== 1 || isBlocked()) { reset(); return; }
        const point = event.touches[0];
        if (point.identifier !== gesture.id) { reset(); return; }
        const dx = point.clientX - gesture.x;
        const dy = point.clientY - gesture.y;
        if (!gesture.axis) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) return;
            if (Math.abs(dx) <= Math.abs(dy) * 1.2) { reset(); return; }
            gesture.axis = 'x';
            track.classList.add('is-dragging');
        }
        if (event.cancelable) event.preventDefault();
        gesture.dx = dx;
        gesture.samples.push([event.timeStamp, point.clientX]);
        while (gesture.samples.length > 2 && gesture.samples[1][0] < event.timeStamp - 100) gesture.samples.shift();
        const index = names.indexOf(current);
        const atEdge = index === 0 && dx > 0 || index === names.length - 1 && dx < 0;
        const offset = Math.max(-gesture.width, Math.min(gesture.width, dx * (atEdge ? 0.3 : 1)));
        track.style.transform = `translate3d(calc(${-index * 100}% + ${offset}px), 0, 0)`;
    }

    function end(event) {
        if (!gesture || gesture.axis !== 'x') { reset(); return; }
        const { dx, width, samples } = gesture;
        const point = [...event.changedTouches].find(touch => touch.identifier === gesture.id);
        const first = samples[0];
        const velocity = point ? (point.clientX - first[1]) / Math.max(event.timeStamp - first[0], 1) : 0;
        clickBlockedUntil = performance.now() + 400;
        const passed = Math.abs(dx) >= width * 0.25 ||
            Math.abs(dx) >= 30 && Math.abs(velocity) > 0.35 && Math.sign(velocity) === Math.sign(dx);
        const target = names[names.indexOf(current) + (dx < 0 ? 1 : -1)];
        reset();
        if (passed && target) show(target);
    }

    function init() {
        views = document.getElementById('views');
        track = views.querySelector('.views-track');
        nav = document.querySelector('.bottom-nav');
        views.addEventListener('touchstart', start, { passive: true });
        views.addEventListener('touchmove', move, { passive: false });
        views.addEventListener('touchend', end, { passive: true });
        views.addEventListener('touchcancel', reset, { passive: true });
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
            const tab = names.find(name => paths[name] === location.pathname) || 'dashboard';
            show(tab, { historyMode: 'none' });
        });
        window.addEventListener('resize', reset);
        window.addEventListener('pagehide', reset);
        document.addEventListener('visibilitychange', reset);
        show(current, { historyMode: 'none' });
    }

    return { init, show, get current() { return current; }, onChange(listener) { listeners.add(listener); } };
})();
