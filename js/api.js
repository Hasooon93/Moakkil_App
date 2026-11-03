/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: js/api.js
 * الوصف: المحرك الموحد للاتصال بالخادم (V5.2 Enterprise Zero-Trust & Sync Edition)
 * الميزات والتحصينات:
 * 1. نظام المزامنة الدفعي (Batch Queue) للعمل بكفاءة دون إنترنت مع حماية من التكرار اللانهائي.
 * 2. قفل منع التكرار (Idempotency Key) باستخدام UUID لمنع تكرار الإدخال.
 * 3. مصادقة ثنائية حقيقية لعمليات الحذف (MFA Action Token) موحدة في Live CRUD و Offline Sync.
 * 4. اعتراض الأخطاء وإدارة الجلسات الأحادية (401 Unauthorized Interceptor & 409 Conflict).
 * 5. التشفير الآمن للحروف العربية في الـ Headers لخدمات الرفع السحابي (Cloudflare R2).
 * 6. تعقيم بيانات المستخدم وتأمين استعلامات العقل القانوني وبوابة الموكل بالـ PIN.
 * ============================================================================
 */

// ============================================================================
// [1] نظام المزامنة الذكية دون اتصال (Offline Batch Queue System)
// ============================================================================
const OFFLINE_QUEUE_KEY = 'moakkil_offline_queue';
const MAX_SYNC_RETRIES = 3;
const MAX_R2_FILE_SIZE = 25 * 1024 * 1024; // 25MB مطابق للحد الأقصى في الوركر
let isSyncing = false; // قفل أمني لمنع التزامن المزدوج وطوفان الإشعارات (Mutex Lock)

// المسارات المدعومة للمزامنة في الباك إند (لمنع بقاء مسارات غير مدعومة في الطابور للأبد)
const SYNCABLE_ENDPOINTS = new Set([
    '/api/clients', '/api/cases', '/api/users',
    '/api/installments', '/api/updates', '/api/appointments',
    '/api/hearings', '/api/tasks', '/api/files',
    '/api/notifications', '/api/expenses', '/api/firms'
]);

/**
 * دالة تعقيم كائن المستخدم من أي حقول سرية أو حساسة
 */
function sanitizeUserObject(userObj) {
    if (!userObj || typeof userObj !== 'object') return {};
    const clean = { ...userObj };
    delete clean.password;
    delete clean.password_hash;
    delete clean.pin_code;
    return clean;
}

/**
 * حفظ العمليات (POST, PATCH, DELETE) محلياً عند انقطاع الإنترنت
 */
function saveToOfflineQueue(endpoint, method, body, actionToken = null) {
    let queue = [];
    try {
        queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
        if (!Array.isArray(queue)) queue = [];
    } catch (e) {
        queue = [];
    }

    // استخراج المعرف ومعالجة الطلبات
    let actionId = (body && body.id && String(body.id).startsWith('temp_'))
        ? String(body.id)
        : ('temp_' + Date.now() + '_' + Math.floor(Math.random() * 1000));
    let targetEndpoint = endpoint.split('?')[0]; // المسار الأساسي فقط للوركر (مثل /api/cases)

    if (method !== 'POST') {
        const match = endpoint.match(/id=(eq\.[a-zA-Z0-9_-]+)/);
        if (match) actionId = match[1]; // استخراج eq.ID للتعديل أو الحذف
    }

    // في حال وجود تعديل سابق لنفس السجل ونفس العملية في الطابور، ندمجه لمنع تضخم الطابور
    const existingIndex = queue.findIndex(item => item.id === actionId && item.endpoint === targetEndpoint && item.method === method && method === 'PATCH');
    if (existingIndex !== -1) {
        queue[existingIndex].body = { ...queue[existingIndex].body, ...(body || {}) };
        queue[existingIndex].timestamp = Date.now();
    } else {
        queue.push({
            queue_uid: 'q_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
            id: actionId,
            endpoint: targetEndpoint,
            method: method,
            body: body || {},
            action_token: actionToken || null,
            timestamp: Date.now(),
            original_url: endpoint,
            retry_count: 0
        });
    }

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
    if (isSyncing || !navigator.onLine) return;

    let queue = [];
    try {
        queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
        if (!Array.isArray(queue)) queue = [];
    } catch (e) {
        queue = [];
    }
    if (queue.length === 0) return;

    // فلترة أي عمليات لمسارات غير قابلة للمزامنة أصلاً حتى لا تعلق للأبد
    queue = queue.filter(req => SYNCABLE_ENDPOINTS.has(req.endpoint));
    if (queue.length === 0) {
        localStorage.removeItem(OFFLINE_QUEUE_KEY);
        return;
    }

    isSyncing = true;
    console.log(`🔄 [Sync Engine] جاري مزامنة ${queue.length} طلبات محفوظة دفعة واحدة...`);
    if (window.showToast) window.showToast('عاد الاتصال. جاري مزامنة البيانات المحفوظة مع الخادم السحابي...', 'info');

    try {
        const token = localStorage.getItem(CONFIG.TOKEN_KEY || 'moakkil_token');
        if (!token) {
            isSyncing = false;
            return;
        }
        const deviceId = localStorage.getItem('moakkil_device_id') || 'unknown-device';
        const baseUrl = window.API_BASE_URL || CONFIG.API_URL || '';

        // استخراج أي توكن مصادقة ثنائية محفوظ مع عمليات الحذف لتمريره أيضاً في الـ Header
        const firstDeleteWithToken = queue.find(q => q.method === 'DELETE' && q.action_token);
        const syncHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'x-device-id': deviceId
        };
        if (firstDeleteWithToken && firstDeleteWithToken.action_token) {
            syncHeaders['x-action-token'] = firstDeleteWithToken.action_token;
        }

        const response = await fetch(`${baseUrl}/api/sync/offline`, {
            method: 'POST',
            headers: syncHeaders,
            body: JSON.stringify({ actions: queue })
        });

        if (response.status === 401) {
            console.warn('⚠️ [Sync Engine] الجلسة منتهية أثناء المزامنة.');
            isSyncing = false;
            return;
        }

        if (!response.ok) throw new Error('فشل الاتصال بمسار المزامنة في الباك إند');
        const data = await response.json();

        if (data.success && Array.isArray(data.synced_items)) {
            const syncedSuccessIds = new Set();
            const permanentFailedIds = new Set();
            const transientFailedReasons = new Map();

            for (const item of data.synced_items) {
                const itemKey = String(item.temp_id || item.target_id || item.action_id || '').replace(/^eq\./, '');
                const rawKey = String(item.temp_id || item.target_id || item.action_id || '');

                if (item.status === 'success') {
                    syncedSuccessIds.add(itemKey);
                    syncedSuccessIds.add(rawKey);
                } else if (item.status === 'failed') {
                    const reason = String(item.reason || '');
                    // إذا كان الرفض أمنياً أو منطقياً دائماً (صلاحيات، سجل محمي، قضايا نشطة، رمز حذف مرفوض)، لا نعيد المحاولة للأبد
                    const isPermanentRejection = reason.includes('مرفوض') ||
                                                 reason.includes('صلاحية') ||
                                                 reason.includes('غير موجود') ||
                                                 reason.includes('معطل') ||
                                                 reason.includes('مصادقة ثنائية');
                    if (isPermanentRejection) {
                        permanentFailedIds.add(itemKey);
                        permanentFailedIds.add(rawKey);
                        console.error(`🚫 [Sync Rejected] تم إلغاء عملية غير مصرح بها (${rawKey}): ${reason}`);
                    } else {
                        transientFailedReasons.set(itemKey, reason);
                        transientFailedReasons.set(rawKey, reason);
                    }
                }
            }

            let droppedCount = 0;
            const remainingQueue = [];

            for (const req of queue) {
                const reqCleanId = String(req.id || '').replace(/^eq\./, '');
                const reqRawId = String(req.id || '');

                // 1. إذا نجحت العملية نحذفها من الطابور
                if (syncedSuccessIds.has(reqCleanId) || syncedSuccessIds.has(reqRawId)) {
                    continue;
                }

                // 2. إذا رُفضت العملية أمنياً/منطقياً بشكل دائم نحذفها وننبه المستخدم
                if (permanentFailedIds.has(reqCleanId) || permanentFailedIds.has(reqRawId)) {
                    droppedCount++;
                    continue;
                }

                // 3. إذا فشلت لسبب عابر أو لم ترجع في الرد، نزيد عداد المحاولات
                req.retry_count = (req.retry_count || 0) + 1;
                if (req.retry_count < MAX_SYNC_RETRIES) {
                    remainingQueue.push(req);
                } else {
                    droppedCount++;
                    console.error(`❌ [Sync Engine] تم إيقاف العملية بعد استنفاد ${MAX_SYNC_RETRIES} محاولات:`, req);
                }
            }

            localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remainingQueue));

            if (remainingQueue.length === 0 && droppedCount === 0) {
                console.log('✅ [Sync Engine] تمت المزامنة الشاملة بنجاح.');
                if (window.showToast) window.showToast('تمت مزامنة جميع البيانات مع السيرفر السحابي بنجاح! ☁️', 'success');
                if (typeof window.loadDashboardData === 'function') setTimeout(window.loadDashboardData, 1000);
                else if (typeof window.loadAllData === 'function') setTimeout(window.loadAllData, 1000);
            } else if (droppedCount > 0) {
                console.warn(`⚠️ [Sync Engine] تم استبعاد ${droppedCount} عمليات مرفوضة أو متعثرة.`);
                if (window.showToast) window.showToast(`تمت المزامنة، وتجاهل (${droppedCount}) عمليات مرفوضة أمنياً أو غير صالحة.`, 'warning');
                if (typeof window.loadDashboardData === 'function') setTimeout(window.loadDashboardData, 1000);
            } else {
                console.warn('⚠️ [Sync Engine] تمت مزامنة جزء وبقيت عمليات قيد إعادة المحاولة:', remainingQueue);
                if (window.showToast) window.showToast('تمت مزامنة بعض البيانات، وسيتم إعادة محاولة العمليات المتبقية.', 'warning');
            }
        }
    } catch (e) {
        console.error(`❌ [Sync Error] فشل المزامنة الشاملة:`, e);
    } finally {
        isSyncing = false;
    }
}

// مراقبة عودة الإنترنت لتفعيل المزامنة التلقائية
window.addEventListener('online', processOfflineQueue);

// الاستماع لإشارات الـ Service Worker لتشغيل المزامنة في الخلفية
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'START_OFFLINE_SYNC') {
            processOfflineQueue();
        }
    });
}

// ============================================================================
// [2] معالجات الوقت، المساعدات، والمصادقة الثنائية للحذف (Time & MFA Helpers)
// ============================================================================

/**
 * توحيد التوقيت (Timezone Fix) - متوافق 100% مع UTC في الوركر
 */
function applyJordanTimeHack(isoString) {
    if (!isoString) return isoString;
    try {
        return new Date(isoString).toISOString();
    } catch (e) {
        return isoString;
    }
}

/**
 * جلب المستخدم الحالي من التخزين المحلي مع تعقيم الحقول الحساسة
 */
const getCurrentUser = () => {
    try {
        const raw = JSON.parse(localStorage.getItem(CONFIG.USER_KEY || 'moakkil_user')) || {};
        return sanitizeUserObject(raw);
    } catch (e) {
        return {};
    }
};

/**
 * التأكد من توفر رمز مصادقة ثنائية صالح (x-action-token) قبل تنفيذ أي عملية حذف (DELETE)
 */
async function ensureValidActionToken(providedToken = null) {
    if (providedToken && String(providedToken).trim().length >= 4) {
        return String(providedToken).trim();
    }

    // 1. إذا كان الجهاز يمتلك بصمة موثقة ومسجلة في النظام، نستخدم معرف البصمة الموثق
    const bioCredId = localStorage.getItem('moakkil_biometric_id');
    if (bioCredId && bioCredId.length >= 8) {
        return `bio_${bioCredId}`;
    }

    // 2. إذا كانت مكتبة SweetAlert2 متوفرة، نطلب من المستخدم إدخال رمز الحذف أو طلب رمز لتيليغرام
    if (typeof Swal !== 'undefined') {
        const result = await Swal.fire({
            title: 'تأكيد أمني للحذف (MFA)',
            html: `
                <p class="small text-muted fw-bold mb-3">هذا الإجراء حساس ويتطلب مصادقة ثنائية. أدخل رمز الأمان الخاص بك أو اطلب رمزاً فورياً عبر تيليغرام:</p>
                <button type="button" id="swal-req-mfa-btn" class="btn btn-sm btn-outline-primary fw-bold rounded-pill px-3 mb-2">
                    <i class="fab fa-telegram me-1"></i> إرسال رمز تأكيد إلى تيليغرام
                </button>
            `,
            input: 'password',
            inputPlaceholder: 'أدخل رمز التأكيد أو الـ PIN هنا...',
            inputAttributes: {
                autocapitalize: 'off',
                autocorrect: 'off',
                dir: 'ltr',
                style: 'text-align:center; letter-spacing: 6px; font-weight:900;'
            },
            showCancelButton: true,
            confirmButtonText: 'تأكيد الحذف',
            cancelButtonText: 'إلغاء',
            confirmButtonColor: '#9e2a2b',
            didOpen: () => {
                const reqBtn = document.getElementById('swal-req-mfa-btn');
                if (reqBtn) {
                    reqBtn.addEventListener('click', async () => {
                        reqBtn.disabled = true;
                        reqBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> جاري الإرسال...';
                        const res = await fetchAPI('/api/auth/request-action-token', 'POST', {});
                        if (res && res.success) {
                            reqBtn.className = 'btn btn-sm btn-success fw-bold rounded-pill px-3 mb-2';
                            reqBtn.innerHTML = '<i class="fas fa-check me-1"></i> تم الإرسال لتيليغرام!';
                        } else {
                            reqBtn.disabled = false;
                            reqBtn.innerHTML = '<i class="fas fa-redo me-1"></i> إعادة الإرسال لتيليغرام';
                        }
                    });
                }
            },
            preConfirm: (val) => {
                if (!val || val.trim().length < 4) {
                    Swal.showValidationMessage('يرجى إدخال رمز تأكيد صالح (4 خانات على الأقل)');
                    return false;
                }
                return val.trim();
            }
        });

        if (result.isConfirmed && result.value) {
            return result.value;
        }
        return null;
    }

    return null;
}

// ============================================================================
// [3] المحرك الرئيسي للاتصال بالخادم (Main Fetch Wrapper)
// ============================================================================

/**
 * دالة التغليف الذكية للاتصال بالـ API (تعالج الـ Tokens والأخطاء والأوفلاين والمصادقة الثنائية)
 */
async function fetchAPI(endpoint, method = 'GET', body = null, isPublic = false, actionToken = null) {

    // 🛡️ إذا كانت العملية DELETE ولم يتم تمرير actionToken، نطلبه تلقائياً لضمان عدم رفض السيرفر
    let resolvedActionToken = actionToken;
    if (method === 'DELETE' && !isPublic && !resolvedActionToken) {
        resolvedActionToken = await ensureValidActionToken(null);
        if (!resolvedActionToken) {
            return { error: 'تم إلغاء عملية الحذف لعدم إدخال رمز المصادقة الثنائية.' };
        }
    }

    // 🛡️ [قفل التكرار - Idempotency Key]: توليد UUID فريد لطلبات الإضافة لمنع تكرار البيانات
    if (method === 'POST' && body && typeof body === 'object' && !Array.isArray(body)) {
        const excludedPaths = ['/ai/', '/auth/', '/public/', '/sync/', '/r2/', '/notifications/', '/webhook/', '/contracts/'];
        const isCrud = !excludedPaths.some(p => endpoint.includes(p));
        if (isCrud && !body.id) {
            body.id = crypto.randomUUID();
        }
    }

    // 1. معالجة حالة انقطاع الإنترنت (Offline Handling)
    if (!navigator.onLine && !isPublic) {
        if (['POST', 'PATCH', 'DELETE'].includes(method)) {
            saveToOfflineQueue(endpoint, method, body, resolvedActionToken);
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

    // 🛡️ إضافة ترويسة المصادقة الثنائية لعمليات الحذف (MFA)
    if (resolvedActionToken) {
        headers['x-action-token'] = resolvedActionToken;
    }

    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

    try {
        // 3. تنفيذ الطلب
        const response = await fetch(`${baseUrl}${endpoint}`, options);

        // 4. الحماية ضد الجلسات المنتهية أو اختطاف الجلسات (Single Session Firewall - خطأ 401)
        if (response.status === 401 && !isPublic && !endpoint.includes('/api/auth/')) {
            console.warn("⚠️ [Security] تم رفض الجلسة (قد يكون الحساب موقوفاً أو تم تسجيل الدخول من جهاز آخر). جاري الطرد...");
            localStorage.removeItem(CONFIG.TOKEN_KEY || 'moakkil_token');
            localStorage.removeItem(CONFIG.USER_KEY || 'moakkil_user');
            localStorage.removeItem('moakkil_full_user_backup');
            if (window.showToast) window.showToast('تم إنهاء الجلسة لدواعٍ أمنية. يرجى تسجيل الدخول مجدداً.', 'error');
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
            if (!response.ok) {
                if (data && data.require_pin) {
                    return { error: data.error || 'رمز الدخول السري (PIN) مطلوب', require_pin: true };
                }
                throw new Error(data.error || data.message || `خطأ سيرفر: ${response.status}`);
            }
            return data;
        } else {
            await response.text();
            throw new Error(`استجابة غير متوقعة من السيرفر (الكود: ${response.status})`);
        }

    } catch (error) {
        console.error(`❌ API Error [${endpoint}]:`, error.message);

        // 7. التعامل مع فقدان الاتصال اللحظي أثناء الإرسال (Fallback)
        if (error.message === 'Failed to fetch' && ['POST', 'PATCH', 'DELETE'].includes(method) && !isPublic) {
            saveToOfflineQueue(endpoint, method, body, resolvedActionToken);
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
    deleteClient: (id, actionToken) => fetchAPI(`/api/clients?id=eq.${id}`, 'DELETE', null, false, actionToken),

    getPOAs: (clientId) => fetchAPI(clientId ? `/api/poas?client_id=eq.${clientId}` : '/api/poas'),
    addPOA: (data) => fetchAPI('/api/poas', 'POST', data),
    deletePOA: (id, actionToken) => fetchAPI(`/api/poas?id=eq.${id}`, 'DELETE', null, false, actionToken),

    // -------------------------------------------------------------
    // 4.3 إدارة القضايا والإجراءات (Cases & Updates & Hearings)
    // -------------------------------------------------------------
    getCases: () => fetchAPI(getCurrentUser().firm_id ? `/api/cases?firm_id=eq.${getCurrentUser().firm_id}` : '/api/cases'),
    addCase: (data) => fetchAPI('/api/cases', 'POST', data),
    updateCase: (id, data) => fetchAPI(`/api/cases?id=eq.${id}`, 'PATCH', data),
    deleteCase: (id, actionToken) => fetchAPI(`/api/cases?id=eq.${id}`, 'DELETE', null, false, actionToken),

    getUpdates: (param) => fetchAPI(param ? (String(param).includes('=') ? `/api/updates?${param}` : `/api/updates?case_id=eq.${param}`) : '/api/updates'),
    addUpdate: (data) => fetchAPI('/api/updates', 'POST', data),
    deleteUpdate: (id, actionToken) => fetchAPI(`/api/updates?id=eq.${id}`, 'DELETE', null, false, actionToken),

    getHearings: (param) => fetchAPI(param ? (String(param).includes('=') ? `/api/hearings?${param}` : `/api/hearings?case_id=eq.${param}`) : '/api/hearings'),
    addHearing: (data) => fetchAPI('/api/hearings', 'POST', data),
    updateHearing: (id, data) => fetchAPI(`/api/hearings?id=eq.${id}`, 'PATCH', data),
    deleteHearing: (id, actionToken) => fetchAPI(`/api/hearings?id=eq.${id}`, 'DELETE', null, false, actionToken),

    // -------------------------------------------------------------
    // 4.4 إدارة الموارد البشرية والمهام (HR & Appointments)
    // -------------------------------------------------------------
    getStaff: () => fetchAPI(getCurrentUser().firm_id ? `/api/users?firm_id=eq.${getCurrentUser().firm_id}` : '/api/users'),
    addStaff: (data) => fetchAPI('/api/users', 'POST', data),
    updateStaff: (id, data) => fetchAPI(`/api/users?id=eq.${id}`, 'PATCH', data),
    deleteStaff: (id, actionToken) => fetchAPI(`/api/users?id=eq.${id}`, 'DELETE', null, false, actionToken),

    getAppointments: () => fetchAPI(getCurrentUser().firm_id ? `/api/appointments?firm_id=eq.${getCurrentUser().firm_id}` : '/api/appointments'),
    addAppointment: async (data) => {
        if (data.appt_date) data.appt_date = applyJordanTimeHack(data.appt_date);
        return await fetchAPI('/api/appointments', 'POST', data);
    },
    updateAppointment: (id, data) => fetchAPI(`/api/appointments?id=eq.${id}`, 'PATCH', data),
    deleteAppointment: (id, actionToken) => fetchAPI(`/api/appointments?id=eq.${id}`, 'DELETE', null, false, actionToken),

    // -------------------------------------------------------------
    // 4.5 الإدارة المالية (Finance)
    // -------------------------------------------------------------
    getInstallments: (param) => fetchAPI(param ? (String(param).includes('=') ? `/api/installments?${param}` : `/api/installments?case_id=eq.${param}`) : '/api/installments'),
    addInstallment: (data) => fetchAPI('/api/installments', 'POST', data),
    updateInstallment: (id, data) => fetchAPI(`/api/installments?id=eq.${id}`, 'PATCH', data),
    deleteInstallment: (id, caseId, actionToken) => fetchAPI(`/api/installments?id=eq.${id}${caseId ? `&case_id=eq.${caseId}` : ''}`, 'DELETE', null, false, actionToken),

    getExpenses: (param) => fetchAPI(param ? (String(param).includes('=') ? `/api/expenses?${param}` : `/api/expenses?case_id=eq.${param}`) : '/api/expenses'),
    addExpense: (data) => fetchAPI('/api/expenses', 'POST', data),
    deleteExpense: (id, actionToken) => fetchAPI(`/api/expenses?id=eq.${id}`, 'DELETE', null, false, actionToken),

    // -------------------------------------------------------------
    // 4.6 العقل الذكي والبحث (AI Integration Engine)
    // -------------------------------------------------------------
    askAI: (content) => fetchAPI('/api/ai/process', 'POST', { type: 'legal_advisor', content }),
    extractDataAI: (content, aiType = 'data_extractor') => fetchAPI('/api/ai/process', 'POST', { type: aiType, content }),

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

    readOCR: (imageBase64, isIdCard = false) => fetchAPI('/api/ai/ocr', 'POST', { image_base_64: imageBase64, is_id_card: isIdCard }),
    smartSearch: (query) => fetchAPI(`/api/search?q=${encodeURIComponent(query)}`),

    checkConflict: (name) => fetchAPI(`/api/conflict-check?name=${encodeURIComponent(name)}`),
    generateSmartContract: (data) => fetchAPI('/api/contracts/generate', 'POST', data),
    getLegalBrain: (query = '') => {
        const safeQ = encodeURIComponent(query.trim());
        return fetchAPI(safeQ ? `/api/legal_brain?or=(title.ilike.*${safeQ}*,category.ilike.*${safeQ}*)` : '/api/legal_brain');
    },

    // -------------------------------------------------------------
    // 4.7 الإشعارات والمصادقة وتاريخ النشاط (Security & Notifications)
    // -------------------------------------------------------------
    getNotifications: () => fetchAPI(getCurrentUser().id ? `/api/notifications?user_id=eq.${getCurrentUser().id}&order=created_at.desc` : '/api/notifications'),
    markNotificationAsRead: (id) => fetchAPI(`/api/notifications?id=eq.${id}`, 'PATCH', { is_read: true }),
    subscribePush: (data) => fetchAPI('/api/notifications/subscribe', 'POST', data),

    requestActionToken: () => fetchAPI('/api/auth/request-action-token', 'POST', {}),
    ensureActionToken: (token = null) => ensureValidActionToken(token),

    registerBiometric: (data) => fetchAPI('/api/auth/biometric-register', 'POST', data),
    biometricLogin: async (data) => {
        const res = await fetchAPI('/api/auth/biometric-login', 'POST', data, true);
        if (res && res.user && res.token) {
            res.user = sanitizeUserObject(res.user);
        }
        return res;
    },

    getHistory: (entityId = null) => fetchAPI(entityId ? `/api/history?entity_id=eq.${encodeURIComponent(entityId)}` : '/api/history'),

    // -------------------------------------------------------------
    // 4.8 إدارة التخزين السحابي (Cloudflare R2 Files)
    // -------------------------------------------------------------
    getFiles: (param) => fetchAPI(param ? (String(param).includes('=') ? `/api/files?${param}` : `/api/files?case_id=eq.${param}`) : '/api/files'),
    deleteFile: (id, actionToken) => fetchAPI(`/api/files?id=eq.${id}`, 'DELETE', null, false, actionToken),

    addFileRecord: (data) => {
        const currentUser = getCurrentUser();
        const payload = { ...data, added_by: currentUser.id || null, firm_id: currentUser.firm_id || null };
        return fetchAPI('/api/files', 'POST', payload);
    },

    /**
     * الرفع المباشر والآمن للملفات كبيانات ثنائية (Stream) إلى Cloudflare R2
     */
    uploadFileToR2: async (file, clientId = 'general', caseId = 'general') => {
        if (!file) throw new Error('لم يتم اختيار ملف للرفع');
        if (file.size > MAX_R2_FILE_SIZE) {
            throw new Error('حجم الملف يتجاوز الحد الأقصى المسموح به (25 ميجابايت)');
        }

        const token = localStorage.getItem(CONFIG.TOKEN_KEY || 'moakkil_token');
        const deviceId = localStorage.getItem('moakkil_device_id') || 'unknown-device';
        const baseUrl = window.API_BASE_URL || CONFIG.API_URL || '';

        // تشفير الحروف العربية في الـ Headers لمنع أخطاء (ISO-8859-1 HTTP Header encoding error)
        const headers = {
            'Authorization': `Bearer ${token}`,
            'x-device-id': deviceId,
            'x-file-name': encodeURIComponent(file.name),
            'x-client-id': encodeURIComponent(clientId || 'general'),
            'x-case-id': encodeURIComponent(caseId || 'general')
        };

        try {
            const response = await fetch(`${baseUrl}/api/r2/upload`, {
                method: 'POST',
                headers: headers,
                body: file
            });

            if (!response.ok) {
                const errJson = await response.json().catch(() => ({}));
                throw new Error(errJson.error || 'فشل الرفع إلى الخوادم السحابية R2');
            }
            return await response.json();
        } catch (e) {
            console.error("R2 Upload Error:", e);
            throw e;
        }
    },

    /**
     * توافقية رجعية (Backward Compatibility) لأي كود قديم يستدعي uploadToDrive
     */
    uploadToDrive: async (file, caseInternalId) => {
        return await API.uploadFileToR2(file, 'general', caseInternalId || 'general');
    },

    /**
     * التحميل الآمن للملفات المشفرة من R2 عبر الـ Worker (للمحامين)
     */
    downloadR2File: async (r2Key, fileName) => {
        const token = localStorage.getItem(CONFIG.TOKEN_KEY || 'moakkil_token');
        const baseUrl = window.API_BASE_URL || CONFIG.API_URL || '';

        if (window.showToast) window.showToast('جاري جلب وتشفير الملف من التخزين السحابي...', 'info');

        try {
            const res = await fetch(`${baseUrl}/api/r2/download?key=${encodeURIComponent(r2Key)}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || 'الملف غير موجود أو لا تملك الصلاحية الأمنية للوصول إليه');
            }

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

    /**
     * التحميل الآمن للملفات المتاحة للموكل عبر بوابة الموكل (Public R2 Download)
     */
    downloadPublicR2File: async (r2Key, clientToken, fileName) => {
        const baseUrl = window.API_BASE_URL || CONFIG.API_URL || '';
        if (window.showToast) window.showToast('جاري تحميل المستند بشكل آمن...', 'info');

        try {
            const res = await fetch(`${baseUrl}/api/public/r2/download?key=${encodeURIComponent(r2Key)}&client_token=${encodeURIComponent(clientToken)}`);
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || 'غير مصرح بتحميل هذا المستند أو لم يتم إتاحته للموكل');
            }

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
            else if (typeof Swal !== 'undefined') Swal.fire({ icon: 'error', title: 'تعذر التحميل', text: e.message });
        }
    },

    // -------------------------------------------------------------
    // 4.9 البوابة العامة والتحقق المستقل (Public Portal & Validation)
    // -------------------------------------------------------------
    publicLogin: async (data) => {
        const res = await fetchAPI('/api/public/client/login', 'POST', data, true);
        if (res && res.success && data && data.access_pin) {
            try { sessionStorage.setItem(`moakkil_portal_pin_${res.token || data.token}`, data.access_pin); } catch (e) {}
        }
        return res;
    },

    getPublicPortalData: (token, pin = '') => {
        let effectivePin = pin;
        if (!effectivePin && token) {
            try { effectivePin = sessionStorage.getItem(`moakkil_portal_pin_${token}`) || ''; } catch (e) {}
        }
        return fetchAPI(`/api/public/client?token=${encodeURIComponent(token || '')}${effectivePin ? `&pin=${encodeURIComponent(effectivePin)}` : ''}`, 'GET', null, true);
    },

    verifyReceipt: (id) => fetchAPI(id && id !== 'undefined' ? `/api/public/verify-receipt?id=${encodeURIComponent(id)}` : '/api/public/verify-receipt', 'GET', null, true),
    verifyCV: (id) => fetchAPI(id && id !== 'undefined' ? `/api/public/verify-cv?id=${encodeURIComponent(id)}` : '/api/public/verify-cv', 'GET', null, true),

    // -------------------------------------------------------------
    // 4.10 السوابق الذكية والمكتبة الهجينة (Smart Arsenal)
    // -------------------------------------------------------------
    findSimilarCases: (caseId, facts) => fetchAPI('/api/ai/cross-case', 'POST', { case_id: caseId, facts: facts }),
    generateClientReport: (clientId) => fetchAPI('/api/ai/process', 'POST', { type: 'client_report', content: clientId })
};