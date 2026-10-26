// Storage can be unavailable in private/in-app browsers; don't crash onboarding.
const storage = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); return true; } catch { return false; } },
    remove(key) { try { localStorage.removeItem(key); } catch {} }
};
function getLessonDuration(shift) {
    const value = storage.get(`mykep_duration${shift}`);
    return value === '80' ? '80' : '60';
}
function migrateDurationDefaults() {
    const revision = '2026-10-27';
    if (storage.get('mykep_duration_defaults') === revision) return;
    const first = storage.get('mykep_duration1');
    const second = storage.get('mykep_duration2');
    // Onboarding saved the old 80/60 default as explicit preferences.
    if (first === '80' && (!second || second === '60')) {
        if (!storage.set('mykep_duration1', '60')) return;
    }
    storage.set('mykep_duration_defaults', revision);
}
migrateDurationDefaults();
function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
}
function renderRoomCue(value) {
    const rooms = String(value ?? '').trim().split(' / ').filter(Boolean);
    const label = rooms.length > 1 ? 'Аудиторії' : 'Аудиторія';
    const numbers = rooms.length ? rooms.map(room => `<span class="room-cue-number">${escapeHTML(room)}</span>`).join('') : '<span class="room-cue-missing">Не вказано</span>';
    return `<span class="room-cue-label">${label}</span><strong class="room-cue-values">${numbers}</strong>`;
}


function normalizeGroupSearch(value) {
    // Separators are optional in search; preserve the original group for display/API.
    return value.normalize('NFKC').toLocaleLowerCase('uk').replace(/[^\p{L}\p{N}]/gu, '');
}

const kyivDateFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
});
function getKyivNow() {
    const parts = kyivDateFormatter.formatToParts(new Date());
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return new Date(+values.year, +values.month - 1, +values.day, +values.hour, +values.minute, +values.second);
}

function getUserId() {
    let uid = storage.get('mykep_uid');
    if (!uid) {
        uid = 'user_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
        storage.set('mykep_uid', uid);
    }
    return uid;
}

function animateValue(obj, start, end, duration) {
    if (!obj) return;
    if (obj._mykepAnimFrame) cancelAnimationFrame(obj._mykepAnimFrame);

    if (start === end || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.visibilityState === 'hidden') {
        obj.textContent = Math.floor(end) + '%';
        return;
    }

    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const easeProgress = progress * (2 - progress);
        obj.textContent = Math.floor(start + easeProgress * (end - start)) + '%';
        if (progress < 1) {
            obj._mykepAnimFrame = window.requestAnimationFrame(step);
        } else {
            obj.textContent = Math.floor(end) + '%';
            obj._mykepAnimFrame = null;
        }
    };
    obj._mykepAnimFrame = window.requestAnimationFrame(step);
}

function getLessonSuffix(num) {
    switch (parseInt(num)) {
        case 1: return "ша";
        case 2: return "га";
        case 3: return "тя";
        case 7: return "ма";
        case 8: return "ма";
        default: return "та"; // 4, 5, 6
    }
}

function timeToMins(timeStr) {
    if (!timeStr) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return (hours || 0) * 60 + (minutes || 0);
}

function getAcademicWeek() { return cycleWeek(getKyivNow()); }

function updateHeaderDisplays() {
    const savedGroup = storage.get('mykep_group') || 'ПІ-24-02';
    const headerDisplay = document.getElementById('header-group-text');
    const groupText = `Група ${savedGroup}`;
    if (headerDisplay && headerDisplay.textContent !== groupText) headerDisplay.textContent = groupText;
}
