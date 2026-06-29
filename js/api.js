/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: js/api.js
 * الوصف: المحرك الموحد للاتصال بالخادم (V4.6 Cloudflare R2, AI Batch Sync & MFA Edition)
 * الميزات:
 * 1. نظام المزامنة الدفعي (Batch Queue) للعمل بكفاءة دون إنترنت مع قفل منع التكرار (Anti-Spam Lock).
 * 2. اعتراض الأخطاء وإدارة الجلسات (401 Unauthorized Interceptor & 409 Conflict).
 * 3. التشفير الآمن للحروف العربية في الـ Headers لخدمات الرفع السحابي (R2).
 * 4. ربط جميع وحدات النظام بموجهات موحدة متضمنة السوابق الذكية (Cross-Case AI).
 * 5. إصلاح جذري لمشكلة الإزاحة الزمنية (Zero-Offset UTC).
 * 6. تصحيح الاعتماديات لدالة getCases لتعمل بانسجام مع app-core.js.
 * ============================================================================
 */

// ============================================================================
// [1] نظام المزامنة الذكية دون اتصال (Offline Batch Queue System)
// ============================================================================
const OFFLINE_QUEUE_KEY = 'moakkil_offline_queue';
let isSyncing = false; // 🔥 قفل أمني لمنع التزامن المزدوج وطوفان الإشعارات (Mutex Lock)

/**
 * حفظ العمليات (POST, PATCH, DELETE) محلياً عند انقطاع الإنترنت
 */
function saveToOfflineQueue(endpoint, method, body) {
    let queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
    
    // استخراج المعرف ومعالجة الطلبات
    let actionId = 'temp_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    let targetEndpoint = endpoint.split('?')[0]; // نحتاج المسار الأساسي فقط للوركر (مثل /api/cases)

    if (method !== 'POST') {
        const match = endpoint.match(/id=(eq\.[a-zA-Z0-9_-]+)/);
        if (match) actionId = match[1]; // استخراج eq.ID للتعديل أو الحذف
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
    console.warn(`🛡️ [Offline Mode] تم حفظ الطلب للمزامنة لاحقاً: ${targetEndpoint} | ActionID: ${actionId}`);
    
    if (window.showToast) {
        window.showToast('أنت غير متصل بالإنترنت. تم حفظ العملية محلياً وستتم المزامنة تلقائياً عند عودة الاتصال.', 'warning');
    }
}

/**
 * معالجة الطابور ورفع البيانات للخادم دفعة واحدة عند عودة الاتصال
 */
async function processOfflineQueue() {
    if (isSyncing) return; // 🔥 منع التكرار إذا كانت المزامنة قيد التشغيل بالفعل
    
    let queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
    if (queue.length === 0) return;

    isSyncing = true;
    console.log(`🔄 [Sync Engine] جاري مزامنة ${queue.length} طلبات محفوظة دفعة واحدة...`);
    if (window.showToast) window.showToast('عاد الاتصال. جاري مزامنة البيانات المحفوظة مع الخادم السحابي...', 'info');

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

        if (!response.ok) throw new Error('فشل الاتصال بمسار المزامنة في الباك إند');
        const data = await response.json();

        if (data.success) {
            // تصفية الطابور وإزالة العمليات الناجحة فقط، وترك الفاشلة للمحاولة لاحقاً
            const syncedIds = data.synced_items.filter(i => i.status === 'success').map(i => i.temp_id || i.target_id);
            const remainingQueue = queue.filter(req => {
                const reqCleanId = req.id.replace('eq.', '');
                return !syncedIds.includes(reqCleanId) && !syncedIds.includes(req.id);
            });

            localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remainingQueue));
            
            if (remainingQueue.length === 0) {
                console.log('✅ [Sync Engine] تمت المزامنة الشاملة بنجاح.');
                if(window.showToast) window.showToast('تمت مزامنة جميع البيانات مع السيرفر السحابي بنجاح! ☁️', 'success');
                // تحديث الواجهة لتعكس البيانات الحقيقية إذا كانت الدالة موجودة
                if(typeof window.loadDashboardData === 'function') setTimeout(window.loadDashboardData, 1000);
            } else {
                console.warn('⚠️ [Sync Engine] تمت مزامنة جزء وبقيت عمليات فاشلة:', remainingQueue);
                if(window.showToast) window.showToast('تمت مزامنة بعض البيانات، ولكن واجهت بعض العمليات أخطاء.', 'warning');
            }
        }
    } catch (e) {
        console.error(`❌ [Sync Error] فشل المزامنة الشاملة:`, e);
    } finally {
        isSyncing = false; // 🔥 تحرير القفل بعد الانتهاء
    }
}

// مراقبة عودة الإنترنت لتفعيل المزامنة التلقائية
window.addEventListener('online', processOfflineQueue);

// ============================================================================
// [2] معالجات الوقت والمساعدات (Time & Helpers)
// ============================================================================

/**
 * توحيد التوقيت (Timezone Fix) - إصلاح جذري للإزاحة
 */
function applyJordanTimeHack(isoString) {
    // 🔥 [إصلاح معماري جذري]: تم إيقاف زيادة 3 ساعات محلياً.
    // المتصفح الآن يعتمد على توقيت الـ UTC القياسي المتوافق 100% مع قاعدة البيانات والوركر.
    if (!isoString) return isoString;
    try {
        return new Date(isoString).toISOString(); 
    } catch(e) {
        return isoString;
    }
}

// جلب المستخدم الحالي من التخزين المحلي
const getCurrentUser = () => JSON.parse(localStorage.getItem(CONFIG.USER_KEY || 'moakkil_user')) || {};

// ============================================================================
// [3] المحرك الرئيسي للاتصال بالخادم (Main Fetch Wrapper)
// ============================================================================

/**
 * دالة التغليف الذكية للاتصال بالـ API (تعالج الـ Tokens والأخطاء والأوفلاين والمصادقة الثنائية)
 */
async function fetchAPI(endpoint, method = 'GET', body = null, isPublic = false, actionToken = null) {
    // 1. معالجة حالة انقطاع الإنترنت (Offline Handling)
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
    
    // 2. تجهيز الترويسات الأمنية (Headers)
    const headers = { 
        'Content-Type': 'application/json',
        'x-device-id': deviceId
    };
    
    if (token && !isPublic) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    // إضافة ترويسة المصادقة الثنائية (WebAuthn) إن وجدت للعمليات الحساسة
    if (actionToken) {
        headers['x-action-token'] = actionToken;
    }
    
    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);
    
    try {
        // 3. تنفيذ الطلب
        const response = await fetch(`${baseUrl}${endpoint}`, options);
        
        // 4. الحماية ضد الجلسات المنتهية أو اختطاف الجلسات (Single Session Firewall - خطأ 401)
        if (response.status === 401 && !isPublic) {
            console.warn("⚠️ [Security] تم رفض الجلسة (قد يكون IP قد تغير أو تم تسجيل الدخول من جهاز آخر). جاري الطرد...");
            localStorage.removeItem(CONFIG.TOKEN_KEY || 'moakkil_token');
            localStorage.removeItem(CONFIG.USER_KEY || 'moakkil_user');
            if(window.showToast) window.showToast('تم إنهاء الجلسة لدواعٍ أمنية. يرجى تسجيل الدخول مجدداً.', 'error');
            setTimeout(() => { window.location.href = 'login.html'; }, 1500);
            return null;
        }

        // 5. معالجة تعارض المواعيد أو البيانات (Conflict Prevention - خطأ 409)
        if (response.status === 409) {
            const errorData = await response.json().catch(() => ({ error: 'تعارض في البيانات' }));
            throw new Error(errorData.error || 'عذراً، يوجد تعارض (مثال: موعد محجوز مسبقاً في هذا الوقت).');
        }

        // 6. معالجة الاستجابة الطبيعية (Parsing)
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
        
        // 7. التعامل مع فقدان الاتصال اللحظي أثناء الإرسال (Fallback)
        if (error.message === 'Failed to fetch' && ['POST', 'PATCH', 'DELETE'].includes(method)) {
            saveToOfflineQueue(endpoint, method, body);
            return { success: true, offline: true, message: "تم الحفظ محلياً بسبب انقطاع الاتصال المفاجئ" };
        }
        return { error: error.message }; 
    }
}

// ============================================================================
// [4] مكتبة الموجهات والمسارات (API Endpoints Library)
// ============================================================================
const API = {
    // -------------------------------------------------------------
    // 4.1 إدارة النظام والمكتب (Firm & Settings)
    // -------------------------------------------------------------
    getFirmSettings: () => fetchAPI(`/api/firms?id=eq.${getCurrentUser().firm_id || ''}`),
    updateFirmSettings: (data) => fetchAPI(`/api/firms?id=eq.${getCurrentUser().firm_id || ''}`, 'PATCH', data),
    getSubscriptions: () => fetchAPI('/api/subscriptions'),

    // -------------------------------------------------------------
    // 4.2 إدارة الموكلين والوكالات (Clients & POAs)
    // -------------------------------------------------------------
    getClients: () => fetchAPI(getCurrentUser().firm_id ? `/api/clients?firm_id=eq.${getCurrentUser().firm_id}` : '/api/clients'),
    addClient: (data) => fetchAPI('/api/clients', 'POST', data),
    updateClient: (id, data) => fetchAPI(`/api/clients?id=eq.${id}`, 'PATCH', data),
    deleteClient: (id) => fetchAPI(`/api/clients?id=eq.${id}`, 'DELETE'),
    
    getPOAs: (clientId) => fetchAPI(clientId ? `/api/poas?client_id=eq.${clientId}` : '/api/poas'),
    addPOA: (data) => fetchAPI('/api/poas', 'POST', data),
    deletePOA: (id) => fetchAPI(`/api/poas?id=eq.${id}`, 'DELETE'),

    // -------------------------------------------------------------
    // 4.3 إدارة القضايا والإجراءات (Cases & Updates & Hearings)
    // -------------------------------------------------------------
    getCases: () => fetchAPI(getCurrentUser().firm_id ? `/api/cases?firm_id=eq.${getCurrentUser().firm_id}` : '/api/cases'), // 🔥 تم إرجاعها إلى getCases لتعمل بشكل سليم
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

    // -------------------------------------------------------------
    // 4.4 إدارة الموارد البشرية والمهام (HR & Appointments)
    // -------------------------------------------------------------
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

    // -------------------------------------------------------------
    // 4.5 الإدارة المالية (Finance)
    // -------------------------------------------------------------
    getInstallments: (param) => fetchAPI(param ? (String(param).includes('=') ? `/api/installments?${param}` : `/api/installments?case_id=eq.${param}`) : '/api/installments'),
    addInstallment: (data) => fetchAPI('/api/installments', 'POST', data),
    deleteInstallment: (id, caseId) => fetchAPI(`/api/installments?id=eq.${id}&case_id=eq.${caseId}`, 'DELETE'),
    
    getExpenses: (param) => fetchAPI(param ? (String(param).includes('=') ? `/api/expenses?${param}` : `/api/expenses?case_id=eq.${param}`) : '/api/expenses'),
    addExpense: (data) => fetchAPI('/api/expenses', 'POST', data),
    deleteExpense: (id) => fetchAPI(`/api/expenses?id=eq.${id}`, 'DELETE'),

    // -------------------------------------------------------------
    // 4.6 العقل الذكي والبحث (AI Integration Engine)
    // -------------------------------------------------------------
    askAI: (content) => fetchAPI('/api/ai/process', 'POST', { type: 'legal_advisor', content }),
    extractDataAI: (content, aiType = 'data_extractor') => fetchAPI('/api/ai/process', 'POST', { type: aiType, content }),
    
    // صياغة المذكرات القانونية تلقائياً بناءً على السوابق
    generateLegalDraft: (caseFacts, similarCases) => fetchAPI('/api/ai/process', 'POST', { 
        type: 'auto_draft', 
        content: { case_facts: caseFacts, similar_cases: similarCases } 
    }),
    
    // استخراج وتحليل النصوص وتغليفها كـ JSON
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
    
    // مسارات الميزات الماسية
    checkConflict: (name) => fetchAPI(`/api/conflict-check?name=${encodeURIComponent(name)}`),
    generateSmartContract: (data) => fetchAPI('/api/contracts/generate', 'POST', data),
    getLegalBrain: (query = '') => fetchAPI(query ? `/api/legal_brain?or=(title.ilike.*${query}*,category.ilike.*${query}*)` : '/api/legal_brain'),

    // -------------------------------------------------------------
    // 4.7 الإشعارات والمصادقة وتاريخ النشاط (Security & Notifications)
    // -------------------------------------------------------------
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

    // -------------------------------------------------------------
    // 4.8 إدارة التخزين السحابي (Cloudflare R2 Files)
    // -------------------------------------------------------------
    getFiles: (param) => fetchAPI(param ? (String(param).includes('=') ? `/api/files?${param}` : `/api/files?case_id=eq.${param}`) : '/api/files'),
    deleteFile: (id) => fetchAPI(`/api/files?id=eq.${id}`, 'DELETE'),
    
    addFileRecord: (data) => {
        const currentUser = getCurrentUser();
        const payload = { ...data, added_by: currentUser.id || null, firm_id: currentUser.firm_id || null };
        return fetchAPI('/api/files', 'POST', payload);
    },

    /**
     * الرفع المباشر والآمن للملفات كبيانات ثنائية (Stream) إلى Cloudflare R2
     */
    uploadFileToR2: async (file, clientId = 'general', caseId = 'general') => {
        const token = localStorage.getItem(CONFIG.TOKEN_KEY || 'moakkil_token');
        const deviceId = localStorage.getItem('moakkil_device_id') || 'unknown-device';
        const baseUrl = window.API_BASE_URL || CONFIG.API_URL || '';

        // تشفير الحروف العربية في הـ Headers لمنع أخطاء (ISO-8859-1 HTTP Header encoding error)
        const headers = {
            'Authorization': `Bearer ${token}`,
            'x-device-id': deviceId,
            'x-file-name': encodeURIComponent(file.name),
            'x-client-id': encodeURIComponent(clientId),
            'x-case-id': encodeURIComponent(caseId)
        };

        try {
            const response = await fetch(`${baseUrl}/api/r2/upload`, {
                method: 'POST',
                headers: headers,
                body: file // رفع الملف مباشرة بدون Base64 لتسريع العملية وتقليل حجم البيانات
            });

            if (!response.ok) throw new Error('فشل الرفع إلى الخوادم السحابية R2');
            return await response.json(); 
        } catch (e) {
            console.error("R2 Upload Error:", e);
            throw e;
        }
    },

    /**
     * التحميل الآمن للملفات المشفرة من R2 عبر الـ Worker
     */
    downloadR2File: async (r2Key, fileName) => {
        const token = localStorage.getItem(CONFIG.TOKEN_KEY || 'moakkil_token');
        const baseUrl = window.API_BASE_URL || CONFIG.API_URL || '';
        
        if (window.showToast) window.showToast('جاري جلب وتشفير الملف من التخزين السحابي...', 'info');
        
        try {
            const res = await fetch(`${baseUrl}/api/r2/download?key=${encodeURIComponent(r2Key)}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (!res.ok) throw new Error('الملف غير موجود أو لا تملك الصلاحية الأمنية للوصول إليه');
            
            // تحويل الملف إلى Blob لعرضه أو تحميله دون كشف رابطه الفعلي
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
            if (window.showToast) window.showToast('خطأ: ' + e.message, 'error');
        }
    },

    // -------------------------------------------------------------
    // 4.9 البوابة العامة والتحقق المستقل (Public Portal & Validation)
    // -------------------------------------------------------------
    publicLogin: (data) => fetchAPI('/api/public/client/login', 'POST', data, true),
    getPublicPortalData: (token) => fetchAPI(`/api/public/client?token=${token}`, 'GET', null, true),
    verifyReceipt: (id) => fetchAPI(id && id !== 'undefined' ? `/api/public/verify-receipt?id=${id}` : '/api/public/verify-receipt', 'GET', null, true),
    verifyCV: (id) => fetchAPI(id && id !== 'undefined' ? `/api/public/verify-cv?id=${id}` : '/api/public/verify-cv', 'GET', null, true),

    // -------------------------------------------------------------
    // 4.10 السوابق الذكية والمكتبة الهجينة (Smart Arsenal - Phase 2 Prep)
    // -------------------------------------------------------------
    // استدعاء محرك البحث الدلالي لاستخراج السوابق المشابهة وربطها بالقضية
    findSimilarCases: (caseId, facts) => fetchAPI('/api/ai/cross-case', 'POST', { case_id: caseId, facts: facts }),
    
    // استدعاء محرك التوليد الآلي لتقارير الموكلين
    generateClientReport: (clientId) => fetchAPI('/api/ai/process', 'POST', { type: 'client_report', content: clientId })
};