/* Exact official matches only. Unknown initials are never guessed. */
const teacherLatinMap = { A:'А', B:'В', C:'С', D:'Д', E:'Е', F:'Ф', G:'Г', H:'Н', I:'І', J:'Й', K:'К', L:'Л', M:'М', N:'Н', O:'О', P:'П', R:'Р', S:'С', T:'Т', U:'У', V:'В', W:'В', X:'Х', Y:'У', Z:'З' };
function teacherHintKey(value) {
    return String(value || '').toUpperCase().split('').map(ch => teacherLatinMap[ch] || ch).join('').replace(/\*/g, '').replace(/[.\s]+/g, '');
}
let teacherDirectory = Object.create(null);
function teacherDisplayName(label) {
    return teacherDirectory[teacherHintKey(label)] || label;
}
function renderTeacherLabel(value) {
    return String(value || '').split(/\s*[,;]\s*/).map(label => {
        if (!label.trim() || label.trim() === '---') return escapeHTML(label);
        return `<span class="teacher-label" data-teacher="${escapeHTML(label.trim())}">${escapeHTML(teacherDisplayName(label.trim()))}</span>`;
    }).join(', ');
}
(() => {
    let latestTimestamp = -1;
    let loading;
    function install(payload) {
        if (!payload || !payload.teachers || typeof payload.teachers !== 'object' || Array.isArray(payload.teachers)) return;
        const timestamp = Number(payload.updated_at) || 0;
        if (timestamp < latestTimestamp) return;
        const next = Object.create(null);
        for (const [key, value] of Object.entries(payload.teachers)) {
            if (typeof value === 'string' && value.trim() && value.length <= 300) next[key] = value;
        }
        if (!Object.keys(next).length) return;
        teacherDirectory = next;
        latestTimestamp = timestamp;
        document.querySelectorAll('.teacher-label[data-teacher]').forEach(node => {
            const name = teacherDisplayName(node.dataset.teacher);
            if (node.textContent !== name) node.textContent = name;
        });
        // Full names can wrap onto another line; remeasure the lower cards.
        if (typeof window.requestDashboardFit === 'function') window.requestDashboardFit();
    }
    async function loadURL(url) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
            const response = await fetch(url, { signal: controller.signal });
            if (response.ok) install(await response.json());
        } catch (_) { /* Bundled/offline directory remains available. */ }
        finally { clearTimeout(timeout); }
    }
    function load() {
        if (!loading) loading = Promise.all([
            loadURL('/data/teacher-hints.json?v=2.6.5-mobile4'),
            loadURL('/api/teacher-hints')
        ]);
        return loading;
    }
    document.addEventListener('DOMContentLoaded', () => {
        if (document.getElementById('dashboard-main') || document.getElementById('dynamic-schedule-list')) load();
    });
})();
