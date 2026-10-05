function initSettings() {
    const clearBtn = document.getElementById('clear-cache-btn');
    const duration1Toggle = document.getElementById('duration1-toggle');
    const duration1Desc = document.getElementById('duration1-desc');
    const duration2Toggle = document.getElementById('duration2-toggle');
    const duration2Desc = document.getElementById('duration2-desc');
    const resetDurationBtn = document.getElementById('reset-duration-btn');

    function renderSettings() {
        for (const [toggle, desc, key, fallback] of [
            [duration1Toggle, duration1Desc, 'mykep_duration1', '80'],
            [duration2Toggle, duration2Desc, 'mykep_duration2', '60']
        ]) {
            const duration = storage.get(key) || fallback;
            toggle.classList.toggle('active', duration === '80');
            toggle.setAttribute('aria-checked', String(duration === '80'));
            desc.textContent = `Поточна: ${duration} хвилин`;
        }
    }
    function refreshSettings() {
        renderSettings();
        document.querySelectorAll('.modal-overlay.active').forEach(modal => modal.classList.remove('active'));
        App.reload();
    }
    renderSettings();
    const installHelp = document.getElementById('show-install-help');
    if (installHelp) {
        if (isPWA()) { installHelp.textContent = 'Встановлено'; installHelp.disabled = true; }
        else installHelp.onclick = () => showPWAGuide(true);
    }
    initGroupModal(refreshSettings);

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
                refreshSettings();
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
                refreshSettings();
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
            refreshSettings();
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
                    refreshSettings();
                }
            );
        });
    }
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

