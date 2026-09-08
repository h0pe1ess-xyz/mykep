async function fetchSchedule() {
    const group = localStorage.getItem('mykep_group') || "ПІ-24-02"; 
    const duration1 = localStorage.getItem('mykep_duration1') || "80"; 
    const duration2 = localStorage.getItem('mykep_duration2') || "60"; 
    const uid = getUserId(); 
    
    try {
        const response = await fetch(`/api/schedule?group=${encodeURIComponent(group)}&duration1=${duration1}&duration2=${duration2}&uid=${uid}`);
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
