function updateTimerDisplay(percentage) {
    percentage = Math.max(0, Math.min(100, percentage));
    const arc = document.getElementById('progress-arc');
    const knob = document.getElementById('timer-knob');
    if (!arc || !knob) return; 
    
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const isFirstPaint = document.getElementById('dashboard-main')?.dataset.ready !== 'true';
    
    const totalLength = 130 * Math.PI; 
    
    const applyState = (pct) => {
        const offset = totalLength - (pct / 100) * totalLength;
        arc.style.strokeDasharray = totalLength;
        arc.style.strokeDashoffset = offset;
        const rotation = (pct / 100) * 180 - 90;
        knob.style.transform = `rotate(${rotation}deg)`;
    };

    if (isFirstPaint && !reducedMotion && document.visibilityState !== 'hidden') {
        arc.style.transition = 'none';
        knob.style.transition = 'none';
        applyState(0);
        
        void arc.getBoundingClientRect(); // Force layout

        arc.style.transition = 'stroke-dashoffset 1s ease';
        knob.style.transition = 'transform 1s ease';
        
        requestAnimationFrame(() => {
            applyState(percentage);
        });
    } else {
        applyState(percentage);
    }
}

function renderDashboard(schedule) {
    const main = document.getElementById('dashboard-main');
    const gaugeMain = document.getElementById('minutes-left');
    const gaugeSub = document.getElementById('current-room');
    const statusText = document.getElementById('status-text');
    const currentCard = document.getElementById('current-lesson-card');
    const nextCard = document.getElementById('next-lesson-card');
    const progressFill = document.getElementById('day-progress-fill');
    const progressThumb = document.getElementById('day-progress-thumb');
    const progressText = document.getElementById('day-progress-text');

    if (!schedule || schedule.length === 0) {
        updateTimerDisplay(100);
        if (gaugeMain) { gaugeMain.innerHTML = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`; }
        if (gaugeSub) gaugeSub.innerHTML = `Вихідний`;
        if (statusText) statusText.innerText = "На сьогодні пар не заплановано.";
        if (currentCard) currentCard.style.display = "none";
        if (nextCard) nextCard.style.display = "none";
        if (main) main.dataset.ready = 'true';
        return; 
    }

    const now = getKyivNow();
    const currentMins = now.getHours() * 60 + now.getMinutes();
    let currentLesson = null, nextLesson = null, previousLessonEnd = null;

    for (let i = 0; i < schedule.length; i++) {
        const lesson = schedule[i];
        if (!lesson || !lesson.time) continue;
        const parts = lesson.time.split(' - ');
        if (parts.length !== 2) continue;
        const [startStr, endStr] = parts;
        const start = timeToMins(startStr);
        const end = timeToMins(endStr);

        if (currentMins >= end) previousLessonEnd = end;
        if (currentMins >= start && currentMins < end) {
            currentLesson = { ...lesson, start, end };
            nextLesson = schedule[i + 1] || null;
            break;
        } else if (currentMins < start) {
            nextLesson = lesson;
            break;
        }
    }

    if (nextCard) nextCard.style.display = "";
    if (currentLesson) {
        if (currentCard) currentCard.style.display = "";
        const totalDuration = currentLesson.end - currentLesson.start;
        const passedTime = currentMins - currentLesson.start;
        const minutesLeft = totalDuration - passedTime;
        const progressPercent = (passedTime / totalDuration) * 100;

        updateTimerDisplay(progressPercent);
        if (gaugeMain) gaugeMain.innerHTML = `${minutesLeft}<span class="timer-unit">хв</span>`;
        if (gaugeSub) gaugeSub.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg> Ауд. ${escapeHTML(currentLesson.room)}`;
        if (statusText) statusText.innerText = `Зараз йде ${currentLesson.lesson}-${getLessonSuffix(currentLesson.lesson)} пара, залишайтесь сфокусованими.`;
        
        document.getElementById('current-subject').innerText = currentLesson.subject;
        document.getElementById('current-teacher').innerHTML = renderTeacherLabel(currentLesson.teacher);
        document.getElementById('current-time').innerText = currentLesson.time;
    } else {
        if (currentCard) currentCard.style.display = "none";
        if (nextLesson) {
            const start = timeToMins(nextLesson.time.split(' - ')[0]);
            const minsToNext = start - currentMins;
            if (minsToNext > 0 && minsToNext <= 90) {
                const breakDuration = previousLessonEnd === null ? 0 : start - previousLessonEnd;
                updateTimerDisplay(breakDuration > 0 ? (minsToNext / breakDuration) * 100 : 100); 
                if (gaugeMain) gaugeMain.innerHTML = `${minsToNext}<span class="timer-unit">хв</span>`;
                if (gaugeSub) gaugeSub.innerHTML = `до ${nextLesson.lesson}-ї пари`;
                if (statusText) statusText.innerText = previousLessonEnd === null ? "Пари ще не почалися." : "Перерва.";
            } else {
                updateTimerDisplay(100);
                if (gaugeMain) { gaugeMain.innerHTML = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`; }
                if (gaugeSub) gaugeSub.innerHTML = `Очікування`;
                if (statusText) statusText.innerText = "Пари ще не почалися.";
            }
        } else {
            updateTimerDisplay(100);
            if (gaugeMain) { gaugeMain.innerHTML = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`; }
            if (gaugeSub) gaugeSub.innerHTML = `Кінець дня`;
            if (statusText) statusText.innerText = "Всі пари на сьогодні завершились.";
        }
    }

    if (nextLesson) {
        document.getElementById('next-subject').innerText = nextLesson.subject;
        document.getElementById('next-room').innerText = nextLesson.room;
        document.getElementById('next-teacher').innerHTML = renderTeacherLabel(nextLesson.teacher);
        document.getElementById('next-time').innerText = nextLesson.time;
    } else {
        document.getElementById('next-subject').innerText = "Пари завершились";
        document.getElementById('next-room').innerText = "---";
        document.getElementById('next-teacher').innerText = "Гарного відпочинку!";
        document.getElementById('next-time').innerText = "";
    }

    const firstLessonStart = timeToMins(schedule[0]?.time.split(' - ')[0] || "00:00");
    const lastLessonEnd = timeToMins(schedule[schedule.length - 1]?.time.split(' - ')[1] || "00:00");
    const totalDayMins = lastLessonEnd - firstLessonStart;
    
    let dayProgress = 0;
    if (currentMins >= lastLessonEnd) {
        dayProgress = 100;
    } else if (currentMins > firstLessonStart) {
        dayProgress = ((currentMins - firstLessonStart) / totalDayMins) * 100;
    }
    
    const targetProgress = Math.floor(dayProgress);
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const isFirstPaint = document.getElementById('dashboard-main')?.dataset.ready !== 'true';

    if (progressFill && progressThumb && progressText) {
        const setStyles = (val) => {
            progressFill.style.width = `${val}%`;
            
            const thumbWidth = progressThumb.offsetWidth || 50;
            const containerWidth = progressThumb.parentElement.offsetWidth || 300;
            let minPct = 8;
            let maxPct = 92;
            if (containerWidth > 0 && thumbWidth > 0) {
                minPct = (thumbWidth / 2 / containerWidth) * 100;
                maxPct = 100 - minPct;
            }
            const clampedLeft = Math.max(minPct, Math.min(val, maxPct));
            progressThumb.style.left = `${clampedLeft}%`;
            progressThumb.style.transform = `translateX(-50%)`;
        };

        if (isFirstPaint && !reducedMotion && document.visibilityState !== 'hidden') {
            progressFill.style.transition = 'none';
            progressThumb.style.transition = 'none';
            setStyles(0);
            animateValue(progressText, 0, targetProgress, 1000);
            
            // Force reflow to ensure the browser registers the 0% state
            void progressFill.offsetWidth;
            
            progressFill.style.transition = 'width 1s ease';
            progressThumb.style.transition = 'left 1s ease';
            
            // The browser needs a tiny delay to start the transition after forcing layout
            // in some edge cases, especially on mobile WebKit.
            requestAnimationFrame(() => {
                setStyles(dayProgress);
            });
        } else {
            setStyles(dayProgress);
            const currentProgress = parseInt(progressText.textContent) || 0;
            if (currentProgress !== targetProgress && !isFirstPaint) {
                animateValue(progressText, currentProgress, targetProgress, 1000);
            } else {
                progressText.textContent = `${targetProgress}%`;
            }
        }
    }
    
    if (main) main.dataset.ready = 'true';
}

let currentGlobalSchedule = null;
let dashboardInterval = null;
let lastDashboardMinute = '';
function tickDashboard(force = false) {
    if (document.visibilityState === 'hidden' || !currentGlobalSchedule) return;
    const now = getKyivNow();
    const minute = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
    if (!force && minute === lastDashboardMinute) return;
    lastDashboardMinute = minute;
    renderDashboard(currentGlobalSchedule);
    window.requestDashboardFit?.();
}
function startDashboard(schedule) {
    currentGlobalSchedule = schedule;
    tickDashboard(true);
    if (dashboardInterval) clearInterval(dashboardInterval);
    dashboardInterval = setInterval(tickDashboard, 10000);
}
document.addEventListener('visibilitychange', () => tickDashboard());
window.addEventListener('pageshow', () => tickDashboard());
