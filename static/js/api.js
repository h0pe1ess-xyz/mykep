let groupsRequest = null;
const scheduleRequests = new Map();
const SCHEDULE_CACHE_VERSION = 3;
const SCHEDULE_CACHE_LIMIT = 12;
const SCHEDULE_DAYS = ['понеділок', 'вівторок', 'середа', 'четвер', "п'ятниця", 'субота'];
function currentDisplayMode() {
    return isPWA() ? 'standalone' : 'browser';
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
        let cache;
        try { cache = JSON.parse(storage.get('mykep_groups') || 'null'); } catch { cache = null; }
        if (!force && cache?.data?.length && Date.now() - cache.time < 3600000) return cache.data;
        try {
            const result = await fetchJSON('/api/groups');
            if (!Array.isArray(result.data) || !result.data.length || !result.data.every(g => typeof g === 'string')) throw new Error('Некоректний список груп.');
            storage.set('mykep_groups', JSON.stringify({ data: result.data, time: Date.now() }));
            return result.data;
        } catch (error) {
            if (Array.isArray(cache?.data) && cache.data.every(g => typeof g === 'string')) return cache.data;
            throw error;
        }
    })().finally(() => { groupsRequest = null; });
    return groupsRequest;
}
function normalizeWeekSelection(value) {
    return ['auto', 'current', 'next', '1', '2', '3', '4'].includes(String(value)) ? String(value) : 'auto';
}
function getScheduleWeekSelection() { return normalizeWeekSelection(storage.get('mykep_schedule_week')); }
function dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function parseLocalDate(value) { return new Date(`${value}T12:00:00`); }
function calendarMonday(now = getKyivNow()) {
    const date = new Date(now);
    date.setDate(date.getDate() - ((date.getDay()+6)%7));
    date.setHours(12,0,0,0);
    return date;
}
function cycleWeek(date) {
    const days = (Date.UTC(date.getFullYear(),date.getMonth(),date.getDate())-Date.UTC(2026,7,31))/86400000;
    return days < 0 ? 1 : (Math.floor(days/7)%4)+1;
}
function scheduleCacheKey(group, duration1, duration2) { return `${group}|${duration1}|${duration2}`; }
function validSchedule(data) {
    return data && typeof data === 'object' && !Array.isArray(data) && SCHEDULE_DAYS.every(day => Array.isArray(data[day]) && data[day].every(l =>
        Number.isInteger(l.lesson) && l.lesson >= 1 && l.lesson <= 8 && typeof l.subject === 'string' && l.subject.trim() &&
        typeof l.teacher === 'string' && typeof l.room === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d - (?:[01]\d|2[0-3]):[0-5]\d$/.test(l.time) &&
        (!l.starts_on || /^\d{4}-\d{2}-\d{2}$/.test(l.starts_on))));
}
function validCycle(cycle) { return cycle && [1,2,3,4].every(w => validSchedule(cycle[w])); }
function scheduleRequestContext(week = 'auto', group = null) {
    group = group || storage.get('mykep_group') || 'ПІ-24-02';
    const duration1 = storage.get('mykep_duration1') || '80', duration2 = storage.get('mykep_duration2') || '60';
    return { group, duration1, duration2, week: normalizeWeekSelection(week), key: scheduleCacheKey(group,duration1,duration2) };
}
function readScheduleEntries() {
    try {
        const cache = JSON.parse(storage.get('mykep_schedule') || 'null');
        if (cache?.version === 3 && Array.isArray(cache.entries)) return cache.entries.filter(e => typeof e.key === 'string' && (validCycle(e.cycle) || validSchedule(e.data)));
        if (cache?.version === 2 && Array.isArray(cache.entries)) {
            // Preserve exact legacy views until their group obtains a cycle. Never
            // turn an incomplete old week into four supposedly complete weeks.
            const entries = cache.entries.filter(e => validSchedule(e.data)).map(e => {
                const [group,d1,d2,monday,week] = e.key.split('|');
                const [y,m,d] = monday.split('-');
                return { ...e, key: scheduleCacheKey(group,d1,d2), legacyMonday: `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`, legacyWeek: week };
            });
            storage.set('mykep_schedule',JSON.stringify({ version: 3, entries }));
            return entries;
        }
    } catch { /* A corrupt cache must not reset independent preferences. */ }
    return [];
}
function cachedScheduleForKey(key) { return readScheduleEntries().find(e => e.key === key && e.cycle) || readScheduleEntries().find(e => e.key === key) || null; }
function saveScheduleEntry(entry) {
    const entries = readScheduleEntries().filter(e => e.key !== entry.key);
    entries.push(entry);
    entries.sort((a,b) => (b.usedAt || b.savedAt || 0)-(a.usedAt || a.savedAt || 0));
    const main = scheduleRequestContext().key;
    const protectedEntry = entries.find(e => e.key === main);
    const retained = entries.filter(e => e.key !== main).slice(0,SCHEDULE_CACHE_LIMIT-(protectedEntry ? 1 : 0));
    if (protectedEntry) retained.unshift(protectedEntry);
    storage.set('mykep_schedule',JSON.stringify({ version: 3, entries: retained }));
}
function getCachedSchedule(week = 'auto', group = null) {
    const context = scheduleRequestContext(week,group);
    const entries = readScheduleEntries();
    const cycle = entries.find(e => e.key === context.key && e.cycle);
    if (cycle) return materializeSchedule(cycle,week,context.group);
    const expected = dateKey(calendarMonday());
    const legacy = entries.find(e => e.key === context.key && e.legacyMonday === expected &&
        ((week === 'auto' || week === 'current') ? e.legacyWeek === 'auto' : e.legacyWeek === week));
    return legacy ? { ...legacy, meta: legacy.meta || {}, notice: 'Збережено за старою схемою. Для повного циклу потрібне підключення.', calendar: { monday: ['1','2','3','4'].includes(week) ? null : expected, cycle: cycleWeek(calendarMonday()), label: 'Збережений тиждень' } } : null;
}
function filterLessons(lessons, date, group, manual = false) {
    return lessons.filter(l => manual || !l.starts_on || dateKey(date) >= l.starts_on);
}
function scheduleOnDate(entry,date,group) {
    const index = (date.getDay()+6)%7;
    return index === 6 ? [] : filterLessons(entry.cycle[cycleWeek(date)][SCHEDULE_DAYS[index]],date,group);
}
function defaultMonday(entry, group, now = getKyivNow()) {
    const monday = calendarMonday(now);
    const saturday = scheduleOnDate(entry,now,group);
    const end = saturday.reduce((max,l) => Math.max(max,timeToMins(l.time.split(' - ')[1])),0);
    if (now.getDay() === 0 || (now.getDay() === 6 && now.getHours()*60+now.getMinutes() >= end)) monday.setDate(monday.getDate()+7);
    return monday;
}
function sourceTimeLabel(meta) {
    if (!meta?.updated_at) return 'Час перевірки джерела невідомий.';
    const checked=new Date(meta.updated_at);
    if (!Number.isFinite(checked.getTime())) return 'Час перевірки джерела невідомий.';
    const oldYear=+new Intl.DateTimeFormat('en',{timeZone:'Europe/Kyiv',year:'numeric'}).format(checked) !== getKyivNow().getFullYear();
    return `Джерело перевірено ${checked.toLocaleString('uk-UA',{timeZone:'Europe/Kyiv',day:'2-digit',month:'2-digit',...(oldYear?{year:'numeric'}:{}),hour:'2-digit',minute:'2-digit'})}.`;
}
function staleScheduleNotice(meta) { return meta?.stale ? 'Дані можуть бути застарілими.' : ''; }
function materializeSchedule(entry, week, group, now = getKyivNow()) {
    const offline = entry.offline || navigator.onLine === false;
    const manual = ['1','2','3','4'].includes(week);
    const monday = week === 'auto' ? defaultMonday(entry,group,now) : calendarMonday(now);
    if (week === 'next') monday.setDate(monday.getDate()+7);
    const current = dateKey(calendarMonday(now)), target = dateKey(monday);
    const cycle = manual ? +week : cycleWeek(monday);
    const data = Object.fromEntries(SCHEDULE_DAYS.map((day,i) => {
        const date = new Date(monday); date.setDate(date.getDate()+i);
        return [day,filterLessons(entry.cycle[cycle][day],date,group,manual)];
    }));
    let nextDay = null;
    for (let i=1;i<=28;i++) {
        const date = new Date(now); date.setDate(date.getDate()+i);
        const lessons = scheduleOnDate(entry,date,group);
        if (lessons.length) { nextDay = { date: dateKey(date), lessons }; break; }
    }
    return { ...entry, data, today: scheduleOnDate(entry,now,group), nextDay,
        calendar: { monday: manual ? null : target, cycle, label: manual ? 'Перегляд циклу' : target === current ? 'Поточний тиждень' : 'Наступний тиждень' },
        notice: `${offline ? 'Немає зв’язку. Офлайн-копія. ' : ''}${staleScheduleNotice(entry.meta)}`, group };
}
function fetchSchedule(week = 'auto', group = null, event = 'refresh') {
    const context = scheduleRequestContext(week,group);
    const requestKey = `${context.key}|${event}`;
    if (!scheduleRequests.has(requestKey)) {
        scheduleRequests.set(requestKey,loadScheduleResponse(context,event).finally(() => scheduleRequests.delete(requestKey)));
    }
    return scheduleRequests.get(requestKey).then(entry => entry?.cycle ? materializeSchedule(entry,week,context.group) : entry);
}
async function loadScheduleResponse(context,event) {
    const {key,group,duration1,duration2} = context;
    const cached = cachedScheduleForKey(key);
    const query = new URLSearchParams({group,duration1,duration2,uid:getUserId(),mode:currentDisplayMode(),event});
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(),10000);
    try {
        const response = await fetch(`/api/schedule?${query}`,{signal:controller.signal,cache:'no-store',headers: cached?.etag ? {'If-None-Match':cached.etag} : {}});
        let entry;
        if (response.status === 304 && cached?.cycle) {
            entry = {...cached, meta: {updated_at:response.headers.get('X-Source-Checked-At') || cached.meta?.updated_at,stale:response.headers.get('X-Source-Stale') === 'true'}};
        } else {
            const result = await response.json();
            if (!response.ok || result.status !== 'success') { const error = new Error(result.message); error.status=response.status; throw error; }
            if (!validCycle(result.cycle)) throw new Error('Некоректний цикл розкладу.');
            entry = {key,cycle:result.cycle,meta:result.meta,etag:response.headers.get('ETag'),savedAt:Date.now()};
        }
        entry.offline=false;
        entry.usedAt=Date.now();
        saveScheduleEntry(entry);
        return entry;
    } catch (error) {
        if (error.status === 404 || error.status === 422) {
            storage.set('mykep_schedule',JSON.stringify({version:SCHEDULE_CACHE_VERSION,
                entries:readScheduleEntries().filter(entry => entry.key !== key)}));
        }
        if (error.status !== 404 && error.status !== 422 && cached?.cycle) {
            const entry = {...cached,offline:true,usedAt:Date.now(),meta:{...cached.meta,stale:true}};
            saveScheduleEntry(entry);
            return entry;
        }
        const legacy = error.status !== 404 && error.status !== 422 ? getCachedSchedule(context.week,group) : null;
        return legacy || { data:null,notice:error.status === 404 ? error.message : 'Не вдалося завантажити розклад. Перевірте з’єднання й спробуйте ще раз.' };
    } finally { clearTimeout(timeout); }
}
