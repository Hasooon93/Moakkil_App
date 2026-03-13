// js/api.js
async function fetchAPI(endpoint, method = 'GET', body = null) {
    const token = localStorage.getItem(CONFIG.TOKEN_KEY);
    const headers = { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}` 
    };
    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

    try {
        const res = await fetch(`${CONFIG.API_URL}${endpoint}`, options);
        // إذا كان السيرفر معلق (500)
        if (!res.ok) {
            console.error(`🔴 Server Error on ${endpoint}`);
            return []; // نرجع مصفوفة فارغة بدل الانهيار
        }
        return await res.json();
    } catch (e) {
        console.error(`❌ Connection Error on ${endpoint}:`, e.message);
        return []; 
    }
}

const API = {
    getClients: () => fetchAPI('/api/clients'),
    getCases: () => fetchAPI('/api/cases'),
    getStaff: () => fetchAPI('/api/users'),
    addClient: (d) => fetchAPI('/api/clients', 'POST', d),
    addCase: (d) => fetchAPI('/api/cases', 'POST', d),
    getUpdates: (id) => fetchAPI(`/api/updates?case_id=${id}`),
    getInstallments: (id) => fetchAPI(`/api/installments?case_id=${id}`),
    askAI: (p) => fetchAPI('/api/ai/chat', 'POST', { prompt: p })
};