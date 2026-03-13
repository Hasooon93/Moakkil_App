// ============================================================================
// نظام موكّل 2.0 - محرك الاتصال (api.js)
// النسخة الكاملة والمحدثة لدعم كافة وظائف النظام والذكاء الاصطناعي
// ============================================================================

/**
 * الدالة المركزية للتخاطب مع الخادم
 * تقوم بمعالجة التوكن، الترويسات (Headers)، والأخطاء بشكل تلقائي
 */
async function fetchAPI(endpoint, method = 'GET', body = null) {
    const token = localStorage.getItem(CONFIG.TOKEN_KEY);
    
    // 1. التحقق من وجود التوكن (للأمان قبل الإرسال)
    if (!token && !endpoint.includes('/api/auth')) {
        window.location.href = 'index.html';
        throw new Error('غير مصرح لك بالدخول، يرجى تسجيل الدخول مجدداً.');
    }

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };

    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

    try {
        const response = await fetch(`${CONFIG.API_URL}${endpoint}`, options);
        
        // التحقق من انتهاء الجلسة (Token Expired)
        if (response.status === 401) {
            localStorage.clear();
            window.location.href = 'index.html';
            throw new Error('انتهت جلستك، يرجى الدخول مجدداً');
        }

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'حدث خطأ غير متوقع في الخادم');
        }
        
        return data;
    } catch (error) {
        console.error(`❌ API Error [${endpoint}]:`, error);
        throw error;
    }
}

/**
 * الكائن المركزي لجميع طلبات النظام
 */
const API = {
    // --- الموكلين (Clients) ---
    getClients: () => fetchAPI('/api/clients'),
    addClient: (data) => fetchAPI('/api/clients', 'POST', data),
    
    // --- القضايا (Cases) ---
    getCases: () => fetchAPI('/api/cases'),
    addCase: (data) => fetchAPI('/api/cases', 'POST', data),
    updateCase: (id, data) => fetchAPI(`/api/cases/${id}`, 'PATCH', data),
    
    // --- فريق العمل (Staff/Users) ---
    getStaff: () => fetchAPI('/api/users'),
    addStaff: (data) => fetchAPI('/api/users', 'POST', data),
    
    // --- الأجندة والمواعيد (Agenda) ---
    getAppointments: () => fetchAPI('/api/appointments'),
    addAppointment: (data) => fetchAPI('/api/appointments', 'POST', data),

    // --- المالية والدفعات (Installments) ---
    getInstallments: (caseId) => fetchAPI(`/api/installments?case_id=${caseId}`),
    addInstallment: (data) => fetchAPI('/api/installments', 'POST', data),

    // --- تحديثات القضايا والوقائع (Timeline Updates) ---
    getUpdates: (caseId) => fetchAPI(`/api/updates?case_id=${caseId}`),
    addUpdate: (data) => fetchAPI('/api/updates', 'POST', data),

    // --- الأرشيف والملفات (Files) ---
    getFiles: (caseId) => fetchAPI(`/api/files?case_id=${caseId}`),
    addFile: (data) => fetchAPI('/api/files', 'POST', data),

    // --- الذكاء الاصطناعي (AI Chat) ---
    /**
     * إرسال طلب للذكاء الاصطناعي لتحليل لائحة أو استشارة
     */
    askAI: (prompt) => fetchAPI('/api/ai/chat', 'POST', { prompt })
};