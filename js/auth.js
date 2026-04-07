// js/auth.js - نظام المصادقة وإدارة الهوية (V3.0 Enterprise)
// الدعم: OTP عبر تيليغرام، الدخول بالبصمة (WebAuthn / FaceID / TouchID)، الجلسات المحمية (JWT).

const AUTH = {
    // =================================================================
    // 1. إدارة الجلسات (Session Management)
    // =================================================================
    
    // التحقق من الجلسة (يُستدعى في بداية كل صفحة محمية مثل app.html)
    checkSession: () => {
        const token = localStorage.getItem(CONFIG.TOKEN_KEY || 'moakkil_token');
        const user = localStorage.getItem(CONFIG.USER_KEY || 'moakkil_user');
        
        if (!token || !user) {
            console.warn("[Auth] جلسة غير صالحة. جاري التوجيه لصفحة الدخول...");
            window.location.replace('login.html');
            return null;
        }

        try {
            return JSON.parse(user);
        } catch (e) {
            AUTH.logout();
            return null;
        }
    },

    // تسجيل الخروج الآمن
    logout: () => {
        localStorage.removeItem(CONFIG.TOKEN_KEY || 'moakkil_token');
        localStorage.removeItem(CONFIG.USER_KEY || 'moakkil_user');
        localStorage.removeItem(CONFIG.FIRM_KEY);
        // لا نحذف OFFLINE_QUEUE_KEY لتجنب ضياع بيانات المزامنة غير المكتملة
        window.location.replace('login.html');
    },

    // =================================================================
    // 2. تسجيل الدخول عبر تيليغرام (OTP)
    // =================================================================
    
    requestOTP: async (phone) => {
        try {
            const response = await fetch(`${CONFIG.API_URL}/api/auth/request-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'فشل إرسال كود التحقق');
            return data;
        } catch (error) {
            console.error('[Auth OTP Error]:', error);
            throw error;
        }
    },

    verifyOTP: async (phone, otp) => {
        try {
            const response = await fetch(`${CONFIG.API_URL}/api/auth/verify-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, otp })
            });
            const data = await response.json();
            
            if (!response.ok) throw new Error(data.error || 'الكود غير صحيح');
            
            // حفظ التوكن وبيانات المستخدم
            localStorage.setItem(CONFIG.TOKEN_KEY || 'moakkil_token', data.token);
            localStorage.setItem(CONFIG.USER_KEY || 'moakkil_user', JSON.stringify(data.user));
            if (data.user.firm_id) {
                localStorage.setItem(CONFIG.FIRM_KEY, data.user.firm_id);
            }

            return data;
        } catch (error) {
            console.error('[Auth Verify Error]:', error);
            throw error;
        }
    },

    // =================================================================
    // 3. نظام الدخول بالبصمة (Biometrics - WebAuthn API)
    // =================================================================
    
    // أدوات مساعدة لتحويل التشفير (ArrayBuffer <-> Base64)
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

    // توليد تحدي عشوائي (Challenge) للأمان
    _generateChallenge: () => {
        const randomValues = new Uint8Array(32);
        window.crypto.getRandomValues(randomValues);
        return randomValues.buffer;
    },

    // أ) تسجيل جهاز جديد بالبصمة (يُستدعى من إعدادات المستخدم من داخل النظام)
    registerBiometric: async () => {
        if (!window.PublicKeyCredential) {
            throw new Error("متصفحك أو جهازك لا يدعم تقنية البصمة (WebAuthn).");
        }

        const user = JSON.parse(localStorage.getItem(CONFIG.USER_KEY || 'moakkil_user'));
        if (!user) throw new Error("يجب تسجيل الدخول بـ OTP أولاً لتفعيل البصمة.");

        try {
            // 1. طلب البصمة من نظام التشغيل (ويندوز/أندرويد/iOS)
            const publicKey = {
                challenge: AUTH._generateChallenge(),
                rp: { name: "نظام موكّل القانوني", id: window.location.hostname },
                user: {
                    id: AUTH._base64ToBuffer(btoa(user.id || "user_id").replace(/=/g, "")),
                    name: user.phone || "user",
                    displayName: user.full_name || "المحامي"
                },
                pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
                authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
                timeout: 60000,
                attestation: "none"
            };

            const credential = await navigator.credentials.create({ publicKey });

            // 2. إرسال بيانات البصمة للسيرفر لربطها بحساب الموظف
            const payload = {
                credential_id: credential.id,
                public_key: AUTH._bufferToBase64(credential.response.clientDataJSON), // تبسيط للغايات الأمنية
                device_name: navigator.userAgent.split(') ')[0].split(' (')[1] || 'جهاز غير معروف'
            };

            const res = await API.registerBiometric(payload);
            if (res.error) throw new Error(res.error);
            
            // حفظ الـ credential_id محلياً لتسريع الدخول المرات القادمة
            localStorage.setItem('moakkil_biometric_id', credential.id);
            localStorage.setItem('moakkil_saved_phone', user.phone);
            
            return { success: true, message: "تم تفعيل الدخول بالبصمة لهذا الجهاز بنجاح!" };
        } catch (error) {
            console.error("[Biometric Register Error]:", error);
            throw new Error(error.message || "تم إلغاء أو فشل تسجيل البصمة.");
        }
    },

    // ب) تسجيل الدخول السريع باستخدام البصمة (من صفحة login.html)
    loginBiometric: async () => {
        if (!window.PublicKeyCredential) {
            throw new Error("متصفحك لا يدعم الدخول بالبصمة.");
        }

        const savedCredId = localStorage.getItem('moakkil_biometric_id');
        const savedPhone = localStorage.getItem('moakkil_saved_phone');

        if (!savedCredId || !savedPhone) {
            throw new Error("لم تقم بتفعيل البصمة على هذا الجهاز مسبقاً. يرجى الدخول بـ OTP وتفعيلها من الإعدادات.");
        }

        try {
            // 1. طلب قراءة البصمة للمطابقة
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

            const assertion = await navigator.credentials.get({ publicKey });

            // 2. إرسال البصمة للباك إند للحصول على التوكن
            const payload = {
                credential_id: assertion.id,
                phone: savedPhone
            };

            // نستخدم API.biometricLogin التي أضفناها في api.js
            const data = await API.biometricLogin(payload);
            
            if (data.error) throw new Error(data.error);

            // 3. تخزين بيانات الجلسة بنجاح
            localStorage.setItem(CONFIG.TOKEN_KEY || 'moakkil_token', data.token);
            localStorage.setItem(CONFIG.USER_KEY || 'moakkil_user', JSON.stringify(data.user));
            if (data.user.firm_id) {
                localStorage.setItem(CONFIG.FIRM_KEY, data.user.firm_id);
            }

            return data;
        } catch (error) {
            console.error("[Biometric Login Error]:", error);
            throw new Error(error.message || "فشل التحقق من البصمة. يرجى المحاولة أو الدخول بالرمز (OTP).");
        }
    }
};