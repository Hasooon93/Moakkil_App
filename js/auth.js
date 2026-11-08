/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: js/auth.js
 * الوصف: محرك المصادقة وإدارة الهوية الرقمية (V5.3 Enterprise True Zero-Trust & WebAuthn Edition)
 * الميزات الأمنية المطبقة:
 * 1. الجلسة الأحادية (Single Session) لمنع الدخول المتعدد عبر x-device-id.
 * 2. تسجيل خروج خادمي (/api/auth/logout) يبطل جلسة KV ويمسح طابور الأوفلاين (moakkil_offline_queue).
 * 3. مصادقة بيومترية تشفيرية حقيقية (Server Challenge + SPKI Public Key + Assertion Signature).
 * 4. مصادقة إجرائية للعمليات الحساسة والحذف تصدر تذكرة خادمية لمرة واحدة (act_UUID).
 * 5. إلغاء البدائل الضعيفة (آخر 4 أرقام الهاتف ومعرف البصمة المجرد) وفصل رمز الحذف عن OTP الدخول.
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
    // [2] إدارة الجلسات المحلية والخادمية (Session Management)
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
     * تسجيل الخروج الآمن: إجهاض أي مزامنة جارية + إبطال الجلسة في الخادم (KV) + تدمير الطابور المحلي والبيانات الحساسة
     */
    logout: async () => {
        const tokenKey = CONFIG?.TOKEN_KEY || 'moakkil_token';
        const userKey = CONFIG?.USER_KEY || 'moakkil_user';
        const firmKey = CONFIG?.FIRM_KEY || 'moakkil_firm_id';
        const token = localStorage.getItem(tokenKey);

        // 1. إجهاض أي طلب مزامنة خلفي جارٍ في الشبكة فوراً لمنع إرسال عمليات بعد الخروج
        if (typeof window !== 'undefined') {
            if (typeof window.abortOfflineSync === 'function') {
                window.abortOfflineSync();
            } else {
                window.isSyncing = false;
            }
        }

        // 2. مسح طابور العمليات الأوفلاين وبيانات الجلسة من المتصفح فوراً (Cross-Account Protection)
        localStorage.removeItem('moakkil_offline_queue');
        localStorage.removeItem(tokenKey);
        localStorage.removeItem(userKey);
        localStorage.removeItem(firmKey);
        localStorage.removeItem('moakkil_full_user_backup');
        localStorage.removeItem('firm_settings');
        sessionStorage.clear();

        // 3. إبلاغ الخادم لإبطال الجلسة في Cloudflare KV، أو جدولة الإبطال فور عودة الاتصال إذا كان الجهاز أوفلاين
        if (token) {
            if (navigator.onLine) {
                try {
                    const baseUrl = window.API_BASE_URL || CONFIG?.API_URL || '';
                    const deviceId = localStorage.getItem('moakkil_device_id') || 'unknown';
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 2500);

                    const res = await fetch(`${baseUrl}/api/auth/logout`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`,
                            'x-device-id': deviceId
                        },
                        signal: controller.signal,
                        keepalive: true
                    });

                    clearTimeout(timeoutId);
                    if (!res.ok) {
                        localStorage.setItem('moakkil_pending_logout_token', token);
                    } else {
                        localStorage.removeItem('moakkil_pending_logout_token');
                    }
                } catch (e) {
                    localStorage.setItem('moakkil_pending_logout_token', token);
                    console.warn("🛡️ [Logout Server Sync]: تم تدمير الجلسة محلياً وجدولة إبطال الجلسة السحابية فور عودة الاتصال.");
                }
            } else {
                localStorage.setItem('moakkil_pending_logout_token', token);
            }
        }

        // نبقي فقط على (moakkil_biometric_id و moakkil_saved_phone) لتمكين طلب البصمة لاحقاً
        if (!window.location.pathname.includes('login.html')) {
            window.location.replace('login.html');
        }
    },

    /**
     * إرسال طلب إبطال جلسة سابقة معلقة في حال تم تسجيل الخروج أثناء انقطاع الإنترنت
     */
    _flushPendingLogout: async () => {
        if (!navigator.onLine) return;
        const pendingToken = localStorage.getItem('moakkil_pending_logout_token');
        if (!pendingToken) return;
        try {
            const baseUrl = window.API_BASE_URL || CONFIG?.API_URL || '';
            const deviceId = localStorage.getItem('moakkil_device_id') || 'unknown';
            const res = await fetch(`${baseUrl}/api/auth/logout`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${pendingToken}`,
                    'x-device-id': deviceId
                },
                keepalive: true
            });
            if (res.ok || res.status === 401) {
                localStorage.removeItem('moakkil_pending_logout_token');
            }
        } catch (e) {}
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

            // تطهير أي طابور قديم لا ينتمي لهذا المستخدم قبل بدء الجلسة الجديدة
            AUTH._purgeForeignOfflineQueue(safeUser);

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

    /**
     * تطهير الطابور المحلي من أي عمليات تنتمي لحساب أو مكتب آخر عند تبديل الحساب
     */
    _purgeForeignOfflineQueue: (newUserObj) => {
        try {
            const rawQueue = localStorage.getItem('moakkil_offline_queue');
            if (!rawQueue) return;
            const parsed = JSON.parse(rawQueue);
            if (!Array.isArray(parsed)) {
                localStorage.removeItem('moakkil_offline_queue');
                return;
            }
            const uid = String(newUserObj?.id || newUserObj?.uid || '');
            const firmId = String(newUserObj?.firm_id || '');
            const filtered = parsed.filter(item => {
                if (!item.uid || !item.firm_id) return false;
                return String(item.uid) === uid && String(item.firm_id) === firmId;
            });
            if (filtered.length > 0) {
                localStorage.setItem('moakkil_offline_queue', JSON.stringify(filtered));
            } else {
                localStorage.removeItem('moakkil_offline_queue');
            }
        } catch (e) {
            localStorage.removeItem('moakkil_offline_queue');
        }
    },

    // ========================================================================
    // [4] المصادقة البيومترية والمصادقة الإجرائية (WebAuthn / Action MFA)
    // ========================================================================

    _bufferToBase64: (buffer) => {
        if (!buffer) return '';
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
     * طلب تحدي WebAuthn مشفر ومؤقت من الخادم (/api/auth/webauthn-challenge)
     */
    _requestServerChallenge: async (phone = null) => {
        const baseUrl = window.API_BASE_URL || CONFIG?.API_URL || '';
        const token = localStorage.getItem(CONFIG?.TOKEN_KEY || 'moakkil_token');
        const deviceId = localStorage.getItem('moakkil_device_id') || 'unknown';

        const headers = {
            'Content-Type': 'application/json',
            'x-device-id': deviceId
        };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${baseUrl}/api/auth/webauthn-challenge`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ phone: phone || localStorage.getItem('moakkil_saved_phone') || undefined })
        });
        const data = await res.json();
        if (!res.ok || !data.challenge) {
            throw new Error(data.error || 'تعذر توليد تحدي الأمان (WebAuthn Challenge) من الخادم.');
        }
        return data.challenge;
    },

    /**
     * تفعيل وتسجيل مستشعر البصمة في جهاز المستخدم مع إرسال المفتاح العام الحقيقي (SPKI)
     */
    registerBiometric: async () => {
        if (!navigator.onLine) throw new Error("لا يمكن تفعيل البصمة دون الاتصال بالإنترنت للمصادقة مع الخادم.");
        if (!window.PublicKeyCredential) throw new Error("للأسف، متصفحك أو جهازك لا يدعم تقنية البصمة البيومترية.");

        const user = JSON.parse(localStorage.getItem(CONFIG?.USER_KEY || 'moakkil_user') || 'null');
        const token = localStorage.getItem(CONFIG?.TOKEN_KEY || 'moakkil_token');

        if (!user || !token) throw new Error("يجب عليك تسجيل الدخول باستخدام الرمز السري (OTP) أولاً لتتمكن من تفعيل البصمة.");

        try {
            // 1. جلب التحدي الأمني من الخادم
            const serverChallengeB64 = await AUTH._requestServerChallenge(user.phone);
            const challengeBuffer = AUTH._base64ToBuffer(serverChallengeB64);

            const publicKey = {
                challenge: challengeBuffer,
                rp: { name: "نظام موكّل القانوني السحابي", id: window.location.hostname },
                user: {
                    id: AUTH._stringToBuffer(user.id || user.uid || "user_id"),
                    name: user.phone || "user",
                    displayName: user.full_name || "المحامي"
                },
                pubKeyCredParams: [
                    { type: "public-key", alg: -7 },   // ES256 (ECDSA P-256)
                    { type: "public-key", alg: -257 }  // RS256 (RSASSA-PKCS1-v1_5)
                ],
                authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
                timeout: 60000,
                attestation: "none"
            };

            const credential = await navigator.credentials.create({ publicKey });

            // 2. استخراج المفتاح العام الحقيقي بصيغة SPKI (SubjectPublicKeyInfo)
            let spkiBase64 = '';
            if (credential.response && typeof credential.response.getPublicKey === 'function') {
                const spkiBuffer = credential.response.getPublicKey();
                if (spkiBuffer) {
                    spkiBase64 = AUTH._bufferToBase64(spkiBuffer);
                }
            }
            if (!spkiBase64) {
                throw new Error("متصفحك لا يدعم استخراج المفتاح العام التشفيري (getPublicKey). يرجى تحديث المتصفح.");
            }

            const algorithm = (credential.response && typeof credential.response.getPublicKeyAlgorithm === 'function')
                ? credential.response.getPublicKeyAlgorithm()
                : -7;

            const payload = {
                credential_id: credential.id,
                public_key_spki: spkiBase64,
                public_key: spkiBase64,
                algorithm: algorithm,
                challenge: serverChallengeB64,
                clientDataJSON: credential.response?.clientDataJSON ? AUTH._bufferToBase64(credential.response.clientDataJSON) : '',
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

            return { success: true, message: "تم تشفير مفتاحك العام وتفعيل البصمة بنجاح!" };
        } catch (error) {
            console.error("🛡️ [Biometric Register Error]:", error);
            if (error.name === 'NotAllowedError' || error.name === 'AbortError') {
                throw new Error("تم إلغاء عملية التسجيل من قبل المستخدم.");
            }
            throw new Error(error.message || "فشل تسجيل البصمة. تأكد من إعدادات الحماية في جهازك.");
        }
    },

    /**
     * تسجيل الدخول السريع باستخدام مستشعر البصمة المسجل مسبقاً (WebAuthn Cryptographic Assertion)
     */
    loginWithBiometric: async () => {
        if (!navigator.onLine) throw new Error("يرجى الاتصال بالإنترنت لتتمكن من تسجيل الدخول.");
        if (!window.PublicKeyCredential) throw new Error("البصمة غير مدعومة في هذا المتصفح.");

        const savedCredId = localStorage.getItem('moakkil_biometric_id');
        const savedPhone = localStorage.getItem('moakkil_saved_phone');

        if (!savedCredId || !savedPhone) throw new Error("البصمة غير مفعلة أو غير مسجلة على هذا الجهاز.");

        try {
            // 1. طلب Challenge خادمي مربوط برقم الهاتف
            const serverChallengeB64 = await AUTH._requestServerChallenge(savedPhone);
            const challengeBuffer = AUTH._base64ToBuffer(serverChallengeB64);

            const publicKey = {
                challenge: challengeBuffer,
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
                authenticatorData: assertion.response?.authenticatorData ? AUTH._bufferToBase64(assertion.response.authenticatorData) : '',
                clientDataJSON: assertion.response?.clientDataJSON ? AUTH._bufferToBase64(assertion.response.clientDataJSON) : '',
                signature: assertion.response?.signature ? AUTH._bufferToBase64(assertion.response.signature) : ''
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

            // تطهير أي طابور قديم لا ينتمي لهذا المستخدم قبل بدء الجلسة
            AUTH._purgeForeignOfflineQueue(safeUser);

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
     * توافقية مع أي استدعاء باسم loginBiometric في صفحات الدخول
     */
    loginBiometric: async () => {
        return await AUTH.loginWithBiometric();
    },

    /**
     * 🛡️ المصادقة الإجرائية الحقيقية (Action-Based Server MFA) للعمليات الحساسة (الحذف)
     * تستصدر تذكرة عملية موقعة لمرة واحدة (act_UUID) من الخادم صالحة لمدة 90 ثانية ومربوطة بالسجل
     * @param {string} actionDescription وصف العملية المعروض للمستخدم
     * @param {string} targetTable اسم الجدول المستهدف (اختياري)
     * @param {string} targetId معرف السجل المستهدف (اختياري)
     * @returns {Promise<string>} action_token تذكرة صالحة لمرة واحدة
     */
    requireActionAuth: async (actionDescription = "تأكيد العملية الحساسة", targetTable = "*", targetId = "*") => {
        if (!navigator.onLine) {
            throw new Error("لا يمكن تنفيذ عمليات الحذف الحساسة في وضع عدم الاتصال (Offline). يرجى الاتصال بالإنترنت للتحقق الأمني.");
        }

        const token = localStorage.getItem(CONFIG?.TOKEN_KEY || 'moakkil_token');
        if (!token) {
            AUTH.logout();
            throw new Error("الجلسة منتهية. يرجى تسجيل الدخول مجدداً.");
        }

        const baseUrl = window.API_BASE_URL || CONFIG?.API_URL || '';
        const deviceId = localStorage.getItem('moakkil_device_id') || 'unknown';
        const savedCredId = localStorage.getItem('moakkil_biometric_id');

        // 1. المحاولة الأولى: إذا كانت البصمة مفعلة، نطلب تحدياً خادمياً وتوقيعاً تشفيرياً (WebAuthn Assertion)
        if (window.PublicKeyCredential && savedCredId) {
            try {
                console.log(`🔒 جاري طلب مصادقة إجرائية بالبصمة: ${actionDescription}`);
                const serverChallengeB64 = await AUTH._requestServerChallenge();
                const challengeBuffer = AUTH._base64ToBuffer(serverChallengeB64);

                const publicKey = {
                    challenge: challengeBuffer,
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

                const verifyRes = await fetch(`${baseUrl}/api/auth/verify-action-mfa`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                        'x-device-id': deviceId
                    },
                    body: JSON.stringify({
                        method: 'biometric',
                        credential_id: assertion.id,
                        authenticatorData: assertion.response?.authenticatorData ? AUTH._bufferToBase64(assertion.response.authenticatorData) : '',
                        clientDataJSON: assertion.response?.clientDataJSON ? AUTH._bufferToBase64(assertion.response.clientDataJSON) : '',
                        signature: assertion.response?.signature ? AUTH._bufferToBase64(assertion.response.signature) : '',
                        target_table: targetTable || '*',
                        target_id: targetId || '*'
                    })
                });

                const verifyData = await verifyRes.json();
                if (verifyRes.ok && verifyData.action_token) {
                    return verifyData.action_token;
                }
                console.warn("🛡️ [Action MFA Biometric Server Reject]:", verifyData.error);
            } catch (error) {
                console.warn("🛡️ [Action MFA Biometric Fallback]: تعذر التحقق بالبصمة، الانتقال للتحقق برمز الأمان:", error.message);
            }
        }

        // 2. المحاولة الثانية: نافذة إدخال رمز التأكيد المرسل عبر تيليغرام أو رمز الـ PIN المعتمد في الخادم
        if (typeof Swal !== 'undefined') {
            const { value: issuedTicket, isConfirmed } = await Swal.fire({
                title: 'تأكيد أمني مطلوب 🔒',
                html: `
                    <p class="small text-muted fw-bold mb-3">${actionDescription}<br>أدخل رمز الأمان (PIN) الخاص بك، أو اطلب رمز تأكيد لمرة واحدة عبر تيليغرام:</p>
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
                showLoaderOnConfirm: true,
                didOpen: () => {
                    const reqBtn = document.getElementById('auth-req-tg-mfa');
                    if (reqBtn) {
                        reqBtn.addEventListener('click', async () => {
                            reqBtn.disabled = true;
                            reqBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> جاري الإرسال...';
                            try {
                                const r = await fetch(`${baseUrl}/api/auth/request-action-token`, {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': `Bearer ${token}`,
                                        'x-device-id': deviceId
                                    },
                                    body: JSON.stringify({})
                                });
                                const rData = await r.json().catch(() => ({}));
                                if (r.ok) {
                                    reqBtn.className = 'btn btn-sm btn-success fw-bold rounded-pill px-3 mb-2';
                                    reqBtn.innerHTML = '<i class="fas fa-check me-1"></i> تم الإرسال لتيليغرام!';
                                } else {
                                    throw new Error(rData.error || 'Failed');
                                }
                            } catch (e) {
                                reqBtn.disabled = false;
                                reqBtn.className = 'btn btn-sm btn-outline-danger fw-bold rounded-pill px-3 mb-2';
                                reqBtn.innerHTML = `<i class="fas fa-redo me-1"></i> ${e.message || 'إعادة المحاولة'}`;
                            }
                        });
                    }
                },
                preConfirm: async (val) => {
                    const cleanVal = String(val || '').trim();
                    if (cleanVal.length < 4) {
                        Swal.showValidationMessage('يرجى إدخال رمز صالح مكون من 4 خانات على الأقل');
                        return false;
                    }
                    try {
                        const r = await fetch(`${baseUrl}/api/auth/verify-action-mfa`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`,
                                'x-device-id': deviceId
                            },
                            body: JSON.stringify({
                                method: 'code',
                                code: cleanVal,
                                target_table: targetTable || '*',
                                target_id: targetId || '*'
                            })
                        });
                        const data = await r.json();
                        if (!r.ok || !data.action_token) {
                            Swal.showValidationMessage(data.error || 'رمز التأكيد غير صحيح');
                            return false;
                        }
                        return data.action_token;
                    } catch (err) {
                        Swal.showValidationMessage('تعذر الاتصال بالخادم للتحقق من الرمز');
                        return false;
                    }
                }
            });

            if (!isConfirmed || !issuedTicket) {
                throw new Error("تم إلغاء المصادقة الأمنية. لم يتم تنفيذ العملية.");
            }
            return issuedTicket;
        }

        // 3. في حال عدم توفر SweetAlert2 في الصفحة، نستخدم prompt قياسي مع تحقق خادمي مباشر
        const promptVal = window.prompt(`تأكيد أمني (${actionDescription}):\nيرجى إدخال رمز الأمان (PIN) أو رمز التأكيد المرسل إلى تيليغرام:`);
        if (!promptVal || String(promptVal).trim().length < 4) {
            throw new Error("تم إلغاء العملية لعدم إدخال رمز التأكيد الأمني.");
        }

        const fallbackRes = await fetch(`${baseUrl}/api/auth/verify-action-mfa`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'x-device-id': deviceId
            },
            body: JSON.stringify({
                method: 'code',
                code: String(promptVal).trim(),
                target_table: targetTable || '*',
                target_id: targetId || '*'
            })
        });
        const fallbackData = await fallbackRes.json();
        if (!fallbackRes.ok || !fallbackData.action_token) {
            throw new Error(fallbackData.error || "رمز التأكيد الأمني غير صحيح.");
        }
        return fallbackData.action_token;
    }
};

// ============================================================================
// [5] سكريبت التشغيل التلقائي ومزامنة تسجيل الخروج المعلق (Auto-Boot UX & Security)
// ============================================================================
window.addEventListener('online', () => {
    if (typeof AUTH !== 'undefined' && typeof AUTH._flushPendingLogout === 'function') {
        AUTH._flushPendingLogout();
    }
});

window.addEventListener('DOMContentLoaded', async () => {
    if (typeof AUTH !== 'undefined' && typeof AUTH._flushPendingLogout === 'function') {
        await AUTH._flushPendingLogout();
    }

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