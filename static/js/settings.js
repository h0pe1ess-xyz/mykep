function initSettings() {
    const clearBtn = document.getElementById('clear-cache-btn');
    const resetDurationBtn = document.getElementById('reset-duration-btn');
    const durations = [
        { name: 'duration1', key: 'mykep_duration1', fallback: '80', label: 'Перша зміна' },
        { name: 'duration2', key: 'mykep_duration2', fallback: '60', label: 'Друга зміна' }
    ];
    function currentDuration(setting) {
        const value = storage.get(setting.key);
        return ['60', '80'].includes(value) ? value : setting.fallback;
    }
    function renderSettings() {
        for (const setting of durations) {
            const value = currentDuration(setting);
            document.querySelectorAll(`input[name="${setting.name}"]`).forEach(input => {
                input.checked = input.value === value;
            });
            document.getElementById(`${setting.name}-desc`).textContent =
                `Стандартно: ${setting.fallback} хв${value !== setting.fallback ? ' · змінено' : ''}`;
        }
        resetDurationBtn.disabled = durations.every(setting => currentDuration(setting) === setting.fallback);
    }
    function refreshSettings() {
        renderSettings();
        document.querySelectorAll('.modal-overlay.active').forEach(modal => modal.classList.remove('active'));
        App.reload();
    }
    renderSettings();
    const installHelp = document.getElementById('show-install-help');
    const installCard = document.getElementById('settings-install-card');
    function updateInstallHelp() {
        installCard.hidden = isPWA() || pwaInstalledThisPage;
    }
    updateInstallHelp();
    installHelp.onclick = () => showPWAGuide(true);
    window.addEventListener('appinstalled', updateInstallHelp);
    window.addEventListener('pageshow', updateInstallHelp);
    for (const mode of ['standalone', 'fullscreen']) {
        window.matchMedia(`(display-mode: ${mode})`).addEventListener('change', updateInstallHelp);
    }
    initGroupModal(refreshSettings);

    const confirmModal = document.getElementById('confirm-modal');
    const confirmModalTitle = document.getElementById('confirm-modal-title');
    const confirmModalDesc = document.getElementById('confirm-modal-desc');
    const confirmCancelBtn = document.getElementById('confirm-cancel-btn');
    const confirmOkBtn = document.getElementById('confirm-ok-btn');
    const mainApp = document.getElementById('main-app');
    let pendingCallback = null;
    let returnFocus = null;
    let previousInert = false;

    function closeConfirmModal() {
        pendingCallback = null;
        confirmModal.classList.remove('active');
        mainApp.inert = previousInert;
        returnFocus?.focus({ preventScroll: true });
    }
    function showConfirmModal(title, desc, okText, callback, durationChange = false) {
        pendingCallback = callback;
        returnFocus = document.activeElement;
        previousInert = mainApp.inert;
        confirmModalTitle.textContent = title;
        confirmModalDesc.textContent = desc;
        confirmOkBtn.textContent = okText;
        confirmModal.classList.toggle('is-duration-change', durationChange);
        mainApp.inert = true;
        confirmModal.classList.add('active');
        confirmCancelBtn.focus({ preventScroll: true });
    }
    confirmCancelBtn.addEventListener('click', closeConfirmModal);
    confirmOkBtn.addEventListener('click', () => {
        const callback = pendingCallback;
        closeConfirmModal();
        callback?.();
    });
    confirmModal.addEventListener('click', event => {
        if (event.target === confirmModal) closeConfirmModal();
    });
    confirmModal.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            event.preventDefault();
            closeConfirmModal();
        } else if (event.key === 'Tab') {
            if (event.shiftKey && document.activeElement === confirmCancelBtn) {
                event.preventDefault(); confirmOkBtn.focus();
            } else if (!event.shiftKey && document.activeElement === confirmOkBtn) {
                event.preventDefault(); confirmCancelBtn.focus();
            }
        }
    });

    for (const setting of durations) {
        document.querySelectorAll(`input[name="${setting.name}"]`).forEach(input => {
            input.addEventListener('change', () => {
                const previous = currentDuration(setting);
                const next = input.value;
                // The saved choice stays selected until the change is confirmed.
                renderSettings();
                if (previous === next) return;
                const apply = () => {
                    storage.set(setting.key, next);
                    storage.remove('mykep_schedule');
                    refreshSettings();
                };
                if (next === setting.fallback) { apply(); return; }
                showConfirmModal(
                    'Змінити тривалість пари?',
                    `${setting.label}: ${previous} → ${next} хв.\n\nСтандартно: перша зміна 80 хв, друга 60 хв. Змінюйте лише якщо ваша група навчається за іншим розкладом дзвінків.\n\nЧас пар і таймер у MyKep зміняться. Офіційний розклад коледжу залишиться тим самим.`,
                    'Змінити', apply, true
                );
            });
        });
    }
    resetDurationBtn.addEventListener('click', () => {
        for (const setting of durations) storage.set(setting.key, setting.fallback);
        storage.remove('mykep_schedule');
        refreshSettings();
    });
    clearBtn.addEventListener('click', () => {
        showConfirmModal(
            'Очищення даних',
            'Видалити збережений розклад? MyKep завантажить його із сервера заново.',
            'Видалити',
            () => { storage.remove('mykep_schedule'); refreshSettings(); }
        );
    });
}

function initGroupModal(onChange) {
    const modal = document.getElementById('group-modal');
    const openBtn = document.getElementById('open-group-modal');
    const closeBtn = document.getElementById('close-modal');
    const searchInput = document.getElementById('modal-search');
    const groupList = document.getElementById('modal-group-list');
    const currentGroupDisplay = document.getElementById('current-group-display');

    if (!modal || !openBtn || !closeBtn || !searchInput || !groupList) return;

    let groupsData = [];
    let savedGroup = storage.get('mykep_group') || 'ПІ-24-02';

    if (currentGroupDisplay) {
        currentGroupDisplay.innerText = `Поточна: ${savedGroup}`;
    }

    async function loadGroups() {
        groupList.textContent = 'Завантаження груп…';
        try {
            groupsData = await fetchGroups();
            const query = normalizeGroupSearch(searchInput.value);
            renderGroups(groupsData.filter(group => normalizeGroupSearch(group).includes(query)));
        } catch {
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
                    savedGroup = grp;
                    currentGroupDisplay.textContent = `Поточна: ${grp}`;
                    onChange();
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
        const query = normalizeGroupSearch(e.target.value);
        const filtered = groupsData.filter(group => normalizeGroupSearch(group).includes(query));
        renderGroups(filtered);
    });
}

