function setGauge(percentage) {
    const arc = document.getElementById('progress-arc');
    const knob = document.getElementById('gauge-knob');
    if (!arc || !knob) return; 
    
    const totalLength = 130 * Math.PI; 
    const offset = totalLength - (percentage / 100) * totalLength;
    arc.style.strokeDashoffset = offset;

    const rotation = (percentage / 100) * 180 - 90;
    knob.style.transform = `rotate(${rotation}deg)`;
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

    const firstLessonStart = timeToMins(schedule[0]?.time.split(' - ')[0] || "00:00");
    const lastLessonEnd = timeToMins(schedule[schedule.length - 1]?.time.split(' - ')[1] || "00:00");
    const totalDayMins = lastLessonEnd - firstLessonStart;
    
    let dayProgress = 0;
    if (currentMins >= lastLessonEnd) {
        dayProgress = 100;
    } else if (currentMins > firstLessonStart) {
        dayProgress = ((currentMins - firstLessonStart) / totalDayMins) * 100;
    }
    
    if (progressFill) progressFill.style.width = `${dayProgress}%`;
    if (progressThumb) {
        progressThumb.style.left = `${dayProgress}%`;
        progressThumb.style.transform = `translateX(-${dayProgress}%)`;
    }
    if (progressText) {
        const targetProgress = Math.floor(dayProgress);
        const currentProgress = parseInt(progressText.innerText) || 0;
        if (currentProgress !== targetProgress) {
            animateValue(progressText, currentProgress, targetProgress, 1000);
        }
    }
}
