// js/api.js - النسخة الشاملة (المحرك الموحد) المحدثة لحل مشاكل الرفع

/**
 * الدالة المركزية للاتصال بالسيرفر (Cloudflare Worker)
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
            window.location.href = 'login.html';
            return null;
        }

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'خطأ في السيرفر');
        return data;
    } catch (error) {
        console.error(`❌ API Error [${endpoint}]:`, error.message);
        return null; // نرجع null لضمان استمرار عمل الواجهة دون تحطم
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

    // 4. المواعيد والمهام
    getAppointments: () => fetchAPI('/api/appointments'),
    addAppointment: (data) => fetchAPI('/api/appointments', 'POST', data),
    
    getTasks: () => fetchAPI('/api/tasks'),
    addTask: (data) => fetchAPI('/api/tasks', 'POST', data),

    // 5. المالية (الدفعات)
    getInstallments: (caseId) => fetchAPI(`/api/installments?case_id=${caseId}`),
    addInstallment: (data) => fetchAPI('/api/installments', 'POST', data),

    // 6. التحديثات والوقائع (Timeline)
    getUpdates: (caseId) => fetchAPI(`/api/updates?case_id=${caseId}`),
    addUpdate: (data) => fetchAPI('/api/updates', 'POST', data),

    // 7. الإشعارات (للموظف الحالي)
    getNotifications: () => fetchAPI('/api/notifications'),
    markNotificationRead: (id) => fetchAPI(`/api/notifications/${id}`, 'PATCH', { is_read: true }),

    // 8. الذكاء الاصطناعي
    askAI: (prompt) => fetchAPI('/api/ai/chat', 'POST', { prompt }),

    // 9. الأرشيف (الملفات)
    getFiles: (caseId) => fetchAPI(`/api/files?case_id=${caseId}`),
    addFileRecord: (data) => fetchAPI('/api/files', 'POST', data), // لحفظ سجل الملف في قاعدة البيانات بعد رفعه

    // 10. محرك الرفع إلى Google Drive (عبر Google Apps Script) معدل لتخطي الـ CORS
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
                    
                    // استخدام text/plain لمنع حظر المتصفح لرد جوجل
                    const res = await fetch(CONFIG.GAS_URL, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'text/plain;charset=utf-8'
                        },
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
                    reject(new Error("تعذر قراءة رد جوجل: " + err.message));
                }
            };
            reader.onerror = (error) => reject(new Error("فشل في قراءة الملف محلياً"));
            reader.readAsDataURL(file);
        });
    }
};

console.log("✅ API Engine Ready");