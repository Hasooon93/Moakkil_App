// js/api.js - المحرك الموحد المحدث V4.0 (Enterprise Edition & R2 Cloud Core)
// الدعم الكامل: JWT، العزل (Multi-Tenancy)، سجل النشاطات، الذكاء الاصطناعي، البصمة، والحذف المادي من R2.

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
        window.showToast('أنت غير متصل بالإنترنت. تم حفظ العملية وستتم المزامنة تلقائياً عند عودة الاتصال.', 'warning');
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
        if(window.showToast) window.showToast('تمت مزامنة جميع البيانات مع السيرفر بنجاح!', 'success');
    }
}

window.addEventListener('online', processOfflineQueue);

// =================================================================
// 🚀 المحرك الرئيسي للاتصال (Main Fetch Wrapper)
// =================================================================

// 🕒 إضافة 3 ساعات للتوقيت العالمي لكي يقرأه بوت تيليغرام كتوقيت أردني
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

// 🛡️ تقوية المحرك لمعالجة أخطاء السيرفر (500) وعدم انهيار النظام
async function fetchAPI(endpoint, method = 'GET', body = null, isPublic = false) {
    if (!navigator.onLine && !isPublic) {
        if (['POST', 'PATCH', 'DELETE'].includes(method)) {
            saveToOfflineQueue(endpoint, method, body);
            return { success: true, offline: true, message: "تم الحفظ محلياً لحين عودة الإنترنت" };
        } else {
            return { error: 'أنت غير متصل بالإنترنت، ولا يمكن جلب أحدث البيانات حالياً.' };
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
            console.warn("⚠️ تم رفض الجلسة. جاري طرد الجلسة القديمة (Single Session Protection)...");
            localStorage.removeItem(CONFIG.TOKEN_KEY || 'moakkil_token');
            localStorage.removeItem(CONFIG.USER_KEY || 'moakkil_user');
            window.location.href = 'login.html';
            return null;
        }

        // التحقق مما إذا كان الرد JSON أم نص/HTML لتجنب الأعطال الصامتة
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || data.message || `خطأ سيرفر: ${response.status}`);
            return data;
        } else {
            if (!response.ok) throw new Error(`استجابة غير متوقعة من السيرفر (الكود: ${response.status})`);
            return { success: true }; // في حال كان الرد 204 No Content
        }

    } catch (error) {
        console.error(`❌ API Error [${endpoint}]:`, error.message);
        if (error.message === 'Failed to fetch' && ['POST', 'PATCH', 'DELETE'].includes(method)) {
            saveToOfflineQueue(endpoint, method, body);
            return { success: true, offline: true, message: "تم الحفظ محلياً بسبب انقطاع الاتصال المفاجئ" };
        }
        return { error: error.message }; 
    }
}

// جلب بيانات المستخدم الحالي بسرعة (Identity)
const getCurrentUser = () => JSON.parse(localStorage.getItem(CONFIG.USER_KEY || 'moakkil_user')) || {};

// =================================================================
// 📚 مكتبة الموجهات (API Endpoints Library & RLS Integration)
// =================================================================
const API = {
    // ⚙️ إعدادات المكتب والاشتراكات
    getFirmSettings: () => fetchAPI(`/api/firms?id=eq.${getCurrentUser().firm_id || ''}`),
    updateFirmSettings: (data) => fetchAPI(`/api/firms?id=eq.${getCurrentUser().firm_id || ''}`, 'PATCH', data),
    getSubscriptions: () => fetchAPI('/api/subscriptions'),

    // 👥 الموكلين والوكالات
    getClients: () => fetchAPI(getCurrentUser().firm_id ? `/api/clients?firm_id=eq.${getCurrentUser().firm_id}` : '/api/clients'),
    addClient: (data) => fetchAPI('/api/clients', 'POST', data),
    updateClient: (id, data) => fetchAPI(`/api/clients?id=eq.${id}`, 'PATCH', data),
    deleteClient: (id) => fetchAPI(`/api/clients?id=eq.${id}`, 'DELETE'),
    getPOAs: (clientId) => fetchAPI(clientId ? `/api/poas?client_id=eq.${clientId}` : '/api/poas'),
    addPOA: (data) => fetchAPI('/api/poas', 'POST', data),
    deletePOA: (id) => fetchAPI(`/api/poas?id=eq.${id}`, 'DELETE'),

    // ⚖️ القضايا والإجراءات
    getCases: () => fetchAPI(getCurrentUser().firm_id ? `/api/cases?firm_id=eq.${getCurrentUser().firm_id}` : '/api/cases'),
    addCase: (data) => fetchAPI('/api/cases', 'POST', data),
    updateCase: (id, data) => fetchAPI(`/api/cases?id=eq.${id}`, 'PATCH', data),
    deleteCase: (id) => fetchAPI(`/api/cases?id=eq.${id}`, 'DELETE'),
    
    getUpdates: (param) => fetchAPI(param ? (String(param).includes('=') ? `/api/updates?${param}` : `/api/updates?case_id=eq.${param}`) : '/api/updates'),
    addUpdate: (data) => fetchAPI('/api/updates', 'POST', data),
    
    getHearings: (param) => fetchAPI(param ? (String(param).includes('=') ? `/api/hearings?${param}` : `/api/hearings?case_id=eq.${param}`) : '/api/hearings'),
    addHearing: (data) => fetchAPI('/api/hearings', 'POST', data),
    updateHearing: (id, data) => fetchAPI(`/api/hearings?id=eq.${id}`, 'PATCH', data),
    deleteHearing: (id) => fetchAPI(`/api/hearings?id=eq.${id}`, 'DELETE'),

    // 🧑‍💼 الموارد البشرية (HR)
    getStaff: () => fetchAPI(getCurrentUser().firm_id ? `/api/users?firm_id=eq.${getCurrentUser().firm_id}` : '/api/users'),
    addStaff: (data) => fetchAPI('/api/users', 'POST', data),
    updateStaff: (id, data) => fetchAPI(`/api/users?id=eq.${id}`, 'PATCH', data),
    deleteStaff: (id) => fetchAPI(`/api/users?id=eq.${id}`, 'DELETE'),
    
    // 📅 الأجندة والمواعيد
    getAppointments: () => fetchAPI(getCurrentUser().firm_id ? `/api/appointments?firm_id=eq.${getCurrentUser().firm_id}` : '/api/appointments'),
    addAppointment: async (data) => {
        if (data.appt_date) data.appt_date = applyJordanTimeHack(data.appt_date);
        return await fetchAPI('/api/appointments', 'POST', data);
    },
    updateAppointment: (id, data) => fetchAPI(`/api/appointments?id=eq.${id}`, 'PATCH', data),
    deleteAppointment: (id) => fetchAPI(`/api/appointments?id=eq.${id}`, 'DELETE'),

    // 💰 النزاهة المالية (Financial Engine)
    getInstallments: (param) => fetchAPI(param ? (String(param).includes('=') ? `/api/installments?${param}` : `/api/installments?case_id=eq.${param}`) : '/api/installments'),
    addInstallment: (data) => fetchAPI('/api/installments', 'POST', data),
    deleteInstallment: (id, caseId) => fetchAPI(`/api/installments?id=eq.${id}&case_id=eq.${caseId}`, 'DELETE'),
    
    getExpenses: (param) => fetchAPI(param ? (String(param).includes('=') ? `/api/expenses?${param}` : `/api/expenses?case_id=eq.${param}`) : '/api/expenses'),
    addExpense: (data) => fetchAPI('/api/expenses', 'POST', data),

    // =================================================================
    // 🧠 محركات الذكاء الاصطناعي (AI Core & Semantic Search)
    // =================================================================
    askAI: (content) => fetchAPI('/api/ai/process', 'POST', { type: 'legal_advisor', content }),
    extractDataAI: (content, aiType = 'data_extractor') => fetchAPI('/api/ai/process', 'POST', { type: aiType, content }),
    
    extractLegalData: async (text) => {
        try {
            const token = localStorage.getItem(CONFIG.TOKEN_KEY || 'moakkil_token');
            const baseUrl = window.API_BASE_URL || CONFIG.API_URL;
            const res = await fetch(`${baseUrl}/api/ai/process`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ type: 'data_extractor', content: text })
            });

            if (!res.ok) throw new Error('فشل الاتصال بالذكاء الاصطناعي');
            const data = await res.json();
            
            // معالجة ذكية للبيانات الراجعة (تفتيت اللائحة JSONB)
            let extracted = data.extracted_json || data;
            if (typeof extracted === 'string') {
                try {
                    const cleanString = extracted.replace(/```json/g, '').replace(/```/g, '').trim();
                    extracted = JSON.parse(cleanString);
                } catch (e) { extracted = {}; }
            }
            return extracted;
        } catch (error) { return { error: error.message }; }
    },

    readOCR: (imageBase64) => fetchAPI('/api/ai/ocr', 'POST', { image_base_64: imageBase64 }),
    smartSearch: (query) => fetchAPI(`/api/search?q=${encodeURIComponent(query)}`),
    getLegalBrain: (query = '') => fetchAPI(query ? `/api/legal_brain?or=(title.ilike.*${query}*,category.ilike.*${query}*)` : '/api/legal_brain'),

    // 🔔 الإشعارات وسجل الرقابة (Audit & Alert)
    getNotifications: () => fetchAPI(getCurrentUser().id ? `/api/notifications?user_id=eq.${getCurrentUser().id}&order=created_at.desc` : '/api/notifications'),
    markNotificationAsRead: (id) => fetchAPI(`/api/notifications?id=eq.${id}`, 'PATCH', { is_read: true }),
    subscribePush: (data) => fetchAPI('/api/notifications/subscribe', 'POST', data),
    getHistory: (entityId = null) => fetchAPI(entityId ? `/api/history?entity_id=eq.${entityId}` : '/api/history'),

    // 👤 البصمة والمصادقة
    registerBiometric: (data) => fetchAPI('/api/auth/biometric-register', 'POST', data),
    biometricLogin: async (data) => {
        const res = await fetchAPI('/api/auth/biometric-login', 'POST', data, true);
        if (res && res.user && res.token) {
            const cachedUserStr = localStorage.getItem('moakkil_full_user_backup');
            if (cachedUserStr) res.user = { ...JSON.parse(cachedUserStr), ...res.user }; 
        }
        return res;
    },

    // =================================================================
    // ☁️ محرك التخزين السحابي وحل الحلقات المفرغة (Cloudflare R2)
    // =================================================================
    
    // 1. الدالة السحرية لحل مشكلة اختفاء الروابط (تأمين الـ URLs)
    getSecureUrl: (url) => {
        if (!url || url === '#' || url.startsWith('blob:')) return url;
        const token = localStorage.getItem(CONFIG.TOKEN_KEY || 'moakkil_token');
        try {
            const urlObj = new URL(url);
            urlObj.searchParams.set('token', token);
            return urlObj.toString();
        } catch(e) {
            const separator = url.includes('?') ? '&' : '?';
            return `${url}${separator}token=${token}`;
        }
    },

    // 2. الرفع المباشر إلى Cloudflare R2
    uploadToCloudR2: async (file, folderName, subFolder) => {
        const token = localStorage.getItem(CONFIG.TOKEN_KEY || 'moakkil_token');
        const formData = new FormData();
        formData.append('file', file);
        formData.append('folder', folderName || 'عام');
        formData.append('subfolder', subFolder || 'غير_محدد');
        
        try {
            const res = await fetch(`${CONFIG.API_URL}/api/r2/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }, // لا تضع Content-Type ليقوم المتصفح بضبط الـ boundary
                body: formData
            });
            return await res.json();
        } catch (e) { return { error: e.message }; }
    },

    // 3. الحذف المادي من التخزين السحابي (الإعدام الرقمي)
    deleteFromCloudR2: async (fileKey) => {
        if (!fileKey || fileKey === '#') return;
        const token = localStorage.getItem(CONFIG.TOKEN_KEY || 'moakkil_token');
        try {
            await fetch(`${CONFIG.API_URL}/api/r2/delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ file_key: fileKey })
            });
        } catch (e) { console.warn('R2 Physical Deletion warning:', e); }
    },

    // 4. دوال إدارة الملفات المقترنة بالحذف المادي
    getFiles: (param) => fetchAPI(param ? (String(param).includes('=') ? `/api/files?${param}` : `/api/files?case_id=eq.${param}`) : '/api/files'),
    
    addFileRecord: (data) => {
        const currentUser = getCurrentUser();
        const firmId = currentUser.firm_id || localStorage.getItem(CONFIG.FIRM_KEY);
        const payload = { ...data, added_by: currentUser.id || null, firm_id: firmId || null };
        return fetchAPI('/api/files', 'POST', payload);
    },

    deleteFile: async (id) => {
        try {
            // أ) جلب السجل لمعرفة مفتاح التخزين السحابي (R2 Key)
            const fileRes = await fetchAPI(`/api/files?id=eq.${id}`);
            if (fileRes && fileRes.length > 0) {
                const r2Key = fileRes[0].drive_file_id || fileRes[0].file_url;
                // ب) حذف الملف المادي من السحابة أولاً
                await API.deleteFromCloudR2(r2Key);
            }
            // ج) حذف السجل من قاعدة البيانات (تسجل في Audit Trail تلقائياً)
            return await fetchAPI(`/api/files?id=eq.${id}`, 'DELETE');
        } catch(e) { return { error: e.message }; }
    },

    deleteUpdate: async (id) => {
        try {
            const updateRes = await fetchAPI(`/api/updates?id=eq.${id}`);
            if (updateRes && updateRes.length > 0 && updateRes[0].attachment_url) {
                await API.deleteFromCloudR2(updateRes[0].attachment_url);
            }
            return await fetchAPI(`/api/updates?id=eq.${id}`, 'DELETE');
        } catch(e) { return { error: e.message }; }
    },

    deleteExpense: async (id) => {
        try {
            const expRes = await fetchAPI(`/api/expenses?id=eq.${id}`);
            if (expRes && expRes.length > 0 && expRes[0].receipt_url) {
                await API.deleteFromCloudR2(expRes[0].receipt_url);
            }
            return await fetchAPI(`/api/expenses?id=eq.${id}`, 'DELETE');
        } catch(e) { return { error: e.message }; }
    },

    // 🌐 بوابة الموكل العامة (Client Portal)
    publicLogin: (data) => fetchAPI('/api/public/client/login', 'POST', data, true),
    getPublicPortalData: (token) => fetchAPI(`/api/public/client?token=${token}`, 'GET', null, true),
    verifyReceipt: (id) => fetchAPI(id && id !== 'undefined' ? `/api/public/verify-receipt?id=${id}` : '/api/public/verify-receipt', 'GET', null, true),
    verifyCV: (id) => fetchAPI(id && id !== 'undefined' ? `/api/public/verify-cv?id=${id}` : '/api/public/verify-cv', 'GET', null, true)
};