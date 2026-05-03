// js/api.js - المحرك الموحد المحدث V4.0 (Cloudflare R2 & AI Batch Sync Edition)
// الدعم الكامل: JWT، البصمة، المزامنة السحابية الدفعية (Batch Sync)، Cloudflare R2 للرفع، والذكاء الاصطناعي الشامل.

// =================================================================
// 🔄 نظام المزامنة الذكي الدفعي (Offline Batch Queue System)
// =================================================================
const OFFLINE_QUEUE_KEY = 'moakkil_offline_queue';

function saveToOfflineQueue(endpoint, method, body) {
    let queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
    
    // استخراج المعرف ومعالجة الطلبات
    let actionId = 'temp_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    let targetEndpoint = endpoint.split('?')[0]; // نحتاج المسار الأساسي فقط للوركر (مثل /api/cases)

    if (method !== 'POST') {
        const match = endpoint.match(/id=(eq\.[a-zA-Z0-9_-]+)/);
        if (match) actionId = match[1]; // استخراج eq.ID
    }

    queue.push({ 
        id: actionId, 
        endpoint: targetEndpoint, 
        method: method, 
        body: body || {}, 
        timestamp: Date.now(),
        original_url: endpoint 
    });
    
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    console.warn(`[Offline Mode] تم حفظ الطلب للمزامنة لاحقاً: ${targetEndpoint} | ActionID: ${actionId}`);
    
    if(window.showToast) {
        window.showToast('أنت غير متصل بالإنترنت. تم حفظ العملية محلياً وستتم المزامنة تلقائياً عند عودة الاتصال.', 'warning');
    }
}

async function processOfflineQueue() {
    let queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
    if (queue.length === 0) return;

    console.log(`[Sync] جاري مزامنة ${queue.length} طلبات محفوظة دفعة واحدة...`);
    if(window.showToast) window.showToast('عاد الاتصال. جاري مزامنة البيانات المحفوظة مع الخادم السحابي...', 'info');

    try {
        const token = localStorage.getItem(CONFIG.TOKEN_KEY || 'moakkil_token');
        const deviceId = localStorage.getItem('moakkil_device_id') || 'unknown-device';
        const baseUrl = window.API_BASE_URL || CONFIG.API_URL || '';
        
        const response = await fetch(`${baseUrl}/api/sync/offline`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'x-device-id': deviceId
            },
            body: JSON.stringify({ actions: queue })
        });

        if (!response.ok) throw new Error('فشل الاتصال بمسار المزامنة');
        const data = await response.json();

        if (data.success) {
            // تصفية الطابور وإزالة العمليات الناجحة فقط
            const syncedIds = data.synced_items.filter(i => i.status === 'success').map(i => i.temp_id || i.target_id);
            const remainingQueue = queue.filter(req => {
                const reqCleanId = req.id.replace('eq.', '');
                return !syncedIds.includes(reqCleanId) && !syncedIds.includes(req.id);
            });

            localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remainingQueue));
            
            if (remainingQueue.length === 0) {
                console.log('[Sync] تمت المزامنة الشاملة بنجاح.');
                if(window.showToast) window.showToast('تمت مزامنة جميع البيانات مع السيرفر السحابي بنجاح! ☁️', 'success');
                // تحديث الواجهة لتعكس البيانات الحقيقية
                if(typeof window.loadDashboardData === 'function') setTimeout(window.loadDashboardData, 1000);
            } else {
                console.warn('[Sync] تمت مزامنة جزء وبقيت عمليات فاشلة:', remainingQueue);
                if(window.showToast) window.showToast('تمت مزامنة بعض البيانات، ولكن واجهت بعض العمليات أخطاء.', 'warning');
            }
        }
    } catch (e) {
        console.error(`[Sync Error] فشل المزامنة الشاملة:`, e);
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
            return { success: true, offline: true, temp_id: `temp_${Date.now()}`, message: "تم الحفظ محلياً لحين عودة الإنترنت" };
        } else {
            return { error: 'أنت غير متصل بالإنترنت، ولا يمكن جلب أحدث البيانات حالياً.' };
        }
    }

    const token = localStorage.getItem(CONFIG.TOKEN_KEY || 'moakkil_token');
    const deviceId = localStorage.getItem('moakkil_device_id') || 'unknown-device';
    const baseUrl = window.API_BASE_URL || CONFIG.API_URL || '';
    
    const headers = { 
        'Content-Type': 'application/json',
        'x-device-id': deviceId
    };
    
    if (token && !isPublic) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);
    
    try {
        const response = await fetch(`${baseUrl}${endpoint}`, options);
        
        if (response.status === 401 && !isPublic) {
            console.warn("⚠️ تم رفض الجلسة أو تم تسجيل الدخول من جهاز آخر. جاري الطرد...");
            localStorage.removeItem(CONFIG.TOKEN_KEY || 'moakkil_token');
            localStorage.removeItem(CONFIG.USER_KEY || 'moakkil_user');
            window.location.href = 'login';
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
            return { success: true, offline: true, message: "تم الحفظ محلياً بسبب انقطاع الاتصال المفاجئ" };
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

    // =================================================================
    // 🧠 العقل الذكي (AI Integration Engine)
    // =================================================================
    askAI: (content) => fetchAPI('/api/ai/process', 'POST', { type: 'legal_advisor', content }),
    extractDataAI: (content, aiType = 'data_extractor') => fetchAPI('/api/ai/process', 'POST', { type: aiType, content }),
    
    // 🔥 جديد: صياغة المذكرات القانونية تلقائياً
    generateLegalDraft: (caseFacts, similarCases) => fetchAPI('/api/ai/process', 'POST', { 
        type: 'auto_draft', 
        content: { case_facts: caseFacts, similar_cases: similarCases } 
    }),
    
    extractLegalData: async (text) => {
        try {
            const res = await fetchAPI('/api/ai/process', 'POST', { type: 'data_extractor', content: text });
            if (res.error) throw new Error(res.error);
            
            let extracted = res.extracted_json || res;
            if (typeof extracted === 'string') {
                try {
                    const cleanString = extracted.replace(/```json/g, '').replace(/```/g, '').trim();
                    extracted = JSON.parse(cleanString);
                } catch (e) {
                    extracted = {};
                }
            }
            return extracted;
        } catch (error) {
            console.error('AI Extraction Error:', error);
            return { error: error.message };
        }
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

    // =================================================================
    // ☁️ إدارة الملفات عبر Cloudflare R2 (بديل Google Drive)
    // =================================================================
    getFiles: (param) => fetchAPI(param ? (String(param).includes('=') ? `/api/files?${param}` : `/api/files?case_id=eq.${param}`) : '/api/files'),
    deleteFile: (id) => fetchAPI(`/api/files?id=eq.${id}`, 'DELETE'),
    
    addFileRecord: (data) => {
        const currentUser = getCurrentUser();
        const payload = { ...data, added_by: currentUser.id || null, firm_id: currentUser.firm_id || null };
        return fetchAPI('/api/files', 'POST', payload);
    },

    // رفع الملف مباشرة إلى R2 كـ Stream (سريع جداً وآمن)
    uploadFileToR2: async (file, clientId = 'general', caseId = 'general') => {
        const token = localStorage.getItem(CONFIG.TOKEN_KEY || 'moakkil_token');
        const deviceId = localStorage.getItem('moakkil_device_id') || 'unknown-device';
        const baseUrl = window.API_BASE_URL || CONFIG.API_URL || '';

        const headers = {
            'Authorization': `Bearer ${token}`,
            'x-device-id': deviceId,
            'x-file-name': encodeURIComponent(file.name),
            'x-client-id': clientId,
            'x-case-id': caseId
        };

        try {
            const response = await fetch(`${baseUrl}/api/r2/upload`, {
                method: 'POST',
                headers: headers,
                body: file // رفع الملف كبيانات ثنائية مباشرة
            });

            if (!response.ok) throw new Error('فشل الرفع إلى الخوادم السحابية R2');
            return await response.json(); // يرجع { success: true, r2_key: "..." }
        } catch (e) {
            console.error("R2 Upload Error:", e);
            throw e;
        }
    },

    // توافقية رجعية (Backward Compatibility) كي لا يتعطل الكود القديم إذا نادى uploadToDrive
    uploadToDrive: async (file, caseInternalId, driveFolderId = null) => {
        console.warn("ملاحظة: تم الترقية لـ R2. جاري تحويل الرفع السحابي...");
        return await API.uploadFileToR2(file, 'general', caseInternalId);
    },

    // تحميل آمن للملفات من R2
    downloadR2File: async (r2Key, fileName) => {
        const token = localStorage.getItem(CONFIG.TOKEN_KEY || 'moakkil_token');
        const baseUrl = window.API_BASE_URL || CONFIG.API_URL || '';
        
        if(window.showToast) window.showToast('جاري جلب الملف الآمن من التخزين السحابي...', 'info');
        
        try {
            const res = await fetch(`${baseUrl}/api/r2/download?key=${encodeURIComponent(r2Key)}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (!res.ok) throw new Error('الملف غير موجود أو لا تملك صلاحية');
            
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName || r2Key.split('_').slice(1).join('_') || 'document';
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (e) {
            if(window.showToast) window.showToast('خطأ: ' + e.message, 'error');
        }
    },

    publicLogin: (data) => fetchAPI('/api/public/client/login', 'POST', data, true),
    getPublicPortalData: (token) => fetchAPI(`/api/public/client?token=${token}`, 'GET', null, true),
    verifyReceipt: (id) => fetchAPI(id && id !== 'undefined' ? `/api/public/verify-receipt?id=${id}` : '/api/public/verify-receipt', 'GET', null, true),
    verifyCV: (id) => fetchAPI(id && id !== 'undefined' ? `/api/public/verify-cv?id=${id}` : '/api/public/verify-cv', 'GET', null, true)
};