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
        const data = await res.json();
        
        if (!res.ok) {
            if (res.status === 401) {
                localStorage.clear();
                window.location.href = 'index.html';
            }
            return null;
        }
        return data;
    } catch (e) {
        console.error("❌ API Error:", endpoint, e.message);
        return null;
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