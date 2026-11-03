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
                <div class="room-badge room-cue">${renderRoomCue(lesson.room)}</div>
                <div class="lesson-divider"></div>
                <div class="lesson-bottom">
                    <div class="teacher-name">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                        <span>${renderTeacherLabel(lesson.teacher)}</span>
                    </div>

                </div>
            </div>
        `;
    }).join('');
    listContainer.append(scheduleCaption);
}

let schedulePageData = null;
let schedulePickerState = null;
function needsControlledDayPicker(nav = navigator) {
    const ua = nav.userAgent || '';
    return /iPad|iPhone|iPod/i.test(ua) || (/Macintosh/i.test(ua) && nav.maxTouchPoints > 1);
}

function initControlledDayPicker(picker, items, state, renderForDay, requestArc) {
    // Share the short, bounded day-strip motion across iOS versions.
    const track = document.createElement('div');
    track.className = 'day-picker-track';
    track.append(...items);
    picker.replaceChildren(track);
    picker.dataset.scrollEngine = 'controlled';
    state.controlled = {offset:0};
    let width = 0, maximum = 0, animation = 0, gesture = null, blockedUntil = 0;
    const removers = [];
    function listen(node, name, handler, options) {
        node.addEventListener(name, handler, options);
        removers.push(() => node.removeEventListener(name, handler, options));
    }
    function stopAnimation() {
        cancelAnimationFrame(animation);
        animation = 0;
    }
    function move(offset) {
        state.controlled.offset = Math.max(0, Math.min(maximum, offset));
        track.style.transform = `translate3d(${-state.controlled.offset}px, 0, 0)`;
        if (picker.scrollLeft) picker.scrollLeft = 0;
        requestArc();
    }
    function measure() {
        width = picker.clientWidth;
        if (!width) return;
        const sizes = items.map(item => item.clientWidth);
        const start = Math.max(0, (width - sizes[0]) / 2);
        const end = Math.max(0, (width - sizes[sizes.length - 1]) / 2);
        track.style.paddingLeft = `${start}px`;
        track.style.paddingRight = `${end}px`;
        track.style.width = `${start + end + sizes.reduce((sum, size) => sum + size, 0) + 16 * (items.length - 1)}px`;
        const last = items[items.length - 1];
        maximum = Math.max(0, last.offsetLeft + last.clientWidth / 2 - width / 2);
    }
    function center(day, animate = true) {
        stopAnimation();
        measure();
        const item = items.find(item => item.dataset.day === day);
        if (!item || !width) return;
        const target = Math.max(0, Math.min(maximum, item.offsetLeft + item.clientWidth / 2 - width / 2));
        const start = state.controlled.offset;
        if (!animate || matchMedia('(prefers-reduced-motion: reduce)').matches) { move(target); return; }
        const began = performance.now();
        function tick(now) {
            const progress = Math.min(1, (now - began) / 180);
            move(start + (target - start) * (1 - Math.pow(1 - progress, 3)));
            animation = progress < 1 ? requestAnimationFrame(tick) : 0;
        }
        animation = requestAnimationFrame(tick);
    }
    function settle(velocity = 0) {
        clearTimeout(state.scrollTimeout);
        if (gesture || picker.hidden || !picker.clientWidth) return;
        const step = items.length > 1 ? items[1].offsetLeft - items[0].offsetLeft : 0;
        // A flick may add at most one day, never a platform-dependent long fling.
        const projection = Math.max(-step, Math.min(step, velocity * 100));
        const middle = state.controlled.offset + projection + picker.clientWidth / 2;
        const closest = items.reduce((best, item) =>
            Math.abs(item.offsetLeft + item.clientWidth / 2 - middle) <
            Math.abs(best.offsetLeft + best.clientWidth / 2 - middle) ? item : best);
        renderForDay(closest.dataset.day, true);
        center(closest.dataset.day);
    }
    function cancel() {
        gesture = null;
        clearTimeout(state.scrollTimeout);
        center(state.activeDay, false);
    }
    listen(picker, 'touchstart', event => {
        if (event.touches.length !== 1) { cancel(); return; }
        blockedUntil = 0;
        stopAnimation();
        clearTimeout(state.scrollTimeout);
        measure();
        const point = event.touches[0];
        gesture = {id:point.identifier, x:point.clientX, y:point.clientY, offset:state.controlled.offset, axis:null, lastX:point.clientX, lastTime:performance.now(), velocity:0};
    }, {passive:true});
    listen(picker, 'touchmove', event => {
        if (!gesture) return;
        if (event.touches.length !== 1) { cancel(); return; }
        const point = event.touches[0];
        if (point.identifier !== gesture.id) return;
        const dx = point.clientX - gesture.x, dy = point.clientY - gesture.y;
        if (!gesture.axis && Math.max(Math.abs(dx), Math.abs(dy)) >= 8) {
            gesture.axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
        }
        if (gesture.axis !== 'x') return;
        if (!event.cancelable) { cancel(); return; }
        event.preventDefault();
        const now = performance.now();
        const elapsed = now - gesture.lastTime;
        if (elapsed > 0) gesture.velocity = (gesture.lastX - point.clientX) / elapsed;
        gesture.lastX = point.clientX;
        gesture.lastTime = now;
        move(gesture.offset - dx);
    }, {passive:false});
    listen(picker, 'touchend', event => {
        if (!gesture) return;
        if (event.touches.length || !Array.from(event.changedTouches).some(point => point.identifier === gesture.id)) {
            cancel(); return;
        }
        const dragged = gesture.axis === 'x';
        const velocity = performance.now() - gesture.lastTime <= 80 ? gesture.velocity : 0;
        gesture = null;
        if (dragged) { blockedUntil = performance.now() + 350; settle(velocity); }
    }, {passive:true});
    listen(picker, 'touchcancel', cancel, {passive:true});
    listen(picker, 'wheel', event => {
        if (Math.abs(event.deltaX) <= Math.abs(event.deltaY) || !event.cancelable) return;
        event.preventDefault();
        stopAnimation();
        measure();
        move(state.controlled.offset + event.deltaX);
        clearTimeout(state.scrollTimeout);
        state.scrollTimeout = setTimeout(settle, 150);
    }, {passive:false});
    listen(picker, 'keydown', event => {
        blockedUntil = 0;
        if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        event.preventDefault();
        const index = items.findIndex(item => item.dataset.day === state.activeDay);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 :
            Math.max(0, Math.min(items.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)));
        renderForDay(items[next].dataset.day, true);
        items[next].focus({preventScroll:true});
        center(items[next].dataset.day);
    });
    listen(picker, 'scroll', () => { if (picker.scrollLeft) picker.scrollLeft = 0; }, {passive:true});
    listen(window, 'blur', cancel);
    listen(window, 'pageshow', cancel);
    const resize = new ResizeObserver(() => { if (width !== picker.clientWidth) cancel(); });
    resize.observe(picker);
    items.forEach(item => {
        item.onclick = () => {
            if (performance.now() < blockedUntil) return;
            renderForDay(item.dataset.day, true);
            center(item.dataset.day);
        };
    });
    state.centerDay = center;
    state.dispose = () => { stopAnimation(); resize.disconnect(); removers.forEach(remove => remove()); };
}
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
        schedulePickerState.dispose?.();
        cancelAnimationFrame(schedulePickerState.frame);
        clearTimeout(schedulePickerState.scrollTimeout);
    }
    const state = { signature, monday:calendar?.monday, activeDay: null, frame: 0, scrollTimeout: 0, programmatic: false, touching: false };
    schedulePickerState = state;
    picker.innerHTML = days.map((day,i) => {
        const date = calendar?.monday ? parseLocalDate(calendar.monday) : null;
        if (date) date.setDate(date.getDate()+i);
        const today = date && dateKey(date) === dateKey(getKyivNow());
        day.dateLabel = date ? `${String(date.getDate()).padStart(2,'0')}.${String(date.getMonth()+1).padStart(2,'0')}` : '';
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
        const center = (state.controlled ? state.controlled.offset : picker.scrollLeft) + width / 2;
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
    if (needsControlledDayPicker()) {
        initControlledDayPicker(picker, items, state, renderForDay, requestArc);
        const initial = items.find(item => item.dataset.day === preferredDay) || items[0];
        if (initial) {
            renderForDay(initial.dataset.day);
            state.centerDay(initial.dataset.day, false);
        }
        return;
    }
    picker.dataset.scrollEngine = 'native';
    function finishScroll() {
        clearTimeout(state.scrollTimeout);
        if (picker.hidden || state.touching) return;
        cancelAnimationFrame(state.frame);
        updateArc();
        // A tap is an explicit selection. Delayed or clamped native scrolling
        // must not replace it; only a new user scroll can choose another day.
        if (!state.programmatic && state.closestDay) renderForDay(state.closestDay, true);
        // Keep native finger movement and momentum, then center the chosen day.
        // Animated arc transforms must not feed native CSS snap retargeting.
        const selected = items.find(item => item.dataset.day === state.activeDay);
        if (!selected || !picker.clientWidth) return;
        const left = Math.max(0, Math.min(picker.scrollWidth - picker.clientWidth,
            selected.offsetLeft + selected.clientWidth / 2 - picker.clientWidth / 2));
        if (Math.abs(picker.scrollLeft - left) > 1) picker.scrollTo({left, behavior:'auto'});
    }
    picker.onscroll = () => {
        requestArc();
        clearTimeout(state.scrollTimeout);
        state.scrollTimeout = setTimeout(finishScroll, 150);
    };
    picker.onscrollend = finishScroll;
    const startUserScroll = event => {
        state.programmatic = false;
        if (event.type === 'touchstart') {
            state.touching = true;
            clearTimeout(state.scrollTimeout);
        }
    };
    picker.ontouchstart = startUserScroll;
    picker.onpointerdown = startUserScroll;
    picker.onwheel = startUserScroll;
    picker.onkeydown = startUserScroll;
    const endUserScroll = event => {
        state.touching = event.touches.length > 0;
        if (!state.touching) {
            clearTimeout(state.scrollTimeout);
            state.scrollTimeout = setTimeout(finishScroll, 150);
        }
    };
    picker.ontouchend = endUserScroll;
    picker.ontouchcancel = endUserScroll;
    items.forEach(item => {
        item.onclick = () => {
            state.programmatic = true;
            const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            picker.scrollTo({ left: item.offsetLeft + item.clientWidth / 2 - picker.clientWidth / 2,
                behavior: reducedMotion ? 'auto' : 'smooth' });
            renderForDay(item.dataset.day, true);
            // Refresh the arc even when tapping an already centered item.
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
    select.value = selection;
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
