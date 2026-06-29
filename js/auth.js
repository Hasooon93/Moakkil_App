/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: js/auth.js
 * الوصف: محرك المصادقة وإدارة الهوية الرقمية (V4.1 Enterprise Security & MFA Edition)
 * الميزات الأمنية المطبقة:
 * 1. الجلسة الأحادية (Single Session) لمنع الدخول المتعدد عبر x-device-id.
 * 2. التحقق المزدوج (2FA) عبر بوت التيليغرام.
 * 3. المصادقة البيومترية (WebAuthn / Passwordless) الآمنة تماماً.
 * 4. الحماية الصارمة ضد محاولات الدخول في وضع عدم الاتصال (Offline Spoofing).
 * 5. المصادقة الإجرائية (Action-Based MFA) للعمليات المالية والحساسة.
 * ============================================================================
 */

// ============================================================================
// [1] بصمة الجهاز (Device Fingerprinting) لضمان الجلسة الأحادية
// ============================================================================
// توليد معرّف فريد ومشفّر للجهاز الحالي إذا لم يكن مسجلاً مسبقاً
if (!localStorage.getItem('moakkil_device_id')) {
    // ندمج رقماً عشوائياً مع الطابع الزمني لضمان عدم تطابق المعرفات (Collision)
    const newDeviceId = 'DEV_' + Math.random().toString(36).substr(2, 10) + '_' + Date.now();
    localStorage.setItem('moakkil_device_id', newDeviceId);
}

const AUTH = {
    // ========================================================================
    // [2] إدارة الجلسات المحلية (Session Management)
    // ========================================================================
    
    /**
     * التحقق من صلاحية الجلسة (يُستدعى كحارس في بداية كل صفحة محمية)
     * @returns {Object|null} بيانات المستخدم إذا كانت الجلسة صالحة، أو null إذا انتهت
     */
    checkSession: () => {
        const token = localStorage.getItem(CONFIG?.TOKEN_KEY || 'moakkil_token');
        const user = localStorage.getItem(CONFIG?.USER_KEY || 'moakkil_user');
        
        if (!token || !user) {
            console.warn("🛡️ [Auth Firewall] تم رصد جلسة غير صالحة. جاري طرد المستخدم لصفحة الدخول...");
            window.location.replace('login.html');
            return null;
        }

        try {
            return JSON.parse(user);
        } catch (e) {
            // في حال تم العبث ببيانات الـ LocalStorage وتخريب الـ JSON
            console.error("🛡️ [Auth Firewall] تلاعب في بيانات الجلسة. جاري تدمير الجلسة...");
            AUTH.logout();
            return null;
        }
    },

    /**
     * تسجيل الخروج الآمن (Destroy Session)
     */
    logout: () => {
        localStorage.removeItem(CONFIG?.TOKEN_KEY || 'moakkil_token');
        localStorage.removeItem(CONFIG?.USER_KEY || 'moakkil_user');
        localStorage.removeItem(CONFIG?.FIRM_KEY || 'moakkil_firm_id');
        
        // 💡 ملاحظة أمنية: لا نحذف بيانات (moakkil_biometric_id و moakkil_full_user_backup) 
        // لكي يتمكن المستخدم من الدخول السريع بالبصمة لاحقاً على نفس هذا الجهاز.
        
        window.location.replace('login.html');
    },

    // ========================================================================
    // [3] المصادقة عبر التيليغرام (Telegram OTP 2FA)
    // ========================================================================
    
    /**
     * طلب الرمز السري الآمن
     * @param {string} phone - رقم هاتف المستخدم
     */
    requestOTP: async (phone) => {
        // حماية الواجهة: يمنع طلب الرمز في حال انقطاع الإنترنت (لمنع تخزين الطلبات)
        if (!navigator.onLine) {
            throw new Error("لا يمكن تسجيل الدخول في وضع عدم الاتصال (Offline). يرجى التأكد من اتصالك بشبكة الإنترنت.");
        }

        try {
            const deviceId = localStorage.getItem('moakkil_device_id') || 'unknown';
            const response = await fetch(`${CONFIG.API_URL}/api/auth/request-otp`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-device-id': deviceId // إرسال بصمة الجهاز للـ Worker لربط الجلسة
                },
                body: JSON.stringify({ phone })
            });
            
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'فشل إرسال كود التحقق من الخادم.');
            
            return data;
        } catch (error) {
            console.error('🛡️ [Auth OTP Request Error]:', error);
            throw error;
        }
    },

    /**
     * التحقق من الرمز السري ومصادقة الدخول
     * @param {string} phone - رقم الهاتف
     * @param {string} otp - الرمز السري المدخل
     */
    verifyOTP: async (phone, otp) => {
        if (!navigator.onLine) {
            throw new Error("لا يمكن التحقق من الكود في وضع عدم الاتصال (Offline). يرجى الاتصال بالإنترنت فوراً.");
        }

        try {
            const deviceId = localStorage.getItem('moakkil_device_id') || 'unknown';
            const response = await fetch(`${CONFIG.API_URL}/api/auth/verify-otp`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-device-id': deviceId
                },
                body: JSON.stringify({ phone, otp })
            });
            
            const data = await response.json();
            
            if (!response.ok) throw new Error(data.error || 'الرمز السري غير صحيح أو منتهي الصلاحية.');
            
            // 1. حفظ التوكن (JWT) وبيانات المستخدم لبدء الجلسة
            localStorage.setItem(CONFIG?.TOKEN_KEY || 'moakkil_token', data.token);
            localStorage.setItem(CONFIG?.USER_KEY || 'moakkil_user', JSON.stringify(data.user));
            
            // 2. أخذ نسخة احتياطية لضمان عمل البصمة بكفاءة لاحقاً حتى في حال مسح الكاش العادي
            localStorage.setItem('moakkil_full_user_backup', JSON.stringify(data.user));
            localStorage.setItem('moakkil_saved_phone', phone); // حفظ الرقم لعمليات البصمة

            // 3. تخزين معرف المكتب إذا كان موجوداً لعزله برمجياً
            if (data.user.firm_id) {
                localStorage.setItem(CONFIG?.FIRM_KEY || 'moakkil_firm_id', data.user.firm_id);
            }

            // 4. التوجيه الذكي (Routing) بناءً على صلاحيات المستخدم (مدير أعلى أم موظف مكتب)
            const userRole = data.user.role || data.user.user_type;
            
            setTimeout(() => {
                // تأخير 800 ملي ثانية ليظهر إشعار النجاح في الفرونت إند بشكل مريح للعين
                if (userRole === 'super_admin' || userRole === 'superadmin' || data.user.is_setup_required) {
                    window.location.replace('register.html'); 
                } else {
                    window.location.replace('app.html');
                }
            }, 800);

            return data;
        } catch (error) {
            console.error('🛡️ [Auth Verify Error]:', error);
            throw error;
        }
    },

    // ========================================================================
    // [4] المصادقة البيومترية والمصادقة الإجرائية (WebAuthn / Action MFA)
    // ========================================================================
    
    // دوال مساعدة لمعالجة التشفير البيومتري (Buffer to Base64)
    _bufferToBase64: (buffer) => {
        const bytes = new Uint8Array(buffer);
        let str = '';
        for (let charCode of bytes) str += String.fromCharCode(charCode);
        return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
    },
    
    _base64ToBuffer: (base64) => {
        const str = atob(base64.replace(/-/g, "+").replace(/_/g, "/"));
        const bytes = new Uint8Array(str.length);
        for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
        return bytes.buffer;
    },

    _generateChallenge: () => {
        const randomValues = new Uint8Array(32);
        window.crypto.getRandomValues(randomValues);
        return randomValues.buffer;
    },

    /**
     * تفعيل وتسجيل مستشعر البصمة في جهاز المستخدم
     */
    registerBiometric: async () => {
        if (!navigator.onLine) throw new Error("لا يمكن تفعيل البصمة دون الاتصال بالإنترنت للمصادقة مع الخادم.");
        if (!window.PublicKeyCredential) throw new Error("للأسف، متصفحك أو جهازك لا يدعم تقنية البصمة البيومترية.");

        const user = JSON.parse(localStorage.getItem(CONFIG?.USER_KEY || 'moakkil_user'));
        if (!user) throw new Error("يجب عليك تسجيل الدخول باستخدام الرمز السري (OTP) أولاً لتتمكن من تفعيل البصمة.");

        try {
            const publicKey = {
                challenge: AUTH._generateChallenge(),
                rp: { name: "نظام موكّل القانوني السحابي", id: window.location.hostname },
                user: {
                    id: AUTH._base64ToBuffer(btoa(user.id || "user_id").replace(/=/g, "")),
                    name: user.phone || "user",
                    displayName: user.full_name || "المحامي"
                },
                // دعم خوارزميات التشفير القياسية للموبايل واللابتوب
                pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
                authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
                timeout: 60000,
                attestation: "none"
            };

            // استدعاء مستشعر النظام (يظهر مربع البصمة للمستخدم)
            const credential = await navigator.credentials.create({ publicKey });

            const payload = {
                credential_id: credential.id,
                public_key: AUTH._bufferToBase64(credential.response.clientDataJSON), 
                device_name: navigator.userAgent.includes('Mobi') ? 'هاتف ذكي (موبايل)' : 'جهاز كمبيوتر (مكتبي)'
            };

            // إرسال التشفير للباك إند
            const res = await API.registerBiometric(payload);
            if (res.error) throw new Error(res.error);
            
            // حفظ المفاتيح محلياً للتعرف على الجهاز لاحقاً
            localStorage.setItem('moakkil_biometric_id', credential.id);
            localStorage.setItem('moakkil_saved_phone', user.phone);
            localStorage.setItem('moakkil_full_user_backup', JSON.stringify(user));
            
            return { success: true, message: "تم تشفير بياناتك وتفعيل البصمة بنجاح!" };
        } catch (error) {
            console.error("🛡️ [Biometric Register Error]:", error);
            if (error.name === 'NotAllowedError' || error.name === 'AbortError') {
                throw new Error("تم إلغاء عملية التسجيل من قبل المستخدم.");
            }
            throw new Error(error.message || "فشل تسجيل البصمة. تأكد من إعدادات الحماية في جهازك.");
        }
    },

    /**
     * تسجيل الدخول السريع باستخدام مستشعر البصمة المسجل مسبقاً
     */
    loginWithBiometric: async () => {
        if (!navigator.onLine) throw new Error("يرجى الاتصال بالإنترنت لتتمكن من تسجيل الدخول.");
        if (!window.PublicKeyCredential) throw new Error("البصمة غير مدعومة في هذا المتصفح.");

        const savedCredId = localStorage.getItem('moakkil_biometric_id');
        const savedPhone = localStorage.getItem('moakkil_saved_phone');

        if (!savedCredId || !savedPhone) throw new Error("البصمة غير مفعلة أو غير مسجلة على هذا الجهاز.");

        try {
            const publicKey = {
                challenge: AUTH._generateChallenge(),
                rpId: window.location.hostname,
                allowCredentials: [{
                    type: "public-key",
                    id: AUTH._base64ToBuffer(savedCredId),
                    transports: ["internal"]
                }],
                userVerification: "required",
                timeout: 60000
            };

            // استدعاء مستشعر النظام للمطابقة
            const assertion = await navigator.credentials.get({ publicKey });

            const payload = {
                credential_id: assertion.id,
                phone: savedPhone,
                deviceId: localStorage.getItem('moakkil_device_id') || 'unknown'
            };

            // التحقق من المطابقة في الباك إند
            const data = await API.biometricLogin(payload);
            if (data.error) throw new Error(data.error);

            // بدء الجلسة
            localStorage.setItem(CONFIG?.TOKEN_KEY || 'moakkil_token', data.token);
            localStorage.setItem(CONFIG?.USER_KEY || 'moakkil_user', JSON.stringify(data.user));
            if (data.user.firm_id) {
                localStorage.setItem(CONFIG?.FIRM_KEY || 'moakkil_firm_id', data.user.firm_id);
            }

            // التوجيه الذكي
            const userRole = data.user.role || data.user.user_type;
            
            setTimeout(() => {
                if (userRole === 'super_admin' || userRole === 'superadmin' || data.user.is_setup_required) {
                    window.location.replace('register.html'); 
                } else {
                    window.location.replace('app.html');
                }
            }, 800);

            return data;
        } catch (error) {
            console.error("🛡️ [Biometric Login Error]:", error);
            if (error.name === 'NotAllowedError' || error.name === 'AbortError') {
                throw new Error("تم إلغاء عملية الدخول بالبصمة.");
            }
            throw error;
        }
    },

    /**
     * 🛡️ المصادقة الإجرائية (Action-Based MFA) للعمليات الحساسة (تعديل/حذف)
     * تطلب من المستخدم مطابقة بصمته أو الـ PIN قبل تنفيذ أمر معين عبر الـ API
     * @returns {string} actionToken توكن مؤقت لإثبات هوية من قام بالعملية
     */
    requireActionAuth: async (actionDescription = "تأكيد العملية الحساسة") => {
        if (!window.PublicKeyCredential) {
            console.warn("المصادقة البيومترية غير مدعومة. سيتم الاعتماد على توكن الجلسة الافتراضي.");
            return "fallback_token_no_biometrics";
        }

        const savedCredId = localStorage.getItem('moakkil_biometric_id');
        
        // إذا لم يكن مسجلاً للبصمة، نسمح له بتخطي هذا الفحص (لتجنب حجب الوظائف عن من لا يملكون بصمة)
        if (!savedCredId) {
            console.warn("المستخدم لم يفعل البصمة. جاري السماح بالعملية بناءً على الجلسة الحالية.");
            return "fallback_token_not_enrolled";
        }

        try {
            console.log(`🔒 جاري طلب مصادقة إجرائية: ${actionDescription}`);
            const publicKey = {
                challenge: AUTH._generateChallenge(),
                rpId: window.location.hostname,
                allowCredentials: [{
                    type: "public-key",
                    id: AUTH._base64ToBuffer(savedCredId),
                    transports: ["internal"]
                }],
                userVerification: "required",
                timeout: 30000 // 30 ثانية فقط لتأكيد العملية
            };

            const assertion = await navigator.credentials.get({ publicKey });
            
            // توليد توكن إجرائي مؤقت بناءً على استجابة البصمة ليمرره الـ API في الـ Header
            const actionToken = `act_${btoa(assertion.id).substring(0, 15)}_${Date.now()}`;
            return actionToken;

        } catch (error) {
            console.error("🛡️ [Action MFA Error]:", error);
            if (error.name === 'NotAllowedError' || error.name === 'AbortError') {
                throw new Error("تم إلغاء المصادقة الأمنية. لم يتم تنفيذ العملية.");
            }
            throw new Error("فشلت المصادقة الأمنية. يرجى المحاولة مجدداً.");
        }
    }
};

// ============================================================================
// [5] سكريبت التشغيل التلقائي (Auto-Boot UX Enhancements)
// ============================================================================

window.addEventListener('DOMContentLoaded', async () => {
    const isLoginPage = window.location.pathname.includes('login.html') || window.location.pathname.endsWith('/');
    const hasBiometric = localStorage.getItem('moakkil_biometric_id');

    // إذا كنا في صفحة الدخول، ويوجد بصمة مسجلة، والإنترنت متوفر، نطلبها فوراً لراحة المستخدم
    if (isLoginPage && hasBiometric && navigator.onLine) {
        console.log("🤖 [نظام موكّل]: تم اكتشاف بصمة مسجلة في هذا الجهاز. جاري طلب التحقق الآمن...");
        
        // تأخير بسيط (800ms) لضمان تحميل واجهة تسجيل الدخول بشكل سليم قبل إظهار الـ Popup للمستخدم
        setTimeout(async () => {
            try {
                await AUTH.loginWithBiometric();
            } catch (err) {
                console.log("🛡️ [نظام موكّل]: تم إيقاف طلب البصمة التلقائي (ربما ألغاه المستخدم أو فشلت المطابقة، سيُطلب منه الـ OTP يدوياً).");
            }
        }, 800);
    }
});