// Storage can be unavailable in private/in-app browsers; don't crash onboarding.
const storage = {
    get(key) { try { return localStorage.getItem(key); } catch (_) { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); return true; } catch (_) { return false; } },
    remove(key) { try { localStorage.removeItem(key); } catch (_) {} }
};
function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
}

function getKyivNow() {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
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
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const easeProgress = progress * (2 - progress); 
        obj.innerText = Math.floor(start + easeProgress * (end - start)) + '%';
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            obj.innerText = Math.floor(end) + '%';
        }
    };
    window.requestAnimationFrame(step);
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

function getAcademicWeek() {
    const now = getKyivNow();
    const baseMonday = new Date(2026, 7, 31); 
    let targetDate = new Date(now);
    
    if (targetDate.getDay() === 0) { 
        targetDate.setDate(targetDate.getDate() + 1);
    } else if (targetDate.getDay() === 6 && targetDate.getHours() >= 15) { 
        targetDate.setDate(targetDate.getDate() + 2);
    }
    
    targetDate.setHours(0, 0, 0, 0);
    baseMonday.setHours(0, 0, 0, 0);
    
    const diffDays = Math.floor((Date.UTC(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()) - Date.UTC(2026, 7, 31)) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 1;
    
    return (Math.floor(diffDays / 7) % 4) + 1;
}

function updateHeaderDisplays() {
    const savedGroup = storage.get('mykep_group') || 'ПІ-24-02';
    const headerDisplay = document.getElementById('header-group-text');
    if (headerDisplay) {
        if (document.querySelector('.day-picker')) {
            headerDisplay.innerText = `${getAcademicWeek()}-й тиждень`;
        } else {
            headerDisplay.innerText = `Група ${savedGroup}`;
        }
    }
}
