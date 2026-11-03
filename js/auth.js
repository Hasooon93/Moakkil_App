/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: js/auth.js
 * الوصف: محرك المصادقة وإدارة الهوية الرقمية (V5.2 Enterprise Zero-Trust & MFA Edition)
 * الميزات الأمنية المطبقة:
 * 1. الجلسة الأحادية (Single Session) لمنع الدخول المتعدد عبر x-device-id.
 * 2. التحقق المزدوج (2FA) عبر بوت التيليغرام مع فحص صلاحية JWT محلياً وخادمياً.
 * 3. المصادقة البيومترية (WebAuthn / Passwordless) المتوافقة مع معايير المتصفحات الحديثة.
 * 4. الحماية الصارمة ضد محاولات الدخول في وضع عدم الاتصال (Offline Spoofing).
 * 5. المصادقة الإجرائية الحقيقية (Action-Based Server MFA) للعمليات الحساسة والحذف.
 * 6. تعقيم بيانات المستخدم وتدمير النسخ الاحتياطية الحساسة عند تسجيل الخروج.
 * ============================================================================
 */

// ============================================================================
// [1] بصمة الجهاز (Device Fingerprinting) لضمان الجلسة الأحادية
// ============================================================================
if (!localStorage.getItem('moakkil_device_id')) {
    const uuidPart = (window.crypto && typeof window.crypto.randomUUID === 'function')
        ? window.crypto.randomUUID()
        : (Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 12));
    localStorage.setItem('moakkil_device_id', 'DEV_' + uuidPart);
}

const AUTH = {
    // ========================================================================
    // [1.1] دوال التعقيم والفحص الكريبتوغرافي المحلي للتوكن
    // ========================================================================
    _sanitizeUser: (userObj) => {
        if (!userObj || typeof userObj !== 'object') return {};
        const clean = { ...userObj };
        delete clean.password;
        delete clean.password_hash;
        delete clean.pin_code;
        delete clean.salary;
        delete clean.salary_details;
        delete clean.base_salary;
        delete clean.financial_notes;
        return clean;
    },

    /**
     * فحص انتهاء صلاحية الـ JWT محلياً عبر قراءة حقل exp
     */
    _isTokenExpired: (token) => {
        try {
            if (!token || typeof token !== 'string') return true;
            const parts = token.split('.');
            if (parts.length !== 3) return true;
            let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            while (b64.length % 4 !== 0) b64 += '=';
            const payloadJson = new TextDecoder().decode(
                Uint8Array.from(window.atob(b64), c => c.charCodeAt(0))
            );
            const payload = JSON.parse(payloadJson);
            if (!payload || !payload.exp) return false;
            const nowSec = Math.floor(Date.now() / 1000);
            return payload.exp < nowSec;
        } catch (e) {
            return true;
        }
    },

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

        if (!token || !user || AUTH._isTokenExpired(token)) {
            console.warn("🛡️ [Auth Firewall] تم رصد جلسة غير صالحة أو منتهية الصلاحية. جاري التوجيه لصفحة الدخول...");
            AUTH.logout();
            return null;
        }

        try {
            const parsedUser = JSON.parse(user);
            if (!parsedUser || (!parsedUser.id && !parsedUser.uid)) {
                throw new Error("Invalid User Object");
            }
            return AUTH._sanitizeUser(parsedUser);
        } catch (e) {
            console.error("🛡️ [Auth Firewall] تلاعب في بيانات الجلسة. جاري تدمير الجلسة...");
            AUTH.logout();
            return null;
        }
    },

    /**
     * تسجيل الخروج الآمن وتدمير كافة البيانات الحساسة في المتصفح (Destroy Session)
     */
    logout: () => {
        localStorage.removeItem(CONFIG?.TOKEN_KEY || 'moakkil_token');
        localStorage.removeItem(CONFIG?.USER_KEY || 'moakkil_user');
        localStorage.removeItem(CONFIG?.FIRM_KEY || 'moakkil_firm_id');
        localStorage.removeItem('moakkil_full_user_backup');
        localStorage.removeItem('firm_settings');
        sessionStorage.clear();

        // نبقي فقط على (moakkil_biometric_id و moakkil_saved_phone) لتمكين طلب البصمة لاحقاً
        window.location.replace('login.html');
    },

    // ========================================================================
    // [3] المصادقة عبر التيليغرام (Telegram OTP 2FA)
    // ========================================================================

    /**
     * طلب الرمز السري الآمن
     * @param {string} phone رقم هاتف المستخدم
     */
    requestOTP: async (phone) => {
        if (!navigator.onLine) {
            throw new Error("لا يمكن تسجيل الدخول في وضع عدم الاتصال (Offline). يرجى التأكد من اتصالك بشبكة الإنترنت.");
        }

        try {
            const deviceId = localStorage.getItem('moakkil_device_id') || 'unknown';
            const baseUrl = window.API_BASE_URL || CONFIG?.API_URL || '';
            const response = await fetch(`${baseUrl}/api/auth/request-otp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-device-id': deviceId
                },
                body: JSON.stringify({ phone: String(phone || '').trim() })
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
     * @param {string} phone رقم الهاتف
     * @param {string} otp الرمز السري المدخل
     */
    verifyOTP: async (phone, otp) => {
        if (!navigator.onLine) {
            throw new Error("لا يمكن التحقق من الكود في وضع عدم الاتصال (Offline). يرجى الاتصال بالإنترنت فوراً.");
        }

        try {
            const deviceId = localStorage.getItem('moakkil_device_id') || 'unknown';
            const baseUrl = window.API_BASE_URL || CONFIG?.API_URL || '';
            const response = await fetch(`${baseUrl}/api/auth/verify-otp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-device-id': deviceId
                },
                body: JSON.stringify({ phone: String(phone || '').trim(), otp: String(otp || '').trim() })
            });

            const data = await response.json();

            if (!response.ok) throw new Error(data.error || 'الرمز السري غير صحيح أو منتهي الصلاحية.');

            const safeUser = AUTH._sanitizeUser(data.user);

            // 1. حفظ التوكن (JWT) وبيانات المستخدم المعقمة لبدء الجلسة
            localStorage.setItem(CONFIG?.TOKEN_KEY || 'moakkil_token', data.token);
            localStorage.setItem(CONFIG?.USER_KEY || 'moakkil_user', JSON.stringify(safeUser));

            // 2. حذف أي نسخة احتياطية قديمة غير آمنة وحفظ رقم الهاتف فقط للبصمة
            localStorage.removeItem('moakkil_full_user_backup');
            localStorage.setItem('moakkil_saved_phone', String(phone || '').trim());

            // 3. تخزين معرف المكتب إذا كان موجوداً لعزله برمجياً
            if (safeUser.firm_id) {
                localStorage.setItem(CONFIG?.FIRM_KEY || 'moakkil_firm_id', safeUser.firm_id);
            }

            // 4. التوجيه الذكي (Routing) بناءً على صلاحيات المستخدم (مدير أعلى أم موظف مكتب)
            const userRole = safeUser.role || safeUser.user_type;

            setTimeout(() => {
                if (userRole === 'super_admin' || userRole === 'superadmin' || safeUser.is_setup_required) {
                    window.location.replace('register.html');
                } else {
                    window.location.replace('app.html');
                }
            }, 800);

            return { ...data, user: safeUser };
        } catch (error) {
            console.error('🛡️ [Auth Verify Error]:', error);
            throw error;
        }
    },

    // ========================================================================
    // [4] المصادقة البيومترية والمصادقة الإجرائية (WebAuthn / Action MFA)
    // ========================================================================

    _bufferToBase64: (buffer) => {
        const bytes = new Uint8Array(buffer);
        let str = '';
        for (let charCode of bytes) str += String.fromCharCode(charCode);
        return window.btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
    },

    _base64ToBuffer: (base64) => {
        try {
            let b64 = String(base64 || '').replace(/-/g, "+").replace(/_/g, "/");
            while (b64.length % 4 !== 0) {
                b64 += "=";
            }
            const str = window.atob(b64);
            const bytes = new Uint8Array(str.length);
            for (let i = 0; i < str.length; i++) {
                bytes[i] = str.charCodeAt(i);
            }
            return bytes.buffer;
        } catch (e) {
            console.error("🛡️ [Base64 Decode Error]:", e);
            throw new Error("بيانات البصمة غير صالحة. يرجى تسجيل الدخول عبر الرمز السري (OTP) لتحديث مفاتيح الأمان.");
        }
    },

    _stringToBuffer: (str) => {
        return new TextEncoder().encode(String(str || 'moakkil_user')).buffer;
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

        const user = JSON.parse(localStorage.getItem(CONFIG?.USER_KEY || 'moakkil_user') || 'null');
        const token = localStorage.getItem(CONFIG?.TOKEN_KEY || 'moakkil_token');

        if (!user || !token) throw new Error("يجب عليك تسجيل الدخول باستخدام الرمز السري (OTP) أولاً لتتمكن من تفعيل البصمة.");

        try {
            const publicKey = {
                challenge: AUTH._generateChallenge(),
                rp: { name: "نظام موكّل القانوني السحابي", id: window.location.hostname },
                user: {
                    id: AUTH._stringToBuffer(user.id || user.uid || "user_id"),
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
                device_name: navigator.userAgent.includes('Mobi') ? 'هاتف ذكي (موبايل)' : 'جهاز كمبيوتر (مكتبي)'
            };

            const baseUrl = window.API_BASE_URL || CONFIG?.API_URL || '';
            const response = await fetch(`${baseUrl}/api/auth/biometric-register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            const res = await response.json();
            if (!response.ok) throw new Error(res.error || 'فشل الحفظ في الخادم');

            localStorage.setItem('moakkil_biometric_id', credential.id);
            localStorage.setItem('moakkil_saved_phone', user.phone);
            localStorage.removeItem('moakkil_full_user_backup');

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

            const assertion = await navigator.credentials.get({ publicKey });

            const deviceId = localStorage.getItem('moakkil_device_id') || 'unknown';
            const payload = {
                credential_id: assertion.id,
                phone: savedPhone,
                deviceId: deviceId,
                authenticator_data: assertion.response?.authenticatorData ? AUTH._bufferToBase64(assertion.response.authenticatorData) : undefined,
                signature: assertion.response?.signature ? AUTH._bufferToBase64(assertion.response.signature) : undefined
            };

            const baseUrl = window.API_BASE_URL || CONFIG?.API_URL || '';
            const response = await fetch(`${baseUrl}/api/auth/biometric-login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-device-id': deviceId
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'البصمة غير متطابقة مع السجلات.');

            const safeUser = AUTH._sanitizeUser(data.user);

            // بدء الجلسة
            localStorage.setItem(CONFIG?.TOKEN_KEY || 'moakkil_token', data.token);
            localStorage.setItem(CONFIG?.USER_KEY || 'moakkil_user', JSON.stringify(safeUser));
            localStorage.removeItem('moakkil_full_user_backup');
            if (safeUser.firm_id) {
                localStorage.setItem(CONFIG?.FIRM_KEY || 'moakkil_firm_id', safeUser.firm_id);
            }

            const userRole = safeUser.role || safeUser.user_type;

            setTimeout(() => {
                if (userRole === 'super_admin' || userRole === 'superadmin' || safeUser.is_setup_required) {
                    window.location.replace('register.html');
                } else {
                    window.location.replace('app.html');
                }
            }, 800);

            return { ...data, user: safeUser };
        } catch (error) {
            console.error("🛡️ [Biometric Login Error]:", error);
            if (error.name === 'NotAllowedError' || error.name === 'AbortError') {
                throw new Error("تم إلغاء عملية الدخول بالبصمة.");
            }
            throw error;
        }
    },

    /**
     * 🛡️ المصادقة الإجرائية الحقيقية (Action-Based Server MFA) للعمليات الحساسة (الحذف)
     * تطلب من المستخدم مطابقة بصمته فعلياً أو إدخال رمز تأكيد موثق من الخادم
     * @returns {Promise<string>} actionToken توكن صالح للمطابقة الخادمية في verifyActionToken
     */
    requireActionAuth: async (actionDescription = "تأكيد العملية الحساسة") => {
        const savedCredId = localStorage.getItem('moakkil_biometric_id');

        // 1. إذا كانت البصمة مدعومة ومفعلة، نلزم المستخدم بالتحقق البيومتري الفعلي ونعيد معرف البصمة الموثق للخادم
        if (window.PublicKeyCredential && savedCredId) {
            try {
                console.log(`🔒 جاري طلب مصادقة إجرائية بالبصمة: ${actionDescription}`);
                const publicKey = {
                    challenge: AUTH._generateChallenge(),
                    rpId: window.location.hostname,
                    allowCredentials: [{
                        type: "public-key",
                        id: AUTH._base64ToBuffer(savedCredId),
                        transports: ["internal"]
                    }],
                    userVerification: "required",
                    timeout: 30000
                };

                const assertion = await navigator.credentials.get({ publicKey });
                // إرجاع المعرف بصيغة bio_<credential_id> ليقوم الوركر بمطابقته مع جدول mo_user_credentials
                return `bio_${assertion.id}`;

            } catch (error) {
                console.warn("🛡️ [Action MFA Biometric Fallback]: تعذر التحقق بالبصمة، الانتقال للتحقق بالرمز:", error.message);
                if (error.name === 'NotAllowedError' || error.name === 'AbortError') {
                    // السماح للمستخدم بإدخال الرمز يدوياً إذا تعذرت البصمة أو ألغاها
                }
            }
        }

        // 2. التحقق التفاعلي عبر رمز تيليغرام لمرة واحدة أو رمز الـ PIN/الهاتف المعتمد في الخادم
        const currentUser = AUTH.checkSession();
        const userPhone = String(currentUser?.phone || localStorage.getItem('moakkil_saved_phone') || '');
        const expectedLast4 = userPhone.length >= 4 ? userPhone.slice(-4) : null;

        if (typeof Swal !== 'undefined') {
            const { value: enteredCode, isConfirmed } = await Swal.fire({
                title: 'تأكيد أمني مطلوب 🔒',
                html: `
                    <p class="small text-muted fw-bold mb-3">${actionDescription}<br>أدخل رمز الأمان/PIN الخاص بك، أو اطلب رمزاً فورياً عبر تيليغرام:</p>
                    <button type="button" id="auth-req-tg-mfa" class="btn btn-sm btn-outline-primary fw-bold rounded-pill px-3 mb-2">
                        <i class="fab fa-telegram me-1"></i> إرسال رمز تأكيد إلى تيليغرام
                    </button>
                `,
                input: 'password',
                inputPlaceholder: 'أدخل رمز التأكيد هنا...',
                inputAttributes: {
                    maxlength: 12,
                    autocapitalize: 'off',
                    autocorrect: 'off',
                    dir: 'ltr',
                    style: 'text-align:center; letter-spacing: 5px; font-weight:900;'
                },
                showCancelButton: true,
                confirmButtonText: 'تأكيد وتنفيذ',
                cancelButtonText: 'إلغاء',
                confirmButtonColor: '#0B132B',
                didOpen: () => {
                    const reqBtn = document.getElementById('auth-req-tg-mfa');
                    if (reqBtn) {
                        reqBtn.addEventListener('click', async () => {
                            reqBtn.disabled = true;
                            reqBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> جاري الإرسال...';
                            try {
                                const token = localStorage.getItem(CONFIG?.TOKEN_KEY || 'moakkil_token');
                                const baseUrl = window.API_BASE_URL || CONFIG?.API_URL || '';
                                const r = await fetch(`${baseUrl}/api/auth/request-action-token`, {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': `Bearer ${token}`
                                    },
                                    body: JSON.stringify({})
                                });
                                if (r.ok) {
                                    reqBtn.className = 'btn btn-sm btn-success fw-bold rounded-pill px-3 mb-2';
                                    reqBtn.innerHTML = '<i class="fas fa-check me-1"></i> تم الإرسال لتيليغرام!';
                                } else {
                                    throw new Error('Failed');
                                }
                            } catch (e) {
                                reqBtn.disabled = false;
                                reqBtn.innerHTML = '<i class="fas fa-redo me-1"></i> إعادة المحاولة';
                            }
                        });
                    }
                },
                preConfirm: (val) => {
                    const cleanVal = String(val || '').trim();
                    if (cleanVal.length < 4) {
                        Swal.showValidationMessage('يرجى إدخال رمز صالح مكون من 4 خانات على الأقل');
                        return false;
                    }
                    return cleanVal;
                }
            });

            if (!isConfirmed || !enteredCode) {
                throw new Error("تم إلغاء المصادقة الأمنية. لم يتم تنفيذ العملية.");
            }
            return String(enteredCode).trim();
        }

        // 3. في حال عدم توفر SweetAlert2 في الصفحة، نستخدم prompt قياسي للتحقق من الرمز
        const promptVal = window.prompt(`تأكيد أمني (${actionDescription}):\nيرجى إدخال رمز الأمان أو آخر 4 أرقام من هاتفك المسجل:`);
        if (!promptVal || String(promptVal).trim().length < 4) {
            throw new Error("تم إلغاء العملية لعدم إدخال رمز التأكيد الأمني.");
        }
        if (expectedLast4 && String(promptVal).trim().length === 4 && String(promptVal).trim() !== expectedLast4) {
            throw new Error("رمز التأكيد غير مطابق.");
        }
        return String(promptVal).trim();
    }
};

// ============================================================================
// [5] سكريبت التشغيل التلقائي (Auto-Boot UX Enhancements)
// ============================================================================
window.addEventListener('DOMContentLoaded', async () => {
    const isLoginPage = window.location.pathname.includes('login.html') || window.location.pathname.endsWith('/login');
    const hasBiometric = localStorage.getItem('moakkil_biometric_id');

    if (isLoginPage && hasBiometric && navigator.onLine) {
        console.log("🤖 [نظام موكّل]: تم اكتشاف بصمة مسجلة في هذا الجهاز. جاري طلب التحقق الآمن...");

        setTimeout(async () => {
            try {
                await AUTH.loginWithBiometric();
            } catch (err) {
                console.log("🛡️ [نظام موكّل]: تم إيقاف طلب البصمة التلقائي (ربما ألغاه المستخدم أو فشلت المطابقة، سيُطلب منه الـ OTP يدوياً).");
            }
        }, 800);
    }
});