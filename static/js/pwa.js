/* Native installation is optional; every browser has a usable fallback. */
let deferredInstallPrompt = null;
let finishPWAGuide = null;
let refreshPWAGuide = null;
let pwaInstalledThisPage = false;

function isPWA() {
    return window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;
}
function browserContext(nav = navigator, location = window.location, referrer = document.referrer) {
    const ua = nav.userAgent || '';
    const ios = /iPad|iPhone|iPod/i.test(ua) || (/Macintosh/i.test(ua) && nav.maxTouchPoints > 1);
    const android = /Android/i.test(ua);
    const params = new URLSearchParams(location.search || '');
    // Telegram can hide its UA. Referral alone is not proof of an embedded browser.
    const telegram = /Telegram/i.test(ua) || params.has('tgWebAppPlatform') ||
        /(?:^|[&#])tgWebApp(?:Data|Platform)=/.test(location.hash || '');
    const embedded = telegram || /FBAN|FBAV|Instagram|Line\/|; wv\)/i.test(ua) ||
        (ios && /AppleWebKit/i.test(ua) && !/Safari|CriOS|FxiOS|EdgiOS/i.test(ua));
    const telegramReferral = /^https?:\/\/(?:t\.me|telegram\.org)(?:\/|$)/i.test(referrer || '');
    return { ios, android, embedded, telegram, telegramReferral };
}
function browserModeAccepted() {
    try { return sessionStorage.getItem('mykep_browser_session') === 'yes'; }
    catch { return false; }
}
window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    refreshPWAGuide?.();
});
window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    pwaInstalledThisPage = true;
    updatePWAInstallStatus();
});
function updatePWAInstallStatus() {
    refreshPWAGuide?.();
}

async function showPWAGuide(force = false) {
    if (isPWA() || (!force && browserModeAccepted()) || document.getElementById('pwa-guide')) return;
    const ctx = browserContext();
    const insecure = window.isSecureContext === false;
    const browser = ctx.ios ? 'Safari' : ctx.android ? 'Chrome' : 'Chrome або Edge';
    let state = ctx.embedded || insecure ? 'external' : 'intro';
    let stateBeforeConfirm = state;
    let feedback = '';
    const overlay = document.createElement('div');
    overlay.id = 'pwa-guide';
    overlay.className = 'pwa-overlay';
    overlay.setAttribute('data-nosnippet', '');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'pwa-title');
    overlay.setAttribute('aria-describedby', 'pwa-lead');
    overlay.innerHTML = `
        <section class="pwa-card">
            <img src="/icons/icon-192.png" alt="" class="pwa-icon" width="72" height="72" loading="eager" decoding="async">
            <h2 id="pwa-title" tabindex="-1"></h2>
            <p id="pwa-lead"></p>
            <div id="pwa-content"></div>
            <p id="pwa-install-status" class="pwa-feedback" role="status" aria-live="polite"></p>
            <button class="pwa-browser-link" id="pwa-browser" type="button">Продовжити у браузері</button>
            <a href="/about.html" class="pwa-about-link">Про MyKep</a>
        </section>`;

    const title = overlay.querySelector('#pwa-title');
    const lead = overlay.querySelector('#pwa-lead');
    const content = overlay.querySelector('#pwa-content');
    const status = overlay.querySelector('#pwa-install-status');
    const cleanURL = new URL(window.location.origin + window.location.pathname);
    const secureURL = new URL(cleanURL);
    secureURL.protocol = 'https:';
    const launchSteps = ctx.ios || ctx.android
        ? `<li>Повернись на головний екран телефона.</li><li>Знайди іконку <strong>MyKep</strong>${ctx.android ? ' на головному екрані або у списку застосунків' : ''} і натисни на неї.</li>`
        : '<li>Знайди <strong>MyKep</strong> у списку застосунків комп’ютера.</li><li>Відкрий його, щоб переглянути розклад.</li>';
    const manualSteps = ctx.ios
        ? '<li>У Safari натисни <strong>«Поділитися»</strong> <svg class="pwa-inline-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 16V3m-4 4 4-4 4 4M7 10H4v11h16V10h-3"/></svg>.</li><li>Обери <strong>«На початковий екран»</strong>, потім <strong>«Додати»</strong>. Якщо є перемикач «Відкривати як вебзастосунок», увімкни його.</li><li>Повернись на головний екран і відкрий іконку <strong>MyKep</strong>.</li>'
        : ctx.android
            ? '<li>У Chrome відкрий <strong>меню ⋮</strong> біля адреси сайту.</li><li>Обери <strong>«Встановити застосунок»</strong> або <strong>«Додати на головний екран»</strong> і підтвердь.</li><li>Відкрий іконку <strong>MyKep</strong> на головному екрані або у списку застосунків.</li>'
            : '<li>У Chrome або Edge відкрий меню біля адреси сайту.</li><li>Обери <strong>«Встановити MyKep»</strong>. Ця дія також може бути в розділі «Застосунки».</li><li>Відкрий <strong>MyKep</strong> зі списку застосунків комп’ютера.</li>';
    const copyControls = `<button class="pwa-copy-btn" id="pwa-copy" type="button">Скопіювати посилання</button>
        <label class="sr-only" for="pwa-url">Посилання на MyKep</label>
        <input class="text-input pwa-url" id="pwa-url" readonly hidden>
        <span id="pwa-copy-status" class="help-text" role="status"></span>`;
    const help = `<details class="pwa-external-help"><summary>Не виходить встановити?</summary>
        <p>Відкрий цей сайт у ${browser}. Якщо ти у Telegram, у його меню обери «Відкрити у браузері». Або скопіюй посилання й встав його в ${browser}.</p>${copyControls}</details>`;

    function render(focus = false) {
        if (pwaInstalledThisPage && state !== 'confirm') state = 'installed';
        const canPrompt = deferredInstallPrompt && !insecure && !ctx.embedded;
        let heading, description, body;
        if (state === 'confirm') {
            heading = pwaInstalledThisPage ? 'Відкрити розклад у браузері?' : 'Продовжити без встановлення?';
            description = 'З іконки MyKep розклад відкривається в окремому вікні. У браузері він працюватиме як звичайний сайт.';
            body = `<button class="btn btn-primary" id="pwa-back" type="button">${pwaInstalledThisPage ? 'Як відкрити MyKep' : 'Повернутися до встановлення'}</button><button class="pwa-browser-link" id="pwa-confirm-browser" type="button">Так, відкрити розклад у браузері</button>`;
        } else if (state === 'external') {
            heading = `Відкрий MyKep у ${browser}`;
            description = ctx.embedded
                ? 'У цьому браузері додати застосунок не вийде. Продовж у своєму основному браузері.'
                : 'За цим посиланням встановлення недоступне. Відкрий сайт для встановлення або переглянь розклад тут.';
            body = ctx.embedded
                ? `<ol class="pwa-steps"><li>У меню ${ctx.telegram ? 'Telegram' : 'цього браузера'} обери <strong>«Відкрити у браузері»</strong>.</li><li>Або скопіюй посилання й відкрий його у <strong>${browser}</strong>.</li></ol>${copyControls}`
                : '<a class="btn btn-primary" id="pwa-secure">Відкрити сайт для встановлення</a>';
        } else if (state === 'installing' || state === 'installed') {
            heading = state === 'installed' ? 'MyKep встановлено' : 'MyKep встановлюється';
            description = state === 'installed'
                ? 'Тепер відкрий його з іконки, як звичайний застосунок.'
                : 'Дочекайся появи іконки MyKep. Потім відкрий застосунок:';
            body = `<ol class="pwa-steps">${launchSteps}</ol>`;
        } else if (state === 'manual') {
            heading = 'Додай MyKep на головний екран';
            description = `Це можна зробити в меню ${browser}:`;
            body = `<ol class="pwa-steps">${manualSteps}</ol>${canPrompt ? '<button class="btn btn-primary" id="pwa-install" type="button">Встановити MyKep</button>' : ''}${help}`;
        } else {
            heading = 'Встанови MyKep';
            description = 'Твій розклад пар, аудиторії та час до кінця заняття. Відкривай одним дотиком з головного екрана.';
            body = `<button class="btn btn-primary" id="pwa-install" type="button">${canPrompt ? 'Встановити MyKep' : 'Як встановити'}</button>${help}`;
        }
        overlay.dataset.state = state;
        title.textContent = heading;
        lead.textContent = description;
        content.innerHTML = body;
        const secureLink = content.querySelector('#pwa-secure');
        if (secureLink) secureLink.href = secureURL.href;
        status.textContent = feedback;
        overlay.querySelector('#pwa-browser').hidden = state === 'confirm';
        if (focus) title.focus();
    }
    render();
    document.body.appendChild(overlay);
    const previousFocus = document.activeElement;
    const appNodes = [...document.body.children].filter(node => node !== overlay && node.tagName !== 'SCRIPT');
    const inertStates = appNodes.map(node => node.inert);
    appNodes.forEach(node => { node.inert = true; });
    const guidePromise = new Promise(resolve => {
        finishPWAGuide = () => {
            overlay.remove();
            appNodes.forEach((node, index) => { node.inert = inertStates[index]; });
            if (previousFocus?.isConnected) previousFocus.focus();
            finishPWAGuide = null;
            refreshPWAGuide = null;
            resolve();
        };
    });
    refreshPWAGuide = () => {
        // A late browser event must not erase a copied link or interrupted input.
        if (pwaInstalledThisPage) render(true);
        else if ((state === 'intro' || state === 'manual') && deferredInstallPrompt && !ctx.embedded && !insecure) {
            const button = content.querySelector('#pwa-install');
            if (button) button.textContent = 'Встановити MyKep';
            else {
                const install = document.createElement('button');
                install.className = 'btn btn-primary';
                install.id = 'pwa-install';
                install.type = 'button';
                install.textContent = 'Встановити MyKep';
                content.querySelector('.pwa-external-help').before(install);
            }
        }
    };
    overlay.addEventListener('click', async event => {
        const button = event.target.closest('button');
        if (!button || button.disabled) return;
        if (button.id === 'pwa-browser') {
            stateBeforeConfirm = state;
            state = 'confirm'; feedback = ''; render(true);
        } else if (button.id === 'pwa-back') {
            state = stateBeforeConfirm; render(true);
        } else if (button.id === 'pwa-confirm-browser') {
            try { sessionStorage.setItem('mykep_browser_session', 'yes'); }
            catch { /* The guide still closes when session storage is unavailable. */ }
            finishPWAGuide();
        } else if (button.id === 'pwa-copy') {
            const copyStatus = content.querySelector('#pwa-copy-status');
            try {
                await navigator.clipboard.writeText((insecure ? secureURL : cleanURL).href);
                if (copyStatus.isConnected) copyStatus.textContent = `Скопійовано. Тепер відкрий ${browser} та встав посилання в адресний рядок.`;
            } catch {
                if (!button.isConnected) return;
                const input = content.querySelector('#pwa-url');
                input.hidden = false;
                input.value = (insecure ? secureURL : cleanURL).href;
                input.focus(); input.select();
                copyStatus.textContent = 'Виділи посилання, скопіюй його та відкрий у своєму браузері.';
            }
        } else if (button.id === 'pwa-install') {
            if (!deferredInstallPrompt || insecure || ctx.embedded) {
                state = 'manual'; feedback = ''; render(true); return;
            }
            const prompt = deferredInstallPrompt;
            deferredInstallPrompt = null;
            button.disabled = true;
            button.textContent = 'Підтвердь встановлення…';
            try {
                await prompt.prompt();
                const choice = await prompt.userChoice;
                if (!overlay.isConnected) return;
                const nextState = choice.outcome === 'accepted' ? 'installing' : 'manual';
                if (state === 'confirm') stateBeforeConfirm = nextState;
                else state = nextState;
                feedback = choice.outcome === 'accepted' ? '' : 'Встановлення скасовано. Можеш додати MyKep пізніше або переглянути розклад зараз.';
            } catch {
                if (!overlay.isConnected) return;
                if (state === 'confirm') stateBeforeConfirm = 'manual';
                else state = 'manual';
                feedback = 'Не вдалося почати встановлення. Спробуй через меню браузера за кроками вище.';
            }
            render(true);
        }
    });
    overlay.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            overlay.querySelector(state === 'confirm' ? '#pwa-back' : '#pwa-browser').click();
            return;
        }
        if (event.key !== 'Tab') return;
        const nodes = [...overlay.querySelectorAll('button, input, summary, a[href]')].filter(node => node.getClientRects().length && !node.disabled);
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === title)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    title.focus();
    return guidePromise;
}
