function renderScheduleList(schedule) {
    const listContainer = document.getElementById('dynamic-schedule-list');
    if (!listContainer) return;
    
    listContainer.innerHTML = ''; 
    listContainer.classList.remove('animate-enter'); 
    void listContainer.offsetWidth; 
    listContainer.classList.add('animate-enter');

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

    schedule.forEach((lesson, index) => {
        const delay = index * 0.06; 
        const cardHtml = `
            <div class="lesson-card" style="animation: fadeIn var(--transition-normal) forwards; animation-delay: ${delay}s; opacity: 0;">
                <div class="lesson-top">
                    <span>${lesson.lesson}-${getLessonSuffix(lesson.lesson)} пара</span>
                    <span>${lesson.time}</span>
                </div>
                <div class="lesson-title">${lesson.subject}</div>
                <div class="lesson-divider"></div>
                <div class="lesson-bottom">
                    <div class="teacher-name">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
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
        
        items.forEach(item => {
            if (item.getAttribute('data-day') === dayId) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        renderScheduleList(scheduleDict[dayId] || []);
        if (navigator.vibrate) navigator.vibrate(10); 
    }

    function updateArc() {
        const pickerCenter = picker.scrollLeft + picker.clientWidth / 2;
        let closestItem = null;
        let minDistance = Infinity;

        items.forEach(item => {
            const itemCenter = item.offsetLeft + item.clientWidth / 2;
            const distance = itemCenter - pickerCenter;
            const absDistance = Math.abs(distance);
            
            if (absDistance < minDistance) {
                minDistance = absDistance;
                closestItem = item;
            }
            
            const normalizedDist = Math.min(absDistance / (picker.clientWidth / 2), 1);
            const scale = 1 - normalizedDist * 0.15;
            const translateY = normalizedDist * 15;
            const opacity = 1 - normalizedDist * 0.6;
            
            item.style.transform = `translateY(${translateY}px) scale(${scale})`;
            item.style.opacity = opacity;
        });

        if (closestItem && !isProgrammaticScroll) {
            const dayId = closestItem.getAttribute('data-day');
            if (dayId !== activeDayId) {
                activeDayId = dayId;
                items.forEach(i => i.classList.remove('active'));
                closestItem.classList.add('active');
                renderScheduleList(scheduleDict[dayId] || []);
                if (navigator.vibrate) navigator.vibrate(10);
            }
        }
    }

    let isProgrammaticScroll = false;
    let scrollTimeout;
    picker.addEventListener('scroll', () => {
        updateArc();
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            isProgrammaticScroll = false;
        }, 150);
    });

    items.forEach(item => {
        item.addEventListener('click', () => {
            isProgrammaticScroll = true;
            item.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            renderForDay(item.getAttribute('data-day'));
        });
    });

    // initial setup
    const initialItem = Array.from(items).find(i => i.getAttribute('data-day') === todayId) || items[0];
    if (initialItem) {
        initialItem.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
        renderForDay(initialItem.getAttribute('data-day'));
    }
    
    // trigger arc update on next frame to ensure layout is ready
    requestAnimationFrame(() => updateArc());
}
