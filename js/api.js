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

// 🕒 دالة التوقيت الذكية: تحويل التاريخ لنص صريح بتوقيت الأردن (UTC+3) لحل مشكلة تيليغرام
function formatJordanTime(isoString) {
    if(!isoString) return '';
    try {
        const date = new Date(isoString);
        return date.toLocaleString('ar-JO', {
            timeZone: 'Asia/Amman',
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    } catch (e) {
        return isoString;
    }
}

// دالة إرسال الإشعارات في الخلفية (Fire-and-Forget) لتسريع النظام
function sendNotificationAsync(endpoint, method, body) {
    const token = localStorage.getItem(CONFIG.TOKEN_KEY || 'moakkil_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    fetch(`${CONFIG.API_URL}${endpoint}`, {
        method: method,
        headers: headers,
        body: JSON.stringify(body)
    }).catch(e => console.warn('[Async Notification] فشل الإرسال بالخلفية:', e));
}

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
    const headers = {
        'Content-Type': 'application/json'
    };
    
    if (token && !isPublic) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);
    
    try {
        const response = await fetch(`${CONFIG.API_URL}${endpoint}`, options);
        
        if (response.status === 401 && !isPublic) {
            console.warn("⚠️ تم رفض الجلسة (مرفوضة أو منتهية). جاري تسجيل الخروج لحماية البيانات...");
            localStorage.removeItem(CONFIG.TOKEN_KEY || 'moakkil_token');
            localStorage.removeItem(CONFIG.USER_KEY || 'moakkil_user');
            window.location.href = 'login';
            return null;
        }

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || data.message || 'خطأ غير معروف في السيرفر');
        return data;
    } catch (error) {
        console.error(`❌ API Error [${endpoint}]:`, error.message);
        
        if (error.message === 'Failed to fetch' && ['POST', 'PATCH', 'DELETE'].includes(method)) {
            saveToOfflineQueue(endpoint, method, body);
            return { success: true, offline: true, message: "تم الحفظ محلياً بسبب انقطاع الاتصال المفاجئ" };
        }
        
        return { error: error.message }; 
    }
}

// =================================================================
// 📚 مكتبة الموجهات (API Endpoints Library)
// =================================================================
const API = {
    getFirmSettings: () => {
        const currentUser = JSON.parse(localStorage.getItem(CONFIG.USER_KEY || 'moakkil_user'));
        return fetchAPI(`/api/firms?id=eq.${currentUser?.firm_id || ''}`);
    },
    updateFirmSettings: (data) => {
        const currentUser = JSON.parse(localStorage.getItem(CONFIG.USER_KEY || 'moakkil_user'));
        return fetchAPI(`/api/firms?id=eq.${currentUser?.firm_id || ''}`, 'PATCH', data);
    },
    getSubscriptions: () => fetchAPI('/api/subscriptions'),

    getClients: () => fetchAPI('/api/clients'),
    addClient: (data) => fetchAPI('/api/clients', 'POST', data),
    updateClient: (id, data) => fetchAPI(`/api/clients?id=eq.${id}`, 'PATCH', data),
    deleteClient: (id) => fetchAPI(`/api/clients?id=eq.${id}`, 'DELETE'),
    getPOAs: (clientId) => fetchAPI(clientId ? `/api/poas?client_id=eq.${clientId}` : '/api/poas'),
    addPOA: (data) => fetchAPI('/api/poas', 'POST', data),
    deletePOA: (id) => fetchAPI(`/api/poas?id=eq.${id}`, 'DELETE'),

    getCases: () => fetchAPI('/api/cases'),
    addCase: (data) => fetchAPI('/api/cases', 'POST', data),
    updateCase: (id, data) => fetchAPI(`/api/cases?id=eq.${id}`, 'PATCH', data),
    deleteCase: (id) => fetchAPI(`/api/cases?id=eq.${id}`, 'DELETE'),
    getUpdates: (caseId) => fetchAPI(`/api/updates?case_id=eq.${caseId}`),
    addUpdate: (data) => fetchAPI('/api/updates', 'POST', data),
    deleteUpdate: (id) => fetchAPI(`/api/updates?id=eq.${id}`, 'DELETE'),
    getHearings: (caseId) => fetchAPI(caseId ? `/api/hearings?case_id=eq.${caseId}` : '/api/hearings'),
    addHearing: (data) => fetchAPI('/api/hearings', 'POST', data),
    updateHearing: (id, data) => fetchAPI(`/api/hearings?id=eq.${id}`, 'PATCH', data),
    deleteHearing: (id) => fetchAPI(`/api/hearings?id=eq.${id}`, 'DELETE'),

    getStaff: () => fetchAPI('/api/users'),
    addStaff: (data) => fetchAPI('/api/users', 'POST', data),
    updateStaff: (id, data) => fetchAPI(`/api/users?id=eq.${id}`, 'PATCH', data),
    deleteStaff: (id) => fetchAPI(`/api/users?id=eq.${id}`, 'DELETE'),
    getAppointments: () => fetchAPI('/api/appointments'),
    
    // 🔥 تم الإصلاح الجذري: إرسال المواعيد بالخلفية وحل مشكلة الإشعارات والتوقيت
    addAppointment: async (data) => {
        const res = await fetchAPI('/api/appointments', 'POST', data);
        if(res && !res.error && data.assigned_to && Array.isArray(data.assigned_to)) {
            // تحويل التاريخ فوراً إلى توقيت الأردن كنص
            const localTimeStr = data.appt_date ? formatJordanTime(data.appt_date) : 'غير محدد';
            
            // إرسال إشعار منفصل لكل محامي باستخدام user_id لتتطابق مع قاعدة البيانات
            data.assigned_to.forEach(userId => {
                sendNotificationAsync('/api/notifications', 'POST', {
                    user_id: userId,
                    title: 'مهمة / موعد جديد',
                    message: `تم إسناد مهمة لك: (${data.title}) بتاريخ ${localTimeStr}. يرجى مراجعة الأجندة.`,
                    action_url: '/app'
                });
            });
        }
        return res;
    },
    
    updateAppointment: (id, data) => fetchAPI(`/api/appointments?id=eq.${id}`, 'PATCH', data),
    deleteAppointment: (id) => fetchAPI(`/api/appointments?id=eq.${id}`, 'DELETE'),

    getInstallments: (caseId) => fetchAPI(`/api/installments?case_id=eq.${caseId}`),
    addInstallment: (data) => fetchAPI('/api/installments', 'POST', data),
    deleteInstallment: (id, caseId) => fetchAPI(`/api/installments?id=eq.${id}&case_id=eq.${caseId}`, 'DELETE'),
    getExpenses: (caseId) => fetchAPI(caseId ? `/api/expenses?case_id=eq.${caseId}` : '/api/expenses'),
    addExpense: (data) => fetchAPI('/api/expenses', 'POST', data),
    deleteExpense: (id) => fetchAPI(`/api/expenses?id=eq.${id}`, 'DELETE'),

    askAI: (content) => fetchAPI('/api/ai/process', 'POST', { type: 'legal_advisor', content }),
    extractDataAI: (content, aiType = 'data_extractor') => fetchAPI('/api/ai/process', 'POST', { type: aiType, content }),
    readOCR: (imageBase64) => fetchAPI('/api/ai/ocr', 'POST', { image_base_64: imageBase64 }),
    smartSearch: (query) => fetchAPI(`/api/search?q=${encodeURIComponent(query)}`),
    checkConflict: (name) => fetchAPI(`/api/check-conflict?name=${encodeURIComponent(name)}`),
    getLegalBrain: (query = '') => fetchAPI(query ? `/api/legal_brain?or=(title.ilike.*${query}*,category.ilike.*${query}*)` : '/api/legal_brain'),

    getNotifications: () => fetchAPI('/api/notifications'),
    markNotificationAsRead: (id) => fetchAPI(`/api/notifications?id=eq.${id}`, 'PATCH', { is_read: true }),
    subscribePush: (data) => fetchAPI('/api/notifications/subscribe', 'POST', data),
    registerBiometric: (data) => fetchAPI('/api/auth/biometric-register', 'POST', data),
    
    // 🔥 تم الإصلاح الجذري: ضمان تحميل بيانات المستخدم كاملة عند الدخول بالبصمة
    biometricLogin: async (data) => {
        const res = await fetchAPI('/api/auth/biometric-login', 'POST', data, true);
        if (res && res.user && res.token) {
            // حفظ التوكن مؤقتاً لكي تعمل دالة fetchAPI وتجلب البيانات المحمية
            localStorage.setItem(CONFIG.TOKEN_KEY || 'moakkil_token', res.token);
            
            const userDetails = await fetchAPI(`/api/users?id=eq.${res.user.id}`);
            if(userDetails && Array.isArray(userDetails) && userDetails.length > 0) {
                 res.user = { ...res.user, ...userDetails[0] }; 
            }
        }
        return res;
    },
    
    getHistory: (entityId = null) => fetchAPI(entityId ? `/api/history?entity_id=eq.${entityId}` : '/api/history'),

    getFiles: (caseId) => fetchAPI(caseId ? `/api/files?case_id=eq.${caseId}` : '/api/files'),
    deleteFile: (id) => fetchAPI(`/api/files?id=eq.${id}`, 'DELETE'),
    addFileRecord: (data) => {
        const currentUser = JSON.parse(localStorage.getItem(CONFIG.USER_KEY || 'moakkil_user'));
        const firmId = currentUser?.firm_id || localStorage.getItem(CONFIG.FIRM_KEY);
        const payload = { ...data, added_by: currentUser?.id || null, firm_id: firmId || null };
        return fetchAPI('/api/files', 'POST', payload);
    },
    getDriveUploadUrl: () => fetchAPI('/api/drive/generate-upload-url'),

    uploadToDrive: async (file, caseInternalId, driveFolderId = null) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async () => {
                const base64Data = reader.result.split(',')[1];
                const payload = { fileName: file.name, mimeType: file.type, fileData: base64Data, caseNumber: caseInternalId || "عام", driveFolderId: driveFolderId };
                const attemptUpload = async (retriesLeft) => {
                    try {
                        const res = await fetch(CONFIG.GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload), redirect: 'follow' });
                        const result = await res.json();
                        if(result?.success) resolve(result);
                        else throw new Error(result.error || "فشل إرجاع الرابط من جوجل درايف");
                    } catch (err) {
                        if (retriesLeft > 0) setTimeout(() => attemptUpload(retriesLeft - 1), 2500); 
                        else reject(new Error("تعذر الاتصال بخوادم جوجل السحابية: " + err.message));
                    }
                };
                attemptUpload(3);
            };
            reader.readAsDataURL(file);
        });
    },

    publicLogin: (data) => fetchAPI('/api/public/client/login', 'POST', data, true),
    getPublicPortalData: (token) => fetchAPI(`/api/public/client?token=${token}`, 'GET', null, true),
    verifyReceipt: (id) => fetchAPI(`/api/public/verify-receipt?id=${id}`, 'GET', null, true),
    verifyCV: (id) => fetchAPI(`/api/public/verify-cv?id=${id}`, 'GET', null, true)
};