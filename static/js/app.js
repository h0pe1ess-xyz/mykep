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

    const mainContainers = document.querySelectorAll('.main-content');
    mainContainers.forEach(container => container.classList.add('animate-enter'));


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

    let scheduleData = await fetchSchedule();
    if (Array.isArray(scheduleData)) {
        storage.remove('mykep_schedule');
        scheduleData = await fetchSchedule();
    }

    if (scheduleData === null) {
        showScheduleError();
        return;
    }

    const daysMap = ["неділя", "понеділок", "вівторок", "середа", "четвер", "п'ятниця", "субота"];
    const currentDayName = daysMap[getKyivNow().getDay()];

    const dashboardMain = document.getElementById('dashboard-main');
    if (dashboardMain) {
        startDashboard(scheduleData[currentDayName] || []);
    }

    const scheduleList = document.getElementById('dynamic-schedule-list');
    if (scheduleList) {
        initSchedulePage(scheduleData);
    }
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

let lastVisibleRefresh = Date.now();
function refreshOnResume() {
    if (document.visibilityState !== 'visible' || storage.get('mykep_onboarded') !== 'true' || document.getElementById('pwa-guide')) return;
    if (!document.getElementById('dashboard-main') && !document.getElementById('dynamic-schedule-list')) return;
    if (Date.now() - lastVisibleRefresh >= 5 * 60 * 1000) window.location.reload();
}
document.addEventListener('visibilitychange', refreshOnResume);
window.addEventListener('pageshow', event => { if (event.persisted) refreshOnResume(); });
// A tab left open over midnight/30-minute upstream refresh must not show yesterday forever.
setInterval(refreshOnResume, 5 * 60 * 1000);
