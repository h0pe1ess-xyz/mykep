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
        dashboard: { token: 0, key: '', lastLoad: 0, pending: false },
        schedule: { token: 0, key: '', lastLoad: 0, pending: false }
    };
    let started = false;
    let settingsReady = false;

    function notice(tab, message, retry = false) {
        const node = document.getElementById(`${tab}-notice`);
        if (node.textContent === message && !retry) return;
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
        const label = sourceTimeLabel(meta);
        if (node && node.textContent !== label) node.textContent=label;
    }

    function clearView(tab) {
        targets[tab].result = null;
        targets[tab].cacheEntry = null;
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
        const previous = target.result;
        if (target.key === key && previous?.data === data && previous.calendar === result.calendar &&
            previous.today === result.today && previous.nextDay === result.nextDay) return;
        target.result = result;
        if (tab === 'dashboard') {
            document.getElementById('dashboard-main').hidden = false;
            startDashboard(result.today || data[days[getKyivNow().getDay()]] || [], result.nextDay);
        } else initSchedulePage(data, result.calendar, result.group || storage.get('mykep_group'));
    }

    function contextFor(tab) {
        const week = tab === 'dashboard' ? 'auto' : getScheduleWeekSelection();
        const context = scheduleRequestContext(week);
        return {...context,key:context.key + `|${week}|day:${dateKey(getKyivNow())}`,cacheKey:context.key};
    }

    function showCached(tab,context) {
        const target = targets[tab];
        const entry = cachedScheduleForKey(context.cacheKey);
        const now = getKyivNow();
        // Only Saturday can change the automatic week within the same day.
        const clock = dateKey(now) + (now.getDay() === 6 ? `|${now.getHours()}:${now.getMinutes()}` : '');
        if (target.key === context.key && target.cacheEntry === entry && target.clock === clock && target.online === navigator.onLine) return;
        const cached = getCachedSchedule(context.week,context.group);
        if (cached) {
            apply(tab,cached,context.key);
            updateFreshness(tab,cached.meta);
            notice(tab,cached.notice);
        } else if (target.key !== context.key) clearView(tab);
        target.key = context.key;
        target.clock = clock;
        target.online = navigator.onLine;
        target.cacheEntry = entry;
    }

    async function load(tab, event = 'refresh') {
        if (!started || !targets[tab]) return;
        const target = targets[tab];
        // A preview week must never feed the live dashboard timer.
        const context = contextFor(tab);
        const {week,group,key} = context;
        if (event !== 'refresh') recordScheduleAction(event,group);
        if (target.pending && target.requestKey === key) return;
        const token = ++target.token;
        target.pending = true;
        target.requestKey = key;
        if (tab === 'schedule' && target.key !== key) setScheduleSharingPending();
        target.lastLoad = Date.now();
        showCached(tab,context);
        if (!target.result) {
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
        const busyNode = tab === 'schedule' ? document.getElementById('dynamic-schedule-list') : document.querySelector(`[data-view="${tab}"] main`);
        busyNode.setAttribute('aria-busy', 'true');
        const result = await fetchSchedule(week,group);
        if (token !== target.token) return;
        target.pending = false;
        busyNode.setAttribute('aria-busy', 'false');
        if (contextFor(tab).key !== key || Tabs.current !== tab &&
            (document.documentElement.dataset.swipe !== 'native' || target.result)) return;
        target.cacheEntry = cachedScheduleForKey(context.cacheKey);
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
            window.requestDashboardFit?.(true);
        }
        const target = targets[tab];
        const context = contextFor(tab);
        const changed = context.key !== target.key;
        if (userAction) recordScheduleAction('view',context.group);
        showCached(tab,context);
        if ((!target.pending || target.requestKey !== context.key) && (!target.lastLoad || changed || Date.now() - target.lastLoad >= refreshInterval)) load(tab);
    }

    function prepareTabs() {
        if (document.documentElement.dataset.swipe !== 'native') return;
        // Native scrolling can reveal a neighbour before its navigation event.
        // Paint cached content now and share any necessary in-flight API request.
        for (const tab of Object.keys(targets)) {
            showCached(tab, contextFor(tab));
            if (!targets[tab].result) load(tab);
        }
    }

    function reload() {
        for (const tab of Object.keys(targets)) {
            ++targets[tab].token;
            targets[tab].pending = false;
            targets[tab].lastLoad = 0;
            targets[tab].key = '';
            clearView(tab);
            (tab === 'schedule' ? document.getElementById('dynamic-schedule-list') : document.querySelector(`[data-view="${tab}"] main`)).setAttribute('aria-busy', 'false');
            notice(tab, '');
        }
        updateHeaderDisplays();
        prepareTabs();
        enter(Tabs.current);
    }

    function resume(force = false) {
        if (!started || document.visibilityState !== 'visible' || document.getElementById('pwa-guide')) return;
        const target = targets[Tabs.current];
        if (target && !target.pending && force) load(Tabs.current);
        else enter(Tabs.current);
    }

    async function init() {
        Tabs.init();
        Tabs.onChange(tab => enter(tab,true));
        if (!isPWA()) await showPWAGuide();
        if (checkOnboarding()) return;
        started = true;
        const weekSelect = document.getElementById('schedule-week');
        const initialWeek=getScheduleWeekSelection();
        weekSelect.value = initialWeek;
        weekSelect.addEventListener('change', () => {
            setScheduleWeekSelection(weekSelect.value);
            updateHeaderDisplays();
            load('schedule','interaction');
        });
        prepareTabs();
        enter(Tabs.current,true);
        setInterval(resume, 10000);
        document.addEventListener('visibilitychange', () => resume(true));
        window.addEventListener('pageshow', event => {
            if (event.persisted) {
                setScheduleWeekSelection('auto');
                weekSelect.value = 'auto';
                resume(true);
            }
        });
        window.addEventListener('online', () => resume(true));
        window.addEventListener('offline', () => resume());
    }

    document.addEventListener('DOMContentLoaded', init);
    return { reload, load, enter, noteInteraction() {
        recordScheduleAction('interaction');
        enter('schedule');
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
