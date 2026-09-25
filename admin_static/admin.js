/* MyKep Admin panel.
   XSS policy: all dynamic text goes through textContent / createTextNode.
   innerHTML/insertAdjacentHTML/eval are never used; Trusted Types (CSP)
   makes any accidental HTML sink throw in Chromium. */
(() => {
    'use strict';
    const C = window.MyKepCharts;
    const REFRESH_MS = { overview: 30000, server: 15000, stats: 120000, security: 60000 };
    const TITLES = { overview: 'Огляд', stats: 'Статистика', server: 'Сервер', security: 'Безпека' };
    const RANGE_LABELS = [['1', 'Сьогодні'], ['7', '7 днів'], ['14', '14 днів'], ['30', '30 днів'], ['90', '90 днів'], ['all', 'Весь час']];
    const state = { config: null, me: null, csrf: null, view: 'overview', range: '14', timer: null, loading: false,
        groupQuery: '', groupSort: 'views', groupsExpanded: false, dailyMetric: 'both', codeTimer: null, lastData: {} };
    const $ = id => document.getElementById(id);
    const nf = new Intl.NumberFormat('uk-UA');
    const nf1 = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 1 });
    const MONTHS = ['січ', 'лют', 'бер', 'квіт', 'трав', 'черв', 'лип', 'серп', 'вер', 'жовт', 'лист', 'груд'];

    /* ------------------------------------------------------------ helpers */
    const SAFE_PROPS = new Set(['type', 'title', 'placeholder', 'value', 'disabled', 'hidden', 'id', 'name', 'maxLength', 'checked']);
    function h(tag, props = {}, children = []) {
        const node = document.createElement(tag);
        for (const [key, value] of Object.entries(props || {})) {
            if (value === undefined || value === null || value === false) continue;
            if (key === 'class') node.className = value;
            else if (key === 'text') node.textContent = String(value);
            else if (key === 'on') for (const [ev, fn] of Object.entries(value)) node.addEventListener(ev, fn);
            else if (key === 'data') for (const [k, v] of Object.entries(value)) node.dataset[k] = String(v);
            else if (key === 'aria') for (const [k, v] of Object.entries(value)) node.setAttribute('aria-' + k, String(v));
            else if (SAFE_PROPS.has(key)) node[key] = value;
            else if (key === 'role' || key === 'for' || key === 'inputmode' || key === 'autocomplete') node.setAttribute(key, String(value));
            else throw new Error('Unsafe prop: ' + key);
        }
        for (const child of [].concat(children)) {
            if (child === null || child === undefined || child === false) continue;
            node.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
        }
        return node;
    }
    const fmt = v => (v === null || v === undefined || Number.isNaN(v)) ? '—' : (Number.isInteger(v) ? nf.format(v) : nf1.format(v));
    const pct = v => (v === null || v === undefined) ? '—' : nf1.format(v) + '%';
    const hh = hour => String(hour).padStart(2, '0') + ':00';
    function fmtBytes(b) {
        if (b === null || b === undefined) return '—';
        const units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];
        let i = 0, v = b;
        while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
        return nf1.format(v) + ' ' + units[i];
    }
    function fmtDuration(sec) {
        if (sec === null || sec === undefined) return '—';
        const d = Math.floor(sec / 86400), hrs = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60);
        if (d) return `${d} д ${hrs} год`;
        if (hrs) return `${hrs} год ${m} хв`;
        if (m) return `${m} хв`;
        return `${Math.max(0, Math.round(sec))} с`;
    }
    function fmtDate(iso) {
        if (!iso) return '—';
        const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
        return `${d} ${MONTHS[m - 1]}`;
    }
    function fmtDateTime(iso) {
        if (!iso) return '—';
        const date = new Date(iso);
        if (Number.isNaN(date.getTime())) return '—';
        return date.toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    }
    function fmtAgo(iso) {
        if (!iso) return '—';
        const sec = (Date.now() - new Date(iso).getTime()) / 1000;
        if (!Number.isFinite(sec)) return '—';
        if (sec < 60) return 'щойно';
        return fmtDuration(sec) + ' тому';
    }
    function toast(message, kind = 'ok') {
        const t = $('toast');
        t.textContent = message;
        t.className = 'toast toast-' + kind;
        t.hidden = false;
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => { t.hidden = true; }, 3800);
    }

    /* ---------------------------------------------------------------- API */
    class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
    async function api(path, { method = 'GET', body } = {}) {
        const headers = { Accept: 'application/json' };
        if (method !== 'GET') {
            headers['Content-Type'] = 'application/json';
            if (state.csrf) headers['X-CSRF-Token'] = state.csrf;
        }
        let response;
        try {
            response = await fetch('/api/admin' + path, { method, headers, credentials: 'same-origin', cache: 'no-store',
                redirect: 'error', referrerPolicy: 'no-referrer', body: body === undefined ? undefined : JSON.stringify(body) });
        } catch (_) {
            $('offline-banner') && ($('offline-banner').hidden = false);
            throw new ApiError(0, "Немає з'єднання з сервером.");
        }
        if ($('offline-banner')) $('offline-banner').hidden = true;
        let json = null;
        try { json = await response.json(); } catch (_) { /* non-JSON */ }
        if (response.status === 401 && !path.startsWith('/auth') && path !== '/me') {
            showLogin('Сесія завершилась. Увійдіть знову.');
            throw new ApiError(401, 'Потрібен вхід.');
        }
        if (!response.ok || !json || json.status !== 'success') {
            throw new ApiError(response.status, (json && typeof json.message === 'string' && json.message) || `Помилка ${response.status}`);
        }
        return json.data;
    }

    /* ------------------------------------------------------ service worker */
    let ttPolicy = null;
    try {
        if (window.trustedTypes && window.trustedTypes.createPolicy) {
            ttPolicy = window.trustedTypes.createPolicy('mykep-admin', {
                createScriptURL: url => { if (url === '/admin/sw.js') return url; throw new TypeError('Blocked script URL'); }
            });
        }
    } catch (_) { ttPolicy = null; }
    function registerSW() {
        if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
        const url = ttPolicy ? ttPolicy.createScriptURL('/admin/sw.js') : '/admin/sw.js';
        navigator.serviceWorker.register(url, { scope: '/admin/' }).catch(() => {});
    }

    /* -------------------------------------------------------------- login */
    function base64ToText(b64) {
        let s = b64.replace(/-/g, '+').replace(/_/g, '/');
        while (s.length % 4) s += '=';
        const bin = atob(s);
        const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
        return new TextDecoder().decode(bytes);
    }
    // Telegram returns auth data either in #tgAuthResult=<base64 JSON> or as query params.
    function extractTelegramAuth() {
        let payload = null;
        const hashMatch = location.hash.match(/tgAuthResult=([A-Za-z0-9\-_=+/%]+)/);
        if (hashMatch) {
            try {
                const parsed = JSON.parse(base64ToText(decodeURIComponent(hashMatch[1])));
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) payload = parsed;
            } catch (_) { payload = null; }
        } else {
            const params = new URLSearchParams(location.search);
            if (params.has('hash') && params.has('id') && params.has('auth_date')) {
                payload = {};
                for (const [k, v] of params) if (/^[a-z_]{1,32}$/.test(k)) payload[k] = v;
            }
        }
        if (hashMatch || location.search) history.replaceState(null, '', '/admin/');
        return payload;
    }
    function isIOSStandalone() {
        const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        return ios && (navigator.standalone === true || matchMedia('(display-mode: standalone)').matches);
    }
    function loginError(message) {
        const e = $('login-error');
        e.textContent = message || '';
        e.hidden = !message;
    }
    function showLogin(message) {
        stopTimer();
        state.me = null; state.csrf = null;
        $('boot').hidden = true;
        $('app').hidden = true;
        $('login').hidden = false;
        const cfg = state.config || {};
        const tg = $('tg-login');
        if (cfg.telegram_login && Number.isInteger(cfg.bot_id)) {
            const params = new URLSearchParams({ bot_id: String(cfg.bot_id), origin: location.origin, embed: '0',
                return_to: location.origin + '/admin/' });
            tg.href = 'https://oauth.telegram.org/auth?' + params.toString();
            tg.hidden = false;
            $('tg-missing').hidden = true;
        } else {
            tg.hidden = true;
            $('tg-missing').hidden = !!cfg.dev_login;
        }
        if (isIOSStandalone()) { $('ios-hint').hidden = false; $('code-box').open = true; }
        const devBox = $('dev-box');
        devBox.hidden = !cfg.dev_login;
        if (cfg.dev_login) {
            $('dev-buttons').replaceChildren(...(cfg.dev_admin_ids || []).map(id => h('button', {
                type: 'button', class: 'btn btn-ghost', text: `Увійти як ${id}`, on: { click: () => devLogin(id) } })));
        }
        loginError(message);
    }
    async function devLogin(id) {
        try { await api('/auth/dev', { method: 'POST', body: { user_id: id } }); await enterApp(); }
        catch (e) { loginError(e.message); }
    }
    $('code-form').addEventListener('submit', async ev => {
        ev.preventDefault();
        const input = $('code-input');
        const code = input.value.trim();
        if (!code) return;
        const btn = ev.target.querySelector('button');
        btn.disabled = true;
        try {
            await api('/auth/code', { method: 'POST', body: { code } });
            input.value = '';
            await enterApp();
        } catch (e) { loginError(e.message); }
        finally { btn.disabled = false; }
    });
    $('code-input').addEventListener('input', ev => {
        const raw = ev.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
        ev.target.value = raw.length > 4 ? raw.slice(0, 4) + '-' + raw.slice(4) : raw;
    });

    async function enterApp() {
        try {
            const me = await api('/me');
            state.me = me; state.csrf = me.csrf;
        } catch (e) {
            if (e.status === 401) return showLogin();
            $('boot').hidden = true;
            return showLogin(e.message);
        }
        $('boot').hidden = true;
        $('login').hidden = true;
        $('app').hidden = false;
        renderSideUser();
        const fromHash = location.hash.replace('#/', '');
        setView(TITLES[fromHash] ? fromHash : 'overview');
    }

    function renderSideUser() {
        const u = state.me.user;
        const initials = (u.name || '?').split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase();
        $('side-user').replaceChildren(
            h('div', { class: 'avatar', text: initials }),
            h('div', { class: 'side-user-info' }, [h('b', { text: u.name }), h('span', { text: u.username ? '@' + u.username : 'ID ' + u.id })]),
            h('button', { type: 'button', class: 'icon-btn small', title: 'Вийти', aria: { label: 'Вийти' }, on: { click: logout } }, [iconLogout()])
        );
    }
    function iconLogout() {
        const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        s.setAttribute('viewBox', '0 0 24 24');
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5m5 5H9');
        s.appendChild(p);
        return s;
    }
    async function logout() {
        if (!confirm('Вийти з адмін-панелі на цьому пристрої?')) return;
        try { await api('/logout', { method: 'POST', body: {} }); } catch (_) { /* ignore */ }
        showLogin();
    }

    /* ------------------------------------------------------------ routing */
    document.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.view)));
    $('refresh-btn').addEventListener('click', () => load(true));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.me) load(false); });

    function setView(view) {
        state.view = view;
        history.replaceState(null, '', '/admin/#/' + view);
        document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
        document.querySelectorAll('.page').forEach(p => { p.hidden = p.dataset.page !== view; });
        $('page-title').textContent = TITLES[view];
        window.scrollTo({ top: 0 });
        load(true);
    }
    function stopTimer() { clearTimeout(state.timer); state.timer = null; }
    function schedule() {
        stopTimer();
        state.timer = setTimeout(() => {
            const focused = document.activeElement && document.activeElement.tagName === 'INPUT';
            if (document.visibilityState === 'visible' && !focused) load(false); else schedule();
        }, REFRESH_MS[state.view]);
    }
    async function load(showSpinner) {
        if (!state.me) return;
        const view = state.view;
        const page = $('page-' + view);
        if (showSpinner && !page.childElementCount) page.replaceChildren(skeleton());
        $('refresh-btn').classList.add('spinning');
        try {
            if (view === 'overview') renderOverview(await api('/overview'));
            else if (view === 'stats') renderStats(await api('/stats?range=' + encodeURIComponent(state.range)));
            else if (view === 'server') renderServer(await api('/server'));
            else if (view === 'security') renderSecurity(await Promise.all([api('/sessions'), api('/audit?limit=150'), api('/server')]));
            $('updated-at').textContent = 'Оновлено ' + new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        } catch (e) {
            if (e.status !== 401) {
                if (!page.childElementCount || page.querySelector('.skeleton')) page.replaceChildren(errorBox(e.message));
                else toast(e.message, 'error');
            }
        } finally {
            $('refresh-btn').classList.remove('spinning');
            if (state.me && state.view === view) schedule();
        }
    }
    function skeleton() {
        return h('div', { class: 'skeleton' }, [h('div', { class: 'sk sk-wide' }), h('div', { class: 'sk-grid' },
            [1, 2, 3, 4].map(() => h('div', { class: 'sk' }))), h('div', { class: 'sk sk-tall' })]);
    }
    function errorBox(message) {
        return h('div', { class: 'card error-card' }, [h('b', { text: 'Не вдалося завантажити дані' }), h('p', { text: message }),
            h('button', { type: 'button', class: 'btn', text: 'Спробувати ще раз', on: { click: () => load(true) } })]);
    }

    /* ------------------------------------------------------ UI components */
    function card(title, body, opts = {}) {
        return h('article', { class: 'card' + (opts.span ? ' span-' + opts.span : '') + (opts.class ? ' ' + opts.class : '') }, [
            (title || opts.actions) && h('header', { class: 'card-head' }, [
                h('div', {}, [title && h('h2', { text: title }), opts.sub && h('p', { class: 'card-sub', text: opts.sub })]),
                opts.actions && h('div', { class: 'card-actions' }, opts.actions)
            ]),
            ...[].concat(body)
        ]);
    }
    function kpi(label, value, opts = {}) {
        const spark = opts.spark ? h('div', { class: 'kpi-spark' }) : null;
        if (spark) C.sparkline(spark, opts.spark, opts.color || '#ff5500');
        let delta = null;
        if (opts.delta !== undefined && opts.delta !== null) {
            const up = opts.delta >= 0;
            delta = h('span', { class: 'delta ' + (up ? 'up' : 'down'), text: (up ? '▲ ' : '▼ ') + nf1.format(Math.abs(opts.delta)) + '%' });
        }
        return h('div', { class: 'kpi' + (opts.accent ? ' kpi-accent' : '') }, [
            h('div', { class: 'kpi-label' }, [opts.live && h('i', { class: 'live-dot' }), label]),
            h('div', { class: 'kpi-value' }, [h('span', { text: value }), delta]),
            opts.hint && h('div', { class: 'kpi-hint', text: opts.hint }),
            spark
        ]);
    }
    function chartBox(cls = '') { return h('div', { class: 'chart-box ' + cls }); }
    function after(fn) { requestAnimationFrame(() => requestAnimationFrame(fn)); }
    function statusBanner(health) {
        const texts = { ok: 'Усі системи працюють нормально', warning: 'Є попередження', critical: 'Критична проблема' };
        return h('div', { class: 'status-banner s-' + health.status }, [
            h('div', { class: 'status-main' }, [h('i', { class: 'status-dot' }), h('div', {}, [
                h('b', { text: texts[health.status] || health.status }),
                h('span', { class: 'muted small', text: `Аптайм ${fmtDuration(health.uptime_seconds)} · v${health.version} · ${fmt(health.rpm)} запит/хв · p95 ${health.p95_ms === null ? '—' : fmt(health.p95_ms) + ' мс'}` })
            ])]),
            h('div', { class: 'checks' }, health.checks.map(c => h('span', { class: 'check c-' + c.level, title: c.detail }, [
                h('i'), h('b', { text: c.label }), h('span', { text: c.detail })])))
        ]);
    }
    function updateStatusPill(health) {
        const pill = $('status-pill');
        const texts = { ok: 'Онлайн', warning: 'Увага', critical: 'Проблема' };
        pill.className = 'status-pill s-' + health.status;
        pill.replaceChildren(h('i'), document.createTextNode(texts[health.status] || ''));
        pill.hidden = false;
    }

    /* ----------------------------------------------------------- overview */
    function renderOverview(d) {
        state.lastData.overview = d;
        updateStatusPill(d.health);
        const page = $('page-overview');
        const hoursNow = new Date(d.now).getHours();
        const todayHours = d.hours_today.slice(0, hoursNow + 1);
        const todayVsYday = chartBox();
        const lastHour = chartBox();
        const days14 = chartBox();
        const gauge = h('div', { class: 'gauge-box' });
        const topGroups = h('div');
        const liveGroups = h('div');
        const a = d.audience;
        page.replaceChildren(
            statusBanner(d.health),
            h('div', { class: 'kpi-grid' }, [
                kpi('Онлайн зараз', fmt(d.live.users_5m), { live: true, accent: true, hint: `15 хв: ${fmt(d.live.users_15m)} · 1 год: ${fmt(d.live.users_60m)}` }),
                kpi('Переглядів сьогодні', fmt(d.today.views), { delta: d.delta_views_same_time_pct,
                    hint: `вчора на цей час: ${fmt(d.yesterday.views_same_time)}`, spark: d.daily_14.map(x => x.views) }),
                kpi('Користувачів сьогодні', fmt(d.today.users), { hint: `вчора: ${fmt(d.yesterday.users)} · ${fmt(d.today.views_per_user)} перегл./люд.`,
                    spark: d.daily_14.map(x => x.users), color: '#ffb020' }),
                kpi('Нових сьогодні', fmt(d.today.new_users), { hint: d.today.peak_hour !== null ? `пік сьогодні: ${hh(d.today.peak_hour)}` : 'ще немає переглядів' }),
                kpi('За 7 днів (WAU)', fmt(a.wau), { hint: 'унікальних користувачів' }),
                kpi('За 30 днів (MAU)', fmt(a.mau), { hint: `залученість DAU/MAU: ${pct(a.stickiness_pct)}` }),
                kpi('Всього користувачів', fmt(a.total), { hint: d.all_time.since ? `з ${fmtDate(d.all_time.since)}` : '' }),
                kpi('Всього переглядів', fmt(d.all_time.views), { hint: 'розкладу за весь час' })
            ]),
            h('div', { class: 'grid' }, [
                card('Сьогодні vs вчора', todayVsYday, { span: 2, sub: 'Перегляди розкладу по годинах' }),
                card('Охоплення коледжу', [gauge, h('p', { class: 'center muted small', text:
                    `${fmt(a.mau)} з ~${fmt(a.college_size)} студентів за 30 днів` }), h('p', { class: 'center muted small', text:
                    `За тиждень: ${pct(a.college_size ? Math.round(a.wau / a.college_size * 1000) / 10 : null)}` })], { sub: 'MAU / кількість студентів' }),
                card('Останні 60 хвилин', lastHour, { span: 2, sub: 'Перегляди щохвилини' }),
                card('Активні групи (1 год)', liveGroups),
                card('14 днів', days14, { span: 2, sub: 'Перегляди та унікальні користувачі' }),
                card('Топ груп сьогодні', topGroups)
            ])
        );
        after(() => {
            C.line(todayVsYday, { labels: d.hours_today.map((_, i) => hh(i)), height: 230, aria: 'Сьогодні проти вчора',
                series: [{ name: 'Вчора', values: d.hours_yesterday, color: '#8a7d75', dashed: true, area: false },
                    { name: 'Сьогодні', values: todayHours, color: '#ff5500' }] });
            C.bars(lastHour, { labels: d.last_60_minutes.map(x => x.time), values: d.last_60_minutes.map(x => x.views), height: 170, name: 'Переглядів' });
            C.line(days14, { labels: d.daily_14.map(x => fmtDate(x.date)), height: 220,
                series: [{ name: 'Перегляди', values: d.daily_14.map(x => x.views), color: '#ff5500' },
                    { name: 'Користувачі', values: d.daily_14.map(x => x.users), color: '#ffb020' }] });
            C.gauge(gauge, { value: a.reach_pct || 0 });
            C.hbars(topGroups, { items: d.top_groups_today.map(g => ({ label: g.group, value: g.views, sub: `${fmt(g.users)} користувачів` })) });
            C.hbars(liveGroups, { color: '#2dd4bf', items: d.live.groups_60m.map(g => ({ label: g.group, value: g.views })) });
        });
    }

    /* -------------------------------------------------------------- stats */
    function rangeControl() {
        return h('div', { class: 'segmented', role: 'tablist' }, RANGE_LABELS.map(([key, label]) => h('button', {
            type: 'button', class: state.range === key ? 'active' : '', text: label, role: 'tab', aria: { selected: state.range === key },
            on: { click: () => { state.range = key; load(true); } } })));
    }
    function renderStats(d) {
        state.lastData.stats = d;
        const page = $('page-stats');
        const t = d.totals, r = d.retention, p = d.peaks;
        const single = d.days === 1;
        const main = chartBox(), newRet = chartBox(), growth = chartBox(), hours = chartBox(), profile = chartBox();
        const heat = chartBox(), weekdays = chartBox(), slotsDonut = h('div'), slotBars = h('div');
        const specs = h('div'), courses = h('div'), plat = h('div'), brow = h('div'), modes = h('div'), freq = chartBox();
        const groupsBox = h('div');
        const peakHourText = p.hour !== null ? `${hh(p.hour)}–${hh((p.hour + 1) % 24)}` : '—';
        const slotSum = d.slots.summary;
        page.replaceChildren(
            h('div', { class: 'toolbar' }, [rangeControl(), h('div', { class: 'toolbar-actions' }, [
                h('a', { class: 'btn btn-ghost small', text: '⬇ CSV по днях', on: { click: ev => download(ev, 'daily') } }),
                h('a', { class: 'btn btn-ghost small', text: '⬇ CSV по групах', on: { click: ev => download(ev, 'groups') } })])]),
            h('p', { class: 'muted small range-note', text: `${fmtDate(d.start)} — ${fmtDate(d.end)} · ${d.days} дн.` }),
            h('div', { class: 'kpi-grid' }, [
                kpi('Переглядів', fmt(t.views), { accent: true, hint: `≈ ${fmt(t.avg_daily_views)} на день` }),
                kpi('Унікальних користувачів', fmt(t.users), { hint: `сер. DAU: ${fmt(t.avg_dau)}` }),
                kpi('Нових користувачів', fmt(t.new_users), { hint: 'вперше за весь час' }),
                kpi('Переглядів на людину', fmt(t.views_per_user), { hint: `сер. активних днів: ${fmt(r.avg_active_days)}` }),
                kpi('Пікова година', peakHourText, { hint: `пік 15 хв: ${p.quarter || '—'}` }),
                kpi('Найактивніший день', p.weekday || '—', { hint: p.best_day ? `рекорд: ${fmt(p.best_day.views)} (${fmtDate(p.best_day.date)})` : '' }),
                kpi('Повертаються', pct(r.returning_pct), { hint: 'заходили ≥ 2 днів' }),
                kpi('Retention D1 / D7', `${pct(r.d1_pct)} / ${pct(r.d7_pct)}`, { hint: `когорти: ${fmt(r.d1_base)} / ${fmt(r.d7_base)} люд.` })
            ]),
            h('div', { class: 'grid' }, [
                card(single ? 'Перегляди по годинах' : 'Перегляди та користувачі по днях', main, { span: 3,
                    actions: single ? null : [metricToggle()] }),
                card('Коли найбільше дивляться', hours, { span: 2, sub: single ? 'Перегляди по годинах' : `Середня кількість переглядів за годину · пік ${peakHourText}` }),
                card('Пари чи перерви?', [slotsDonut], { sub: 'За стандартним розкладом дзвінків' }),
                card('Профіль дня (кожні 15 хв)', profile, { span: 3, sub: 'Підсвічено час пар (1-ша зміна 80 хв, 2-га — 60 хв)' }),
                card('Тиждень × година', heat, { span: 2, sub: 'Теплова карта переглядів' }),
                card('По днях тижня', weekdays, { sub: 'Середня кількість переглядів за день' }),
                card('Перегляди по парах', slotBars, { sub: `Під час пар ${fmt(slotSum.lessons)} · перерви ${fmt(slotSum.breaks)} · поза парами ${fmt(slotSum.outside)}` }),
                !single && card('Нові та повторні користувачі', newRet, { span: 2 }),
                !single && card('Ріст аудиторії', growth, { span: 2, sub: 'Кумулятивна кількість користувачів' }),
                card('Частота відвідувань', freq, { sub: 'Скільки різних днів заходили за період' }),
                card('Групи', groupsBox, { span: 3, sub: `${d.groups.length} груп з переглядами` }),
                card('Спеціальності', specs, { sub: 'За префіксом групи' }),
                card('Курси', courses, { sub: 'За роком вступу в назві групи' }),
                card('Режим запуску', modes, { sub: 'PWA з головного екрана чи браузер' }),
                card('Платформи', plat, { sub: 'Унікальні користувачі' }),
                card('Браузери', brow, { sub: 'Унікальні користувачі' })
            ])
        );
        after(() => {
            if (single) {
                C.bars(main, { labels: d.hours_total.map((_, i) => hh(i)), values: d.hours_total, height: 250, highlightMax: true, name: 'Переглядів' });
            } else {
                const labels = d.daily.map(x => fmtDate(x.date));
                const titles = d.daily.map(x => `${x.weekday}, ${fmtDate(x.date)}`);
                const series = [];
                if (state.dailyMetric !== 'users') series.push({ name: 'Перегляди', values: d.daily.map(x => x.views), color: '#ff5500' });
                if (state.dailyMetric !== 'views') series.push({ name: 'Користувачі', values: d.daily.map(x => x.users), color: '#ffb020' });
                C.line(main, { labels, titles, series, height: 260 });
                C.bars(newRet, { labels, titles, height: 220, series: [
                    { name: 'Повторні', values: d.daily.map(x => x.returning_users), color: '#ff5500' },
                    { name: 'Нові', values: d.daily.map(x => x.new_users), color: '#2dd4bf' }] });
                C.line(growth, { labels, titles, height: 220, series: [{ name: 'Всього користувачів', values: d.daily.map(x => x.total_users), color: '#a78bfa' }] });
            }
            C.bars(hours, { labels: d.hours_avg.map((_, i) => String(i).padStart(2, '0')), titles: d.hours_avg.map((_, i) => `${hh(i)}–${hh((i + 1) % 24)}`),
                values: single ? d.hours_total : d.hours_avg, highlightMax: true, height: 220, name: single ? 'Переглядів' : 'Сер. переглядів' });
            const from = 24, to = 92; // 06:00–23:00
            const q = d.quarter_hours_avg.slice(from, to);
            const qLabels = q.map((_, i) => { const m = (from + i) * 15; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; });
            const toIdx = hm => { const [a, b] = hm.split(':').map(Number); return (a * 60 + b) / 15 - from; };
            C.line(profile, { labels: qLabels, height: 240, series: [{ name: single ? 'Переглядів' : 'Сер. переглядів', values: single ? d.quarter_hours_avg.slice(from, to) : q, color: '#ff5500' }],
                bands: d.slots.bells.map(b => ({ from: toIdx(b.start), to: toIdx(b.end), label: String(b.lesson) })) });
            C.heatmap(heat, { rows: d.weekdays, matrix: d.heatmap });
            C.bars(weekdays, { labels: d.weekdays, values: d.weekday_avg, height: 200, highlightMax: true, color: '#ffb020', name: 'Сер. переглядів' });
            C.donut(slotsDonut, { unit: 'переглядів', items: [
                { label: 'Під час пар', value: slotSum.lessons, color: '#ff5500' },
                { label: 'На перервах', value: slotSum.breaks, color: '#2dd4bf' },
                { label: 'Поза парами', value: slotSum.outside, color: '#60a5fa' }] });
            C.hbars(slotBars, { items: d.slots.items.map(s => ({ label: s.label, value: s.views, suffix: ` · ${nf1.format(s.percent)}%`,
                color: s.key === 'break' ? '#2dd4bf' : s.key.startsWith('lesson') ? '#ff5500' : '#60a5fa' })) });
            C.bars(freq, { labels: r.frequency.map(f => String(f.days)), titles: r.frequency.map(f => `${f.days} дн.`), values: r.frequency.map(f => f.users), height: 190, color: '#a78bfa', name: 'Користувачів' });
            C.hbars(specs, { items: d.specialties.map(s => ({ label: s.name, value: s.users, suffix: ' люд.', sub: `${fmt(s.views)} переглядів` })) });
            C.hbars(courses, { color: '#ffb020', items: d.courses.map(c => ({ label: c.label, value: c.users, suffix: ' люд.', sub: `вступ ${c.year} · ${fmt(c.views)} переглядів` })) });
            const modeNames = { standalone: 'PWA (головний екран)', browser: 'Браузер', unknown: 'Невідомо (старі дані)' };
            const modeColors = { standalone: '#ff5500', browser: '#60a5fa', unknown: '#4b403a' };
            C.donut(modes, { unit: 'людей', items: d.display_modes.map(m => ({ label: modeNames[m.name] || m.name, value: m.users, color: modeColors[m.name] })) });
            C.donut(plat, { unit: 'людей', items: d.platforms.map(x => ({ label: x.name, value: x.users })) });
            C.donut(brow, { unit: 'людей', items: d.browsers.map(x => ({ label: x.name, value: x.users })) });
            renderGroups(groupsBox, d.groups);
        });
    }
    function metricToggle() {
        const opts = [['both', 'Обидва'], ['views', 'Перегляди'], ['users', 'Люди']];
        return h('div', { class: 'segmented small' }, opts.map(([k, label]) => h('button', { type: 'button', class: state.dailyMetric === k ? 'active' : '', text: label,
            on: { click: () => { state.dailyMetric = k; renderStats(state.lastData.stats); } } })));
    }
    function renderGroups(box, groups) {
        const input = h('input', { type: 'search', placeholder: 'Пошук групи…', value: state.groupQuery, aria: { label: 'Пошук групи' } });
        const sort = h('select', { aria: { label: 'Сортування' } }, [['views', 'За переглядами'], ['users', 'За користувачами'], ['name', 'За назвою']]
            .map(([v, t]) => { const o = h('option', { value: v, text: t }); o.selected = state.groupSort === v; return o; }));
        const list = h('div', { class: 'group-table' });
        const more = h('button', { type: 'button', class: 'btn btn-ghost small' });
        const maxViews = Math.max(1, ...groups.map(g => g.views));
        const draw = () => {
            const q = state.groupQuery.trim().toUpperCase();
            let rows = groups.filter(g => !q || g.group.toUpperCase().includes(q));
            if (state.groupSort === 'users') rows = rows.slice().sort((a, b) => b.users - a.users);
            else if (state.groupSort === 'name') rows = rows.slice().sort((a, b) => a.group.localeCompare(b.group, 'uk'));
            const shown = state.groupsExpanded || q ? rows : rows.slice(0, 15);
            list.replaceChildren(h('div', { class: 'gt-row gt-head' }, [h('span', { text: '#' }), h('span', { text: 'Група' }), h('span', { text: 'Перегляди' }), h('span', { text: 'Люди' })]),
                ...shown.map((g, i) => {
                    const bar = h('div', { class: 'gt-bar' }); bar.style.width = Math.max(2, g.views / maxViews * 100) + '%';
                    return h('div', { class: 'gt-row' }, [h('span', { class: 'muted', text: i + 1 }), h('b', { text: g.group }),
                        h('span', { class: 'gt-views' }, [h('div', { class: 'gt-track' }, [bar]), h('span', { text: fmt(g.views) })]), h('span', { text: fmt(g.users) })]);
                }));
            if (!shown.length) list.appendChild(h('p', { class: 'muted', text: 'Нічого не знайдено' }));
            more.hidden = !!q || rows.length <= 15;
            more.textContent = state.groupsExpanded ? 'Згорнути' : `Показати всі (${rows.length})`;
        };
        input.addEventListener('input', () => { state.groupQuery = input.value.slice(0, 40); draw(); });
        sort.addEventListener('change', () => { state.groupSort = sort.value; draw(); });
        more.addEventListener('click', () => { state.groupsExpanded = !state.groupsExpanded; draw(); });
        box.replaceChildren(h('div', { class: 'group-tools' }, [input, sort]), list, more);
        draw();
    }
    async function download(ev, kind) {
        ev.preventDefault();
        try {
            const res = await fetch(`/api/admin/export/${kind}.csv`, { credentials: 'same-origin', cache: 'no-store' });
            if (!res.ok) throw new Error('Помилка експорту');
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `mykep-${kind}.csv`;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 2000);
        } catch (e) { toast(e.message, 'error'); }
    }

    /* ------------------------------------------------------------- server */
    function meter(label, value, percent, hint) {
        const fill = h('div', { class: 'meter-fill' + (percent > 90 ? ' crit' : percent > 75 ? ' warn' : '') });
        fill.style.width = Math.max(0, Math.min(100, percent || 0)) + '%';
        return h('div', { class: 'tile' }, [h('div', { class: 'tile-label', text: label }), h('div', { class: 'tile-value', text: value }),
            h('div', { class: 'meter' }, [fill]), hint && h('div', { class: 'tile-hint', text: hint })]);
    }
    function tile(label, value, hint, level) {
        return h('div', { class: 'tile' + (level ? ' t-' + level : '') }, [h('div', { class: 'tile-label', text: label }),
            h('div', { class: 'tile-value', text: value }), hint && h('div', { class: 'tile-hint', text: hint })]);
    }
    function kv(rows) {
        return h('dl', { class: 'kv' }, rows.filter(Boolean).flatMap(([k, v, level]) => [h('dt', { text: k }), h('dd', { class: level ? 'lv-' + level : '', text: v })]));
    }
    function renderServer(d) {
        state.lastData.server = d;
        updateStatusPill(d.health);
        const s = d.system, rq = d.requests, sc = d.schedule, w = d.analytics_writer;
        const reqChart = chartBox(), latChart = chartBox();
        const load = s.load_avg ? s.load_avg.map(x => nf1.format(x)).join(' · ') : '—';
        const loadPct = s.load_avg && s.cpu_count ? s.load_avg[0] / s.cpu_count * 100 : 0;
        const refreshBtn = h('button', { type: 'button', class: 'btn', text: 'Оновити розклад зараз', on: { click: ev => refreshSchedule(ev.currentTarget) } });
        $('page-server').replaceChildren(
            statusBanner(d.health),
            h('div', { class: 'tile-grid' }, [
                tile('Аптайм', fmtDuration(s.uptime_seconds), `з ${fmtDateTime(s.started_at)}`),
                tile('Запитів / хв', fmt(rq.last5.rpm), `за 5 хв: ${fmt(rq.last5.requests)} (API ${fmt(rq.last5.api)})`),
                tile('Час відповіді API', rq.latency_ms.p50 === null ? '—' : `${fmt(rq.latency_ms.p50)} мс`,
                    `p95 ${rq.latency_ms.p95 === null ? '—' : fmt(rq.latency_ms.p95) + ' мс'} · p99 ${rq.latency_ms.p99 === null ? '—' : fmt(rq.latency_ms.p99) + ' мс'}`),
                tile('Помилки 5xx', fmt(rq.totals.s5xx), `4xx: ${fmt(rq.totals.s4xx)} · всього запитів: ${fmt(rq.totals.requests)}`, rq.last5.s5xx ? 'warning' : null),
                meter('Навантаження CPU', load, loadPct, `ядер: ${fmt(s.cpu_count)} · процес: ${s.process.cpu_percent === null ? '—' : fmt(s.process.cpu_percent) + '%'}`),
                s.memory ? meter("Пам'ять сервера", `${fmtBytes(s.memory.used)} / ${fmtBytes(s.memory.total)}`, s.memory.percent, `процес MyKep: ${fmtBytes(s.process.rss)}`)
                    : tile("Пам'ять процесу", fmtBytes(s.process.rss)),
                s.disk ? meter('Диск', `${fmtBytes(s.disk.used)} / ${fmtBytes(s.disk.total)}`, s.disk.percent, `вільно ${fmtBytes(s.disk.free)}`) : tile('Диск', '—'),
                tile('База даних', fmtBytes(s.database.size), `WAL: ${fmtBytes(s.database.wal)}`),
                tile('Event loop', s.event_loop_lag_ms.current === null ? '—' : `${fmt(s.event_loop_lag_ms.current)} мс`,
                    `макс. за 2 хв: ${s.event_loop_lag_ms.max_2min === null ? '—' : fmt(s.event_loop_lag_ms.max_2min) + ' мс'}`, s.event_loop_lag_ms.max_2min > 250 ? 'warning' : null),
                tile('Процес', `PID ${s.pid}`, `потоків: ${fmt(s.process.threads)} · файлів: ${fmt(s.process.open_fds)}`),
                tile('Версія', `v${s.version}`, `Python ${s.python} · ${s.platform}`),
                tile('Сервер', s.hostname, `час: ${fmtDateTime(s.server_time)}`)
            ]),
            h('div', { class: 'grid' }, [
                card('Запити за останню годину', reqChart, { span: 2, sub: 'Щохвилини, за статусом відповіді' }),
                card('Середній час відповіді', latChart, { sub: 'мс, щохвилини' }),
                card('Розклад (сайт коледжу)', [kv([
                    ['Статус', !sc || !sc.ready ? 'Немає даних' : sc.stale ? 'Застарілий кеш' : 'Актуальний', !sc || !sc.ready ? 'critical' : sc.stale ? 'warning' : 'ok'],
                    ['Оновлено', sc && sc.updated_at ? `${fmtDateTime(sc.updated_at)} (${fmtAgo(sc.updated_at)})` : '—'],
                    ['Груп', sc ? fmt(sc.groups) : '—'],
                    ['Остання спроба', sc && sc.last_attempt ? fmtDateTime(sc.last_attempt) : '—'],
                    ['Тривалість оновлення', sc && sc.last_duration_ms !== null ? `${fmt(sc.last_duration_ms)} мс` : '—'],
                    ['Остання помилка', sc && sc.last_error_type ? sc.last_error_type : 'немає', sc && sc.last_error_type ? 'warning' : null],
                    ['Успішних / невдалих', sc ? `${fmt(sc.refresh_ok)} / ${fmt(sc.refresh_failed)}` : '—'],
                    ['Наступне оновлення', sc && sc.next_refresh_in !== null ? `через ${fmtDuration(sc.next_refresh_in)}` : '—'],
                    ['Інтервал', sc ? `${fmtDuration(sc.refresh_interval)} (повтор ${fmtDuration(sc.retry_interval)})` : '—']
                ]), refreshBtn], { span: 2 }),
                card('Запис статистики', kv([
                    ['Writer', w.running ? 'працює' : 'зупинений', w.running ? 'ok' : 'critical'],
                    ['У черзі', fmt(w.pending)],
                    ['Втрачено подій', fmt(w.dropped), w.dropped ? 'warning' : null],
                    ['Помилка запису', w.write_error ? 'так' : 'ні', w.write_error ? 'warning' : null]
                ])),
                card('Telegram-бот', [kv([['Режим', d.bot.mode === 'disabled' ? 'вимкнено' : d.bot.mode], ['Стан', String(d.bot.state)]]),
                    h('p', { class: 'muted small', text: 'Статистика тепер в адмінці. Бота можна увімкнути назад через BOT_MODE=embedded у .env.' })]),
                card('Останні помилки 5xx', rq.recent_errors.length ? h('div', { class: 'list' }, rq.recent_errors.slice(0, 12).map(e =>
                    h('div', { class: 'list-row' }, [h('span', { class: 'badge b-critical', text: e.status }), h('span', { text: e.path }), h('span', { class: 'muted small', text: fmtDateTime(e.time) })])))
                    : h('p', { class: 'muted', text: 'Помилок немає 🎉' }), { span: 2 })
            ])
        );
        after(() => {
            const labels = rq.series.map(x => x.time);
            C.bars(reqChart, { labels, height: 210, series: [
                { name: 'Успішні', values: rq.series.map(x => x.requests - x.s4xx - x.s5xx), color: '#ff5500' },
                { name: '4xx', values: rq.series.map(x => x.s4xx), color: '#ffb020' },
                { name: '5xx', values: rq.series.map(x => x.s5xx), color: '#ef4444' }] });
            C.line(latChart, { labels, height: 210, series: [{ name: 'Сер. час, мс', values: rq.series.map(x => x.avg_ms), color: '#2dd4bf' }] });
        });
    }
    async function refreshSchedule(btn) {
        if (!confirm('Запустити оновлення розкладу з сайту коледжу зараз?')) return;
        btn.disabled = true;
        try {
            const r = await api('/actions/refresh-schedule', { method: 'POST', body: {} });
            toast(r.message, r.refreshed ? 'ok' : 'warn');
            load(false);
        } catch (e) { toast(e.message, 'error'); }
        finally { btn.disabled = false; }
    }

    /* ----------------------------------------------------------- security */
    const EVENTS = { login: ['Вхід', 'ok'], logout: ['Вихід', null], login_denied: ['Спроба входу: не адмін', 'critical'],
        login_bad_signature: ['Невалідний підпис Telegram', 'warning'], login_replay: ['Повторне використання входу', 'critical'],
        login_bad_code: ['Невірний код входу', 'warning'], login_code_created: ['Створено код входу', null],
        refresh_schedule: ['Ручне оновлення розкладу', null], revoke_sessions: ['Завершення сесій', null], export: ['Експорт CSV', null] };
    const METHODS = { telegram: 'Telegram', code: 'Код', dev: 'Dev (локально)' };
    function renderSecurity([sessions, audit, server]) {
        const me = state.me, sec = server.security;
        const codeBox = h('div', { class: 'code-display', hidden: true });
        const codeBtn = h('button', { type: 'button', class: 'btn', text: 'Створити код входу', on: { click: () => createCode(codeBox, codeBtn) } });
        const checks = [
            ['HTTPS', sec.https, 'З’єднання зашифроване', 'Сайт відкрито без HTTPS (нормально лише локально)'],
            ['Secure-cookie', sec.secure_cookie, 'Кука сесії лише через HTTPS', 'ADMIN_COOKIE_SECURE=0 — тільки для локального тесту'],
            ['Dev-вхід вимкнено', !sec.dev_login_enabled, 'Вхід без пароля вимкнено', 'ADMIN_DEV_LOGIN=1 — вимкніть на сервері!'],
            ['Telegram Login', sec.telegram_login_configured, 'Токен бота налаштовано', 'Немає TELEGRAM_BOT_TOKEN'],
            ['Адміністратори', true, `${sec.admins} акаунти в жорсткому allowlist`, '']
        ];
        $('page-security').replaceChildren(h('div', { class: 'grid' }, [
            card('Ваш акаунт', [kv([['Ім’я', me.user.name], ['Telegram', me.user.username ? '@' + me.user.username : '—'], ['ID', String(me.user.id)],
                ['Спосіб входу', METHODS[me.session.method] || me.session.method], ['Сесія діє до', fmtDateTime(me.session.expires_at)]]),
                h('button', { type: 'button', class: 'btn btn-danger', text: 'Вийти', on: { click: logout } })]),
            card('Код входу для iPhone', [h('p', { class: 'muted small', text: 'iOS ізолює PWA з головного екрана від Safari, тож Telegram-вхід там може не працювати. Створіть тут одноразовий код (діє 3 хвилини) і введіть його на екрані входу в PWA.' }),
                codeBtn, codeBox]),
            card('Перевірки безпеки', h('div', { class: 'list' }, checks.map(([name, ok, good, bad]) => h('div', { class: 'list-row' }, [
                h('span', { class: 'badge ' + (ok ? 'b-ok' : 'b-critical'), text: ok ? 'OK' : '!' }), h('b', { text: name }), h('span', { class: 'muted small', text: ok ? good : bad })])))),
            card('Активні сесії', [h('div', { class: 'list' }, sessions.map(s => h('div', { class: 'list-row session' }, [
                h('div', {}, [h('b', { text: s.device }), s.current && h('span', { class: 'badge b-ok', text: 'ця сесія' }),
                    h('div', { class: 'muted small', text: `${s.name || s.user_id} · ${METHODS[s.method] || s.method} · IP ${s.ip || '—'}` }),
                    h('div', { class: 'muted small', text: `активність ${fmtAgo(s.last_seen)} · до ${fmtDateTime(s.expires_at)}` })]),
                !s.current && h('button', { type: 'button', class: 'btn btn-ghost small', text: 'Завершити', on: { click: () => revoke({ sid: s.sid }) } })
            ]))), sessions.length > 1 && h('button', { type: 'button', class: 'btn btn-ghost', text: 'Завершити всі інші сесії', on: { click: () => revoke({ scope: 'others' }) } })], { span: 2 }),
            card('Журнал подій', h('div', { class: 'audit' }, audit.length ? audit.map(a => {
                const [label, level] = EVENTS[a.event] || [a.event, null];
                return h('div', { class: 'audit-row' }, [h('span', { class: 'muted small', text: fmtDateTime(a.time) }),
                    h('span', { class: 'badge ' + (level ? 'b-' + level : ''), text: label }),
                    h('span', { class: 'small', text: [a.user_id ? 'ID ' + a.user_id : '', a.detail || ''].filter(Boolean).join(' · ') }),
                    h('span', { class: 'muted small mono', text: a.ip || '' })]);
            }) : [h('p', { class: 'muted', text: 'Подій ще немає' })]), { span: 3, sub: 'Входи, невдалі спроби та дії адміністраторів (180 днів)' })
        ]));
    }
    async function createCode(box, btn) {
        btn.disabled = true;
        try {
            const r = await api('/login-code', { method: 'POST', body: {} });
            clearInterval(state.codeTimer);
            let left = r.expires_in;
            const timer = h('span', { class: 'muted small' });
            const copy = h('button', { type: 'button', class: 'btn btn-ghost small', text: 'Копіювати', on: { click: async () => {
                try { await navigator.clipboard.writeText(r.code); toast('Скопійовано'); } catch (_) { toast('Не вдалося скопіювати', 'warn'); } } } });
            box.replaceChildren(h('div', { class: 'code-value mono', text: r.code }), h('div', { class: 'code-meta' }, [timer, copy]));
            box.hidden = false;
            const tick = () => {
                timer.textContent = left > 0 ? `діє ще ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'Код прострочено';
                if (left <= 0) { clearInterval(state.codeTimer); box.classList.add('expired'); }
                left--;
            };
            box.classList.remove('expired');
            tick();
            state.codeTimer = setInterval(tick, 1000);
        } catch (e) { toast(e.message, 'error'); }
        finally { btn.disabled = false; }
    }
    async function revoke(body) {
        if (!confirm(body.scope === 'others' ? 'Завершити всі інші сесії?' : 'Завершити цю сесію?')) return;
        try { const r = await api('/sessions/revoke', { method: 'POST', body }); toast(`Завершено сесій: ${r.revoked}`); load(false); }
        catch (e) { toast(e.message, 'error'); }
    }

    /* --------------------------------------------------------------- boot */
    async function boot() {
        registerSW();
        const pending = extractTelegramAuth();
        try { state.config = await api('/config'); }
        catch (e) { state.config = {}; }
        if (pending) {
            try { await api('/auth/telegram', { method: 'POST', body: pending }); }
            catch (e) { $('boot').hidden = true; return showLogin(e.message); }
        }
        await enterApp();
    }
    boot();
})();
