document.addEventListener('DOMContentLoaded', () => {
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    const navLinks = document.querySelectorAll('.bottom-nav a, .bottom-nav button');
    
    navLinks.forEach(link => {
        let linkPath = link.getAttribute('href');
        if (!linkPath && link.hasAttribute('onclick')) {
            const match = link.getAttribute('onclick').match(/'([^']+)'/);
            if (match) linkPath = match[1];
        }
        
        if (linkPath === currentPath) {
            link.classList.add('active');
            link.addEventListener('click', (e) => {
                e.preventDefault();
            });
        }
    });

    const mainContainers = document.querySelectorAll('.main-content');
    mainContainers.forEach(container => container.classList.add('animate-enter'));

    document.addEventListener('touchstart', (e) => {
        if (e.touches[0].clientX < 30) {
            e.preventDefault();
        }
    }, { passive: false });
});

async function initApplication() {
    if (!isPWA()) {
        showPWAGuide();
        return;
    }

    if (checkOnboarding()) return; 

    initSettings();
    updateHeaderDisplays();

    let scheduleData = await fetchSchedule();
    if (Array.isArray(scheduleData)) {
        localStorage.removeItem('mykep_schedule');
        scheduleData = await fetchSchedule();
    }

    const daysMap = ["неділя", "понеділок", "вівторок", "середа", "четвер", "п'ятниця", "субота"];
    const currentDayName = daysMap[new Date().getDay()];

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
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => {
            console.error('Service Worker registration failed:', err);
        });
    });
}
