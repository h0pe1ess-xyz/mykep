'use strict';

function getSupportDevice(nav = navigator) {
    const ua = nav.userAgent || '';
    const ios = /iPad|iPhone|iPod/i.test(ua) || (/Macintosh/i.test(ua) && nav.maxTouchPoints > 1);
    const android = /Android/i.test(ua);
    const system = ios ? 'iOS' : android ? 'Android' : /Windows/i.test(ua) ? 'Windows'
        : /Macintosh/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : 'Не визначено';
    let model = 'Браузер не надає модель';
    if (ios) {
        const family = /iPad|Macintosh/i.test(ua) ? 'iPad' : /iPod/i.test(ua) ? 'iPod' : 'iPhone';
        model = `${family} (точна модель недоступна)`;
    }
    if (android) {
        const reported = ua.match(/Android[^;)]*;\s*(?:[a-z]{2}[-_][a-z]{2};\s*)?([^;)]+)/i)?.[1]
            .replace(/\s+Build\/.*$/i, '').trim();
        if (reported && !/^(K|wv|Mobile)$/i.test(reported)) model = reported.slice(0, 100);
    }
    const browsers = [
        ['Telegram', /Telegram(?:\/([\d.]+))?/i], ['Edge', /(?:EdgA|EdgiOS|Edg)\/([\d.]+)/],
        ['Samsung Internet', /SamsungBrowser\/([\d.]+)/], ['Opera', /(?:OPR|OPiOS)\/([\d.]+)/],
        ['Firefox', /(?:FxiOS|Firefox)\/([\d.]+)/], ['Chrome', /(?:CriOS|Chrome)\/([\d.]+)/],
        ['Safari', /Version\/([\d.]+).*Safari/]
    ];
    let browser = 'Не визначено';
    for (const [name, pattern] of browsers) {
        const match = ua.match(pattern);
        if (match) { browser = name + (match[1] ? ` ${match[1].split('.')[0]}` : ''); break; }
    }
    return { system, model, browser };
}

async function getSupportModel(nav = navigator) {
    if (!nav.userAgentData?.getHighEntropyValues) return null;
    let timer;
    try {
        const hints = await Promise.race([
            nav.userAgentData.getHighEntropyValues(['model']),
            new Promise(resolve => { timer = setTimeout(() => resolve(null), 1500); })
        ]);
        const model = typeof hints?.model === 'string' ? hints.model.replace(/[\r\n\t]/g, ' ').trim().slice(0, 100) : '';
        return model && model !== 'K' ? model : null;
    } catch {
        // Restricted or unavailable Client Hints are expected; retain the UA fallback.
        return null;
    } finally { clearTimeout(timer); }
}

function buildSupportReport(device) {
    const build = document.querySelector('meta[name="mykep-build"]')?.content || 'Не визначено';
    const mode = isPWA() ? 'PWA (запущено як застосунок)' : 'Браузер';
    return `Повідомлення MyKep\n\nПроблема або ідея: [опишіть тут]\n\nДані застосунку:\nВерсія: ${build}\nСистема: ${device.system}\nМодель: ${device.model}\nБраузер: ${device.browser}\nРежим: ${mode}\nВікно: ${window.innerWidth} × ${window.innerHeight}`;
}

function initSupportReport() {
    const link = document.getElementById('support-telegram');
    const copy = document.getElementById('support-copy');
    const toggle = document.getElementById('support-show');
    const preview = document.getElementById('support-report');
    const status = document.getElementById('support-status');
    if (!link || !copy || !toggle || !preview || !status) return;
    const destination = link.href;
    const device = getSupportDevice();
    function refresh() {
        const report = buildSupportReport(device);
        preview.value = report;
        if (link.dataset.supportDraft === 'true') {
            const url = new URL(destination);
            url.searchParams.set('text', report);
            link.href = url.href;
        }
        return report;
    }
    refresh();
    // Information stays on this device until the person copies it or opens Telegram.
    const ready = getSupportModel().then(model => { if (model) device.model = model; refresh(); });
    link.addEventListener('click', refresh);
    link.addEventListener('focus', refresh);
    toggle.addEventListener('click', () => {
        refresh();
        preview.hidden = !preview.hidden;
        toggle.setAttribute('aria-expanded', String(!preview.hidden));
        toggle.textContent = preview.hidden ? 'Показати дані' : 'Сховати дані';
    });
    copy.addEventListener('click', async () => {
        if (copy.disabled) return;
        copy.disabled = true;
        status.textContent = 'Готуємо дані…';
        await ready;
        const report = refresh();
        try {
            if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
            await navigator.clipboard.writeText(report);
            status.textContent = 'Дані скопійовано. Вставте їх у повідомлення в Telegram.';
        } catch {
            preview.hidden = false;
            toggle.setAttribute('aria-expanded', 'true');
            toggle.textContent = 'Сховати дані';
            preview.focus({ preventScroll: true });
            preview.select();
            status.textContent = 'Скопіюйте виділений текст вручну та вставте в повідомлення в Telegram.';
        } finally { copy.disabled = false; }
    });
}

initSupportReport();
