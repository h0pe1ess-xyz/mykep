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
    document.querySelectorAll('.onboarding-slide').forEach(el => el.classList.remove('active'));
    const nextSlide = document.getElementById('ob-slide-' + step);
    if (nextSlide) nextSlide.classList.add('active');
    if (step === 3) initOnboardingGroups();
}

let onboardingGroups = [];
let onboardingGroupsLoaded = false;
let onboardingGroupsLoading = false;
let onboardingSelectedGroup = '';

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
            document.getElementById('ob-group-picker').open = false;
            document.getElementById('ob-group-status').textContent = '';
            search.value = '';
            renderOnboardingGroups();
            document.getElementById('ob-group-select').focus();
        };
        list.appendChild(button);
    });
    if (!groups.length && onboardingGroupsLoaded) {
        const empty = document.createElement('p');
        empty.className = 'help-text';
        empty.textContent = 'Груп не знайдено. Спробуйте інший пошук.';
        list.appendChild(empty);
    }
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
            picker.open = false;
            document.getElementById('ob-group-select').focus();
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
    const status = document.getElementById('ob-group-status');
    const group = onboardingSelectedGroup;
    if (!onboardingGroupsLoaded || !onboardingGroups.includes(group)) {
        status.textContent = onboardingGroupsLoading ? 'Зачекайте, групи завантажуються…' : 'Оберіть вашу групу зі списку.';
        document.getElementById('ob-group-picker').open = true;
        document.getElementById('ob-group-select').focus();
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
    const target = event.target instanceof Element ? event.target.closest('[data-ob-step], [data-ob-finish]') : null;
    if (!target) return;
    event.preventDefault();
    if (target.hasAttribute('data-ob-finish')) window.obFinish();
    else window.obNextSlide(Number(target.getAttribute('data-ob-step')));
});
