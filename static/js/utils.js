function isPWA() {
    return (window.matchMedia('(display-mode: standalone)').matches) || (window.navigator.standalone === true);
}

function showPWAGuide() {
    document.body.innerHTML = `
        <div style="position: fixed; inset: 0; background-color: var(--bg-main); display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px; text-align: center; color: white; font-family: 'Inter', sans-serif; z-index: 10000; animation: fadeIn var(--transition-normal) forwards;">
            <div style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 24px; padding: 32px 24px; width: 100%; max-width: 400px; box-shadow: 0 12px 32px rgba(0,0,0,0.5);">
                <img src="favicon.png" alt="MyKep" style="width: 72px; height: 72px; border-radius: 16px; margin-bottom: 24px; border: 1px solid var(--border-color);">
                <h2 style="font-size: 22px; font-weight: 600; margin-bottom: 12px; color: var(--text-main);">Встанови MyKep</h2>
                <p style="font-size: 14px; color: var(--text-muted); margin-bottom: 32px; line-height: 1.5;">Цей додаток працює як нативний. Щоб користуватись ним, збережи його на головний екран.</p>
                
                <div style="display: flex; flex-direction: column; gap: 12px; text-align: left;">
                    <div style="background: var(--bg-main); border: 1px solid var(--border-color); padding: 16px; border-radius: 16px; display: flex; align-items: center; gap: 16px;">
                        <div style="background: var(--bg-surface); padding: 10px; border-radius: 12px; display: flex; align-items: center; justify-content: center; border: 1px solid var(--border-color);">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="var(--text-main)" stroke="none"><path d="M16.36 10.02c-.03-2.11 1.73-3.13 1.81-3.18-1-.98-2.52-1.65-3.08-1.68-1.31-.13-2.56.77-3.23.77-.67 0-1.68-.75-2.77-.73-1.42.02-2.72.82-3.45 2.1-1.48 2.55-.38 6.32 1.05 8.38.7 1 1.51 2.14 2.6 2.1 1.04-.04 1.43-.67 2.68-.67 1.25 0 1.61.67 2.7.65 1.12-.02 1.83-1.04 2.51-2.03.8-1.16 1.12-2.28 1.14-2.34-.02-.01-2.07-.79-2.08-2.59h-.02zM12.92 5.4c.57-.69.96-1.64.85-2.61-.82.03-1.85.55-2.43 1.24-.51.55-.98 1.52-.86 2.47.92.07 1.87-.41 2.44-1.1z"/></svg>
                        </div>
                        <div>
                            <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px; color: var(--text-main);">Для iOS (Safari)</div>
                            <div style="font-size: 12px; color: var(--text-muted); line-height: 1.4;">Натисни «Поділитися» знизу і вибери <span style="color: var(--accent-orange); font-weight: 500;">«На початковий екран»</span>.</div>
                        </div>
                    </div>
                    
                    <div style="background: var(--bg-main); border: 1px solid var(--border-color); padding: 16px; border-radius: 16px; display: flex; align-items: center; gap: 16px;">
                        <div style="background: var(--bg-surface); padding: 10px; border-radius: 12px; display: flex; align-items: center; justify-content: center; border: 1px solid var(--border-color);">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="var(--text-main)" stroke="none"><path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4483-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993.0001.5511-.4482.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993 0 .5511-.4482.9997-.9993.9997m11.4045-6.02l1.9973-3.4592a.416.416 0 0 0-.1521-.5676.416.416 0 0 0-.5676.1521l-2.0223 3.503C15.5902 8.244 13.8533 7.85 12 7.85s-3.5902.394-5.1367 1.1005L4.841 5.4475a.4158.4158 0 0 0-.5676-.1521.4157.4157 0 0 0-.1521.5676l1.9973 3.4592C2.6889 11.1867.3432 14.6589 0 18.761h24c-.3432-4.1021-2.6889-7.5743-6.1185-9.4396"/></svg>
                        </div>
                        <div>
                            <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px; color: var(--text-main);">Для Android</div>
                            <div style="font-size: 12px; color: var(--text-muted); line-height: 1.4;">Натисни меню і вибери <span style="color: var(--accent-orange); font-weight: 500;">«Встановити додаток»</span>.</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function getUserId() {
    let uid = localStorage.getItem('mykep_uid');
    if (!uid) {
        uid = 'user_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
        localStorage.setItem('mykep_uid', uid);
    }
    return uid;
}

function animateValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const easeProgress = progress * (2 - progress); 
        obj.innerText = Math.floor(start + easeProgress * (end - start)) + '%';
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            obj.innerText = Math.floor(end) + '%';
        }
    };
    window.requestAnimationFrame(step);
}

function getLessonSuffix(num) {
    switch (parseInt(num)) {
        case 1: return "ша";
        case 2: return "га";
        case 3: return "тя";
        case 7: return "ма";
        case 8: return "ма";
        default: return "та"; // 4, 5, 6
    }
}

function timeToMins(timeStr) {
    if (!timeStr) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return (hours || 0) * 60 + (minutes || 0);
}

function getAcademicWeek() {
    const now = new Date();
    const baseMonday = new Date(2026, 7, 31); 
    let targetDate = new Date(now);
    
    if (targetDate.getDay() === 0) { 
        targetDate.setDate(targetDate.getDate() + 1);
    } else if (targetDate.getDay() === 6 && targetDate.getHours() >= 15) { 
        targetDate.setDate(targetDate.getDate() + 2);
    }
    
    targetDate.setHours(0, 0, 0, 0);
    baseMonday.setHours(0, 0, 0, 0);
    
    const diffDays = Math.floor((targetDate.getTime() - baseMonday.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 1;
    
    return (Math.floor(diffDays / 7) % 4) + 1;
}

function updateHeaderDisplays() {
    const savedGroup = localStorage.getItem('mykep_group') || 'ПІ-24-02';
    const headerDisplay = document.getElementById('header-group-text');
    if (headerDisplay) {
        if (document.querySelector('.day-picker')) {
            headerDisplay.innerText = `${getAcademicWeek()}-й тиждень`;
        } else {
            headerDisplay.innerText = `Група ${savedGroup}`;
        }
    }
}
