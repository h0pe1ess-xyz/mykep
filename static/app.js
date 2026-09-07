// ==========================================
// 1. ЗАХИСТ ВІД ПЕРЕЗАВАНТАЖЕНЬ І ПЛАВНІСТЬ
// ==========================================
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

// ==========================================
// 2. PWA ЗАГЛУШКА ТА СТАТИСТИКА
// ==========================================
function isPWA() {
    return (window.matchMedia('(display-mode: standalone)').matches) || (window.navigator.standalone === true);
}

function showPWAGuide() {
    document.body.innerHTML = `
        <div style="position: fixed; inset: 0; background-color: #110c0a; background-image: radial-gradient(circle at 50% 15%, rgba(255, 85, 0, 0.15) 0%, transparent 60%); display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px; text-align: center; color: white; font-family: 'Inter', sans-serif; animation: smoothAppear 0.6s ease forwards; z-index: 10000;">
            <div style="background: rgba(36, 28, 24, 0.65); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 28px; padding: 40px 24px; width: 100%; max-width: 400px; box-shadow: 0 20px 40px rgba(0,0,0,0.4);">
                <img src="favicon.png" alt="MyKep" style="width: 80px; height: 80px; border-radius: 20px; margin-bottom: 24px; box-shadow: 0 8px 24px rgba(255, 85, 0, 0.25); border: 1px solid rgba(255,255,255,0.1);">
                <h2 style="font-size: 24px; font-weight: 600; margin-bottom: 12px; letter-spacing: -0.5px;">Встанови MyKep</h2>
                <p style="font-size: 14px; color: #8b8079; margin-bottom: 32px; line-height: 1.5;">Цей додаток працює як нативний. Щоб користуватись ним, збережи його на головний екран.</p>
                
                <div style="display: flex; flex-direction: column; gap: 12px; text-align: left;">
                    <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.04); padding: 16px; border-radius: 16px; display: flex; align-items: center; gap: 16px;">
                        <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 12px; display: flex; align-items: center; justify-content: center;">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M16.36 10.02c-.03-2.11 1.73-3.13 1.81-3.18-1-.98-2.52-1.65-3.08-1.68-1.31-.13-2.56.77-3.23.77-.67 0-1.68-.75-2.77-.73-1.42.02-2.72.82-3.45 2.1-1.48 2.55-.38 6.32 1.05 8.38.7 1 1.51 2.14 2.6 2.1 1.04-.04 1.43-.67 2.68-.67 1.25 0 1.61.67 2.7.65 1.12-.02 1.83-1.04 2.51-2.03.8-1.16 1.12-2.28 1.14-2.34-.02-.01-2.07-.79-2.08-2.59h-.02zM12.92 5.4c.57-.69.96-1.64.85-2.61-.82.03-1.85.55-2.43 1.24-.51.55-.98 1.52-.86 2.47.92.07 1.87-.41 2.44-1.1z"/></svg>
                        </div>
                        <div>
                            <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px; color: #fff;">Для iOS (Safari)</div>
                            <div style="font-size: 12px; color: #8b8079; line-height: 1.4;">Натисни «Поділитися» знизу і вибери <span style="color: #ff5500; font-weight: 500;">«На початковий екран»</span>.</div>
                        </div>
                    </div>
                    
                    <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.04); padding: 16px; border-radius: 16px; display: flex; align-items: center; gap: 16px;">
                        <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 12px; display: flex; align-items: center; justify-content: center;">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4483-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993.0001.5511-.4482.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993 0 .5511-.4482.9997-.9993.9997m11.4045-6.02l1.9973-3.4592a.416.416 0 0 0-.1521-.5676.416.416 0 0 0-.5676.1521l-2.0223 3.503C15.5902 8.244 13.8533 7.85 12 7.85s-3.5902.394-5.1367 1.1005L4.841 5.4475a.4158.4158 0 0 0-.5676-.1521.4157.4157 0 0 0-.1521.5676l1.9973 3.4592C2.6889 11.1867.3432 14.6589 0 18.761h24c-.3432-4.1021-2.6889-7.5743-6.1185-9.4396"/></svg>
                        </div>
                        <div>
                            <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px; color: #fff;">Для Android</div>
                            <div style="font-size: 12px; color: #8b8079; line-height: 1.4;">Натисни меню (три крапки) і вибери <span style="color: #ff5500; font-weight: 500;">«Встановити додаток»</span>.</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function getUserId() {
    let uid = localStorage.getItem('mykep_uid');
    if (!uid) {
        uid = 'user_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
        localStorage.setItem('mykep_uid', uid);
    }
    return uid;
}

// ==========================================
// 3. АНІМАЦІЯ SVG-ТАЙМЕРА
// ==========================================
function setGauge(percentage) {
    const arc = document.getElementById('progress-arc');
    const knob = document.getElementById('gauge-knob');
    if (!arc || !knob) return; 
    
    const totalLength = 130 * Math.PI; 
    const offset = totalLength - (percentage / 100) * totalLength;
    arc.style.strokeDashoffset = offset;

    const angle = Math.PI - (percentage / 100) * Math.PI;
    const r = 130, cx = 150, cy = 150;
    
    const x = cx + r * Math.cos(angle);
    const y = cy - r * Math.sin(angle);
    const rotation = (percentage / 100) * 180 - 90;
    
    knob.setAttribute('transform', `translate(${x}, ${y}) rotate(${rotation})`);
}

// ==========================================
// 4. ОТРИМАННЯ ДАНИХ ТА ДАШБОРД
// ==========================================
async function fetchSchedule() {
    const group = localStorage.getItem('mykep_group') || "ПІ-24-02"; 
    const duration = localStorage.getItem('mykep_duration') || "80"; 
    const uid = getUserId(); 
    
    try {
        const response = await fetch(`/api/schedule?group=${encodeURIComponent(group)}&duration=${duration}&uid=${uid}`);
        const result = await response.json();
        
        if (result.status === "success") {
            localStorage.setItem('mykep_schedule', JSON.stringify(result.data));
            return result.data;
        } else {
            return fallbackCache();
        }
    } catch (error) {
        return fallbackCache();
    }
}

function fallbackCache() {
    const cached = localStorage.getItem('mykep_schedule');
    return cached ? JSON.parse(cached) : {};
}

function timeToMins(tStr) {
    if (!tStr) return 0;
    const [h, m] = tStr.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
}

function renderDashboard(schedule) {
    const gaugeMain = document.getElementById('minutes-left');
    const gaugeSub = document.getElementById('current-room');
    const statusText = document.getElementById('status-text');
    const currentCard = document.getElementById('current-lesson-card');
    const nextCard = document.getElementById('next-lesson-card');
    const progressFill = document.getElementById('day-progress-fill');
    const progressThumb = document.getElementById('day-progress-thumb');
    const progressText = document.getElementById('day-progress-text');

    if (!schedule || schedule.length === 0) {
        setGauge(100);
        if (gaugeMain) { gaugeMain.innerHTML = `🎉`; gaugeMain.style.fontSize = "56px"; }
        if (gaugeSub) gaugeSub.innerHTML = `Вихідний`;
        if (statusText) statusText.innerText = "На сьогодні пар немає. Відпочивайте!";
        if (currentCard) currentCard.style.display = "none";
        if (nextCard) nextCard.style.display = "none";
        return; 
    }

    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();
    let currentLesson = null, nextLesson = null;

    for (let i = 0; i < schedule.length; i++) {
        const lesson = schedule[i];
        if (!lesson || !lesson.time) continue;
        const parts = lesson.time.split(' - ');
        if (parts.length !== 2) continue;
        const [startStr, endStr] = parts;
        const start = timeToMins(startStr);
        const end = timeToMins(endStr);

        if (currentMins >= start && currentMins <= end) {
            currentLesson = { ...lesson, start, end };
            nextLesson = schedule[i + 1] || null;
            break;
        } else if (currentMins < start) {
            nextLesson = lesson;
            break;
        }
    }

    if (currentLesson) {
        const totalDuration = currentLesson.end - currentLesson.start;
        const passedTime = currentMins - currentLesson.start;
        const minutesLeft = totalDuration - passedTime;
        const progressPercent = (passedTime / totalDuration) * 100;

        setGauge(progressPercent);
        if (gaugeMain) gaugeMain.innerHTML = `${minutesLeft}<span class="score-sub">хв</span>`;
        if (gaugeSub) gaugeSub.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg> Ауд. ${currentLesson.room}`;
        if (statusText) statusText.innerText = `Зараз йде ${currentLesson.lesson}-га пара, залишайтесь сфокусованими.`;
        
        document.getElementById('current-subject').innerText = currentLesson.subject;
        document.getElementById('current-teacher').innerText = currentLesson.teacher;
        document.getElementById('current-time').innerText = currentLesson.time;
    } else {
        if (currentCard) currentCard.style.display = "none";
        if (nextLesson) {
            const start = timeToMins(nextLesson.time.split(' - ')[0]);
            const minsToNext = start - currentMins;
            if (minsToNext > 0 && minsToNext <= 90) {
                setGauge((minsToNext / 20) * 100); 
                if (gaugeMain) gaugeMain.innerHTML = `${minsToNext}<span class="score-sub">хв</span>`;
                if (gaugeSub) gaugeSub.innerHTML = `до ${nextLesson.lesson}-ї пари`;
                if (statusText) statusText.innerText = "Зараз перерва.";
            } else {
                setGauge(100);
                if (gaugeMain) { gaugeMain.innerHTML = `☕`; gaugeMain.style.fontSize = "56px"; }
                if (gaugeSub) gaugeSub.innerHTML = `Очікування`;
                if (statusText) statusText.innerText = "Пари ще не почалися.";
            }
        } else {
            setGauge(100);
            if (gaugeMain) { gaugeMain.innerHTML = `🌙`; gaugeMain.style.fontSize = "56px"; }
            if (gaugeSub) gaugeSub.innerHTML = `Кінець дня`;
            if (statusText) statusText.innerText = "Всі пари на сьогодні завершились.";
        }
    }

    if (nextLesson) {
        document.getElementById('next-subject').innerText = nextLesson.subject;
        document.getElementById('next-room').innerText = nextLesson.room;
        document.getElementById('next-teacher').innerText = nextLesson.teacher;
        document.getElementById('next-time').innerText = nextLesson.time;
    } else {
        document.getElementById('next-subject').innerText = "Пари завершились";
        document.getElementById('next-room').innerText = "---";
        document.getElementById('next-teacher').innerText = "Гарного відпочинку!";
        document.getElementById('next-time').innerText = "";
    }

    const firstLessonStart = timeToMins(schedule[0].time.split(' - ')[0]);
    const lastLessonEnd = timeToMins(schedule[schedule.length - 1].time.split(' - ')[1]);
    const totalDayMins = lastLessonEnd - firstLessonStart;
    
    let dayProgress = 0;
    if (currentMins >= lastLessonEnd) {
        dayProgress = 100;
    } else if (currentMins > firstLessonStart) {
        dayProgress = ((currentMins - firstLessonStart) / totalDayMins) * 100;
    }
    
    if (progressFill) progressFill.style.width = `${dayProgress}%`;
    if (progressThumb) progressThumb.style.left = `${dayProgress}%`;
    if (progressText) progressText.innerText = `${Math.floor(dayProgress)}%`;
}

// ==========================================
// 5. ЛОГІКА СТОРІНКИ РОЗКЛАДУ ТА АНІМАЦІЇ
// ==========================================
function renderScheduleList(schedule) {
    const listContainer = document.getElementById('dynamic-schedule-list');
    if (!listContainer) return;
    
    listContainer.innerHTML = ''; 
    listContainer.classList.remove('animate-enter'); 
    void listContainer.offsetWidth; // Тригер рефлоу для перезапуску анімації
    listContainer.classList.add('animate-enter');

    if (!schedule || schedule.length === 0) {
        listContainer.innerHTML = `
            <div style="text-align: center; margin-top: 60px;">
                <div style="font-size: 48px; margin-bottom: 16px;">🎉</div>
                <h3 style="font-size: 18px; font-weight: 500; color: var(--text-main);">Вихідний день</h3>
                <p style="font-size: 13px; color: var(--text-muted);">На цей день пар не заплановано</p>
            </div>
        `;
        return;
    }

    schedule.forEach((lesson, index) => {
        const delay = index * 0.06; 
        const cardHtml = `
            <div class="lesson-card" style="animation-delay: ${delay}s;">
                <div class="lesson-top">
                    <span>${lesson.lesson}-га пара</span>
                    <span>${lesson.time}</span>
                </div>
                <div class="lesson-title">${lesson.subject}</div>
                <div class="lesson-divider"></div>
                <div class="lesson-bottom">
                    <div class="teacher-name">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                        ${lesson.teacher}
                    </div>
                    <div class="room-badge">${lesson.room}</div>
                </div>
            </div>
        `;
        listContainer.insertAdjacentHTML('beforeend', cardHtml);
    });
}

function initSchedulePage(scheduleDict) {
    const picker = document.querySelector('.day-picker');
    if (!picker) return;

    const days = [
        { id: 'понеділок', short: 'Пн', name: 'Понеділок' },
        { id: 'вівторок', short: 'Вт', name: 'Вівторок' },
        { id: 'середа', short: 'Ср', name: 'Середа' },
        { id: 'четвер', short: 'Чт', name: 'Четвер' },
        { id: 'п\'ятниця', short: 'Пт', name: 'П\'ятниця' }
    ];

    if (scheduleDict['субота'] && scheduleDict['субота'].length > 0) {
        days.push({ id: 'субота', short: 'Сб', name: 'Субота' });
    }

    const todayMap = ["неділя", "понеділок", "вівторок", "середа", "четвер", "п'ятниця", "субота"];
    let todayId = todayMap[new Date().getDay()];
    if (todayId === 'неділя') todayId = 'понеділок'; 

    let html = '';
    days.forEach(d => {
        const isActive = d.id === todayId ? 'active' : '';
        html += `
            <div class="day-item ${isActive}" data-day="${d.id}">
                <div class="day-num">${d.short}</div>
                <div class="day-name">${d.name}</div>
            </div>
        `;
    });
    picker.innerHTML = html;

    const items = picker.querySelectorAll('.day-item');
    let activeDayId = null;

    function renderForDay(dayId) {
        if (activeDayId === dayId) return; 
        activeDayId = dayId;
        renderScheduleList(scheduleDict[dayId] || []);
        if (navigator.vibrate) navigator.vibrate(20); // Легка вібрація при зміні дня (працює на Android)
    }

    function updateArc() {
        const pickerRect = picker.getBoundingClientRect();
        const pickerCenter = pickerRect.left + pickerRect.width / 2;

        let closestItem = null;
        let minDistance = Infinity;

        items.forEach(item => {
            const itemRect = item.getBoundingClientRect();
            const itemCenter = itemRect.left + itemRect.width / 2;
            const distance = Math.abs(pickerCenter - itemCenter);
            const translateY = Math.pow(distance / 45, 2) * 2.5; 
            
            let scale = 1, opacity = 0.5;

            if (distance < minDistance) {
                minDistance = distance;
                closestItem = item;
            }

            if (distance < 25) {
                scale = 1.15; opacity = 1; item.classList.add('active');
            } else {
                scale = Math.max(0.85, 1 - (distance / 400));
                opacity = Math.max(0.2, 0.6 - (distance / 300));
                item.classList.remove('active');
            }

            item.style.transform = `translateY(${translateY}px) scale(${scale})`;
            item.style.opacity = opacity;
        });

        if (closestItem) {
            const newDayId = closestItem.getAttribute('data-day');
            renderForDay(newDayId);
        }
    }

    picker.addEventListener('scroll', updateArc);
    window.addEventListener('resize', updateArc);
    
    items.forEach(item => {
        item.addEventListener('click', () => {
            const scrollPos = item.offsetLeft - picker.offsetWidth / 2 + item.offsetWidth / 2;
            picker.scrollTo({ left: scrollPos, behavior: 'smooth' });
        });
    });

    renderForDay(todayId);
    
    setTimeout(() => {
        updateArc();
        const activeItem = picker.querySelector('.day-item.active') || items[2];
        if (activeItem) {
            const scrollPos = activeItem.offsetLeft - picker.offsetWidth / 2 + activeItem.offsetWidth / 2;
            picker.scrollTo({ left: scrollPos, behavior: 'auto' });
        }
    }, 50);
}

// ==========================================
// 6. НАЛАШТУВАННЯ
// ==========================================
function initSettings() {
    const clearBtn = document.getElementById('clear-cache-btn');
    const durationToggle = document.getElementById('duration-toggle');
    const durationDesc = document.getElementById('duration-desc');

    const savedDuration = localStorage.getItem('mykep_duration') || '80'; 
    if (savedDuration === '80' && durationToggle) {
        durationToggle.classList.add('active');
    } else if (durationToggle) {
        durationToggle.classList.remove('active');
    }
    if(durationDesc) durationDesc.innerText = `Поточна: ${savedDuration} хвилин`;

    if(durationToggle) {
        durationToggle.addEventListener('click', () => {
            durationToggle.classList.toggle('active'); 
            const newDuration = durationToggle.classList.contains('active') ? '80' : '60'; 
            localStorage.setItem('mykep_duration', newDuration);
            localStorage.removeItem('mykep_schedule'); 
            window.location.reload();
        });
    }

    if(clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (confirm("Видалити збережений розклад?")) {
                localStorage.removeItem('mykep_schedule');
                window.location.reload();
            }
        });
    }
}

function getAcademicWeek() {
    const now = new Date();
    const baseMonday = new Date(2026, 7, 31); 
    let targetDate = new Date(now);
    if (targetDate.getDay() === 0) { 
        targetDate.setDate(targetDate.getDate() + 1);
    } else if (targetDate.getDay() === 6 && targetDate.getHours() >= 15) { 
        targetDate.setDate(targetDate.getDate() + 2);
    }
    targetDate.setHours(0, 0, 0, 0);
    baseMonday.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((targetDate.getTime() - baseMonday.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 1;
    return (Math.floor(diffDays / 7) % 4) + 1;
}

function updateHeaderDisplays() {
    const savedGroup = localStorage.getItem('mykep_group') || 'ПІ-24-02';
    const headerDisplay = document.getElementById('header-group-text');
    if (headerDisplay) {
        if (document.querySelector('.day-picker')) {
            headerDisplay.innerText = `${getAcademicWeek()}-й тиждень`;
        } else {
            headerDisplay.innerText = `Група ${savedGroup}`;
        }
    }
}

// ==========================================
// 7. СТАРТ І SERVICE WORKER
// ==========================================
function checkOnboarding() {
    const onboarding = document.getElementById('onboarding');
    const mainApp = document.getElementById('main-app');
    if (!onboarding) return false;

    if (localStorage.getItem('mykep_onboarded') === 'true') {
        onboarding.style.display = 'none';
        if (mainApp) mainApp.style.opacity = '1';
        return false;
    }
    onboarding.style.display = 'flex';
    if (mainApp) mainApp.style.opacity = '0';
    return true; 
}

window.obFinish = function() {
    const groupInput = document.getElementById('ob-group-input').value.trim() || 'ПІ-24-02';
    const obDurationToggle = document.getElementById('ob-duration-toggle');
    const newDuration = (obDurationToggle && !obDurationToggle.classList.contains('active')) ? '60' : '80';
    localStorage.setItem('mykep_group', groupInput.toUpperCase());
    localStorage.setItem('mykep_duration', newDuration);
    localStorage.setItem('mykep_onboarded', 'true');
    localStorage.removeItem('mykep_schedule');
    window.location.reload(); 
}

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
