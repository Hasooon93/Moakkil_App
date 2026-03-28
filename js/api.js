// js/api.js - المحرك الموحد المحدث (يدعم فحص التعارض، والبحث، الإشعارات، والتعديل الشامل)

async function fetchAPI(endpoint, method = 'GET', body = null) {
    const token = localStorage.getItem(CONFIG.TOKEN_KEY);
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);
    
    try {
        const response = await fetch(`${CONFIG.API_URL}${endpoint}`, options);
        if (response.status === 401) {
            localStorage.clear();
            window.location.href = 'login.html';
            return null;
        }

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || data.message || 'خطأ في السيرفر');
        return data;
    } catch (error) {
        console.error(`❌ API Error [${endpoint}]:`, error.message);
        return { error: error.message }; 
    }
}

const API = {
    // إعدادات المكتب (تخصيص الهوية)
    getFirmSettings: () => {
        const currentUser = JSON.parse(localStorage.getItem(CONFIG.USER_KEY));
        return fetchAPI(`/api/firms?id=eq.${currentUser.firm_id}`);
    },
    updateFirmSettings: (data) => {
        const currentUser = JSON.parse(localStorage.getItem(CONFIG.USER_KEY));
        return fetchAPI(`/api/firms?id=eq.${currentUser.firm_id}`, 'PATCH', data);
    },

    // الموكلين
    getClients: () => fetchAPI('/api/clients'),
    addClient: (data) => fetchAPI('/api/clients', 'POST', data),
    updateClient: (id, data) => fetchAPI(`/api/clients?id=eq.${id}`, 'PATCH', data),
    deleteClient: (id) => fetchAPI(`/api/clients?id=eq.${id}`, 'DELETE'),
    
    // القضايا
    getCases: () => fetchAPI('/api/cases'),
    addCase: (data) => fetchAPI('/api/cases', 'POST', data),
    updateCase: (id, data) => fetchAPI(`/api/cases?id=eq.${id}`, 'PATCH', data),
    deleteCase: (id) => fetchAPI(`/api/cases?id=eq.${id}`, 'DELETE'),
    
    // الموظفين
    getStaff: () => fetchAPI('/api/users'),
    addStaff: (data) => fetchAPI('/api/users', 'POST', data),
    updateStaff: (id, data) => fetchAPI(`/api/users?id=eq.${id}`, 'PATCH', data),
    deleteStaff: (id) => fetchAPI(`/api/users?id=eq.${id}`, 'DELETE'),
    
    // المواعيد والمهام
    getAppointments: () => fetchAPI('/api/appointments'),
    addAppointment: (data) => fetchAPI('/api/appointments', 'POST', data),
    updateAppointment: (id, data) => fetchAPI(`/api/appointments?id=eq.${id}`, 'PATCH', data),
    deleteAppointment: (id) => fetchAPI(`/api/appointments?id=eq.${id}`, 'DELETE'),
    
    // المالية والمصروفات
    getInstallments: (caseId) => fetchAPI(`/api/installments?case_id=${caseId}`),
    addInstallment: (data) => fetchAPI('/api/installments', 'POST', data),
    getExpenses: (caseId) => fetchAPI(caseId ? `/api/expenses?case_id=eq.${caseId}` : '/api/expenses'),
    addExpense: (data) => fetchAPI('/api/expenses', 'POST', data),
    
    // الوقائع
    getUpdates: (caseId) => fetchAPI(`/api/updates?case_id=${caseId}`),
    addUpdate: (data) => fetchAPI('/api/updates', 'POST', data),
    
    // الأرشيف والذكاء الاصطناعي والبحث
    askAI: (prompt) => fetchAPI('/api/ai/chat', 'POST', { prompt }),
    smartSearch: (query) => fetchAPI(`/api/search?q=${encodeURIComponent(query)}`),
    
    // فحص تعارض المصالح 
    checkConflict: (name) => fetchAPI(`/api/check-conflict?name=${encodeURIComponent(name)}`),

    // الإشعارات الداخلية (الميزة الجديدة)
    getNotifications: () => fetchAPI('/api/notifications'),
    markNotificationAsRead: (id) => fetchAPI(`/api/notifications?id=eq.${id}`, 'PATCH', { is_read: true }),

    getFiles: (caseId) => fetchAPI(caseId ? `/api/files?case_id=${caseId}` : '/api/files'),
    addFileRecord: (data) => {
        const currentUser = JSON.parse(localStorage.getItem(CONFIG.USER_KEY));
        const firmId = localStorage.getItem(CONFIG.FIRM_KEY);
        const payload = {
            ...data,
            added_by: currentUser ? currentUser.id : null,
            firm_id: (firmId && firmId !== "undefined") ? firmId : null
        };
        return fetchAPI('/api/files', 'POST', payload);
    },

    uploadToDrive: async (file, caseInternalId) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async () => {
                try {
                    const base64Data = reader.result.split(',')[1];
                    const payload = {
                        fileName: file.name,
                        mimeType: file.type,
                        fileData: base64Data,
                        caseNumber: caseInternalId || "عام"
                    };
                    const res = await fetch(CONFIG.GAS_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                        body: JSON.stringify(payload),
                        redirect: 'follow'
                    });
                    const result = await res.json();
                    if(result && result.success && result.url) {
                        resolve(result);
                    } else {
                        reject(new Error(result.error || "فشل إرجاع الرابط من جوجل"));
                    }
                } catch (err) {
                    reject(new Error("تعذر الاتصال بسيرفر جوجل: " + err.message));
                }
            };
            reader.onerror = () => reject(new Error("فشل في قراءة الملف محلياً"));
            reader.readAsDataURL(file);
        });
    }
};

console.log("✅ API Engine Ready");