// visualViewport responds to iOS browser chrome and the on-screen keyboard.
function updateViewportSize() {
    const viewport = window.visualViewport;
    document.documentElement.style.setProperty('--viewport-height', `${viewport ? viewport.height : window.innerHeight}px`);
    document.documentElement.style.setProperty('--viewport-top', `${viewport ? viewport.offsetTop : 0}px`);
}
updateViewportSize();
window.addEventListener('resize', updateViewportSize);
window.visualViewport?.addEventListener('resize', updateViewportSize);
window.visualViewport?.addEventListener('scroll', updateViewportSize);

document.addEventListener('DOMContentLoaded', () => {
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    const navLinks = document.querySelectorAll('.bottom-nav a, .bottom-nav button');
    
    navLinks.forEach(link => {
        let linkPath = link.getAttribute('href');
        if (!linkPath && link.hasAttribute('onclick')) {
            const match = link.getAttribute('onclick').match(/'([^']+)'/);
            if (match) linkPath = match[1];
        }
        
        if (linkPath) linkPath = linkPath.split('/').pop() || 'index.html';
        if (linkPath === currentPath) {
            link.classList.add('active');
            link.setAttribute('aria-current', 'page');
            link.removeAttribute('onclick');
            link.addEventListener('click', (e) => {
                e.preventDefault();
            });
        }
    });

    // Content is visible immediately; do not fade the whole page on every tab.


});

async function initApplication() {
    if (!isPWA()) {
        await showPWAGuide();
    }

    if (storage.get('mykep_onboarded') !== 'true' && !document.getElementById('onboarding')) {
        window.location.replace('/index.html');
        return;
    }
    if (checkOnboarding()) return; 

    initSettings();
    updateHeaderDisplays();

    if (!document.getElementById('dashboard-main') && !document.getElementById('dynamic-schedule-list')) return;

    const weekSelect = document.getElementById('schedule-week');
    if (weekSelect) {
        weekSelect.value = getScheduleWeekSelection();
        weekSelect.addEventListener('change', () => {
            storage.set('mykep_schedule_week', normalizeWeekSelection(weekSelect.value));
            updateHeaderDisplays();
            loadScheduleView();
        });
    }
    await loadScheduleView();
}

let scheduleLoadId = 0;
let renderedScheduleKey = '';
let renderedScheduleJSON = '';
let lastVisibleRefresh = 0;
let scheduleViewReady = false;
function scheduleWeekForPage() {
    // The live timer always uses the automatic week, never the preview setting.
    return document.getElementById('schedule-week')?.value || 'auto';
}
function renderScheduleView(data, key) {
    const json = JSON.stringify(data);
    if (key === renderedScheduleKey && json === renderedScheduleJSON) return;
    renderedScheduleKey = key;
    renderedScheduleJSON = json;
    const dashboard = document.getElementById('dashboard-main');
    if (dashboard) {
        dashboard.hidden = false;
        const days = ['неділя', 'понеділок', 'вівторок', 'середа', 'четвер', "п'ятниця", 'субота'];
        startDashboard(data[days[getKyivNow().getDay()]] || []);
    }
    if (document.getElementById('dynamic-schedule-list')) initSchedulePage(data);
}
async function loadScheduleView() {
    const loadId = ++scheduleLoadId;
    scheduleViewReady = true;
    lastVisibleRefresh = Date.now();
    const week = scheduleWeekForPage();
    // Include the day in the render identity so midnight refreshes the dashboard.
    const key = `${scheduleRequestContext(week).key}|day:${getKyivNow().getDay()}`;
    const cached = getCachedSchedule(week);
    const list = document.getElementById('dynamic-schedule-list');
    if (cached) {
        scheduleNotice = Date.now() - cached.savedAt > 120000 ?
            'Показано збережений розклад. Перевіряємо оновлення…' : staleScheduleNotice(cached.meta);
        renderScheduleView(cached.data, key);
    } else if (key !== renderedScheduleKey) {
        scheduleNotice = 'Завантаження розкладу…';
        if (list) {
            list.replaceChildren();
            if (typeof setSchedulePending === 'function') setSchedulePending();
        }
        const dashboard = document.getElementById('dashboard-main');
        if (dashboard) dashboard.hidden = true;
        // Do not retain another week's cards beneath the new week label.
        renderedScheduleKey = '';
        renderedScheduleJSON = '';
    } else {
        scheduleNotice = 'Перевіряємо оновлення розкладу…';
    }
    showScheduleNotice();
    list?.setAttribute('aria-busy', 'true');
    const result = await fetchSchedule(week);
    if (loadId !== scheduleLoadId) return; // Rapid week changes: latest selection wins.
    list?.setAttribute('aria-busy', 'false');
    scheduleNotice = result.notice;
    showScheduleNotice();
    if (result.data === null) {
        renderedScheduleKey = '';
        renderedScheduleJSON = '';
        if (typeof setSchedulePending === 'function') setSchedulePending();
        showScheduleError(loadScheduleView);
        return;
    }
    renderScheduleView(result.data, key);
}

document.addEventListener('DOMContentLoaded', initApplication);

if ('serviceWorker' in navigator) {
    let refreshing = false;
    const hadController = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (hadController && !refreshing) { refreshing = true; window.location.reload(); }
    });
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(err => {
            console.error('Service Worker registration failed:', err);
        });
    });
}

function refreshOnResume(force = false) {
    if (!scheduleViewReady || document.visibilityState !== 'visible' ||
        storage.get('mykep_onboarded') !== 'true' || document.getElementById('pwa-guide')) return;
    if (force || Date.now() - lastVisibleRefresh >= 5 * 60 * 1000) {
        updateHeaderDisplays();
        loadScheduleView();
    }
}
document.addEventListener('visibilitychange', () => refreshOnResume());
window.addEventListener('pageshow', event => { if (event.persisted) refreshOnResume(true); });
window.addEventListener('online', () => refreshOnResume(true));
// Revalidate in place, without reloading the shell/nav every five minutes.
setInterval(refreshOnResume, 5 * 60 * 1000);
