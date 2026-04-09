// moakkil-api.js
// الدستور المطبق: DRY (لا تكرر نفسك)، Interceptor، حماية الجلسة، معالجة الأخطاء المركزية.

const api = (function() {
    // 🔴 هام جداً: استبدل هذا الرابط برابط الـ Cloudflare Worker الخاص بك
    const BASE_URL = 'https://curly-pond-9975.hassan-alsakka.workers.dev';

    /**
     * الدالة المركزية لمعالجة كافة الطلبات
     */
    async function request(endpoint, options = {}) {
        const url = `${BASE_URL}${endpoint}`;
        
        // تجهيز الترويسات (Headers)
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        // حقن التوكن (JWT) إذا كان موجوداً
        const token = localStorage.getItem('moakkil_token');
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const config = {
            ...options,
            headers
        };

        try {
            const response = await fetch(url, config);
            
            // التعامل مع الأخطاء غير المتوقعة (مثل سقوط الخادم)
            if (!response.ok) {
                // إذا انتهت الجلسة أو تم تسجيل الدخول من جهاز آخر (Session Hijacking / Expiry)
                if (response.status === 401 || response.status === 403) {
                    console.warn("الجلسة غير صالحة أو انتهت الصلاحية. جاري تسجيل الخروج...");
                    localStorage.removeItem('moakkil_token');
                    localStorage.removeItem('moakkil_user');
                    window.location.replace('login.html'); // الطرد الفوري
                    throw new Error("انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً.");
                }

                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || errorData.message || `خطأ في الخادم: ${response.status}`);
            }

            // إذا كان الطلب DELETE ونجح ولم يرجع محتوى
            if (response.status === 204) {
                return { success: true };
            }

            return await response.json();

        } catch (error) {
            // معالجة أخطاء الشبكة (انقطاع الإنترنت)
            if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
                throw new Error("لا يوجد اتصال بالإنترنت أو الخادم لا يستجيب.");
            }
            throw error;
        }
    }

    // تصدير الدوال للاستخدام في باقي الملفات
    return {
        get: (endpoint, options = {}) => request(endpoint, { method: 'GET', ...options }),
        post: (endpoint, body, options = {}) => request(endpoint, { method: 'POST', body: JSON.stringify(body), ...options }),
        patch: (endpoint, body, options = {}) => request(endpoint, { method: 'PATCH', body: JSON.stringify(body), ...options }),
        delete: (endpoint, options = {}) => request(endpoint, { method: 'DELETE', ...options })
    };
})();

// جعل الـ API متاحاً عالمياً في المتصفح
window.api = api;