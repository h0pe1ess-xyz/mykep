function renderScheduleList(schedule) {
    const listContainer = document.getElementById('dynamic-schedule-list');
    if (!listContainer) return;
    
    // A single DOM write; optional entrance never blocks rendering or navigation.

    if (!schedule || schedule.length === 0) {
        listContainer.innerHTML = `
            <div style="text-align: center; margin-top: 60px;">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" style="margin-bottom: 16px;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                <h3 style="font-size: 18px; font-weight: 500; color: var(--text-main);">Вихідний день</h3>
                <p style="font-size: 13px; color: var(--text-muted);">На цей день пар не заплановано</p>
            </div>
        `;
        return;
    }

    listContainer.innerHTML = '';
    schedule.forEach((lesson, index) => {
        const delay = Math.min(index * 0.06, 0.36); 
        const cardHtml = `
            <div class="lesson-card" style="animation: fadeIn var(--transition-normal) both; animation-delay: ${delay}s;">
                <div class="lesson-top">
                    <span>${escapeHTML(lesson.lesson)}-${getLessonSuffix(lesson.lesson)} пара</span>
                    <span>${escapeHTML(lesson.time)}</span>
                </div>
                <div class="lesson-title">${escapeHTML(lesson.subject)}</div>
                <div class="lesson-divider"></div>
                <div class="lesson-bottom">
                    <div class="teacher-name">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                        <span>${renderTeacherLabel(lesson.teacher)}</span>
                    </div>
                    ${lesson.room && String(lesson.room).trim() !== '' ? `<div class="room-badge">${escapeHTML(lesson.room)}</div>` : ''}
                </div>
            </div>
        `;
        listContainer.insertAdjacentHTML('beforeend', cardHtml);
    });
}

let schedulePageData = null;
let schedulePickerState = null;
function setSchedulePending() {
    schedulePageData = null;
    document.querySelectorAll('.day-picker button').forEach(button => { button.disabled = true; });
}
function initSchedulePage(scheduleDict) {
    const picker = document.querySelector('.day-picker');
    if (!picker) return;
    schedulePageData = scheduleDict;
    document.querySelectorAll('.day-picker button').forEach(button => { button.disabled = false; });
    const days = [
        { id: 'понеділок', short: 'Пн', name: 'Понеділок' },
        { id: 'вівторок', short: 'Вт', name: 'Вівторок' },
        { id: 'середа', short: 'Ср', name: 'Середа' },
        { id: 'четвер', short: 'Чт', name: 'Четвер' },
        { id: "п'ятниця", short: 'Пт', name: "П'ятниця" }
    ];
    if (scheduleDict['субота']?.length) days.push({ id: 'субота', short: 'Сб', name: 'Субота' });
    const signature = days.map(day => day.id).join('|');
    if (schedulePickerState?.signature === signature) {
        // Background updates and week selection keep the chosen day and scroll.
        renderScheduleList(scheduleDict[schedulePickerState.activeDay] || []);
        return;
    }
    const todayMap = ['неділя', 'понеділок', 'вівторок', 'середа', 'четвер', "п'ятниця", 'субота'];
    const preferredDay = schedulePickerState?.activeDay || todayMap[getKyivNow().getDay()];
    if (schedulePickerState) {
        cancelAnimationFrame(schedulePickerState.frame);
        clearTimeout(schedulePickerState.scrollTimeout);
    }
    const state = { signature, activeDay: null, frame: 0, scrollTimeout: 0, programmatic: false };
    schedulePickerState = state;
    picker.innerHTML = days.map(day => `
        <button type="button" class="day-item" data-day="${escapeHTML(day.id)}" aria-label="${escapeHTML(day.name)}" aria-pressed="false">
            <span class="day-num">${day.short}</span>
            <span class="day-name">${day.name}</span>
        </button>`).join('');
    const items = [...picker.querySelectorAll('.day-item')];
    function renderForDay(dayId, vibrate = false) {
        if (state.activeDay === dayId) return;
        state.activeDay = dayId;
        items.forEach(item => {
            const active = item.dataset.day === dayId;
            item.classList.toggle('active', active);
            item.setAttribute('aria-pressed', String(active));
        });
        if (schedulePageData) renderScheduleList(schedulePageData[dayId] || []);
        if (vibrate && navigator.vibrate) navigator.vibrate(10);
    }
    function updateArc() {
        state.frame = 0;
        const width = picker.clientWidth;
        if (!width) return;
        const center = picker.scrollLeft + width / 2;
        // Batch all layout reads before writing styles.
        const positions = items.map(item => ({ item,
            distance: Math.abs(item.offsetLeft + item.clientWidth / 2 - center) }));
        let closest = positions[0];
        for (const position of positions) {
            if (position.distance < closest.distance) closest = position;
            const distance = Math.min(position.distance / (width / 2), 1);
            position.item.style.transform = `translateY(${distance * 15}px) scale(${1 - distance * 0.15})`;
            position.item.style.opacity = 1 - distance * 0.6;
        }
        if (!state.programmatic && closest) renderForDay(closest.item.dataset.day, true);
    }
    function requestArc() {
        if (!state.frame) state.frame = requestAnimationFrame(updateArc);
    }
    picker.onscroll = () => {
        requestArc();
        clearTimeout(state.scrollTimeout);
        state.scrollTimeout = setTimeout(() => {
            state.programmatic = false;
            requestArc();
        }, 150);
    };
    items.forEach(item => {
        item.onclick = () => {
            state.programmatic = true;
            const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            picker.scrollTo({ left: item.offsetLeft + item.clientWidth / 2 - picker.clientWidth / 2,
                behavior: reducedMotion ? 'auto' : 'smooth' });
            renderForDay(item.dataset.day, true);
            // Also release the guard when tapping an already centered item.
            clearTimeout(state.scrollTimeout);
            state.scrollTimeout = setTimeout(() => { state.programmatic = false; }, 200);
        };
    });
    const initial = items.find(item => item.dataset.day === preferredDay) || items[0];
    if (initial) {
        picker.scrollTo({ left: initial.offsetLeft + initial.clientWidth / 2 - picker.clientWidth / 2, behavior: 'auto' });
        renderForDay(initial.dataset.day);
    }
    requestArc();
}
