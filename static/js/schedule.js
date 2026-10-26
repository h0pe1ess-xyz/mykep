const scheduleCaption = document.querySelector('.schedule-caption');
let renderedScheduleList = null;
function renderScheduleList(schedule) {
    const listContainer = document.getElementById('dynamic-schedule-list');
    if (!listContainer) return;
    const signature = JSON.stringify(schedule || []);
    if (renderedScheduleList === signature && listContainer.contains(scheduleCaption)) return;
    renderedScheduleList = signature;

    if (!schedule || schedule.length === 0) {
        listContainer.innerHTML = `
            <div style="text-align: center; margin-top: 60px;">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" style="margin-bottom: 16px;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                <h3 style="font-size: 18px; font-weight: 500; color: var(--text-main);">Вихідний день</h3>
                <p style="font-size: 13px; color: var(--text-muted);">На цей день пар не заплановано</p>
            </div>
        `;
        listContainer.append(scheduleCaption);
        return;
    }

    listContainer.innerHTML = schedule.map(lesson => {
        return `
            <div class="lesson-card">
                <div class="lesson-top">
                    <span>${escapeHTML(lesson.lesson)}-${getLessonSuffix(lesson.lesson)} пара</span>
                    <span>${escapeHTML(lesson.time)}</span>
                </div>
                <div class="lesson-title">${escapeHTML(lesson.subject)}</div>
                ${lesson.starts_on ? `<p class="lesson-condition">З ${escapeHTML(lesson.starts_on.split('-').reverse().join('.'))} · ${escapeHTML(lesson.condition || '')}</p>` : ''}
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
    }).join('');
    listContainer.append(scheduleCaption);
}

let schedulePageData = null;
let schedulePickerState = null;
function setSchedulePending() {
    schedulePageData = null;
    renderedScheduleList = null;
    setScheduleSharingPending();
    document.querySelectorAll('.day-picker button').forEach(button => { button.disabled = true; });
}
function initSchedulePage(scheduleDict, calendar = null, group = null) {
    const picker = document.querySelector('.day-picker');
    if (!picker) return;
    schedulePageData = scheduleDict;
    currentScheduleCalendar = calendar;
    group = group || storage.get('mykep_group') || 'ПІ-24-02';
    scheduleShareContext = { group, week: getScheduleWeekSelection(), date: calendar?.monday ? parseLocalDate(calendar.monday) : getKyivNow() };
    renderScheduleContext(calendar,group);
    document.querySelectorAll('.day-picker button').forEach(button => { button.disabled = false; });
    const days = [
        { id: 'понеділок', short: 'Пн', name: 'Понеділок' },
        { id: 'вівторок', short: 'Вт', name: 'Вівторок' },
        { id: 'середа', short: 'Ср', name: 'Середа' },
        { id: 'четвер', short: 'Чт', name: 'Четвер' },
        { id: "п'ятниця", short: 'Пт', name: "П'ятниця" }
    ];
    if (scheduleDict['субота']?.length) days.push({ id: 'субота', short: 'Сб', name: 'Субота' });
    const signature = days.map(day => day.id).join('|') + JSON.stringify(calendar) + dateKey(getKyivNow());
    if (schedulePickerState?.signature === signature) {
        // Background updates and week selection keep the chosen day and scroll.
        renderScheduleList(scheduleDict[schedulePickerState.activeDay] || []);
        setScheduleShareData(scheduleDict[schedulePickerState.activeDay] || [], schedulePickerState.activeDay);
        return;
    }
    const todayMap = ['неділя', 'понеділок', 'вівторок', 'середа', 'четвер', "п'ятниця", 'субота'];
    const sameCalendar=schedulePickerState?.monday === calendar?.monday;
    const containsToday=calendar?.monday === dateKey(calendarMonday());
    const preferredDay = sameCalendar ? schedulePickerState?.activeDay : containsToday || !calendar?.monday ? todayMap[getKyivNow().getDay()] : 'понеділок';
    if (schedulePickerState) {
        cancelAnimationFrame(schedulePickerState.frame);
        clearTimeout(schedulePickerState.scrollTimeout);
    }
    const state = { signature, monday:calendar?.monday, activeDay: null, frame: 0, scrollTimeout: 0, programmatic: false };
    schedulePickerState = state;
    picker.innerHTML = days.map((day,i) => {
        const date = calendar?.monday ? parseLocalDate(calendar.monday) : null;
        if (date) date.setDate(date.getDate()+i);
        const today = date && dateKey(date) === dateKey(getKyivNow());
        day.dateLabel = date ? `${date.getDate()}.${String(date.getMonth()+1).padStart(2,'0')}` : '';
        day.today = today;
        return `
        <button type="button" class="day-item" data-day="${escapeHTML(day.id)}" aria-label="${escapeHTML(day.name + (day.dateLabel ? ' ' + day.dateLabel : '') + (day.today ? ' · сьогодні' : ''))}" aria-pressed="false" ${day.today ? 'aria-current="date"' : ''}>
            <span class="day-num">${day.short}</span>
            <span class="day-name">${day.name}</span>
            <span class="day-date">${day.dateLabel}</span>
        </button>`; }).join('');
    const items = [...picker.querySelectorAll('.day-item')];
    function renderForDay(dayId, vibrate = false) {
        if (state.activeDay === dayId) return;
        state.activeDay = dayId;
        items.forEach(item => {
            const active = item.dataset.day === dayId;
            item.classList.toggle('active', active);
            item.setAttribute('aria-pressed', String(active));
        });
        if (schedulePageData) {
            renderScheduleList(schedulePageData[dayId] || []);
            setScheduleShareData(schedulePageData[dayId] || [], dayId);
        }
        if (vibrate && navigator.vibrate) navigator.vibrate(10);
        if (vibrate) App.noteInteraction();
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
        state.closestDay = closest?.item.dataset.day;
    }
    function requestArc() {
        if (!state.frame) state.frame = requestAnimationFrame(updateArc);
    }
    function finishScroll() {
        clearTimeout(state.scrollTimeout);
        if (picker.hidden) return;
        state.programmatic = false;
        cancelAnimationFrame(state.frame);
        updateArc();
        if (state.closestDay) renderForDay(state.closestDay, true);
    }
    picker.onscroll = () => {
        requestArc();
        clearTimeout(state.scrollTimeout);
        state.scrollTimeout = setTimeout(finishScroll, 150);
    };
    picker.onscrollend = finishScroll;
    items.forEach(item => {
        item.onclick = () => {
            state.programmatic = true;
            const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            picker.scrollTo({ left: item.offsetLeft + item.clientWidth / 2 - picker.clientWidth / 2,
                behavior: reducedMotion ? 'auto' : 'smooth' });
            renderForDay(item.dataset.day, true);
            // Also release the guard when tapping an already centered item.
            clearTimeout(state.scrollTimeout);
            state.scrollTimeout = setTimeout(finishScroll, 200);
        };
    });
    const initial = items.find(item => item.dataset.day === preferredDay) || items[0];
    if (initial) {
        picker.scrollTo({ left: initial.offsetLeft + initial.clientWidth / 2 - picker.clientWidth / 2, behavior: 'auto' });
        renderForDay(initial.dataset.day);
    }
    requestArc();
}


function renderScheduleContext(calendar,group) {
    const label = scheduleCaption.querySelector('#schedule-week-label');
    const select=document.getElementById('schedule-week');
    const selection=getScheduleWeekSelection();
    const automaticIsNext=calendar?.default_monday
        ? calendar.default_monday !== dateKey(calendarMonday()) : calendar?.label === 'Наступний тиждень';
    const automaticLabel=automaticIsNext ? 'Наступний' : 'Цей тиждень';
    if (select.options[0].textContent !== automaticLabel) select.options[0].textContent=automaticLabel;
    let current=select.querySelector('option[value=current]');
    if (automaticIsNext && !current) {
        current=document.createElement('option');
        current.value='current'; current.textContent='Цей тиждень';
        select.insertBefore(current,select.options[1]);
    } else if (!automaticIsNext) current?.remove();
    let next = select.querySelector('option[value=next]');
    if (selection === 'next' && !automaticIsNext && !next) {
        next = document.createElement('option');
        next.value = 'next'; next.textContent = 'Наступний';
        select.insertBefore(next,select.options[1]);
    } else if (selection !== 'next' || automaticIsNext) next?.remove();
    // Preserve an explicit current-week preference while both views coincide.
    select.value=(selection === 'current' && !automaticIsNext || selection === 'next' && automaticIsNext) ? 'auto' : selection;
    label.hidden = !calendar?.monday;
    if (label.hidden) {
        label.replaceChildren();
        delete label.dataset.description;
        delete label.dataset.cycle;
        return;
    }
    let description;
    if (calendar?.monday) {
        const monday = parseLocalDate(calendar.monday), end = new Date(monday); end.setDate(end.getDate()+5);
        const sameMonth = monday.getMonth() === end.getMonth() && monday.getFullYear() === end.getFullYear();
        const startLabel = sameMonth ? monday.getDate() : monday.toLocaleDateString('uk-UA',{day:'numeric',month:'long'});
        const endLabel = end.toLocaleDateString('uk-UA',{day:'numeric',month:'long'});
        description = `${startLabel}${sameMonth ? '–' : ' – '}${endLabel}`;
    }
    const cycleLabel = `Тиждень ${calendar?.cycle || getScheduleWeekSelection()}`;
    if (label.dataset.description !== description || label.dataset.cycle !== cycleLabel) {
        const dates = document.createElement('span');
        dates.textContent = description;
        const cycle = document.createElement('span');
        cycle.className = 'schedule-cycle';
        cycle.textContent = cycleLabel;
        label.replaceChildren(dates, document.createTextNode(' '), cycle);
        label.dataset.description = description;
        label.dataset.cycle = cycleLabel;
    }
}
let currentScheduleCalendar = null;
