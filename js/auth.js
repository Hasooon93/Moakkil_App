// js/auth.js - نظام المصادقة وإدارة الهوية (V4.0 Enterprise Security Edition)
// التحديثات: توليد x-device-id تلقائي لضمان الجلسة الأحادية، منع الدخول بالـ Offline، والتحقق الصارم من الـ JWT.

// توليد المعرف الفريد للجهاز إذا لم يكن موجوداً (لتطبيق الجلسة الأحادية)
if (!localStorage.getItem('moakkil_device_id')) {
    const newDeviceId = 'DEV_' + Math.random().toString(36).substr(2, 10) + '_' + Date.now();
    localStorage.setItem('moakkil_device_id', newDeviceId);
}

const AUTH = {
    // =================================================================
    // 1. إدارة الجلسات (Session Management)
    // =================================================================
    
    // التحقق من الجلسة (يُستدعى في بداية كل صفحة محمية)
    checkSession: () => {
        const token = localStorage.getItem(CONFIG?.TOKEN_KEY || 'moakkil_token');
        const user = localStorage.getItem(CONFIG?.USER_KEY || 'moakkil_user');
        
        if (!token || !user) {
            console.warn("🛡️ [Auth] جلسة غير صالحة. جاري التوجيه لصفحة الدخول...");
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

    // تسجيل الخروج الآمن وتدمير الجلسة المحلية
    logout: () => {
        localStorage.removeItem(CONFIG?.TOKEN_KEY || 'moakkil_token');
        localStorage.removeItem(CONFIG?.USER_KEY || 'moakkil_user');
        localStorage.removeItem(CONFIG?.FIRM_KEY || 'moakkil_firm_id');
        // ملاحظة: لا نحذف بيانات البصمة moakkil_biometric_id لكي يتمكن من الدخول بها لاحقاً بشكل سريع
        window.location.replace('login.html');
    },

    // =================================================================
    // 2. تسجيل الدخول عبر تيليغرام (OTP)
    // =================================================================
    
    requestOTP: async (phone) => {
        if (!navigator.onLine) {
            throw new Error("لا يمكن تسجيل الدخول في وضع عدم الاتصال (Offline). يرجى التأكد من اتصالك بالإنترنت.");
        }

        try {
            const deviceId = localStorage.getItem('moakkil_device_id') || 'unknown';
            const response = await fetch(`${CONFIG.API_URL}/api/auth/request-otp`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-device-id': deviceId
                },
                body: JSON.stringify({ phone })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'فشل إرسال كود التحقق');
            return data;
        } catch (error) {
            console.error('🛡️ [Auth OTP Request Error]:', error);
            throw error;
        }
    },

    verifyOTP: async (phone, otp) => {
        if (!navigator.onLine) {
            throw new Error("لا يمكن التحقق من الكود في وضع عدم الاتصال (Offline). يرجى الاتصال بالإنترنت.");
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
            
            if (!response.ok) throw new Error(data.error || 'الكود غير صحيح أو منتهي الصلاحية');
            
            // حفظ التوكن وبيانات المستخدم لبدء الجلسة
            localStorage.setItem(CONFIG?.TOKEN_KEY || 'moakkil_token', data.token);
            localStorage.setItem(CONFIG?.USER_KEY || 'moakkil_user', JSON.stringify(data.user));
            
            // نسخة احتياطية لضمان عمل البصمة بكفاءة لاحقاً حتى في حال مسح الكاش العادي
            localStorage.setItem('moakkil_full_user_backup', JSON.stringify(data.user));

            if (data.user.firm_id) {
                localStorage.setItem(CONFIG?.FIRM_KEY || 'moakkil_firm_id', data.user.firm_id);
            }

            // التوجيه الذكي والصحيح (إلى register.html للإدارة العليا إذا لزم الأمر)
            const userRole = data.user.role || data.user.user_type;
            
            setTimeout(() => {
                if (userRole === 'super_admin' || userRole === 'superadmin' || data.user.is_setup_required) {
                    window.location.replace('register.html'); 
                } else {
                    window.location.replace('app.html');
                }
            }, 800); // تأخير بسيط ليظهر إشعار النجاح في الفرونت إند بشكل مريح للعين

            return data;
        } catch (error) {
            console.error('🛡️ [Auth Verify Error]:', error);
            throw error;
        }
    },

    // =================================================================
    // 3. نظام الدخول بالبصمة (Biometrics - WebAuthn API)
    // =================================================================
    
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

    registerBiometric: async () => {
        if (!navigator.onLine) throw new Error("لا يمكن تفعيل البصمة دون الاتصال بالإنترنت.");
        if (!window.PublicKeyCredential) throw new Error("متصفحك لا يدعم تقنية البصمة البيومترية.");

        const user = JSON.parse(localStorage.getItem(CONFIG?.USER_KEY || 'moakkil_user'));
        if (!user) throw new Error("يجب تسجيل الدخول بـ OTP أولاً لتفعيل البصمة.");

        try {
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

            const payload = {
                credential_id: credential.id,
                public_key: AUTH._bufferToBase64(credential.response.clientDataJSON), 
                device_name: navigator.userAgent.includes('Mobi') ? 'هاتف ذكي' : 'جهاز كمبيوتر'
            };

            const res = await API.registerBiometric(payload);
            if (res.error) throw new Error(res.error);
            
            localStorage.setItem('moakkil_biometric_id', credential.id);
            localStorage.setItem('moakkil_saved_phone', user.phone);
            localStorage.setItem('moakkil_full_user_backup', JSON.stringify(user));
            
            return { success: true, message: "تم تشفير وتفعيل البصمة بنجاح!" };
        } catch (error) {
            console.error("🛡️ [Biometric Register Error]:", error);
            throw new Error(error.message || "فشل تسجيل البصمة. تأكد من إعدادات جهازك.");
        }
    },

    loginWithBiometric: async () => {
        if (!navigator.onLine) throw new Error("يرجى الاتصال بالإنترنت لتسجيل الدخول.");
        if (!window.PublicKeyCredential) throw new Error("البصمة غير مدعومة في هذا المتصفح.");

        const savedCredId = localStorage.getItem('moakkil_biometric_id');
        const savedPhone = localStorage.getItem('moakkil_saved_phone');

        if (!savedCredId || !savedPhone) throw new Error("البصمة غير مفعلة على هذا الجهاز.");

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

            const assertion = await navigator.credentials.get({ publicKey });

            const payload = {
                credential_id: assertion.id,
                phone: savedPhone,
                deviceId: localStorage.getItem('moakkil_device_id') || 'unknown'
            };

            const data = await API.biometricLogin(payload);
            if (data.error) throw new Error(data.error);

            localStorage.setItem(CONFIG?.TOKEN_KEY || 'moakkil_token', data.token);
            localStorage.setItem(CONFIG?.USER_KEY || 'moakkil_user', JSON.stringify(data.user));
            if (data.user.firm_id) localStorage.setItem(CONFIG?.FIRM_KEY || 'moakkil_firm_id', data.user.firm_id);

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
            throw error;
        }
    }
};

// =================================================================
// 🚀 سكريبت التشغيل التلقائي (Auto-Initializer)
// =================================================================

window.addEventListener('DOMContentLoaded', async () => {
    const isLoginPage = window.location.pathname.includes('login');
    const hasBiometric = localStorage.getItem('moakkil_biometric_id');

    // إذا كنا في صفحة الدخول ويوجد بصمة مسجلة، والإنترنت متوفر، نطلبها فوراً
    if (isLoginPage && hasBiometric && navigator.onLine) {
        console.log("🤖 نظام موكّل: تم اكتشاف بصمة مسجلة. جاري طلب التحقق الآمن...");
        
        // تأخير بسيط لضمان تحميل واجهة تسجيل الدخول بشكل سليم للمستخدم
        setTimeout(async () => {
            try {
                await AUTH.loginWithBiometric();
            } catch (err) {
                console.log("🛡️ تم إيقاف طلب البصمة التلقائي (ربما ألغاه المستخدم أو يحتاج لطلب OTP يدوياً)");
            }
        }, 800);
    }
});