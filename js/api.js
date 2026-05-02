// js/api.js - المحرك الموحد المحدث V3.0 (Enterprise Edition)
// الدعم الكامل: JWT، سجل النشاطات المفلتر، استخلاص AI ديناميكي، البصمة، المزامنة السحابية مع نظام Retry، وضع عدم الاتصال (Offline Mode).

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

// 🕒 خدعة التوقيت: إضافة 3 ساعات للتوقيت العالمي لكي يقرأه بوت تيليغرام كتوقيت أردني
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
            console.warn("⚠️ تم رفض الجلسة. جاري تسجيل الخروج...");
            localStorage.removeItem(CONFIG.TOKEN_KEY || 'moakkil_token');
            localStorage.removeItem(CONFIG.USER_KEY || 'moakkil_user');
            window.location.href = 'login.html';
            return null;
        }

        // التحقق مما إذا كان الرد JSON أم نص/HTML (مثل خطأ 502)
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

// دالة مساعدة لجلب بيانات المستخدم الحالي بسرعة
const getCurrentUser = () => JSON.parse(localStorage.getItem(CONFIG.USER_KEY || 'moakkil_user')) || {};

// =================================================================
// 📚 مكتبة الموجهات (API Endpoints Library)
// =================================================================
const API = {
    getFirmSettings: () => fetchAPI(`/api/firms?id=eq.${getCurrentUser().firm_id || ''}`),
    updateFirmSettings: (data) => fetchAPI(`/api/firms?id=eq.${getCurrentUser().firm_id || ''}`, 'PATCH', data),
    getSubscriptions: () => fetchAPI('/api/subscriptions'),

    // 🔥 إضافة فلتر firm_id لضمان جلب البيانات الصحيحة وعدم رفض السيرفر
    getClients: () => fetchAPI(getCurrentUser().firm_id ? `/api/clients?firm_id=eq.${getCurrentUser().firm_id}` : '/api/clients'),
    addClient: (data) => fetchAPI('/api/clients', 'POST', data),
    updateClient: (id, data) => fetchAPI(`/api/clients?id=eq.${id}`, 'PATCH', data),
    deleteClient: (id) => fetchAPI(`/api/clients?id=eq.${id}`, 'DELETE'),
    getPOAs: (clientId) => fetchAPI(clientId ? `/api/poas?client_id=eq.${clientId}` : '/api/poas'),
    addPOA: (data) => fetchAPI('/api/poas', 'POST', data),
    deletePOA: (id) => fetchAPI(`/api/poas?id=eq.${id}`, 'DELETE'),

    // 🔥 إضافة فلتر firm_id
    getCases: () => fetchAPI(getCurrentUser().firm_id ? `/api/cases?firm_id=eq.${getCurrentUser().firm_id}` : '/api/cases'),
    addCase: (data) => fetchAPI('/api/cases', 'POST', data),
    updateCase: (id, data) => fetchAPI(`/api/cases?id=eq.${id}`, 'PATCH', data),
    deleteCase: (id) => fetchAPI(`/api/cases?id=eq.${id}`, 'DELETE'),
    
    // 🧠 دوال ذكية (Polymorphic) تقبل: حالة فارغة، أو فلتر بحث مخصص، أو case_id محدد
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
    
    // 🔥 تم تنظيف الدالة. سيقوم الوركر السحابي بتولي الإشعارات بالكامل للحماية من أخطاء الـ 500
    addAppointment: async (data) => {
        if (data.appt_date) {
            data.appt_date = applyJordanTimeHack(data.appt_date);
        }
        return await fetchAPI('/api/appointments', 'POST', data);
    },
    
    updateAppointment: (id, data) => fetchAPI(`/api/appointments?id=eq.${id}`, 'PATCH', data),
    deleteAppointment: (id) => fetchAPI(`/api/appointments?id=eq.${id}`, 'DELETE'),

    // 🧠 دوال ذكية (Polymorphic) للتعامل مع التقارير والمكتبة وتفاصيل القضية معاً
    getInstallments: (param) => fetchAPI(param ? (String(param).includes('=') ? `/api/installments?${param}` : `/api/installments?case_id=eq.${param}`) : '/api/installments'),
    addInstallment: (data) => fetchAPI('/api/installments', 'POST', data),
    deleteInstallment: (id, caseId) => fetchAPI(`/api/installments?id=eq.${id}&case_id=eq.${caseId}`, 'DELETE'),
    
    getExpenses: (param) => fetchAPI(param ? (String(param).includes('=') ? `/api/expenses?${param}` : `/api/expenses?case_id=eq.${param}`) : '/api/expenses'),
    addExpense: (data) => fetchAPI('/api/expenses', 'POST', data),
    deleteExpense: (id) => fetchAPI(`/api/expenses?id=eq.${id}`, 'DELETE'),

    askAI: (content) => fetchAPI('/api/ai/process', 'POST', { type: 'legal_advisor', content }),
    extractDataAI: (content, aiType = 'data_extractor') => fetchAPI('/api/ai/process', 'POST', { type: aiType, content }),
    
    // 🧠 دالة الاستخراج الذكي الشاملة (تتحمل أخطاء تنسيق الـ AI)
    extractLegalData: async (text) => {
        try {
            const token = localStorage.getItem(CONFIG.TOKEN_KEY || 'moakkil_token');
            const baseUrl = window.API_BASE_URL || CONFIG.API_URL || 'https://curly-pond-9975.hassan-alsakka.workers.dev';
            
            const res = await fetch(`${baseUrl}/api/ai/process`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({ type: 'data_extractor', content: text })
            });

            if (!res.ok) throw new Error('فشل الاتصال بالذكاء الاصطناعي');
            
            const data = await res.json();
            
            // محاولة صيد البيانات مهما كان شكلها (Fallbacks)
            let extracted = data.extracted_json || data;
            
            // في حال أعاد السيرفر نصاً وليس Object (بسبب علامات Markdown)
            if (typeof extracted === 'string') {
                try {
                    const cleanString = extracted.replace(/```json/g, '').replace(/```/g, '').trim();
                    extracted = JSON.parse(cleanString);
                } catch (e) {
                    console.warn("فشل في تحويل النص إلى JSON", e);
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

    // 🔥 حل مشكلة الإشعارات: طلب إشعارات "هذا المستخدم فقط"
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

    // 🧠 دالة ذكية للملفات تقبل فلاتر معقدة مثل: is_template=eq.true
    getFiles: (param) => fetchAPI(param ? (String(param).includes('=') ? `/api/files?${param}` : `/api/files?case_id=eq.${param}`) : '/api/files'),
    deleteFile: (id) => fetchAPI(`/api/files?id=eq.${id}`, 'DELETE'),
    addFileRecord: (data) => {
        const currentUser = getCurrentUser();
        const firmId = currentUser.firm_id || localStorage.getItem(CONFIG.FIRM_KEY);
        const payload = { ...data, added_by: currentUser.id || null, firm_id: firmId || null };
        return fetchAPI('/api/files', 'POST', payload);
    },

    // =================================================================
    // 🚀 تحديث محرك الرفع السحابي ليعمل مع Cloudflare R2
    // =================================================================
    
    // دالة الرفع المباشر إلى مسار Worker R2
    uploadToCloudR2: async (file, caseInternalId = "عام", clientName = "عام") => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async () => {
                const base64Data = reader.result.split(',')[1];
                const payload = {
                    file_name: file.name,
                    file_type: file.type,
                    file_data_base64: base64Data,
                    case_internal_id: caseInternalId,
                    client_name: clientName
                };
                try {
                    const res = await fetchAPI('/api/files/upload', 'POST', payload);
                    if (res && res.success) {
                        resolve(res);
                    } else {
                        reject(new Error(res?.error || "فشل الرفع إلى التخزين السحابي"));
                    }
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = () => reject(new Error("فشل قراءة الملف محلياً"));
            reader.readAsDataURL(file);
        });
    },

    // الحفاظ على اسم الدالة القديمة (التوافقية الرجعية) لعدم انهيار أي واجهة
    // حتى يتم تعديل جميع الواجهات لتقرأ من الدالة الجديدة.
    uploadToDrive: async function(file, caseInternalId, driveFolderId = null) {
        // توجيه الطلب فوراً إلى الدالة الجديدة (R2)
        return this.uploadToCloudR2(file, caseInternalId, "غير_محدد");
    },

    publicLogin: (data) => fetchAPI('/api/public/client/login', 'POST', data, true),
    getPublicPortalData: (token) => fetchAPI(`/api/public/client?token=${token}`, 'GET', null, true),
    
    // 🛡️ إصلاح خطأ الـ undefined في جلب البطاقات والإيصالات
    verifyReceipt: (id) => fetchAPI(id && id !== 'undefined' ? `/api/public/verify-receipt?id=${id}` : '/api/public/verify-receipt', 'GET', null, true),
    verifyCV: (id) => fetchAPI(id && id !== 'undefined' ? `/api/public/verify-cv?id=${id}` : '/api/public/verify-cv', 'GET', null, true)
};