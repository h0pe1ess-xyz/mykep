'use strict';

function updateViewportSize() {
    const viewport = window.visualViewport;
    const height = viewport ? viewport.height : window.innerHeight;
    document.documentElement.style.setProperty('--viewport-height', `${height}px`);
    document.documentElement.style.setProperty('--viewport-top', `${viewport ? viewport.offsetTop : 0}px`);
    // Keyboard height belongs to the visual viewport, not CSS height queries.
    document.getElementById('onboarding')?.classList.toggle('onboarding-compact', height < 520);
}
updateViewportSize();
window.addEventListener('resize', updateViewportSize);
window.visualViewport?.addEventListener('resize', updateViewportSize);
window.visualViewport?.addEventListener('scroll', updateViewportSize);

const App = (() => {
    const refreshInterval = 5 * 60 * 1000;
    const days = ['неділя', 'понеділок', 'вівторок', 'середа', 'четвер', "п'ятниця", 'субота'];
    const targets = {
        dashboard: { token: 0, signature: '', key: '', lastLoad: 0, pending: false },
        schedule: { token: 0, signature: '', key: '', lastLoad: 0, pending: false }
    };
    let started = false;
    let settingsReady = false;

    function notice(tab, message, retry = false) {
        const node = document.getElementById(`${tab}-notice`);
        node.textContent = message;
        node.hidden = !message && !retry;
        if (tab === 'schedule') refreshScheduleShareFile();
        if (retry) {
            const button = document.createElement('button');
            button.type = 'button'; button.className = 'btn btn-secondary';
            button.textContent = 'Спробувати ще раз';
            button.onclick = () => load(tab);
            node.appendChild(button);
        }
    }

    function updateFreshness(tab,meta) {
        const node=tab === 'schedule' ? scheduleCaption.querySelector('#schedule-data-time') : document.getElementById(`${tab}-data-time`);
        if (node) node.textContent=sourceTimeLabel(meta);
    }

    function clearView(tab) {
        targets[tab].signature = '';
        if (tab === 'dashboard') {
            currentGlobalSchedule = null;
            clearInterval(dashboardInterval);
            document.getElementById('dashboard-main').hidden = true;
        } else {
            setSchedulePending();
            document.getElementById('dynamic-schedule-list').replaceChildren();
        }
    }

    function apply(tab, result, key) {
        const target = targets[tab];
        const data = result.data;
        const signature = key + '|' + JSON.stringify([data,result.calendar,result.today,result.nextDay]);
        if (signature === target.signature) return;
        target.signature = signature;
        if (tab === 'dashboard') {
            document.getElementById('dashboard-main').hidden = false;
            startDashboard(result.today || data[days[getKyivNow().getDay()]] || [], result.nextDay);
        } else initSchedulePage(data, result.calendar, result.group || storage.get('mykep_group'));
    }

    async function load(tab, event = 'refresh') {
        if (!started || !targets[tab]) return;
        const target = targets[tab];
        const token = ++target.token;
        // A preview week must never feed the live dashboard timer.
        const week = tab === 'dashboard' ? 'auto' : getScheduleWeekSelection();
        const group = null;
        const context = scheduleRequestContext(week,group);
        const key = context.key + `|${week}|day:${dateKey(getKyivNow())}`;
        const cached = getCachedSchedule(week,group);
        target.pending = true;
        if (tab === 'schedule' && target.key !== key) setScheduleSharingPending();
        target.lastLoad = Date.now();
        if (cached) {
            apply(tab, cached, key);
            updateFreshness(tab,cached.meta);
            notice(tab, cached.notice);
        } else {
            if (target.key !== key) clearView(tab);
            if (tab === 'schedule' && !schedulePageData) {
                // Keep the day picker and list in place while the first request loads.
                notice(tab, '');
                const status = document.createElement('p');
                status.className = 'help-text';
                status.setAttribute('role', 'status');
                status.textContent = 'Завантаження розкладу…';
                document.getElementById('dynamic-schedule-list').replaceChildren(status);
            } else notice(tab, 'Завантаження розкладу…');
        }
        target.key = key;
        const busyNode = document.querySelector(`[data-view="${tab}"] main`);
        busyNode.setAttribute('aria-busy', 'true');
        const result = await fetchSchedule(week,group,event);
        if (token !== target.token) return;
        target.pending = false;
        busyNode.setAttribute('aria-busy', 'false');
        updateFreshness(tab,result.meta);
        notice(tab, result.notice, result.data === null);
        if (result.data === null) clearView(tab);
        else apply(tab, result, key);
    }

    function enter(tab, userAction = false) {
        if (!started) return;
        updateHeaderDisplays();
        if (tab === 'settings') {
            if (!settingsReady) { initSettings(); settingsReady = true; }
            return;
        }
        if (tab === 'dashboard') {
            // Keep the minute guard: returning to a tab does not change its data.
            // New schedule data still forces a render through startDashboard().
            tickDashboard();
            window.requestDashboardFit?.();
        }
        const target = targets[tab];
        const week = tab === 'dashboard' ? 'auto' : getScheduleWeekSelection();
        const group = null;
        const key = scheduleRequestContext(week,group).key + `|${week}|day:${dateKey(getKyivNow())}`;
        const cached = getCachedSchedule(week,group);
        if (cached) {
            apply(tab,cached,key);
            updateFreshness(tab,cached.meta);
        }
        if (!target.pending && (userAction || !target.lastLoad || key !== target.key || Date.now() - target.lastLoad >= refreshInterval)) load(tab,userAction ? 'view' : 'refresh');
    }

    function reload() {
        for (const tab of Object.keys(targets)) {
            ++targets[tab].token;
            targets[tab].pending = false;
            targets[tab].lastLoad = 0;
            targets[tab].key = '';
            clearView(tab);
            document.querySelector(`[data-view="${tab}"] main`).setAttribute('aria-busy', 'false');
            notice(tab, '');
        }
        updateHeaderDisplays();
        enter(Tabs.current);
    }

    function resume(force = false) {
        if (!started || document.visibilityState !== 'visible' || document.getElementById('pwa-guide')) return;
        const target = targets[Tabs.current];
        if (target && !target.pending && (force || Date.now() - target.lastLoad >= refreshInterval)) load(Tabs.current);
        else enter(Tabs.current);
    }

    async function init() {
        Tabs.init();
        Tabs.onChange(tab => enter(tab,true));
        if (!isPWA()) await showPWAGuide();
        if (checkOnboarding()) return;
        started = true;
        const weekSelect = document.getElementById('schedule-week');
        weekSelect.value = getScheduleWeekSelection();
        weekSelect.addEventListener('change', () => {
            storage.set('mykep_schedule_week', normalizeWeekSelection(weekSelect.value));
            updateHeaderDisplays();
            load('schedule','interaction');
        });
        enter(Tabs.current,true);
        setInterval(resume, 10000);
        document.addEventListener('visibilitychange', () => resume());
        window.addEventListener('pageshow', event => { if (event.persisted) resume(true); });
        window.addEventListener('online', () => resume(true));
    }

    document.addEventListener('DOMContentLoaded', init);
    return { reload, load, enter, noteInteraction() {
        fetchSchedule(getScheduleWeekSelection(),null,'interaction').then(result => {
            if (result.meta) updateFreshness('schedule',result.meta);
        });
    } };
})();

if ('serviceWorker' in navigator) {
    let refreshing = false;
    const hadController = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (hadController && !refreshing) { refreshing = true; window.location.reload(); }
    });
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(error => {
            console.error('Service Worker registration failed:', error);
        });
    });
}
