function initSettings() {
    const clearBtn = document.getElementById('clear-cache-btn');
    const durationToggle = document.getElementById('duration-toggle');
    const durationDesc = document.getElementById('duration-desc');

    const savedDuration = localStorage.getItem('mykep_duration') || '80'; 
    if (durationToggle) {
        if (savedDuration === '80') {
            durationToggle.classList.add('active');
        } else {
            durationToggle.classList.remove('active');
        }
    }
    
    if (durationDesc) {
        durationDesc.innerText = `Поточна: ${savedDuration} хвилин`;
    }

    if (durationToggle) {
        durationToggle.addEventListener('click', () => {
            durationToggle.classList.toggle('active'); 
            const newDuration = durationToggle.classList.contains('active') ? '80' : '60'; 
            localStorage.setItem('mykep_duration', newDuration);
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
    const obDurationToggle = document.getElementById('ob-duration-toggle');
    const newDuration = (obDurationToggle && !obDurationToggle.classList.contains('active')) ? '60' : '80';
    
    localStorage.setItem('mykep_group', groupValue.toUpperCase());
    localStorage.setItem('mykep_duration', newDuration);
    localStorage.setItem('mykep_onboarded', 'true');
    localStorage.removeItem('mykep_schedule');
    
    window.location.reload(); 
}
