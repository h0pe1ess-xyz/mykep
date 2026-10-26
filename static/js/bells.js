const BellSchedule = (() => {
    const script = new URL(document.currentScript.src);
    const dataURL = new URL('../data/bells.json', script);
    dataURL.search = script.search;
    let dataPromise = null;
    let mode = 'lessons';
    let renderToken = 0;
    let renderedKey = '';
    const view = document.querySelector('.view-schedule');
    const panel = document.getElementById('schedule-bells-panel');
    const table = document.getElementById('bells-table');
    const status = document.getElementById('bells-status');
    const retry = document.getElementById('bells-retry');
    const buttons = [...document.querySelectorAll('.schedule-mode-switch [role="tab"]')];

    function load() {
        if (!dataPromise) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);
            dataPromise = fetch(dataURL, { signal: controller.signal }).then(async response => {
                if (!response.ok) throw new Error(`Bell times HTTP ${response.status}`);
                const data = await response.json();
                for (const duration of ['60', '80']) {
                    if (!Array.isArray(data[duration]) || data[duration].length !== 8 ||
                        !data[duration].every(slot => Array.isArray(slot) && slot.length === 2 &&
                            slot.every(time => typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time)))) {
                        throw new Error('Invalid bell times');
                    }
                }
                return data;
            }).finally(() => clearTimeout(timeout)).catch(error => { dataPromise = null; throw error; });
        }
        return dataPromise;
    }

    async function render() {
        if (mode !== 'bells' || Tabs.current !== 'schedule') return;
        const token = ++renderToken;
        const first = getLessonDuration(1);
        const second = getLessonDuration(2);
        const now = getKyivNow();
        const minute = now.getHours() * 60 + now.getMinutes();
        const key = `${first}|${second}|${minute}`;
        if (key === renderedKey) return;
        retry.hidden = true;
        if (table.hidden) { status.hidden = false; status.textContent = 'Завантаження дзвінків…'; }
        panel.setAttribute('aria-busy', 'true');
        try {
            const data = await load();
            if (token !== renderToken || mode !== 'bells') return;
            const groups = [first, second].map((duration, shift) => {
                const title = shift === 0 ? 'Перша зміна' : 'Друга зміна';
                const rows = Array.from({length:4}, (_, slot) => {
                    const i = shift * 4 + slot;
                    const [start, end] = data[duration][i];
                    const current = minute >= timeToMins(start) && minute < timeToMins(end);
                    return `<tr class="bell-row"${current ? ' aria-current="time"' : ''}><th scope="row"><span class="bell-number">${i + 1}</span>${current ? ' <span class="bell-current">Зараз</span>' : ''}</th><td><span class="bell-start">${start}</span><span class="bell-separator">–</span><span class="bell-end">${end}</span></td></tr>`;
                });
                return `<tbody><tr class="bells-shift"><th colspan="2" scope="rowgroup"><span class="bells-shift-label"><span>${title}</span><span class="bells-duration">${duration} хв</span></span></th></tr>${rows.join('')}</tbody>`;
            });
            table.querySelectorAll('tbody').forEach(group => group.remove());
            table.insertAdjacentHTML('beforeend', groups.join(''));
            status.hidden = true;
            table.hidden = false;
            renderedKey = key;
        } catch (error) {
            if (token !== renderToken || mode !== 'bells') return;
            console.warn('Bell times unavailable:', error);
            table.hidden = true;
            status.hidden = false;
            status.textContent = 'Не вдалося завантажити дзвінки. Спробуйте ще раз';
            retry.hidden = false;
        } finally {
            if (token === renderToken) panel.setAttribute('aria-busy', 'false');
        }
    }

    function show(nextMode) {
        mode = nextMode;
        ++renderToken;
        view.dataset.scheduleMode = mode;
        const bells = mode === 'bells';
        panel.hidden = !bells;
        document.getElementById('dynamic-schedule-list').hidden = bells;
        document.querySelector('.schedule-header-actions').hidden = bells;
        document.querySelector('.day-picker').hidden = bells;
        buttons.forEach((button, i) => {
            const selected = i === (bells ? 1 : 0);
            button.setAttribute('aria-selected', String(selected));
            button.tabIndex = selected ? 0 : -1;
        });
        if (bells) {
            // Changing the view must cancel sharing that is still preparing.
            ++scheduleExportToken;
            showScheduleShareStatus();
            render();
        } else {
            panel.setAttribute('aria-busy', 'false');
            if (schedulePickerState) {
                const day = document.querySelector('.day-picker .active');
                const picker = document.querySelector('.day-picker');
                if (day) picker.scrollTo({left:day.offsetLeft + day.clientWidth / 2 - picker.clientWidth / 2,behavior:'auto'});
            }
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        buttons.forEach((button, i) => {
            button.onclick = () => show(i ? 'bells' : 'lessons');
            button.onkeydown = event => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - i;
                buttons[next].focus();
                show(next ? 'bells' : 'lessons');
            };
        });
        retry.onclick = () => render();
        Tabs.onChange(() => render());
        document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
        window.addEventListener('pageshow', () => render());
        setInterval(() => { if (!document.hidden) render(); }, 30000);
    });
    return { render };
})();
