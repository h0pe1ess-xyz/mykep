/* Manual instructions always work; beforeinstallprompt is only an enhancement. */
let deferredInstallPrompt = null;
let finishPWAGuide = null;
function isPWA() {
    return window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;
}
function browserContext(nav = navigator, location = window.location, referrer = document.referrer) {
    const ua = nav.userAgent || '';
    const ios = /iPad|iPhone|iPod/i.test(ua) || (/Macintosh/i.test(ua) && nav.maxTouchPoints > 1);
    const android = /Android/i.test(ua);
    const params = new URLSearchParams(location.search || '');
    // Telegram does NOT consistently identify itself in User-Agent. Referral is
    // only a hint, not proof; the universal fallback below covers hidden UAs.
    const telegram = /Telegram/i.test(ua) || params.has('tgWebAppPlatform') ||
        /(?:^|[&#])tgWebApp(?:Data|Platform)=/.test(location.hash || '');
    const embedded = telegram || /FBAN|FBAV|Instagram|Line\/|; wv\)/i.test(ua) ||
        (ios && /AppleWebKit/i.test(ua) && !/Safari|CriOS|FxiOS|EdgiOS/i.test(ua));
    const telegramReferral = /^https?:\/\/(?:t\.me|telegram\.org)(?:\/|$)/i.test(referrer || '');
    return { ios, android, embedded, telegram, telegramReferral };
}
function browserModeAccepted() {
    try { return sessionStorage.getItem('mykep_browser_session') === 'yes'; }
    catch (_) { return false; }
}
window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    const button = document.getElementById('pwa-install');
    if (button && !browserContext().embedded) button.hidden = false;
});
window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    if (finishPWAGuide) finishPWAGuide();
});

async function showPWAGuide(force = false) {
    if (isPWA() || (!force && browserModeAccepted())) return;
    if (document.getElementById('pwa-guide')) return;
    const ctx = browserContext();
    const browser = ctx.ios ? 'Safari' : ctx.android ? 'Chrome або інший браузер із підтримкою встановлення застосунків' : 'Chrome або Edge';
    const overlay = document.createElement('div');
    overlay.id = 'pwa-guide';
    overlay.className = 'pwa-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'pwa-title');
    const instructions = ctx.ios
        ? 'Натисніть «Поділитися» у Safari → <span class="pwa-accent">«На початковий екран»</span>.'
        : ctx.android
            ? 'Відкрийте меню ⋮ → <span class="pwa-accent">«Встановити застосунок»</span> або «Додати на головний екран».'
            : 'У Chrome або Edge натисніть значок встановлення в адресному рядку.';
    overlay.innerHTML = `
        <section class="pwa-card">
            <img src="/favicon.png" alt="MyKep" class="pwa-icon">
            <h2 id="pwa-title" tabindex="-1">${ctx.embedded ? 'Відкрийте у браузері' : 'Встанови MyKep'}</h2>
            <div id="pwa-intro">
                <p>${ctx.embedded ? `Щоб встановити MyKep, відкрийте сайт у ${ctx.ios ? 'Safari' : ctx.android ? 'Chrome' : 'Chrome або Edge'}.` : 'Додай MyKep на головний екран, щоб розклад завжди був під рукою.'}</p>
                ${ctx.embedded ? '' : `<div class="pwa-instructions">
                    <strong>${ctx.ios ? 'Для iOS (Safari)' : ctx.android ? 'Для Android' : 'Для комп’ютера'}</strong>
                    <p>${instructions}</p>
                </div>`}
                <details class="pwa-external-help" id="pwa-external-help" ${ctx.embedded ? 'open' : ''}>
                    <summary>${ctx.embedded ? 'Як відкрити у браузері' : 'Відкрили через Telegram?'}</summary>
                    <p>У меню ⋯ або ⋮ виберіть «Відкрити у браузері»${ctx.ios ? ' або «Відкрити в Safari»' : ''}. Якщо цього пункту немає, скопіюйте посилання та відкрийте його в ${browser}.</p>
                    <button class="settings-btn" id="pwa-copy" type="button">Скопіювати посилання</button>
                    <input class="text-input pwa-url" id="pwa-url" readonly aria-label="Посилання на MyKep" hidden>
                    <span id="pwa-copy-status" class="help-text" role="status"></span>
                </details>
                <button class="btn btn-primary" id="pwa-install" type="button" ${deferredInstallPrompt && !ctx.embedded ? '' : 'hidden'}>Встановити MyKep</button>
            </div>
            <div id="pwa-confirm" hidden>
                <p><strong>Продовжити без встановлення?</strong></p>
                <p>Панелі браузера займатимуть частину екрана. З іконки MyKep користуватися розкладом зручніше.</p>
                <button class="btn btn-primary" id="pwa-back" type="button">До встановлення</button>
                <button class="pwa-browser-link" id="pwa-confirm-browser" type="button">Так, продовжити у браузері</button>
            </div>
            <button class="pwa-browser-link" id="pwa-browser" type="button">Продовжити у браузері</button>
        </section>`;
    document.body.appendChild(overlay);
    const previousFocus = document.activeElement;
    const appNodes = [...document.body.children].filter(node => node !== overlay && node.tagName !== 'SCRIPT');
    appNodes.forEach(node => { node.inert = true; });
    const guidePromise = new Promise(resolve => {
        finishPWAGuide = () => {
            overlay.remove();
            appNodes.forEach(node => { node.inert = false; });
            if (previousFocus && previousFocus.isConnected) previousFocus.focus();
            finishPWAGuide = null;
            resolve();
        };
    });
    overlay.querySelector('#pwa-copy').onclick = async () => {
        // Drop Telegram launch data and tracking arguments from copied URL.
        const url = window.location.origin + window.location.pathname;
        const status = overlay.querySelector('#pwa-copy-status');
        try {
            await navigator.clipboard.writeText(url);
            status.textContent = 'Посилання скопійовано.';
        } catch (_) {
            const input = overlay.querySelector('#pwa-url');
            input.hidden = false; input.value = url; input.focus(); input.select();
            status.textContent = 'Натисніть і утримуйте посилання, щоб скопіювати його.';
        }
    };
    overlay.querySelector('#pwa-install').onclick = async () => {
        if (!deferredInstallPrompt) return;
        const prompt = deferredInstallPrompt;
        deferredInstallPrompt = null;
        overlay.querySelector('#pwa-install').hidden = true;
        try { await prompt.prompt(); await prompt.userChoice; }
        catch (_) { /* The manual instructions remain visible. */ }
    };
    overlay.querySelector('#pwa-browser').onclick = () => {
        overlay.querySelector('#pwa-browser').hidden = true;
        overlay.querySelector('#pwa-intro').hidden = true;
        overlay.querySelector('#pwa-confirm').hidden = false;
        overlay.querySelector('#pwa-back').focus();
        overlay.querySelector('#pwa-confirm').scrollIntoView({ block: 'nearest' });
    };
    overlay.querySelector('#pwa-back').onclick = () => {
        overlay.querySelector('#pwa-confirm').hidden = true;
        overlay.querySelector('#pwa-intro').hidden = false;
        overlay.querySelector('#pwa-browser').hidden = false;
        overlay.querySelector('#pwa-browser').focus();
    };
    overlay.querySelector('#pwa-confirm-browser').onclick = () => {
        try { sessionStorage.setItem('mykep_browser_session', 'yes'); } catch (_) {}
        finishPWAGuide();
    };
    overlay.addEventListener('keydown', event => {
        if (event.key !== 'Tab') return;
        const nodes = [...overlay.querySelectorAll('button, input, summary')].filter(node => node.getClientRects().length && !node.disabled);
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    overlay.querySelector('#pwa-title').focus();
    return guidePromise;
}
