/**
 * js/api.js
 * المحرك الرئيسي للاتصال بالباك إند (API Wrapper)
 * الدستور المطبق: حماية JWT، الجلسة الأحادية، التكامل السحابي مع R2، والتحصين ضد الاستدعاء المزدوج.
 */

// [الإصلاح الأمني]: درع مضاد للانهيار (Anti-Crash). نتحقق مما إذا كان المحرك موجوداً مسبقاً
if (typeof window.API === 'undefined') {
    
    // تعريف الثوابت داخل النطاق الآمن
const API_BASE_URL = 'https://curly-pond-9975.hassan-alsakka.workers.dev'; // تنبيه: ضع رابط الوركر الخاص بك هنا
    // دالة مساعدة للحصول على اسم المفتاح الصحيح من الإعدادات لمنع حلقة التوجيه اللانهائية
    const getTokenKey = () => (typeof CONFIG !== 'undefined' && CONFIG.TOKEN_KEY) ? CONFIG.TOKEN_KEY : 'moakkil_token';
    const getUserKey = () => (typeof CONFIG !== 'undefined' && CONFIG.USER_KEY) ? CONFIG.USER_KEY : 'moakkil_user';

    const API_CORE = {
        // 1. إدارة الهوية والتوثيق (تم توحيد المفاتيح للقضاء على Infinite Loop)
        getToken: () => localStorage.getItem(getTokenKey()),
        
        setToken: (token) => localStorage.setItem(getTokenKey(), token),
        
        clearSession: () => {
            // تدمير جميع المفاتيح المحتملة (القديمة والجديدة) لضمان طرد آمن ومنع تذبذب الصفحات
            localStorage.removeItem(getTokenKey());
            localStorage.removeItem(getUserKey());
            localStorage.removeItem('moakkil_jwt_token'); 
            
            // التوجيه لصفحة تسجيل الدخول
            window.location.href = '/login.html';
        },

        // 2. المحرك الأساسي للطلبات (Core Request Engine)
        async request(endpoint, method = 'GET', body = null) {
            const token = this.getToken();
            
            // بناء الهيدرز مع ضمان إرفاق التوكن في كل طلب
            const headers = {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            };

            const config = { method, headers };
            
            // منع XSS المبدئي (Sanitization) قبل إرسال البيانات للباك إند
            if (body) {
                const sanitizedBody = this.sanitizeInput(body);
                config.body = JSON.stringify(sanitizedBody);
            }

            try {
                const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
                
                // معالجة الطرد في حال الجلسة الأحادية أو انتهاء الصلاحية
                if (response.status === 401 || response.status === 403) {
                    console.warn('[Security] جلسة غير صالحة أو تم تسجيل الدخول من جهاز آخر.');
                    this.clearSession();
                    throw new Error('تم إنهاء الجلسة لدواعي أمنية أو انتهت صلاحيتها.');
                }

                const data = await response.json();
                
                if (!response.ok) {
                    throw new Error(data.error || 'حدث خطأ غير معروف في الخادم.');
                }
                
                return data;
            } catch (error) {
                console.error(`[Moakkil API Error - ${endpoint}]:`, error.message);
                throw error;
            }
        },

        // 3. الدوال السريعة (Helper Methods)
        get: (endpoint) => API_CORE.request(endpoint, 'GET'),
        post: (endpoint, body) => API_CORE.request(endpoint, 'POST', body),
        put: (endpoint, body) => API_CORE.request(endpoint, 'PUT', body),
        patch: (endpoint, body) => API_CORE.request(endpoint, 'PATCH', body),
        delete: (endpoint) => API_CORE.request(endpoint, 'DELETE'),

        // 4. نظام إدارة الملفات السحابية (Cloudflare R2 Integration)
        
        /**
         * دالة الرفع إلى السحابة مع دعم المسارات الديناميكية المعزولة
         * @param {File} file - الملف المراد رفعه
         * @param {String} folderPath - مسار العزل (مثال: cases/12345/attachments)
         */
        async uploadToCloudR2(file, folderPath) {
            const token = this.getToken();
            if (!token) throw new Error('لا يوجد تصريح لرفع الملفات');

            const formData = new FormData();
            formData.append('file', file);
            formData.append('folderPath', folderPath);

            try {
                // نستخدم fetch مباشرة هنا لأننا نحتاج إرسال FormData وليس JSON
                const response = await fetch(`${API_BASE_URL}/api/files/upload`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`
                        // لا نضيف Content-Type لكي يضع المتصفح multipart/form-data مع الـ Boundary تلقائياً
                    },
                    body: formData
                });

                if (response.status === 401 || response.status === 403) {
                    this.clearSession();
                    throw new Error('جلسة غير صالحة أثناء رفع الملف.');
                }

                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'فشل رفع الملف إلى السحابة');
                
                return data; // يعود بـ { file_url: '...', extracted_text: '...', file_id: '...' }
            } catch (error) {
                console.error('[R2 Upload Error]:', error);
                throw error;
            }
        },

        /**
         * دالة تأمين روابط العرض (Zero Trust Access)
         * تدمج التوكن المشفر مع الرابط ليسمح الوركر بعرضه دون خطأ 401
         * @param {String} filePath - مسار الملف المحفوظ في الداتا
         */
        getSecureUrl(filePath) {
            if (!filePath) return '/assets/img/placeholder.png'; // صورة افتراضية عند غياب الملف
            
            // إذا كان الرابط خارجياً (مثل شعار قديم)، نعيده كما هو
            if (filePath.startsWith('http')) return filePath;

            const token = this.getToken();
            // تمرير التوكن كـ Query Parameter ليتمكن وسم <img> أو <iframe> من قراءته
            return `${API_BASE_URL}/api/files/download?path=${encodeURIComponent(filePath)}&token=${token}`;
        },

        // 5. حماية وتدقيق البيانات (Sanitization)
        sanitizeInput(data) {
            if (typeof data === 'string') {
                return data.replace(/</g, "&lt;").replace(/>/g, "&gt;");
            }
            if (Array.isArray(data)) {
                return data.map(item => this.sanitizeInput(item));
            }
            if (data !== null && typeof data === 'object') {
                const sanitizedObj = {};
                for (const key in data) {
                    sanitizedObj[key] = this.sanitizeInput(data[key]);
                }
                return sanitizedObj;
            }
            return data;
        }
    };

    // تسجيل المحرك بأمان في الـ Window ليكون متاحاً لجميع الملفات
    window.API = API_CORE;
    window.API_BASE_URL = API_BASE_URL; // نتيح الرابط عالمياً للسكربتات الأخرى
    
    // [إصلاح خطأ صفحة التسجيل]: دالة عالمية قسرية لإنهاء الجلسة 
    window.logout = function() {
        API_CORE.clearSession();
    };

    // تأمين كائن AUTH في حال لم يتم تحميله بعد لمنع أخطاء الواجهة
    if (typeof window.AUTH === 'undefined') {
        window.AUTH = { logout: window.logout };
    }
    
    console.log('[System] API Engine Loaded Successfully. Anti-Loop applied.');
} else {
    // تم استدعاء الملف سابقاً، نتجاهل الأمر لمنع الانهيار
    console.warn('[System] API Engine is already loaded. Skipping re-declaration.');
}
