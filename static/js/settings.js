function initSettings() {
    const clearBtn = document.getElementById('clear-cache-btn');
    const duration1Toggle = document.getElementById('duration1-toggle');
    const duration1Desc = document.getElementById('duration1-desc');
    const duration2Toggle = document.getElementById('duration2-toggle');
    const duration2Desc = document.getElementById('duration2-desc');
    const resetDurationBtn = document.getElementById('reset-duration-btn');

    const savedDuration1 = storage.get('mykep_duration1') || '80'; 
    const savedDuration2 = storage.get('mykep_duration2') || '60'; 

    if (duration1Toggle) {
        if (savedDuration1 === '80') duration1Toggle.classList.add('active');
        else duration1Toggle.classList.remove('active');
    }
    if (duration1Desc) duration1Desc.innerText = `Поточна: ${savedDuration1} хвилин`;

    if (duration2Toggle) {
        if (savedDuration2 === '80') duration2Toggle.classList.add('active');
        else duration2Toggle.classList.remove('active');
    }
    if (duration2Desc) duration2Desc.innerText = `Поточна: ${savedDuration2} хвилин`;

    [duration1Toggle, duration2Toggle].forEach(toggle => {
        if (toggle) toggle.setAttribute('aria-checked', String(toggle.classList.contains('active')));
    });
    const installHelp = document.getElementById('show-install-help');
    if (installHelp) {
        if (isPWA()) { installHelp.textContent = 'Встановлено'; installHelp.disabled = true; }
        else installHelp.onclick = () => showPWAGuide(true);
    }
    initGroupModal();

    const confirmModal = document.getElementById('confirm-modal');
    const confirmModalTitle = document.getElementById('confirm-modal-title');
    const confirmModalDesc = document.getElementById('confirm-modal-desc');
    const confirmCancelBtn = document.getElementById('confirm-cancel-btn');
    const confirmOkBtn = document.getElementById('confirm-ok-btn');
    
    let pendingCallback = null;

    function showConfirmModal(title, desc, okText, callback) {
        pendingCallback = callback;
        if (confirmModalTitle) confirmModalTitle.innerText = title;
        if (confirmModalDesc) confirmModalDesc.innerHTML = desc;
        if (confirmOkBtn) confirmOkBtn.innerText = okText;
        
        if (confirmModal) {
            confirmModal.classList.add('active');
        }
    }

    if (confirmCancelBtn) {
        confirmCancelBtn.addEventListener('click', () => {
            pendingCallback = null;
            if (confirmModal) confirmModal.classList.remove('active');
        });
    }

    if (confirmOkBtn) {
        confirmOkBtn.addEventListener('click', () => {
            if (pendingCallback) pendingCallback();
            pendingCallback = null;
            if (confirmModal) confirmModal.classList.remove('active');
        });
    }

    function confirmDurationChange(callback) {
        showConfirmModal(
            "Зміна тривалості занять", 
            "Рекомендована тривалість занять: 80 хвилин для першої зміни та 60 хвилин для другої.<br><br>Зміна цих параметрів вплине на час початку й завершення пар та роботу таймера в MyKep. Офіційний розклад коледжу при цьому не зміниться.<br><br>Змінюйте тривалість лише тоді, коли для вашої групи діє інший розклад дзвінків. Продовжити?", 
            "Змінити", 
            callback
        );
    }

    function isRecommendedState() {
        if (!duration1Toggle || !duration2Toggle) return false;
        const dur1Is80 = duration1Toggle.classList.contains('active');
        const dur2Is60 = !duration2Toggle.classList.contains('active');
        return dur1Is80 && dur2Is60;
    }

    if (duration1Toggle) {
        duration1Toggle.addEventListener('click', () => {
            const performChange = () => {
                duration1Toggle.classList.toggle('active'); 
                const newDuration = duration1Toggle.classList.contains('active') ? '80' : '60'; 
                storage.set('mykep_duration1', newDuration);
                storage.remove('mykep_schedule'); 
                window.location.reload();
            };

            if (isRecommendedState()) {
                confirmDurationChange(performChange);
            } else {
                performChange();
            }
        });
    }

    if (duration2Toggle) {
        duration2Toggle.addEventListener('click', () => {
            const performChange = () => {
                duration2Toggle.classList.toggle('active'); 
                const newDuration = duration2Toggle.classList.contains('active') ? '80' : '60'; 
                storage.set('mykep_duration2', newDuration);
                storage.remove('mykep_schedule'); 
                window.location.reload();
            };

            if (isRecommendedState()) {
                confirmDurationChange(performChange);
            } else {
                performChange();
            }
        });
    }

    if (resetDurationBtn) {
        resetDurationBtn.addEventListener('click', () => {
            storage.set('mykep_duration1', '80');
            storage.set('mykep_duration2', '60');
            storage.remove('mykep_schedule');
            window.location.reload();
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            showConfirmModal(
                "Очищення даних",
                "Видалити збережений розклад? Це змусить додаток завантажити розклад з сервера заново.",
                "Видалити",
                () => {
                    storage.remove('mykep_schedule');
                    window.location.reload();
                }
            );
        });
    }
}

function initGroupModal() {
    const modal = document.getElementById('group-modal');
    const openBtn = document.getElementById('open-group-modal');
    const closeBtn = document.getElementById('close-modal');
    const searchInput = document.getElementById('modal-search');
    const groupList = document.getElementById('modal-group-list');
    const currentGroupDisplay = document.getElementById('current-group-display');

    if (!modal || !openBtn || !closeBtn || !searchInput || !groupList) return;

    let groupsData = [];
    const savedGroup = storage.get('mykep_group') || 'ПІ-24-02';
    
    if (currentGroupDisplay) {
        currentGroupDisplay.innerText = `Поточна: ${savedGroup}`;
    }

    async function loadGroups() {
        groupList.textContent = 'Завантаження груп…';
        try {
            groupsData = await fetchGroups();
            renderGroups(groupsData.filter(g => g.toLowerCase().includes(searchInput.value.toLowerCase().trim())));
        } catch (_) {
            groupList.textContent = 'Не вдалося завантажити групи. ';
            const retry = document.createElement('button');
            retry.className = 'settings-btn';
            retry.textContent = 'Спробувати ще раз';
            retry.onclick = loadGroups;
            groupList.appendChild(retry);
        }
    }

    function renderGroups(list) {
        groupList.innerHTML = '';
        if (!list.length) groupList.textContent = 'Груп не знайдено. Спробуйте інший запит.';
        list.forEach(grp => {
            const div = document.createElement('button');
            div.type = 'button';
            div.className = 'modal-item';
            if (grp === savedGroup) div.classList.add('selected');
            div.innerText = grp;
            div.addEventListener('click', () => {
                if (grp !== savedGroup) {
                    storage.set('mykep_group', grp);
                    storage.remove('mykep_schedule');
                    window.location.reload();
                } else {
                    modal.classList.remove('active');
                }
            });
            groupList.appendChild(div);
        });
    }

    openBtn.addEventListener('click', () => {
        modal.classList.add('active');
        loadGroups();
    });

    closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        const filtered = groupsData.filter(g => g.toLowerCase().includes(query));
        renderGroups(filtered);
    });
}

function checkOnboarding() {
    const onboarding = document.getElementById('onboarding');
    const mainApp = document.getElementById('main-app');
    if (!onboarding) return false;

    if (storage.get('mykep_onboarded') === 'true') {
        onboarding.style.display = 'none';
        if (mainApp) mainApp.style.opacity = '1';
        return false;
    }
    onboarding.style.display = 'flex';
    if (mainApp) mainApp.style.opacity = '0';
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
    } catch (_) {
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
