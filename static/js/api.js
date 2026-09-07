async function fetchSchedule() {
    const group = localStorage.getItem('mykep_group') || "ПІ-24-02"; 
    const duration = localStorage.getItem('mykep_duration') || "80"; 
    const uid = getUserId(); 
    
    try {
        const response = await fetch(`/api/schedule?group=${encodeURIComponent(group)}&duration=${duration}&uid=${uid}`);
        const result = await response.json();
        
        if (result.status === "success") {
            localStorage.setItem('mykep_schedule', JSON.stringify(result.data));
            return result.data;
        } else {
            return fallbackCache();
        }
    } catch (error) {
        return fallbackCache();
    }
}

function fallbackCache() {
    const cached = localStorage.getItem('mykep_schedule');
    return cached ? JSON.parse(cached) : {};
}
