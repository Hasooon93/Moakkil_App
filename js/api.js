// js/api.js - النسخة الشاملة (المحرك الموحد)

/**
 * الدالة المركزية للاتصال بالسيرفر
 */
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
        
        // إذا انتهت الجلسة (أو التوكن خاطئ)
        if (response.status === 401) {
            localStorage.clear();
            window.location.href = 'index.html';
            return null;
        }

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'خطأ في السيرفر');
        return data;
    } catch (error) {
        console.error(`❌ API Error [${endpoint}]:`, error.message);
        return null; // نرجع null لضمان استمرار عمل الواجهة
    }
}

/**
 * كائن API يحتوي على كافة العمليات المطلوبة في النظام
 */
const API = {
    // 1. الموكلين
    getClients: () => fetchAPI('/api/clients'),
    addClient: (data) => fetchAPI('/api/clients', 'POST', data),

    // 2. القضايا
    getCases: () => fetchAPI('/api/cases'),
    addCase: (data) => fetchAPI('/api/cases', 'POST', data),

    // 3. فريق العمل (الموظفين)
    getStaff: () => fetchAPI('/api/users'),
    addStaff: (data) => fetchAPI('/api/users', 'POST', data),

    // 4. المواعيد والأجندة
    getAppointments: () => fetchAPI('/api/appointments'),
    addAppointment: (data) => fetchAPI('/api/appointments', 'POST', data),

    // 5. المالية (الدفعات)
    getInstallments: (caseId) => fetchAPI(`/api/installments?case_id=${caseId}`),
    addInstallment: (data) => fetchAPI('/api/installments', 'POST', data),

    // 6. التحديثات (Timeline)
    getUpdates: (caseId) => fetchAPI(`/api/updates?case_id=${caseId}`),
    addUpdate: (data) => fetchAPI('/api/updates', 'POST', data),

    // 7. الأرشيف (الملفات)
    getFiles: (caseId) => fetchAPI(`/api/files?case_id=${caseId}`),
    addFile: (data) => fetchAPI('/api/files', 'POST', data),

    // 8. الذكاء الاصطناعي
    askAI: (prompt) => fetchAPI('/api/ai/chat', 'POST', { prompt })
};

console.log("✅ API Engine Ready");