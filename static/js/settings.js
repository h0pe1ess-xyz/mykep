function initSettings() {
    const clearBtn = document.getElementById('clear-cache-btn');
    const duration1Toggle = document.getElementById('duration1-toggle');
    const duration1Desc = document.getElementById('duration1-desc');
    const duration2Toggle = document.getElementById('duration2-toggle');
    const duration2Desc = document.getElementById('duration2-desc');
    const resetDurationBtn = document.getElementById('reset-duration-btn');

    const savedDuration1 = localStorage.getItem('mykep_duration1') || '80'; 
    const savedDuration2 = localStorage.getItem('mykep_duration2') || '60'; 

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

    const openGroupModalBtn = document.getElementById('open-group-modal');
    const obGroupInput = document.getElementById('ob-group-input');
    const groupModal = document.getElementById('group-modal');
    const closeGroupModalBtn = document.getElementById('close-modal');
    const currentGroupDisplay = document.getElementById('current-group-display');
    const modalSearch = document.getElementById('modal-search');
    const modalGroupList = document.getElementById('modal-group-list');

    const savedGroup = localStorage.getItem('mykep_group') || 'ПІ-24-02';
    if (currentGroupDisplay) {
        currentGroupDisplay.innerText = `Поточна: ${savedGroup}`;
    }
    
    let cachedGroups = [];
    let isFromOnboarding = false;

    async function loadGroups() {
        modalGroupList.innerHTML = '<div style="padding: 14px; text-align: center; color: var(--text-muted);">Завантаження...</div>';
        try {
            const resp = await fetch('/api/groups');
            const data = await resp.json();
            if (data.status === 'success') {
                cachedGroups = data.data;
                renderGroupList(cachedGroups);
            } else {
                modalGroupList.innerHTML = '<div style="padding: 14px; text-align: center; color: #ff4444;">Помилка завантаження</div>';
            }
        } catch (e) {
            modalGroupList.innerHTML = '<div style="padding: 14px; text-align: center; color: #ff4444;">Помилка завантаження</div>';
        }
    }

    function renderGroupList(groups) {
        modalGroupList.innerHTML = '';
        if (groups.length === 0) {
            modalGroupList.innerHTML = '<div style="padding: 14px; text-align: center; color: var(--text-muted);">Нічого не знайдено</div>';
            return;
        }
        groups.forEach(grp => {
            const div = document.createElement('div');
            div.className = 'modal-item';
            if (grp === savedGroup) div.classList.add('selected');
            div.innerText = grp;
            div.addEventListener('click', () => {
                if (isFromOnboarding && obGroupInput) {
                    obGroupInput.value = grp;
                    groupModal.classList.remove('active');
                } else {
                    localStorage.setItem('mykep_group', grp);
                    localStorage.removeItem('mykep_schedule');
                    window.location.reload();
                }
            });
            modalGroupList.appendChild(div);
        });
    }

    if (modalSearch) {
        modalSearch.addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase().replace(/[^a-zа-яієїґ0-9]/g, '');
            const filtered = cachedGroups.filter(grp => grp.toLowerCase().replace(/[^a-zа-яієїґ0-9]/g, '').includes(q));
            renderGroupList(filtered);
        });
    }

    if (openGroupModalBtn && groupModal) {
        openGroupModalBtn.addEventListener('click', () => {
            isFromOnboarding = false;
            groupModal.classList.add('active');
            if (cachedGroups.length === 0) {
                loadGroups();
            } else {
                renderGroupList(cachedGroups);
            }
        });
    }

    if (obGroupInput && groupModal) {
        obGroupInput.addEventListener('click', () => {
            isFromOnboarding = true;
            groupModal.classList.add('active');
            if (cachedGroups.length === 0) {
                loadGroups();
            } else {
                renderGroupList(cachedGroups);
            }
        });
    }

    if (closeGroupModalBtn && groupModal) {
        closeGroupModalBtn.addEventListener('click', () => {
            groupModal.classList.remove('active');
        });
    }

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
            "Увага!", 
            "Це рекомендовані настройки MyKep.<br>Так як у нас пари зараз проходять іменно в такому форматі, краще тут нічого не міняти<br><br>Чи точно ви хочете змінити це?", 
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
                localStorage.setItem('mykep_duration1', newDuration);
                localStorage.removeItem('mykep_schedule'); 
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
                localStorage.setItem('mykep_duration2', newDuration);
                localStorage.removeItem('mykep_schedule'); 
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
            localStorage.setItem('mykep_duration1', '80');
            localStorage.setItem('mykep_duration2', '60');
            localStorage.removeItem('mykep_schedule');
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
                    localStorage.removeItem('mykep_schedule');
                    window.location.reload();
                }
            );
        });
    }
}

function checkOnboarding() {
    const onboarding = document.getElementById('onboarding');
    const mainApp = document.getElementById('main-app');
    if (!onboarding) return false;

    if (localStorage.getItem('mykep_onboarded') === 'true') {
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
}

window.obFinish = function() {
    const groupInput = document.getElementById('ob-group-input');
    const groupValue = groupInput && groupInput.value.trim() ? groupInput.value.trim() : 'ПІ-24-02';
    localStorage.setItem('mykep_group', groupValue.toUpperCase());
    localStorage.setItem('mykep_duration1', '80');
    localStorage.setItem('mykep_duration2', '60');
    localStorage.setItem('mykep_onboarded', 'true');
    localStorage.removeItem('mykep_schedule');
    
    window.location.reload(); 
}
