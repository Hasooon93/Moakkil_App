// js/api.js - المحرك الموحد المحدث V12.0 (Enterprise R2 Core & Pure JSON Base64 Upload)
// الدعم الكامل: JWT، العزل التام (RLS)، الذكاء الاصطناعي الشامل، الرفع الآمن المضمون (JSON)، والحذف المادي.

const OFFLINE_QUEUE_KEY = 'moakkil_offline_queue';

function saveToOfflineQueue(endpoint, method, body) {
    let queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
    queue.push({ endpoint, method, body, timestamp: Date.now() });
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    if(window.showToast) window.showToast('أنت غير متصل بالإنترنت. تم حفظ العملية للمزامنة التلقائية.', 'warning');
}

async function processOfflineQueue() {
    let queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
    if (queue.length === 0) return;

    if(window.showToast) window.showToast('عاد الاتصال. جاري مزامنة البيانات...', 'info');
    let remainingQueue = [];
    for (let req of queue) {
        try {
            const token = localStorage.getItem(CONFIG.TOKEN_KEY || 'moakkil_token');
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const options = { method: req.method, headers };
            if (req.body) options.body = JSON.stringify(req.body);

            const response = await fetch(`${CONFIG.API_URL}${req.endpoint}`, options);
            if (!response.ok) throw new Error('فشل المزامنة');
        } catch (e) { remainingQueue.push(req); }
    }
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remainingQueue));
}

window.addEventListener('online', processOfflineQueue);

function applyJordanTimeHack(isoString) {
    if (!isoString) return isoString;
    try { let d = new Date(isoString); d.setHours(d.getHours() + 3); return d.toISOString(); } catch(e) { return isoString; }
}

async function fetchAPI(endpoint, method = 'GET', body = null, isPublic = false) {
    if (!navigator.onLine && !isPublic) {
        if (['POST', 'PATCH', 'DELETE'].includes(method)) {
            saveToOfflineQueue(endpoint, method, body);
            return { success: true, offline: true, message: "تم الحفظ محلياً" };
        } else return { error: 'أنت غير متصل بالإنترنت.' };
    }

    const token = localStorage.getItem(CONFIG.TOKEN_KEY || 'moakkil_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token && !isPublic) headers['Authorization'] = `Bearer ${token}`;
    
    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);
    
    try {
        const response = await fetch(`${CONFIG.API_URL}${endpoint}`, options);
        if (response.status === 401 && !isPublic) {
            localStorage.removeItem(CONFIG.TOKEN_KEY || 'moakkil_token');
            localStorage.removeItem(CONFIG.USER_KEY || 'moakkil_user');
            window.location.replace('/login');
            return null;
        }

        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || data.message || `خطأ: ${response.status}`);
            return data;
        } else {
            if (!response.ok) throw new Error(`استجابة غير متوقعة (${response.status})`);
            return { success: true }; 
        }
    } catch (error) {
        if (error.message === 'Failed to fetch' && ['POST', 'PATCH', 'DELETE'].includes(method)) {
            saveToOfflineQueue(endpoint, method, body);
            return { success: true, offline: true, message: "تم الحفظ محلياً لانقطاع الاتصال" };
        }
        return { error: error.message }; 
    }
}

const getCurrentUser = () => JSON.parse(localStorage.getItem(CONFIG.USER_KEY || 'moakkil_user')) || {};

const API = {
    // ⚙️ إعدادات المكتب
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

    // 🧑‍💼 الموارد البشرية
    getStaff: () => fetchAPI(getCurrentUser().firm_id ? `/api/users?firm_id=eq.${getCurrentUser().firm_id}` : '/api/users'),
    addStaff: (data) => fetchAPI('/api/users', 'POST', data),
    updateStaff: (id, data) => fetchAPI(`/api/users?id=eq.${id}`, 'PATCH', data),
    deleteStaff: (id) => fetchAPI(`/api/users?id=eq.${id}`, 'DELETE'),
    
    // 📅 الأجندة والمواعيد
    getAppointments: () => fetchAPI(getCurrentUser().firm_id ? `/api/appointments?firm_id=eq.${getCurrentUser().firm_id}` : '/api/appointments'),
    addAppointment: async (data) => { if (data.appt_date) data.appt_date = applyJordanTimeHack(data.appt_date); return await fetchAPI('/api/appointments', 'POST', data); },
    updateAppointment: (id, data) => fetchAPI(`/api/appointments?id=eq.${id}`, 'PATCH', data),
    deleteAppointment: (id) => fetchAPI(`/api/appointments?id=eq.${id}`, 'DELETE'),

    // 💰 المالية
    getInstallments: (param) => fetchAPI(param ? (String(param).includes('=') ? `/api/installments?${param}` : `/api/installments?case_id=eq.${param}`) : '/api/installments'),
    addInstallment: (data) => fetchAPI('/api/installments', 'POST', data),
    deleteInstallment: (id, caseId) => fetchAPI(`/api/installments?id=eq.${id}&case_id=eq.${caseId}`, 'DELETE'),
    getExpenses: (param) => fetchAPI(param ? (String(param).includes('=') ? `/api/expenses?${param}` : `/api/expenses?case_id=eq.${param}`) : '/api/expenses'),
    addExpense: (data) => fetchAPI('/api/expenses', 'POST', data),

    // =================================================================
    // 🧠 محركات الذكاء الاصطناعي (AI Core)
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
            
            let extracted = data.extracted_json || data;
            if (typeof extracted === 'string') {
                try { extracted = JSON.parse(extracted.replace(/```json/g, '').replace(/```/g, '').trim()); } catch (e) { extracted = {}; }
            }
            return extracted;
        } catch (error) { return { error: error.message }; }
    },

    readOCR: (imageBase64) => fetchAPI('/api/ai/ocr', 'POST', { image_base_64: imageBase64 }),
    smartSearch: (query) => fetchAPI(`/api/search?q=${encodeURIComponent(query)}`),
    getLegalBrain: (query = '') => fetchAPI(query ? `/api/legal_brain?or=(title.ilike.*${query}*,category.ilike.*${query}*)` : '/api/legal_brain'),

    // 🔔 الإشعارات وسجل الرقابة
    getNotifications: () => fetchAPI(getCurrentUser().id ? `/api/notifications?user_id=eq.${getCurrentUser().id}&order=created_at.desc` : '/api/notifications'),
    markNotificationAsRead: (id) => fetchAPI(`/api/notifications?id=eq.${id}`, 'PATCH', { is_read: true }),
    subscribePush: (data) => fetchAPI('/api/notifications/subscribe', 'POST', data),
    getHistory: (entityId = null) => fetchAPI(entityId ? `/api/history?entity_id=eq.${entityId}` : '/api/history'),
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
    // ☁️ محرك التخزين السحابي (R2 Cloud) والروابط الآمنة
    // =================================================================
    
    getSecureUrl: (fileKey) => {
        if (!fileKey || typeof fileKey !== 'string' || fileKey === '#' || fileKey.startsWith('blob:') || fileKey.startsWith('data:')) {
            return fileKey;
        }
        try {
            const token = localStorage.getItem(CONFIG.TOKEN_KEY || 'moakkil_token') || '';
            if (fileKey.startsWith('http')) {
                if (fileKey.includes('token=')) return fileKey;
                const sep = fileKey.includes('?') ? '&' : '?';
                return `${fileKey}${sep}token=${token}`;
            }
            const baseUrl = window.API_BASE_URL || CONFIG.API_URL || '';
            const cleanBase = baseUrl.replace(/\/$/, '');
            return `${cleanBase}/api/files/download?file_key=${encodeURIComponent(fileKey)}&token=${token}`;
        } catch (e) {
            return fileKey; 
        }
    },

    // 🛡️ الحل الجذري والنهائي للرفع: استخدام Pure JSON Object لتوافق 100% مع الباك إند
    uploadToCloudR2: async (file, folderName, subFolder) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async () => {
                try {
                    // استخراج الـ Base64 الصافي بدون ترويسة البيانات (data:image/png;base64, ...)
                    const base64Data = reader.result.split(',')[1];
                    const token = localStorage.getItem(CONFIG.TOKEN_KEY || 'moakkil_token');
                    
                    // بناء حزمة JSON نقية تتوافق مع Header (application/json)
                    const payload = {
                        file_name: file.name,
                        fileName: file.name, // دعم التسمية القديمة
                        file_type: file.type,
                        mimeType: file.type,
                        file_data: base64Data,
                        fileData: base64Data,
                        folder: folderName || 'عام',
                        caseNumber: folderName || 'عام',
                        subfolder: subFolder || 'غير_محدد',
                        driveFolderId: subFolder || 'غير_محدد'
                    };

                    const baseUrl = window.API_BASE_URL || CONFIG.API_URL || '';
                    const cleanBase = baseUrl.replace(/\/$/, '');

                    const res = await fetch(`${cleanBase}/api/files/upload`, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json', // تحديد النوع كـ JSON
                            'Authorization': `Bearer ${token}` 
                        },
                        body: JSON.stringify(payload)
                    });

                    if (!res.ok) {
                        const errText = await res.text();
                        throw new Error(`Upload Error ${res.status}: ${errText}`);
                    }
                    
                    resolve(await res.json());

                } catch (e) {
                    console.error("Upload R2 Error:", e);
                    resolve({ error: e.message });
                }
            };
            reader.onerror = () => resolve({ error: "فشل قراءة الملف محلياً" });
            reader.readAsDataURL(file); // قراءة الملف כـ Base64
        });
    },

    // الحذف المادي الفعلي
    deleteFromCloudR2: async (fileKey) => {
        if (!fileKey || typeof fileKey !== 'string' || fileKey === '#') return;
        const token = localStorage.getItem(CONFIG.TOKEN_KEY || 'moakkil_token');
        try {
            let cleanKey = fileKey;
            if (fileKey.startsWith('http')) {
                const urlObj = new URL(fileKey);
                cleanKey = urlObj.searchParams.get('file_key') || urlObj.pathname.split('/').pop();
            }

            const baseUrl = window.API_BASE_URL || CONFIG.API_URL || '';
            const cleanBase = baseUrl.replace(/\/$/, '');

            await fetch(`${cleanBase}/api/files/delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ file_key: cleanKey, fileId: cleanKey, url: fileKey })
            }).catch(e=>{});

        } catch (e) { console.warn('R2 Physical Deletion warning:', e); }
    },

    getFiles: (param) => fetchAPI(param ? (String(param).includes('=') ? `/api/files?${param}` : `/api/files?case_id=eq.${param}`) : '/api/files'),
    
    addFileRecord: (data) => {
        const currentUser = getCurrentUser();
        const firmId = currentUser.firm_id || localStorage.getItem(CONFIG.FIRM_KEY);
        const payload = { ...data, added_by: currentUser.id || null, firm_id: firmId || null };
        return fetchAPI('/api/files', 'POST', payload);
    },

    deleteFile: async (id) => {
        try {
            const fileRes = await fetchAPI(`/api/files?id=eq.${id}`);
            if (fileRes && Array.isArray(fileRes) && fileRes.length > 0) {
                const r2Key = fileRes[0].drive_file_id || fileRes[0].file_url;
                if(r2Key) await API.deleteFromCloudR2(r2Key);
            }
            return await fetchAPI(`/api/files?id=eq.${id}`, 'DELETE');
        } catch(e) { return { error: e.message }; }
    },

    deleteUpdate: async (id) => {
        try {
            const updateRes = await fetchAPI(`/api/updates?id=eq.${id}`);
            if (updateRes && Array.isArray(updateRes) && updateRes.length > 0 && updateRes[0].attachment_url) {
                await API.deleteFromCloudR2(updateRes[0].attachment_url);
            }
            return await fetchAPI(`/api/updates?id=eq.${id}`, 'DELETE');
        } catch(e) { return { error: e.message }; }
    },

    deleteExpense: async (id) => {
        try {
            const expRes = await fetchAPI(`/api/expenses?id=eq.${id}`);
            if (expRes && Array.isArray(expRes) && expRes.length > 0 && expRes[0].receipt_url) {
                await API.deleteFromCloudR2(expRes[0].receipt_url);
            }
            return await fetchAPI(`/api/expenses?id=eq.${id}`, 'DELETE');
        } catch(e) { return { error: e.message }; }
    },

    publicLogin: (data) => fetchAPI('/api/public/client/login', 'POST', data, true),
    getPublicPortalData: (token) => fetchAPI(`/api/public/client?token=${token}`, 'GET', null, true),
    verifyReceipt: (id) => fetchAPI(id && id !== 'undefined' ? `/api/public/verify-receipt?id=${id}` : '/api/public/verify-receipt', 'GET', null, true),
    verifyCV: (id) => fetchAPI(id && id !== 'undefined' ? `/api/public/verify-cv?id=${id}` : '/api/public/verify-cv', 'GET', null, true)
};