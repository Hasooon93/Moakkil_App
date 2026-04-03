// js/api.js - المحرك الموحد المحدث (يدعم JWT، سجل النشاطات، الاستخلاص الذكي الديناميكي، والبصمة، المزامنة السحابية الذكية)

async function fetchAPI(endpoint, method = 'GET', body = null) {
    const token = localStorage.getItem(CONFIG.TOKEN_KEY || 'moakkil_token');
    const headers = {
        'Content-Type': 'application/json'
    };
    
    // تضمين توكن JWT في ترويسة الطلب لضمان المصادقة الصارمة
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);
    
    try {
        const response = await fetch(`${CONFIG.API_URL}${endpoint}`, options);
        
        // معالجة انتهاء أو تزوير الجلسة (JWT 401) بطرد المستخدم فوراً لحماية البيانات
        if (response.status === 401) {
            console.warn("⚠️ تم رفض الجلسة (مرفوضة أو منتهية). جاري تسجيل الخروج...");
            localStorage.removeItem(CONFIG.TOKEN_KEY || 'moakkil_token');
            localStorage.removeItem(CONFIG.USER_KEY || 'moakkil_user');
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
        const currentUser = JSON.parse(localStorage.getItem(CONFIG.USER_KEY || 'moakkil_user'));
        return fetchAPI(`/api/firms?id=eq.${currentUser.firm_id}`);
    },
    updateFirmSettings: (data) => {
        const currentUser = JSON.parse(localStorage.getItem(CONFIG.USER_KEY || 'moakkil_user'));
        return fetchAPI(`/api/firms?id=eq.${currentUser.firm_id}`, 'PATCH', data);
    },

    // الموكلين
    getClients: () => fetchAPI('/api/clients'),
    addClient: (data) => fetchAPI('/api/clients', 'POST', data),
    updateClient: (id, data) => fetchAPI(`/api/clients?id=eq.${id}`, 'PATCH', data),
    deleteClient: (id) => fetchAPI(`/api/clients?id=eq.${id}`, 'DELETE'),
    
    // القضايا (دعم التدرج القضائي والمحامين المتعددين)
    getCases: () => fetchAPI('/api/cases'),
    addCase: (data) => fetchAPI('/api/cases', 'POST', data),
    updateCase: (id, data) => fetchAPI(`/api/cases?id=eq.${id}`, 'PATCH', data),
    deleteCase: (id) => fetchAPI(`/api/cases?id=eq.${id}`, 'DELETE'),
    
    // الموظفين (HR)
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
    getInstallments: (caseId) => fetchAPI(`/api/installments?case_id=eq.${caseId}`),
    addInstallment: (data) => fetchAPI('/api/installments', 'POST', data),
    deleteInstallment: (id, caseId) => fetchAPI(`/api/installments?id=eq.${id}&case_id=eq.${caseId}`, 'DELETE'),
    getExpenses: (caseId) => fetchAPI(caseId ? `/api/expenses?case_id=eq.${caseId}` : '/api/expenses'),
    addExpense: (data) => fetchAPI('/api/expenses', 'POST', data),
    deleteExpense: (id) => fetchAPI(`/api/expenses?id=eq.${id}`, 'DELETE'),
    
    // التحديثات والوقائع (تم تجهيزها لدعم المرفقات attachment_url)
    getUpdates: (caseId) => fetchAPI(`/api/updates?case_id=eq.${caseId}`),
    addUpdate: (data) => fetchAPI('/api/updates', 'POST', data),
    deleteUpdate: (id) => fetchAPI(`/api/updates?id=eq.${id}`, 'DELETE'),
    
    // الأرشيف والذكاء الاصطناعي المزدوج
    askAI: (content) => fetchAPI('/api/ai/process', 'POST', { type: 'legal_advisor', content }),
    
    // **[التعديل الهام هنا]** جعل المتغير type ديناميكياً ليقبل id_extractor الخاص بالموظفين
    extractDataAI: (content, aiType = 'data_extractor') => fetchAPI('/api/ai/process', 'POST', { type: aiType, content }),
    
    readOCR: (imageBase64) => fetchAPI('/api/ai/ocr', 'POST', { image_base64: imageBase64 }),
    smartSearch: (query) => fetchAPI(`/api/search?q=${encodeURIComponent(query)}`),
    
    // فحص تعارض المصالح 
    checkConflict: (name) => fetchAPI(`/api/check-conflict?name=${encodeURIComponent(name)}`),

    // الإشعارات الداخلية وتسجيل أجهزة الـ Push
    getNotifications: () => fetchAPI('/api/notifications'),
    markNotificationAsRead: (id) => fetchAPI(`/api/notifications?id=eq.${id}`, 'PATCH', { is_read: true }),
    subscribePush: (data) => fetchAPI('/api/notifications/subscribe', 'POST', data),

    // نظام تسجيل البصمة (WebAuthn)
    registerBiometric: (data) => fetchAPI('/api/auth/biometric-register', 'POST', data),

    // سجل النشاطات (Audit Trail) - تم التحديث ليدعم الفلترة حسب القضية (entity_id)
    getHistory: (entityId = null) => {
        return fetchAPI(entityId ? `/api/history?entity_id=eq.${entityId}` : '/api/history');
    },

    // إدارة الملفات والأرشيف السحابي
    getFiles: (caseId) => fetchAPI(caseId ? `/api/files?case_id=eq.${caseId}` : '/api/files'),
    deleteFile: (id) => fetchAPI(`/api/files?id=eq.${id}`, 'DELETE'),
    addFileRecord: (data) => {
        const currentUser = JSON.parse(localStorage.getItem(CONFIG.USER_KEY || 'moakkil_user'));
        const firmId = localStorage.getItem(CONFIG.FIRM_KEY);
        const payload = {
            ...data,
            added_by: currentUser ? currentUser.id : null,
            firm_id: (firmId && firmId !== "undefined") ? firmId : null
        };
        return fetchAPI('/api/files', 'POST', payload);
    },

    // تم التحديث: دعم توجيه الملفات إلى المجلد الصحيح في درايف (Drive Folder Hierarchy)
    uploadToDrive: async (file, caseInternalId, driveFolderId = null) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async () => {
                try {
                    const base64Data = reader.result.split(',')[1];
                    const payload = {
                        fileName: file.name,
                        mimeType: file.type,
                        fileData: base64Data,
                        caseNumber: caseInternalId || "عام",
                        driveFolderId: driveFolderId // إذا تم تمريره، سيقوم سكربت جوجل بوضعه داخل المجلد
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

console.log("✅ API Engine Ready (V2.2 - Dynamic AI Types & HR System Supported)");