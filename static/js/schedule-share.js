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
    if (['1','2','3','4'].includes(week)) return `${name} · ${week}-й тиждень`;
    const date = new Date(now);
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
    const group = lines(data.group, `500 30px ${family}`, 668);
    const label = lines(scheduleExportDayLabel(data.day, data.week, data.date), `500 30px ${family}`, 790);
    const cards = data.lessons.map(lesson => {
        const heading = lines(`${lesson.lesson}-${getLessonSuffix(lesson.lesson)} пара   ${lesson.time || 'Час не вказано'}`, fonts.small, 520);
        const subject = lines(lesson.subject || 'Заняття', fonts.title, 520);
        const teacher = lines(teacherDisplayName(String(lesson.teacher || '')), fonts.small, 482);
        ctx.font = `600 48px ${family}`;
        const compactRoom = ctx.measureText(lesson.room || 'Не вказано').width > 166;
        const roomFont = compactRoom ? `500 32px ${family}` : `600 48px ${family}`;
        const roomLineHeight = compactRoom ? 42 : 58;
        const room = lines(lesson.room || 'Не вказано', roomFont, 166);
        const leftHeight = heading.length * 36 + 20 + subject.length * 46 + 32 + teacher.length * 34;
        return { heading, subject, teacher, room, roomFont, roomLineHeight, height: Math.max(leftHeight, 42 + room.length * roomLineHeight) + 72 };
    });
    const notice = lines(data.notice || '', fonts.footer, 790);
    const headerHeight = 200 + group.length * 40 + label.length * 40;
    const height = headerHeight + (cards.length ? cards.reduce((sum, card) => sum + card.height + 24, 0) : 130)
        + notice.length * 32 + 184;
    if (height > 16000) throw new Error('Image too large');
    canvas.height = height;
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, canvas.width, height);
    const glow = ctx.createRadialGradient(450, 0, 0, 450, 0, 1100);
    glow.addColorStop(0, 'rgba(255, 85, 0, 0.12)');
    glow.addColorStop(1, 'rgba(255, 85, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, canvas.width, height);
    function draw(textLines, font, color, x, top, lineHeight) {
        ctx.font = font;
        ctx.fillStyle = color;
        ctx.textBaseline = 'top';
        for (const line of textLines) { ctx.fillText(line, x, top); top += lineHeight; }
        return top;
    }
    function rule(x, top, right, bottom) {
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(right, bottom);
        ctx.strokeStyle = colors.border;
        ctx.lineWidth = 2;
        ctx.stroke();
    }
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(72, 44);
    ctx.arcTo(160, 44, 160, 156, 24);
    ctx.arcTo(160, 156, 48, 156, 24);
    ctx.arcTo(48, 156, 48, 44, 24);
    ctx.arcTo(48, 44, 160, 44, 24);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(logo, 48, 44, 112, 112);
    ctx.restore();
    draw(['MyKep'], `700 72px ${family}`, colors.accent, 184, 40, 84);
    let y = draw(group, `500 30px ${family}`, colors.muted, 184, 128, 40);
    y = draw(label, `500 30px ${family}`, colors.text, 48, y + 28, 40) + 48;
    for (const card of cards) {
        const top = y;
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
        ctx.shadowBlur = 24;
        ctx.shadowOffsetY = 12;
        ctx.beginPath();
        ctx.moveTo(80, top);
        ctx.arcTo(860, top, 860, top + card.height, 40);
        ctx.arcTo(860, top + card.height, 40, top + card.height, 40);
        ctx.arcTo(40, top + card.height, 40, top, 40);
        ctx.arcTo(40, top, 860, top, 40);
        ctx.closePath();
        ctx.fillStyle = colors.card;
        ctx.fill();
        ctx.restore();
        ctx.strokeStyle = colors.border;
        ctx.lineWidth = 2;
        ctx.stroke();
        y = draw(card.heading, fonts.small, colors.muted, 80, top + 36, 36) + 20;
        y = draw(card.subject, fonts.title, colors.text, 80, y, 46) + 16;
        rule(80, y, 600, y);
        y += 20;
        // Match the teacher icon and separate room column of the schedule cards
        ctx.beginPath();
        ctx.arc(92, y + 8, 7, 0, Math.PI * 2);
        ctx.moveTo(80, y + 32);
        ctx.lineTo(80, y + 26);
        ctx.quadraticCurveTo(92, y + 16, 104, y + 26);
        ctx.lineTo(104, y + 32);
        ctx.strokeStyle = colors.muted;
        ctx.stroke();
        draw(card.teacher, fonts.small, colors.muted, 118, y, 34);
        rule(638, top + 36, 638, top + card.height - 36);
        const roomTop = top + (card.height - 38 - card.room.length * card.roomLineHeight) / 2;
        ctx.textAlign = 'center';
        draw(['Аудиторія'], `400 24px ${family}`, colors.muted, 734, roomTop, 32);
        draw(card.room, card.roomFont, colors.text, 734, roomTop + 38, card.roomLineHeight);
        ctx.textAlign = 'left';
        y = top + card.height + 24;
    }
    if (!cards.length) y = draw(['Пар не заплановано'], fonts.title, colors.text, 48, y, 46) + 60;
    y = draw(notice, fonts.footer, colors.muted, 48, y, 32) + 20;
    rule(48, y, 852, y);
    y += 26;
    draw(['mykep.pp.ua'], `600 46px ${family}`, colors.accent, 48, y, 56);
    const now = getKyivNow();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    draw([`Створено ${scheduleExportDateLabel(now)} · ${time}`], `400 22px ${family}`, colors.muted, 48, y + 64, 30);
    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG unavailable')), 'image/png');
    });
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
