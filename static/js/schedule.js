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
