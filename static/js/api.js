let groupsRequest = null;
const scheduleRequests = new Map();
const SCHEDULE_CACHE_VERSION = 3;
const SCHEDULE_CACHE_LIMIT = 12;
const SCHEDULE_DAYS = ['понеділок', 'вівторок', 'середа', 'четвер', "п'ятниця", 'субота'];
let scheduleCacheSource;
let scheduleEntries = [];
const scheduleViews = new WeakMap();
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
    const duration1 = getLessonDuration(1), duration2 = getLessonDuration(2);
    return { group, duration1, duration2, week: normalizeWeekSelection(week), key: scheduleCacheKey(group,duration1,duration2) };
}
function readScheduleEntries() {
    const source = storage.get('mykep_schedule');
    if (source === scheduleCacheSource) return scheduleEntries;
    scheduleCacheSource = source;
    scheduleEntries = [];
    try {
        const cache = JSON.parse(source || 'null');
        if (cache?.version === 3 && Array.isArray(cache.entries)) {
            scheduleEntries = cache.entries.filter(e => e && typeof e.key === 'string' && (validCycle(e.cycle) || validSchedule(e.data)));
        }
        if (cache?.version === 2 && Array.isArray(cache.entries)) {
            // Preserve exact legacy views until their group obtains a cycle. Never
            // turn an incomplete old week into four supposedly complete weeks.
            const entries = cache.entries.filter(e => typeof e?.key === 'string' && validSchedule(e.data)).map(e => {
                const [group,d1,d2,monday,week] = e.key.split('|');
                if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(monday || '')) return null;
                const [y,m,d] = monday.split('-');
                return { ...e, key: scheduleCacheKey(group,d1,d2), legacyMonday: `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`, legacyWeek: week };
            }).filter(Boolean);
            scheduleEntries = entries;
            persistScheduleEntries();
        }
    } catch { /* A corrupt cache must not reset independent preferences. */ }
    return scheduleEntries;
}
function persistScheduleEntries() {
    const source = JSON.stringify({version:SCHEDULE_CACHE_VERSION,entries:scheduleEntries});
    if (storage.set('mykep_schedule',source)) scheduleCacheSource = source;
}
function cachedScheduleForKey(key) {
    const entries = readScheduleEntries();
    return entries.find(e => e.key === key && e.cycle) || entries.find(e => e.key === key) || null;
}
function saveScheduleEntry(entry) {
    const previous = cachedScheduleForKey(entry.key);
    const changed = !previous || previous.cycle !== entry.cycle || previous.etag !== entry.etag ||
        previous.meta?.updated_at !== entry.meta?.updated_at || previous.meta?.stale !== entry.meta?.stale;
    const entries = scheduleEntries.filter(e => e.key !== entry.key);
    entries.push(entry);
    entries.sort((a,b) => (b.usedAt || b.savedAt || 0)-(a.usedAt || a.savedAt || 0));
    const main = scheduleRequestContext().key;
    const protectedEntry = entries.find(e => e.key === main);
    const retained = entries.filter(e => e.key !== main).slice(0,SCHEDULE_CACHE_LIMIT-(protectedEntry ? 1 : 0));
    if (protectedEntry) retained.unshift(protectedEntry);
    scheduleEntries = retained;
    // Access order and temporary network failures stay in memory. Persist only
    // source changes, not every conditional check of the same cycle.
    if (changed) persistScheduleEntries();
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
    if (!meta?.updated_at) return 'Час перевірки невідомий';
    const checked=new Date(meta.updated_at);
    if (!Number.isFinite(checked.getTime())) return 'Час перевірки невідомий';
    const oldYear=+new Intl.DateTimeFormat('en',{timeZone:'Europe/Kyiv',year:'numeric'}).format(checked) !== getKyivNow().getFullYear();
    const date = checked.toLocaleDateString('uk-UA',{timeZone:'Europe/Kyiv',day:'numeric',month:'long',...(oldYear?{year:'numeric'}:{})});
    const time = checked.toLocaleTimeString('uk-UA',{timeZone:'Europe/Kyiv',hour:'2-digit',minute:'2-digit'});
    return `Перевірено ${date} о ${time}`;
}
function staleScheduleNotice(meta) { return meta?.stale ? 'Дані можуть бути застарілими.' : ''; }
function materializeSchedule(entry, week, group, now = getKyivNow()) {
    const offline = entry.offline || navigator.onLine === false;
    const manual = ['1','2','3','4'].includes(week);
    const automaticMonday = defaultMonday(entry,group,now);
    const viewKey = `${week}|${dateKey(now)}|${dateKey(automaticMonday)}`;
    let views = scheduleViews.get(entry.cycle);
    if (!views) { views = new Map(); scheduleViews.set(entry.cycle,views); }
    const cached = views.get(viewKey);
    if (cached) return {...entry,...cached,notice:scheduleNotice(entry,offline),group};
    const monday = week === 'auto' ? automaticMonday : calendarMonday(now);
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
    const view = {data,today:scheduleOnDate(entry,now,group),nextDay,
        calendar:{monday:manual ? null : target,default_monday:dateKey(automaticMonday),cycle,label:manual ? 'Перегляд циклу' : target === current ? 'Поточний тиждень' : 'Наступний тиждень'}};
    if (views.size >= 14) views.clear();
    views.set(viewKey,view);
    return {...entry,...view,notice:scheduleNotice(entry,offline),group};
}
function scheduleNotice(entry,offline) {
    return `${offline ? 'Немає зв’язку. Офлайн-копія. ' : ''}${staleScheduleNotice(entry.meta)}`;
}
function fetchSchedule(week = 'auto', group = null, event = 'refresh') {
    const context = scheduleRequestContext(week,group);
    if (event !== 'refresh') recordScheduleAction(event,context.group);
    const requestKey = context.key;
    if (!scheduleRequests.has(requestKey)) {
        scheduleRequests.set(requestKey,loadScheduleResponse(context).finally(() => scheduleRequests.delete(requestKey)));
    }
    return scheduleRequests.get(requestKey).then(entry => {
        if (entry?.cycle) return materializeSchedule(entry,week,context.group);
        // A shared failed request still needs the caller's exact legacy week.
        return entry.legacyFallback ? getCachedSchedule(week,context.group) || entry : entry;
    });
}
async function loadScheduleResponse(context) {
    const {key,group,duration1,duration2} = context;
    const cached = cachedScheduleForKey(key);
    const query = new URLSearchParams({group,duration1,duration2,uid:getUserId(),mode:currentDisplayMode(),event:'refresh'});
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
            const cycle = cached?.cycle && JSON.stringify(cached.cycle) === JSON.stringify(result.cycle) ? cached.cycle : result.cycle;
            entry = {key,cycle,meta:result.meta,etag:response.headers.get('ETag'),savedAt:Date.now()};
        }
        entry.offline=false;
        entry.usedAt=Date.now();
        saveScheduleEntry(entry);
        return entry;
    } catch (error) {
        if (error.status === 404 || error.status === 422) {
            scheduleEntries = readScheduleEntries().filter(entry => entry.key !== key);
            persistScheduleEntries();
        }
        if (error.status !== 404 && error.status !== 422 && cached?.cycle) {
            const entry = {...cached,offline:true,usedAt:Date.now(),meta:{...cached.meta,stale:true}};
            saveScheduleEntry(entry);
            return entry;
        }
        return {data:null,legacyFallback:error.status !== 404 && error.status !== 422,
            notice:error.status === 404 ? error.message : 'Не вдалося завантажити розклад. Перевірте з’єднання й спробуйте ще раз.'};
    } finally { clearTimeout(timeout); }
}

function recordScheduleAction(event,group = scheduleRequestContext().group) {
    // Offline actions were never delivered before. Do not create a durable
    // tracking queue or retry an ambiguous acknowledgement and double count it.
    if (navigator.onLine === false) return;
    fetch('/api/activity', {method:'POST',cache:'no-store',keepalive:true,
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({uid:getUserId(),group,mode:currentDisplayMode(),event})
    }).then(response => {
        if (!response.ok) console.warn('Activity was not recorded:',response.status);
    }).catch(error => console.warn('Activity delivery failed:',error.name));
}
