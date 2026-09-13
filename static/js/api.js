let groupsRequest = null;
let scheduleNotice = '';

async function fetchJSON(url, timeout = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
        const result = await response.json();
        if (!response.ok || result.status !== 'success') {
            const error = new Error(result.message || 'Сервер тимчасово недоступний.');
            error.status = response.status;
            throw error;
        }
        return result;
    } finally { clearTimeout(timer); }
}

async function fetchGroups(force = false) {
    if (groupsRequest) return groupsRequest;
    groupsRequest = (async () => {
        try {
            if (!force) {
                const cache = JSON.parse(storage.get('mykep_groups') || 'null');
                if (cache && Array.isArray(cache.data) && cache.data.length && Date.now() - cache.time < 3600000) return cache.data;
            }
        } catch (_) { storage.remove('mykep_groups'); }
        const result = await fetchJSON('/api/groups');
        if (!Array.isArray(result.data) || !result.data.length || !result.data.every(group => typeof group === 'string')) throw new Error('Некоректний список груп.');
        storage.set('mykep_groups', JSON.stringify({ data: result.data, time: Date.now() }));
        return result.data;
    })().finally(() => { groupsRequest = null; });
    return groupsRequest;
}

function scheduleCacheKey(group, duration1, duration2) {
    const now = getKyivNow();
    if (now.getDay() === 0) now.setDate(now.getDate() + 1);
    else if (now.getDay() === 6 && now.getHours() >= 15) now.setDate(now.getDate() + 2);
    now.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    return `${group}|${duration1}|${duration2}|${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`;
}
function validSchedule(data) {
    return data !== null && typeof data === 'object' && !Array.isArray(data) &&
        Object.values(data).every(day => Array.isArray(day));
}
async function fetchSchedule() {
    const group = storage.get('mykep_group') || 'ПІ-24-02';
    const duration1 = storage.get('mykep_duration1') || '80';
    const duration2 = storage.get('mykep_duration2') || '60';
    const key = scheduleCacheKey(group, duration1, duration2);
    const query = new URLSearchParams({ group, duration1, duration2, uid: getUserId() });
    try {
        const result = await fetchJSON(`/api/schedule?${query}`);
        if (!validSchedule(result.data)) throw new Error('Некоректна відповідь сервера.');
        storage.set('mykep_schedule', JSON.stringify({ key, data: result.data, savedAt: Date.now(), meta: result.meta }));
        scheduleNotice = result.meta?.stale ? 'Показано останню збережену версію: сайт коледжу тимчасово недоступний або дані ще оновлюються.' : '';
        showScheduleNotice();
        return result.data;
    } catch (error) {
        // Never turn an unknown group into an apparently successful offline view.
        if (error.status !== 404 && error.status !== 422) {
            const cached = fallbackCache(key);
            if (cached) {
                scheduleNotice = 'Немає зв’язку із сервером. Показано збережений розклад; зміни могли не завантажитися.';
                showScheduleNotice();
                return cached;
            }
        }
        scheduleNotice = error.status === 404 ? error.message : 'Не вдалося завантажити розклад. Перевірте з’єднання й спробуйте ще раз.';
        return null;
    }
}
function fallbackCache(key) {
    try {
        const cached = JSON.parse(storage.get('mykep_schedule') || 'null');
        return cached && cached.key === key && validSchedule(cached.data) ? cached.data : null;
    } catch (_) { storage.remove('mykep_schedule'); return null; }
}
function showScheduleNotice() {
    let notice = document.getElementById('schedule-notice');
    if (!notice) {
        notice = document.createElement('p'); notice.id = 'schedule-notice';
        notice.className = 'schedule-notice'; notice.setAttribute('role', 'status');
        document.querySelector('.app-header')?.insertAdjacentElement('afterend', notice);
    }
    notice.textContent = scheduleNotice;
    notice.hidden = !scheduleNotice;
}
function showScheduleError() {
    const target = document.getElementById('dashboard-main') || document.getElementById('dynamic-schedule-list');
    if (!target) return;
    target.replaceChildren();
    const text = document.createElement('p'); text.className = 'schedule-notice'; text.setAttribute('role', 'alert');
    text.textContent = scheduleNotice;
    const retry = document.createElement('button'); retry.className = 'btn btn-secondary'; retry.textContent = 'Спробувати ще раз';
    retry.onclick = () => window.location.reload();
    target.append(text, retry);
}
