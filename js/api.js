// js/api.js - النسخة الشاملة (المحرك الموحد) المحدثة لحل مشكلة جوجل

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
        if (!response.ok) throw new Error(data.error || 'خطأ في السيرفر');
        return data;
    } catch (error) {
        console.error(`❌ API Error [${endpoint}]:`, error.message);
        return null; 
    }
}

const API = {
    getClients: () => fetchAPI('/api/clients'),
    addClient: (data) => fetchAPI('/api/clients', 'POST', data),

    getCases: () => fetchAPI('/api/cases'),
    addCase: (data) => fetchAPI('/api/cases', 'POST', data),

    getStaff: () => fetchAPI('/api/users'),
    addStaff: (data) => fetchAPI('/api/users', 'POST', data),

    getAppointments: () => fetchAPI('/api/appointments'),
    addAppointment: (data) => fetchAPI('/api/appointments', 'POST', data),
    
    getTasks: () => fetchAPI('/api/tasks'),
    addTask: (data) => fetchAPI('/api/tasks', 'POST', data),

    getInstallments: (caseId) => fetchAPI(`/api/installments?case_id=${caseId}`),
    addInstallment: (data) => fetchAPI('/api/installments', 'POST', data),

    getUpdates: (caseId) => fetchAPI(`/api/updates?case_id=${caseId}`),
    addUpdate: (data) => fetchAPI('/api/updates', 'POST', data),

    getNotifications: () => fetchAPI('/api/notifications'),
    markNotificationRead: (id) => fetchAPI(`/api/notifications/${id}`, 'PATCH', { is_read: true }),

    askAI: (prompt) => fetchAPI('/api/ai/chat', 'POST', { prompt }),

    getFiles: (caseId) => fetchAPI(`/api/files?case_id=${caseId}`),
    addFileRecord: (data) => fetchAPI('/api/files', 'POST', data),

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
                        body: JSON.stringify(payload),
                        redirect: 'follow' // تم إضافة هذه الخاصية لمنع حظر الاستجابة من جوجل
                    });
                    
                    const result = await res.json();
                    
                    if(result && result.success && result.url) {
                        resolve(result);
                    } else {
                        reject(new Error(result.error || "فشل الرفع، لم يتم إرجاع رابط من جوجل"));
                    }
                } catch (err) {
                    reject(new Error("حدث خطأ في الاتصال بسيرفر جوجل: " + err.message));
                }
            };
            reader.onerror = (error) => reject(new Error("فشل في قراءة الملف محلياً"));
            reader.readAsDataURL(file);
        });
    }
};

console.log("✅ API Engine Ready");