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

    function confirmDurationChange(callback) {
        if (confirm("Це рекомендовані настройки MyKep так як у нас зараз пари саме так налаштовані, що краще нічого не змінювати. Продовжити?")) {
            if (confirm("Чи точно ви хочете змінити це?")) {
                callback();
            }
        }
    }

    if (duration1Toggle) {
        duration1Toggle.addEventListener('click', () => {
            confirmDurationChange(() => {
                duration1Toggle.classList.toggle('active'); 
                const newDuration = duration1Toggle.classList.contains('active') ? '80' : '60'; 
                localStorage.setItem('mykep_duration1', newDuration);
                localStorage.removeItem('mykep_schedule'); 
                window.location.reload();
            });
        });
    }

    if (duration2Toggle) {
        duration2Toggle.addEventListener('click', () => {
            confirmDurationChange(() => {
                duration2Toggle.classList.toggle('active'); 
                const newDuration = duration2Toggle.classList.contains('active') ? '80' : '60'; 
                localStorage.setItem('mykep_duration2', newDuration);
                localStorage.removeItem('mykep_schedule'); 
                window.location.reload();
            });
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
            if (confirm("Видалити збережений розклад?")) {
                localStorage.removeItem('mykep_schedule');
                window.location.reload();
            }
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
