// js/api.js - المحرك الموحد المحدث V4.1 (Enterprise Edition)
// الدعم الكامل: JWT، سجل النشاطات المفلتر، البصمة، المزامنة السحابية (Offline Mode)، الرفع المباشر السريع لـ R2 بـ FormData.

// =================================================================
// 🔄 نظام المزامنة الذكي (Offline Queue System)
// =================================================================
const OFFLINE_QUEUE_KEY = 'moakkil_offline_queue';

function saveToOfflineQueue(endpoint, method, body) {
    let queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
    queue.push({ endpoint, method, body, timestamp: Date.now() });
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    console.warn(`[Offline Mode] تم حفظ الطلب للمزامنة لاحقاً: ${endpoint}`);
    
    if(window.showToast) {
        window.showToast('أنت غير متصل بالإنترنت. تم حفظ العملية وستتم المزامنة تلقائياً.', 'warning');
    }
}

async function processOfflineQueue() {
    let queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
    if (queue.length === 0) return;

    console.log(`[Sync] جاري مزامنة ${queue.length} طلبات محفوظة...`);
    if(window.showToast) window.showToast('عاد الاتصال. جاري مزامنة البيانات المحفوظة...', 'info');

    let remainingQueue = [];
    for (let req of queue) {
        try {
            const token = localStorage.getItem(CONFIG.TOKEN_KEY || 'moakkil_token');
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const options = { method: req.method, headers };
            if (req.body) options.body = JSON.stringify(req.body);

            const response = await fetch(`${CONFIG.API_URL}${req.endpoint}`, options);
            if (!response.ok) throw new Error('فشل المزامنة مع السيرفر');
        } catch (e) {
            console.error(`[Sync Error] فشل مزامنة ${req.endpoint}`, e);
            remainingQueue.push(req);
        }
    }

    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remainingQueue));
    if (remainingQueue.length === 0) {
        console.log('[Sync] تمت المزامنة بنجاح.');
        if(window.showToast) window.showToast('تمت مزامنة جميع البيانات بنجاح!', 'success');
    }
}

window.addEventListener('online', processOfflineQueue);

// =================================================================
// 🚀 المحرك الرئيسي للاتصال (Main Fetch Wrapper)
// =================================================================

function applyJordanTimeHack(isoString) {
    if (!isoString) return isoString;
    try {
        let d = new Date(isoString);
        d.setHours(d.getHours() + 3); 
        return d.toISOString();
    } catch(e) {
        return isoString;
    }
}

async function fetchAPI(endpoint, method = 'GET', body = null, isPublic = false) {
    if (!navigator.onLine && !isPublic) {
        if (['POST', 'PATCH', 'DELETE'].includes(method)) {
            saveToOfflineQueue(endpoint, method, body);
            return { success: true, offline: true, message: "تم الحفظ محلياً لحين عودة الإنترنت" };
        } else {
            return { error: 'أنت غير متصل بالإنترنت حالياً.' };
        }
    }

    const token = localStorage.getItem(CONFIG.TOKEN_KEY || 'moakkil_token');
    const headers = { 'Content-Type': 'application/json' };
    
    if (token && !isPublic) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);
    
    try {
        const response = await fetch(`${CONFIG.API_URL}${endpoint}`, options);
        
        if (response.status === 401 && !isPublic) {
            console.warn("⚠️ جلسة غير صالحة. جاري تسجيل الخروج...");
            localStorage.removeItem(CONFIG.TOKEN_KEY || 'moakkil_token');
            localStorage.removeItem(CONFIG.USER_KEY || 'moakkil_user');
            window.location.href = 'login.html';
            return null;
        }

        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || data.message || `خطأ سيرفر: ${response.status}`);
            return data;
        } else {
            const text = await response.text();
            throw new Error(`استجابة غير متوقعة من السيرفر (الكود: ${response.status})`);
        }

    } catch (error) {
        console.error(`❌ API Error [${endpoint}]:`, error.message);
        if (error.message === 'Failed to fetch' && ['POST', 'PATCH', 'DELETE'].includes(method)) {
            saveToOfflineQueue(endpoint, method, body);
            return { success: true, offline: true, message: "تم الحفظ محلياً" };
        }
        return { error: error.message }; 
    }
}

const getCurrentUser = () => JSON.parse(localStorage.getItem(CONFIG.USER_KEY || 'moakkil_user')) || {};

// =================================================================
// 📚 مكتبة الموجهات (API Endpoints Library)
// =================================================================
const API = {
    getFirmSettings: () => fetchAPI(`/api/firms?id=eq.${getCurrentUser().firm_id || ''}`),
    updateFirmSettings: (data) => fetchAPI(`/api/firms?id=eq.${getCurrentUser().firm_id || ''}`, 'PATCH', data),
    getSubscriptions: () => fetchAPI('/api/subscriptions'),

    getClients: () => fetchAPI(getCurrentUser().firm_id ? `/api/clients?firm_id=eq.${getCurrentUser().firm_id}` : '/api/clients'),
    addClient: (data) => fetchAPI('/api/clients', 'POST', data),
    updateClient: (id, data) => fetchAPI(`/api/clients?id=eq.${id}`, 'PATCH', data),
    deleteClient: (id) => fetchAPI(`/api/clients?id=eq.${id}`, 'DELETE'),
    getPOAs: (clientId) => fetchAPI(clientId ? `/api/poas?client_id=eq.${clientId}` : '/api/poas'),
    addPOA: (data) => fetchAPI('/api/poas', 'POST', data),
    deletePOA: (id) => fetchAPI(`/api/poas?id=eq.${id}`, 'DELETE'),

    getCases: () => fetchAPI(getCurrentUser().firm_id ? `/api/cases?firm_id=eq.${getCurrentUser().firm_id}` : '/api/cases'),
    addCase: (data) => fetchAPI('/api/cases', 'POST', data),
    updateCase: (id, data) => fetchAPI(`/api/cases?id=eq.${id}`, 'PATCH', data),
    deleteCase: (id) => fetchAPI(`/api/cases?id=eq.${id}`, 'DELETE'),
    
    getUpdates: (param) => fetchAPI(param ? (String(param).includes('=') ? `/api/updates?${param}` : `/api/updates?case_id=eq.${param}`) : '/api/updates'),
    addUpdate: (data) => fetchAPI('/api/updates', 'POST', data),
    deleteUpdate: (id) => fetchAPI(`/api/updates?id=eq.${id}`, 'DELETE'),
    
    getHearings: (param) => fetchAPI(param ? (String(param).includes('=') ? `/api/hearings?${param}` : `/api/hearings?case_id=eq.${param}`) : '/api/hearings'),
    addHearing: (data) => fetchAPI('/api/hearings', 'POST', data),
    updateHearing: (id, data) => fetchAPI(`/api/hearings?id=eq.${id}`, 'PATCH', data),
    deleteHearing: (id) => fetchAPI(`/api/hearings?id=eq.${id}`, 'DELETE'),

    getStaff: () => fetchAPI(getCurrentUser().firm_id ? `/api/users?firm_id=eq.${getCurrentUser().firm_id}` : '/api/users'),
    addStaff: (data) => fetchAPI('/api/users', 'POST', data),
    updateStaff: (id, data) => fetchAPI(`/api/users?id=eq.${id}`, 'PATCH', data),
    deleteStaff: (id) => fetchAPI(`/api/users?id=eq.${id}`, 'DELETE'),
    
    getAppointments: () => fetchAPI(getCurrentUser().firm_id ? `/api/appointments?firm_id=eq.${getCurrentUser().firm_id}` : '/api/appointments'),
    addAppointment: async (data) => {
        if (data.appt_date) data.appt_date = applyJordanTimeHack(data.appt_date);
        return await fetchAPI('/api/appointments', 'POST', data);
    },
    updateAppointment: (id, data) => fetchAPI(`/api/appointments?id=eq.${id}`, 'PATCH', data),
    deleteAppointment: (id) => fetchAPI(`/api/appointments?id=eq.${id}`, 'DELETE'),

    getInstallments: (param) => fetchAPI(param ? (String(param).includes('=') ? `/api/installments?${param}` : `/api/installments?case_id=eq.${param}`) : '/api/installments'),
    addInstallment: (data) => fetchAPI('/api/installments', 'POST', data),
    deleteInstallment: (id, caseId) => fetchAPI(`/api/installments?id=eq.${id}&case_id=eq.${caseId}`, 'DELETE'),
    
    getExpenses: (param) => fetchAPI(param ? (String(param).includes('=') ? `/api/expenses?${param}` : `/api/expenses?case_id=eq.${param}`) : '/api/expenses'),
    addExpense: (data) => fetchAPI('/api/expenses', 'POST', data),
    deleteExpense: (id) => fetchAPI(`/api/expenses?id=eq.${id}`, 'DELETE'),

    askAI: (content) => fetchAPI('/api/ai/process', 'POST', { type: 'legal_advisor', content }),
    extractDataAI: (content, aiType = 'data_extractor') => fetchAPI('/api/ai/process', 'POST', { type: aiType, content }),
    
    extractLegalData: async (text) => {
        try {
            const token = localStorage.getItem(CONFIG.TOKEN_KEY || 'moakkil_token');
            const baseUrl = window.API_BASE_URL || CONFIG.API_URL || 'https://curly-pond-9975.hassan-alsakka.workers.dev';
            const res = await fetch(`${baseUrl}/api/ai/process`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ type: 'data_extractor', content: text })
            });

            if (!res.ok) throw new Error('فشل الاتصال بالذكاء الاصطناعي');
            const data = await res.json();
            
            let extracted = data.extracted_json || data;
            if (typeof extracted === 'string') {
                try { extracted = JSON.parse(extracted.replace(/```json/g, '').replace(/```/g, '').trim()); } 
                catch (e) { extracted = {}; }
            }
            return extracted;
        } catch (error) { return { error: error.message }; }
    },

    readOCR: (imageBase64) => fetchAPI('/api/ai/ocr', 'POST', { image_base_64: imageBase64 }),
    smartSearch: (query) => fetchAPI(`/api/search?q=${encodeURIComponent(query)}`),
    checkConflict: (name) => fetchAPI(`/api/check-conflict?name=${encodeURIComponent(name)}`),
    getLegalBrain: (query = '') => fetchAPI(query ? `/api/legal_brain?or=(title.ilike.*${query}*,category.ilike.*${query}*)` : '/api/legal_brain'),

    getNotifications: () => fetchAPI(getCurrentUser().id ? `/api/notifications?user_id=eq.${getCurrentUser().id}&order=created_at.desc` : '/api/notifications'),
    markNotificationAsRead: (id) => fetchAPI(`/api/notifications?id=eq.${id}`, 'PATCH', { is_read: true }),
    subscribePush: (data) => fetchAPI('/api/notifications/subscribe', 'POST', data),
    registerBiometric: (data) => fetchAPI('/api/auth/biometric-register', 'POST', data),
    
    biometricLogin: async (data) => {
        const res = await fetchAPI('/api/auth/biometric-login', 'POST', data, true);
        if (res && res.user && res.token) {
            const cachedUserStr = localStorage.getItem('moakkil_full_user_backup');
            if (cachedUserStr) {
                const cachedUser = JSON.parse(cachedUserStr);
                res.user = { ...cachedUser, ...res.user }; 
            }
        }
        return res;
    },
    
    getHistory: (entityId = null) => fetchAPI(entityId ? `/api/history?entity_id=eq.${entityId}` : '/api/history'),

    getFiles: (param) => fetchAPI(param ? (String(param).includes('=') ? `/api/files?${param}` : `/api/files?case_id=eq.${param}`) : '/api/files'),
    deleteFile: (id) => fetchAPI(`/api/files?id=eq.${id}`, 'DELETE'),

    // 🚀 تحديث جذري: الرفع المباشر والآمن السريع عبر FormData لحل مشكلة الـ 500
    uploadToCloudR2: async (file, title, category, expiryDate = null) => {
        if (!navigator.onLine) throw new Error("لا يمكن رفع الملفات في وضع عدم الاتصال.");
        
        // استخدام FormData يمنع استهلاك الذاكرة كـ Base64 ويرسل الملف كـ Stream
        const formData = new FormData();
        formData.append('file', file);
        if (title) formData.append('title', title);
        if (category) formData.append('category', category);
        if (expiryDate) formData.append('expiry_date', expiryDate);

        const token = localStorage.getItem(CONFIG.TOKEN_KEY || 'moakkil_token');
        const headers = {};
        // ⚠️ مهم جداً: لا تقم بتحديد Content-Type هنا! المتصفح سيضع multipart/form-data مع الـ boundary تلقائياً
        if (token) headers['Authorization'] = `Bearer ${token}`;

        try {
            const response = await fetch(`${CONFIG.API_URL}/api/files/upload`, {
                method: 'POST',
                headers: headers,
                body: formData
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'فشل الرفع السحابي');
            return data;
        } catch (error) {
            console.error('Cloudflare R2 Upload Error:', error);
            throw error;
        }
    },

    publicLogin: (data) => fetchAPI('/api/public/client/login', 'POST', data, true),
    getPublicPortalData: (token) => fetchAPI(`/api/public/client?token=${token}`, 'GET', null, true),
    verifyReceipt: (id) => fetchAPI(id && id !== 'undefined' ? `/api/public/verify-receipt?id=${id}` : '/api/public/verify-receipt', 'GET', null, true),
    verifyCV: (id) => fetchAPI(id && id !== 'undefined' ? `/api/public/verify-cv?id=${id}` : '/api/public/verify-cv', 'GET', null, true)
};