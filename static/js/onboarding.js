function checkOnboarding() {
    const onboarding = document.getElementById('onboarding');
    const mainApp = document.getElementById('main-app');
    if (!onboarding) return false;

    if (storage.get('mykep_onboarded') === 'true') {
        onboarding.style.display = 'none';
        if (mainApp) { mainApp.style.opacity = '1'; mainApp.inert = false; }
        return false;
    }
    onboarding.style.display = 'flex';
    if (mainApp) { mainApp.style.opacity = '0'; mainApp.inert = true; }
    return true;
}

window.obNextSlide = function(step) {
    closeOnboardingGroupPicker(false);
    document.querySelectorAll('.onboarding-slide').forEach(el => el.classList.remove('active'));
    const nextSlide = document.getElementById('ob-slide-' + step);
    if (nextSlide) nextSlide.classList.add('active');
    if (step === 3) initOnboardingGroups();
}

let onboardingGroups = [];
let onboardingGroupsLoaded = false;
let onboardingGroupsLoading = false;
let onboardingSelectedGroup = '';

function openOnboardingGroupPicker() {
    const picker = document.getElementById('ob-group-picker');
    picker.hidden = false;
    document.getElementById('ob-group-select').setAttribute('aria-expanded', 'true');
    document.querySelector('.onboarding-card').inert = true;
    // Let people browse before opening the keyboard themselves.
    document.getElementById('ob-group-back').focus({ preventScroll: true });
    initOnboardingGroups();
}

function closeOnboardingGroupPicker(restoreFocus = true) {
    const picker = document.getElementById('ob-group-picker');
    if (!picker || picker.hidden) return;
    document.getElementById('ob-group-search').blur();
    picker.hidden = true;
    document.getElementById('ob-group-select').setAttribute('aria-expanded', 'false');
    document.querySelector('.onboarding-card').inert = false;
    if (restoreFocus) document.getElementById('ob-group-select').focus({ preventScroll: true });
}

function renderOnboardingGroups() {
    const search = document.getElementById('ob-group-search');
    const list = document.getElementById('ob-group-options');
    const query = search.value.toLocaleLowerCase('uk').trim();
    const groups = onboardingGroups.filter(group => group.toLocaleLowerCase('uk').includes(query));
    list.replaceChildren();
    groups.forEach(group => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'modal-item';
        button.textContent = group;
        button.setAttribute('aria-pressed', String(group === onboardingSelectedGroup));
        if (group === onboardingSelectedGroup) button.classList.add('selected');
        button.onclick = () => {
            onboardingSelectedGroup = group;
            document.getElementById('ob-group-value').textContent = group;
            document.getElementById('ob-group-status').textContent = '';
            document.getElementById('ob-settings-status').textContent = '';
            search.value = '';
            renderOnboardingGroups();
            closeOnboardingGroupPicker();
        };
        list.appendChild(button);
    });
    if (!groups.length && onboardingGroupsLoaded) {
        const empty = document.createElement('p');
        empty.className = 'help-text';
        empty.textContent = 'Груп не знайдено. Спробуйте інший пошук.';
        list.appendChild(empty);
    }
    list.scrollTop = 0;
}

async function initOnboardingGroups(force = false) {
    const picker = document.getElementById('ob-group-picker');
    const search = document.getElementById('ob-group-search');
    const status = document.getElementById('ob-group-status');
    const retry = document.getElementById('ob-group-retry');
    if (!picker || onboardingGroupsLoading || (onboardingGroupsLoaded && !force)) return;
    onboardingGroupsLoading = true;
    search.disabled = true;
    status.textContent = 'Завантаження груп…';
    retry.hidden = true;
    search.oninput = renderOnboardingGroups;
    picker.onkeydown = event => {
        if (event.key === 'Escape') {
            event.preventDefault();
            closeOnboardingGroupPicker();
        } else if (event.key === 'Tab') {
            const controls = [...picker.querySelectorAll('button, input')].filter(node => !node.disabled && node.getClientRects().length);
            const first = controls[0], last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
    };
    // Do not auto-focus search: opening the list should not raise the iPhone keyboard.
    retry.onclick = () => initOnboardingGroups(true);
    try {
        onboardingGroups = await fetchGroups(force);
        if (!onboardingGroups.length) throw new Error('Empty group list');
        onboardingGroupsLoaded = true;
        search.disabled = false;
        status.textContent = '';
        renderOnboardingGroups();
    } catch {
        status.textContent = 'Не вдалося завантажити групи. Спробуйте ще раз.';
        retry.hidden = false;
    } finally { onboardingGroupsLoading = false; }
}

window.obFinish = function() {
    const status = document.getElementById('ob-settings-status');
    const group = onboardingSelectedGroup;
    if (!onboardingGroupsLoaded || !onboardingGroups.includes(group)) {
        openOnboardingGroupPicker();
        document.getElementById('ob-group-status').textContent = onboardingGroupsLoading ? 'Зачекайте, групи завантажуються…' : 'Оберіть вашу групу зі списку.';
        return;
    }
    if (!storage.set('mykep_group', group)) {
        status.textContent = 'Браузер заборонив збереження даних. Дозвольте сховище для цього сайту або відкрийте його в іншому браузері.';
        return;
    }
    storage.set('mykep_duration1', '80');
    storage.set('mykep_duration2', '60');
    storage.set('mykep_onboarded', 'true');
    storage.remove('mykep_schedule');
    window.location.reload();
};

// Onboarding buttons: delegated handlers (no inline onclick, so a strict CSP
// without 'unsafe-inline' scripts keeps working).
document.addEventListener('click', event => {
    if (event.target instanceof Element) {
        if (event.target.closest('#ob-group-select')) { openOnboardingGroupPicker(); return; }
        if (event.target.closest('#ob-group-back')) { closeOnboardingGroupPicker(); return; }
    }
    const target = event.target instanceof Element ? event.target.closest('[data-ob-step], [data-ob-finish]') : null;
    if (!target) return;
    event.preventDefault();
    if (target.hasAttribute('data-ob-finish')) window.obFinish();
    else window.obNextSlide(Number(target.getAttribute('data-ob-step')));
});
