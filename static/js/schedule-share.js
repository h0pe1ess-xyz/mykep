'use strict';

let scheduleShareContext = null;
let scheduleShareData = null;
let scheduleExportToken = 0;
let scheduleExportURL = null;
let scheduleExportFile = null;

function scheduleExportDayLabel(day, week, now = getKyivNow()) {
    const names = ['неділя', 'понеділок', 'вівторок', 'середа', 'четвер', "п'ятниця", 'субота'];
    const name = day.charAt(0).toUpperCase() + day.slice(1);
    if (week !== 'auto') return `${name} · ${week}-й тиждень`;
    const date = new Date(now);
    if (date.getDay() === 0) date.setDate(date.getDate() + 1);
    else if (date.getDay() === 6 && date.getHours() >= 15) date.setDate(date.getDate() + 2);
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7) + ((names.indexOf(day) + 6) % 7));
    return `${name} · ${date.getDate()}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;
}

function closeScheduleExport(restoreFocus = false) {
    ++scheduleExportToken;
    const panel = document.getElementById('schedule-export');
    panel.hidden = true;
    panel.closest('main').classList.remove('schedule-export-open');
    document.getElementById('schedule-share').setAttribute('aria-expanded', 'false');
    document.getElementById('schedule-export-image').removeAttribute('src');
    document.getElementById('schedule-export-save').removeAttribute('href');
    if (scheduleExportURL) URL.revokeObjectURL(scheduleExportURL);
    scheduleExportURL = null;
    scheduleExportFile = null;
    if (restoreFocus) document.getElementById('schedule-share').focus({ preventScroll: true });
}

function setScheduleSharingPending() {
    closeScheduleExport();
    scheduleShareData = null;
    document.getElementById('schedule-share').disabled = true;
}

function setScheduleShareData(lessons, day) {
    closeScheduleExport();
    scheduleShareData = { lessons, day, ...scheduleShareContext };
    document.getElementById('schedule-share').disabled = false;
}

async function createSchedulePNG(data) {
    // Draw text and shapes locally. No server renderer, external images or uploads.
    if (!Array.isArray(data.lessons) || data.lessons.length > 32) throw new Error('Schedule too large');
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    function lines(value, font, width = 788) {
        const text = String(value ?? '').replace(/\s+/g, ' ').trim();
        if (text.length > 1500) throw new Error('Text too large');
        ctx.font = font;
        const result = [];
        let line = '';
        for (const character of Array.from(text)) {
            if (ctx.measureText(line + character).width > width && line) {
                result.push(line.trimEnd());
                line = character.trimStart();
            } else line += character;
        }
        if (line) result.push(line.trimEnd());
        return result;
    }
    const group = lines(data.group, 'bold 38px Arial');
    const label = scheduleExportDayLabel(data.day, data.week, data.date);
    const cards = data.lessons.map(lesson => {
        const heading = lines(`${lesson.lesson}-${getLessonSuffix(lesson.lesson)} пара · ${lesson.time || 'Час не вказано'}`, '24px Arial');
        const subject = lines(lesson.subject || 'Заняття', 'bold 32px Arial');
        const teacher = lines(teacherDisplayName(String(lesson.teacher || '')), '24px Arial');
        const room = lines(lesson.room ? `Аудиторія ${lesson.room}` : 'Аудиторія не вказана', '24px Arial');
        return { heading, subject, teacher, room,
            height: 54 + heading.length * 32 + subject.length * 42 + teacher.length * 32 + room.length * 32 };
    });
    const notice = lines(data.notice || '', '22px Arial');
    const height = 210 + group.length * 46 + (cards.length ? cards.reduce((sum, card) => sum + card.height + 16, 0) : 130)
        + notice.length * 30 + 100;
    if (height > 16000) throw new Error('Image too large');
    canvas.height = height;
    ctx.fillStyle = '#120e0c';
    ctx.fillRect(0, 0, canvas.width, height);
    let y = 54;
    function draw(textLines, font, color, lineHeight, x = 56) {
        ctx.font = font;
        ctx.fillStyle = color;
        ctx.textBaseline = 'top';
        for (const line of textLines) { ctx.fillText(line, x, y); y += lineHeight; }
    }
    draw(['MyKep'], 'bold 32px Arial', '#ff783e', 52);
    draw(group, 'bold 38px Arial', '#fff8f3', 46);
    y += 12;
    draw([label], '26px Arial', '#d2c4bb', 36);
    y += 26;
    for (const card of cards) {
        ctx.fillStyle = '#251c17';
        ctx.fillRect(32, y, 836, card.height);
        y += 22;
        draw(card.heading, '24px Arial', '#d2c4bb', 32);
        y += 6;
        draw(card.subject, 'bold 32px Arial', '#fff8f3', 42);
        draw(card.teacher, '24px Arial', '#d2c4bb', 32);
        draw(card.room, '24px Arial', '#ffae7f', 32);
        y += 42;
    }
    if (!cards.length) { draw(['Пар не заплановано'], '32px Arial', '#fff8f3', 46); y += 84; }
    draw(notice, '22px Arial', '#ffae7f', 30);
    y += 16;
    const now = getKyivNow();
    const stamp = `${now.getDate()}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    draw([`Створено ${stamp}`, 'Актуальний розклад: mykep.pp.ua'], '22px Arial', '#d2c4bb', 30);
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG unavailable')), 'image/png'));
}

function initScheduleSharing() {
    const button = document.getElementById('schedule-share');
    const panel = document.getElementById('schedule-export');
    const status = document.getElementById('schedule-export-status');
    const image = document.getElementById('schedule-export-image');
    const save = document.getElementById('schedule-export-save');
    const send = document.getElementById('schedule-export-send');
    button.onclick = async () => {
        if (!scheduleShareData || button.disabled) return;
        if (!panel.hidden) { closeScheduleExport(); return; }
        const data = { ...scheduleShareData, notice: document.getElementById('schedule-notice').textContent };
        const token = ++scheduleExportToken;
        panel.hidden = false;
        panel.closest('main').classList.add('schedule-export-open');
        image.hidden = save.hidden = send.hidden = true;
        button.setAttribute('aria-expanded', 'true');
        status.textContent = 'Готуємо картинку…';
        try {
            const blob = await createSchedulePNG(data);
            // The public CSP allows data images, so preview without permitting blob images.
            const previewURL = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(new Error('Preview unavailable'));
                reader.readAsDataURL(blob);
            });
            if (token !== scheduleExportToken) return;
            const filename = `MyKep-${data.group}-${data.day}.png`.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
            scheduleExportURL = URL.createObjectURL(blob);
            scheduleExportFile = new File([blob], filename, { type: 'image/png' });
            image.src = previewURL;
            image.alt = `Розклад ${data.group}: ${scheduleExportDayLabel(data.day, data.week, data.date)}`;
            image.hidden = save.hidden = false;
            save.href = scheduleExportURL;
            save.download = filename;
            let canShare = false;
            try { canShare = !!navigator.share && !!navigator.canShare?.({ files: [scheduleExportFile] }); }
            catch { canShare = false; }
            send.hidden = !canShare;
            send.disabled = false;
            status.textContent = canShare ? 'Надішліть картинку або збережіть PNG.' : 'Збережіть PNG та надішліть його в чат.';
        } catch (error) {
            if (token !== scheduleExportToken) return;
            console.error('Schedule image generation failed:', error);
            status.textContent = 'Не вдалося створити картинку. Закрийте та спробуйте ще раз.';
        }
    };
    send.onclick = async () => {
        if (!scheduleExportFile || send.disabled) return;
        const token = scheduleExportToken;
        send.disabled = true;
        try {
            // The file is ready before this tap, preserving native share user activation.
            await navigator.share({ files: [scheduleExportFile], title: 'Розклад MyKep' });
            if (token === scheduleExportToken) status.textContent = 'Картинку передано в меню поширення.';
        } catch (error) {
            if (token === scheduleExportToken) status.textContent = error.name === 'AbortError'
                ? 'Поширення скасовано. Можна спробувати ще раз або зберегти PNG.'
                : 'Не вдалося відкрити меню поширення. Збережіть PNG та надішліть його в чат.';
        } finally { if (token === scheduleExportToken) send.disabled = false; }
    };
    document.getElementById('schedule-export-close').onclick = () => closeScheduleExport(true);
    panel.addEventListener('keydown', event => { if (event.key === 'Escape') closeScheduleExport(true); });
}

initScheduleSharing();
