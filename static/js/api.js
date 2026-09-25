let groupsRequest = null;
let scheduleNotice = '';

// Anonymous: only tells the admin stats whether MyKep runs as an installed PWA.
function currentDisplayMode() {
    try {
        const standalone = window.matchMedia('(display-mode: standalone)').matches ||
            window.matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;
        return standalone ? 'standalone' : 'browser';
    } catch (_) { return 'browser'; }
}

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

// Keep all five views separate; settings still clear them with one storage key.
const SCHEDULE_CACHE_VERSION = 2;
const SCHEDULE_CACHE_LIMIT = 10;
function normalizeWeekSelection(value) {
    return ['1', '2', '3', '4'].includes(String(value)) ? String(value) : 'auto';
}
function getScheduleWeekSelection() {
    return normalizeWeekSelection(storage.get('mykep_schedule_week'));
}
function scheduleCacheKey(group, duration1, duration2, week = 'auto') {
    const now = getKyivNow();
    if (now.getDay() === 0) now.setDate(now.getDate() + 1);
    else if (now.getDay() === 6 && now.getHours() >= 15) now.setDate(now.getDate() + 2);
    now.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    return `${group}|${duration1}|${duration2}|${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}|${normalizeWeekSelection(week)}`;
}
function validSchedule(data) {
    return data !== null && typeof data === 'object' && !Array.isArray(data) &&
        Object.values(data).every(day => Array.isArray(day));
}
function scheduleRequestContext(week = 'auto') {
    const group = storage.get('mykep_group') || 'ПІ-24-02';
    const duration1 = storage.get('mykep_duration1') || '80';
    const duration2 = storage.get('mykep_duration2') || '60';
    return { group, duration1, duration2, week: normalizeWeekSelection(week),
        key: scheduleCacheKey(group, duration1, duration2, week) };
}
function readScheduleEntries() {
    try {
        const cache = JSON.parse(storage.get('mykep_schedule') || 'null');
        return cache?.version === SCHEDULE_CACHE_VERSION && Array.isArray(cache.entries) ?
            cache.entries.filter(entry => entry && typeof entry.key === 'string' &&
                Number.isFinite(entry.savedAt) && validSchedule(entry.data)) : [];
    } catch (_) { storage.remove('mykep_schedule'); return []; }
}
function cachedScheduleForKey(key) {
    return readScheduleEntries().find(entry => entry.key === key) || null;
}
function getCachedSchedule(week = 'auto') {
    return cachedScheduleForKey(scheduleRequestContext(week).key);
}
function saveScheduleEntry(entry) {
    const entries = readScheduleEntries().filter(item => item.key !== entry.key);
    entries.push(entry);
    entries.sort((a, b) => b.savedAt - a.savedAt);
    storage.set('mykep_schedule', JSON.stringify({ version: SCHEDULE_CACHE_VERSION,
        entries: entries.slice(0, SCHEDULE_CACHE_LIMIT) }));
}
function staleScheduleNotice(meta) {
    return meta?.stale ? 'Показано останню збережену версію: сайт коледжу тимчасово недоступний або дані ще оновлюються.' : '';
}
async function fetchSchedule(week = 'auto') {
    const { group, duration1, duration2, key, week: selectedWeek } = scheduleRequestContext(week);
    const query = new URLSearchParams({ group, duration1, duration2, uid: getUserId(), mode: currentDisplayMode() });
    if (selectedWeek !== 'auto') query.set('week', selectedWeek);
    try {
        const result = await fetchJSON(`/api/schedule?${query}`);
        if (!validSchedule(result.data)) throw new Error('Некоректна відповідь сервера.');
        saveScheduleEntry({ key, data: result.data, savedAt: Date.now(), meta: result.meta });
        return { data: result.data, notice: staleScheduleNotice(result.meta) };
    } catch (error) {
        // Do not resurrect a server-rejected group/view on the next offline visit.
        if (error.status === 404 || error.status === 422) {
            storage.set('mykep_schedule', JSON.stringify({ version: SCHEDULE_CACHE_VERSION,
                entries: readScheduleEntries().filter(entry => entry.key !== key) }));
        }
        // A different week/group must never masquerade as this offline view.
        if (error.status !== 404 && error.status !== 422) {
            const cached = cachedScheduleForKey(key);
            if (cached) return { data: cached.data,
                notice: 'Немає зв’язку із сервером. Показано збережений розклад; зміни могли не завантажитися.' };
        }
        return { data: null, notice: error.status === 404 ? error.message :
            'Не вдалося завантажити розклад. Перевірте з’єднання й спробуйте ще раз.' };
    }
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
function showScheduleError(retryLoad = () => window.location.reload()) {
    showScheduleNotice();
    const dashboard = document.getElementById('dashboard-main');
    if (dashboard) dashboard.hidden = true; // Preserve the timer DOM for retry.
    const list = document.getElementById('dynamic-schedule-list');
    if (list) list.replaceChildren();
    const retry = document.createElement('button');
    retry.type = 'button'; retry.className = 'btn btn-secondary';
    retry.textContent = 'Спробувати ще раз'; retry.onclick = retryLoad;
    const notice = document.getElementById('schedule-notice');
    if (notice) { notice.hidden = false; notice.appendChild(retry); }
}
