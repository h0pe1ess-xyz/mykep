'use strict';

let scheduleShareContext = null;
let scheduleShareData = null;
let scheduleExportToken = 0;
let scheduleExportFile = null;
let scheduleShareSignature = '';
let scheduleSharePreparing = false;
let scheduleShareInFlight = false;
let scheduleShareStatusTimer = null;
let scheduleShareLogoPromise = null;

function scheduleExportDateLabel(date) {
    return `${date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })} ${date.getFullYear()}`;
}

function scheduleExportDayLabel(day, week, now = getKyivNow()) {
    const names = ['неділя', 'понеділок', 'вівторок', 'середа', 'четвер', "п'ятниця", 'субота'];
    const name = day.charAt(0).toUpperCase() + day.slice(1);
    if (week !== 'auto') return `${name} · ${week}-й тиждень`;
    const date = new Date(now);
    if (date.getDay() === 0) date.setDate(date.getDate() + 1);
    else if (date.getDay() === 6 && date.getHours() >= 15) date.setDate(date.getDate() + 2);
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7) + ((names.indexOf(day) + 6) % 7));
    return `${name} · ${scheduleExportDateLabel(date)}`;
}

function loadScheduleShareLogo() {
    if (scheduleShareLogoPromise) return scheduleShareLogoPromise;
    scheduleShareLogoPromise = new Promise((resolve, reject) => {
        const logo = new Image();
        const timeout = setTimeout(() => { logo.src = ''; finish(new Error('Logo loading timed out')); }, 8000);
        function finish(error) {
            clearTimeout(timeout);
            logo.onload = logo.onerror = null;
            if (error) { scheduleShareLogoPromise = null; reject(error); }
            else resolve(logo);
        }
        logo.onload = () => finish();
        logo.onerror = () => finish(new Error('Logo unavailable'));
        logo.src = '/icons/icon-192.png';
    });
    return scheduleShareLogoPromise;
}

function updateScheduleShareButton() {
    const button = document.getElementById('schedule-share');
    button.disabled = !scheduleShareData || scheduleSharePreparing || scheduleShareInFlight;
    button.setAttribute('aria-busy', String(scheduleSharePreparing || scheduleShareInFlight));
}

function showScheduleShareStatus(message = '', autoHide = true) {
    clearTimeout(scheduleShareStatusTimer);
    const status = document.getElementById('schedule-share-status');
    status.textContent = message;
    status.hidden = !message;
    if (message && autoHide) scheduleShareStatusTimer = setTimeout(() => { status.hidden = true; }, 7000);
}

function setScheduleSharingPending() {
    ++scheduleExportToken;
    scheduleShareData = null;
    scheduleExportFile = null;
    scheduleShareSignature = '';
    showScheduleShareStatus();
    updateScheduleShareButton();
}

function setScheduleShareData(lessons, day) {
    scheduleShareData = { lessons, day, ...scheduleShareContext };
    refreshScheduleShareFile();
}

async function createSchedulePNG(data) {
    // Draw locally with the app's cached same-origin icon. No renderer or uploads.
    if (!Array.isArray(data.lessons) || data.lessons.length > 32) throw new Error('Schedule too large');
    const logo = await loadScheduleShareLogo();
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    const style = getComputedStyle(document.documentElement);
    const family = getComputedStyle(document.body).fontFamily;
    const colors = {
        background: style.getPropertyValue('--bg-main').trim(),
        card: style.getPropertyValue('--card-bg').trim(),
        border: style.getPropertyValue('--border-color').trim(),
        text: style.getPropertyValue('--text-main').trim(),
        muted: style.getPropertyValue('--text-muted').trim(),
        badge: style.getPropertyValue('--bg-surface-hover').trim(),
        accent: style.getPropertyValue('--accent-orange').trim()
    };
    const fonts = { title: `600 36px ${family}`, small: `500 26px ${family}`, footer: `24px ${family}` };
    function lines(value, font, width = 756) {
        const text = String(value ?? '').replace(/\s+/g, ' ').trim();
        if (text.length > 1500) throw new Error('Text too large');
        ctx.font = font;
        const result = [];
        let line = '';
        for (const word of text.split(' ')) {
            const candidate = line ? `${line} ${word}` : word;
            if (ctx.measureText(candidate).width <= width) { line = candidate; continue; }
            if (line) result.push(line);
            line = '';
            for (const character of Array.from(word)) {
                if (ctx.measureText(line + character).width > width && line) { result.push(line); line = ''; }
                line += character;
            }
        }
        if (line) result.push(line.trimEnd());
        return result;
    }
    const group = lines(data.group, fonts.small, 692);
    const label = scheduleExportDayLabel(data.day, data.week, data.date);
    const cards = data.lessons.map(lesson => {
        const heading = lines(`${lesson.lesson}-${getLessonSuffix(lesson.lesson)} пара     ${lesson.time || 'Час не вказано'}`, fonts.small);
        const subject = lines(lesson.subject || 'Заняття', fonts.title);
        const room = lesson.room ? lines(lesson.room, fonts.small, 160) : [];
        const teacher = lines(teacherDisplayName(String(lesson.teacher || '')), fonts.small, room.length ? 520 : 756);
        return { heading, subject, teacher, room,
            height: 100 + heading.length * 36 + subject.length * 46 + Math.max(teacher.length * 34, room.length * 34 + 12) };
    });
    const notice = lines(data.notice || '', fonts.footer);
    const height = 206 + group.length * 36 + (cards.length ? cards.reduce((sum, card) => sum + card.height + 24, 0) : 130)
        + notice.length * 32 + 186;
    if (height > 16000) throw new Error('Image too large');
    canvas.height = height;
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, canvas.width, height);
    const glow = ctx.createRadialGradient(450, 120, 0, 450, 120, 720);
    glow.addColorStop(0, 'rgba(255, 85, 0, 0.12)');
    glow.addColorStop(1, 'rgba(255, 85, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, canvas.width, height);
    function roundedRect(x, top, width, boxHeight, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, top);
        ctx.lineTo(x + width - radius, top);
        ctx.quadraticCurveTo(x + width, top, x + width, top + radius);
        ctx.lineTo(x + width, top + boxHeight - radius);
        ctx.quadraticCurveTo(x + width, top + boxHeight, x + width - radius, top + boxHeight);
        ctx.lineTo(x + radius, top + boxHeight);
        ctx.quadraticCurveTo(x, top + boxHeight, x, top + boxHeight - radius);
        ctx.lineTo(x, top + radius);
        ctx.quadraticCurveTo(x, top, x + radius, top);
        ctx.closePath();
    }
    let y = 40;
    function draw(textLines, font, color, lineHeight, x = 72) {
        ctx.font = font;
        ctx.fillStyle = color;
        ctx.textBaseline = 'top';
        for (const line of textLines) { ctx.fillText(line, x, y); y += lineHeight; }
    }
    ctx.save();
    roundedRect(40, 40, 104, 104, 24);
    ctx.clip();
    ctx.drawImage(logo, 40, 40, 104, 104);
    ctx.restore();
    draw(['MyKep'], `700 64px ${family}`, colors.accent, 78, 168);
    draw(group, fonts.small, colors.muted, 36, 168);
    y += 20;
    draw([label], `600 34px ${family}`, colors.text, 44, 40);
    y += 24;
    for (const card of cards) {
        const top = y;
        roundedRect(40, top, 820, card.height, 28);
        ctx.fillStyle = colors.card;
        ctx.fill();
        ctx.strokeStyle = colors.border;
        ctx.lineWidth = 2;
        ctx.stroke();
        y += 30;
        draw(card.heading, fonts.small, colors.muted, 36);
        y += 12;
        draw(card.subject, fonts.title, colors.text, 46);
        y += 12;
        ctx.beginPath();
        ctx.moveTo(72, y);
        ctx.lineTo(828, y);
        ctx.stroke();
        y += 22;
        const bottomStart = y;
        draw(card.teacher, fonts.small, colors.muted, 34);
        if (card.room.length) {
            ctx.font = fonts.small;
            const width = Math.max(...card.room.map(line => ctx.measureText(line).width)) + 24;
            roundedRect(828 - width, bottomStart - 6, width, card.room.length * 34 + 12, 14);
            ctx.fillStyle = colors.badge;
            ctx.fill();
            y = bottomStart;
            draw(card.room, fonts.small, colors.text, 34, 840 - width);
        }
        y = top + card.height + 24;
    }
    if (!cards.length) { draw(['Пар не заплановано'], fonts.title, colors.text, 46, 40); y += 84; }
    draw(notice, fonts.footer, colors.muted, 32, 40);
    y += 8;
    ctx.beginPath();
    ctx.moveTo(40, y);
    ctx.lineTo(860, y);
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 2;
    ctx.stroke();
    y += 20;
    draw(['Актуальний розклад'], fonts.footer, colors.muted, 32, 40);
    draw(['mykep.pp.ua'], `600 44px ${family}`, colors.accent, 52, 40);
    y += 8;
    const now = getKyivNow();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    draw([`Створено ${scheduleExportDateLabel(now)} · ${time}`], fonts.footer, colors.muted, 32, 40);
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG unavailable')), 'image/png'));
}

function scheduleShareSnapshot() {
    // Keep the date belonging to the rendered data across a calendar rollover.
    return { ...scheduleShareData, date: scheduleShareData.date || getKyivNow(), notice: document.getElementById('schedule-notice').textContent };
}

function refreshScheduleShareFile(force = false) {
    if (!scheduleShareData) return;
    const data = scheduleShareSnapshot();
    const signature = JSON.stringify([data.group, data.week, scheduleExportDayLabel(data.day, data.week, data.date), data.lessons, data.notice]);
    if (!force && signature === scheduleShareSignature) return;
    scheduleShareSignature = signature;
    ++scheduleExportToken;
    scheduleExportFile = null;
    showScheduleShareStatus();
    updateScheduleShareButton();
}

function initScheduleSharing() {
    const button = document.getElementById('schedule-share');
    button.onclick = async () => {
        if (!scheduleShareData || button.disabled || scheduleShareInFlight) return;
        if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') {
            showScheduleShareStatus('Цей браузер не підтримує поширення картинки. Спробуйте відкрити MyKep у браузері телефона.');
            return;
        }
        // Day/data changes only invalidate the file. Rendering starts at the tap.
        refreshScheduleShareFile();
        const token = scheduleExportToken;
        scheduleShareInFlight = true;
        updateScheduleShareButton();
        showScheduleShareStatus();
        let generated = false;
        try {
            if (!scheduleExportFile) {
                scheduleSharePreparing = true;
                updateScheduleShareButton();
                showScheduleShareStatus('Готуємо картинку…', false);
                const data = scheduleShareSnapshot();
                try {
                    const blob = await createSchedulePNG(data);
                    if (token !== scheduleExportToken || Tabs.current !== 'schedule') return;
                    const filename = `MyKep-${data.group}-${data.day}.png`.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
                    scheduleExportFile = new File([blob], filename, { type: 'image/png' });
                    generated = true;
                } catch (error) {
                    if (token === scheduleExportToken) {
                        console.error('Schedule image generation failed:', error);
                        showScheduleShareStatus('Не вдалося підготувати картинку. Спробуйте ще раз.');
                    }
                    return;
                }
            }
            let canShare = false;
            try { canShare = navigator.canShare({ files: [scheduleExportFile] }); }
            catch (error) { console.warn('Schedule file sharing unavailable:', error); }
            if (!canShare) {
                showScheduleShareStatus('Цей браузер не підтримує поширення картинки. Спробуйте відкрити MyKep у браузері телефона.');
                return;
            }
            // Slow preparation may outlive transient activation. Keep the file
            // so the next tap can share synchronously, without rendering again.
            if (navigator.userActivation && !navigator.userActivation.isActive) {
                showScheduleShareStatus('Картинка готова. Натисніть «Поділитися» ще раз.');
                return;
            }
            showScheduleShareStatus();
            await navigator.share({ files: [scheduleExportFile] });
        } catch (error) {
            if (token === scheduleExportToken && error.name !== 'AbortError') {
                showScheduleShareStatus(generated && error.name === 'NotAllowedError' ?
                    'Картинка готова. Натисніть «Поділитися» ще раз.' :
                    'Не вдалося відкрити меню поширення. Спробуйте ще раз.');
            }
        } finally {
            scheduleSharePreparing = false;
            scheduleShareInFlight = false;
            if (token !== scheduleExportToken || Tabs.current !== 'schedule') showScheduleShareStatus();
            updateScheduleShareButton();
        }
    };
}

initScheduleSharing();
