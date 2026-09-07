document.addEventListener('DOMContentLoaded', () => {
    // Шукаємо, на якій ми зараз сторінці
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    const navLinks = document.querySelectorAll('.bottom-nav a');
    
    navLinks.forEach(link => {
        const linkPath = link.getAttribute('href');
        // Якщо це поточна сторінка — робимо кнопку активною і блокуємо клік
        if (linkPath === currentPath) {
            link.classList.add('active');
            link.addEventListener('click', (e) => {
                e.preventDefault(); // Не даємо сторінці перезавантажитись
            });
        }
    });

    // Додаємо клас анімації для головних блоків
    const mainContainers = document.querySelectorAll('#dashboard-main, #schedule-main, #settings-main');
    mainContainers.forEach(container => container.classList.add('animate-enter'));
});

async function initApp() {
    // РОЗКОМЕНТУВАТИ ДЛЯ БЛОКУВАННЯ В БРАУЗЕРІ:
    // if (!isPWA()) { showPWAGuide(); return; }

    if (checkOnboarding()) return; 

    initSettings();
    updateHeaderDisplays();

    let scheduleDict = await fetchSchedule();
    if (Array.isArray(scheduleDict)) {
        localStorage.removeItem('mykep_schedule');
        scheduleDict = await fetchSchedule();
    }

    const daysMap = ["неділя", "понеділок", "вівторок", "середа", "четвер", "п'ятниця", "субота"];
    const currentDayName = daysMap[new Date().getDay()];

    if (document.getElementById('dashboard-main')) renderDashboard(scheduleDict[currentDayName] || []);
    if (document.getElementById('dynamic-schedule-list')) initSchedulePage(scheduleDict);
}

document.addEventListener('DOMContentLoaded', initApp);

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => {
            console.log('Помилка реєстрації Service Worker: ', err);
        });
    });
}
