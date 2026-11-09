/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: worker.js (Cloudflare Worker Backend)
 * الوصف: المحرك السحابي المركزي (The Ultimate Core Engine - Enterprise V5.5 Bulletproof Zero-Trust)
 * التحديثات والتحصينات الأمنية والمعمارية الشاملة (V5.5):
 * 1. إزالة الأسرار الافتراضية (Zero Hardcoded Secrets) واعتماد مبدأ Fail-Closed.
 * 2. مسار تسجيل خروج خادمي (/api/auth/logout) يبطل جلسة KV وتذاكر الإجراءات (jti-bound).
 * 3. تحقق WebAuthn تشفيري كامل (SPKI إلزامي بدون webauthn_verified + Origin + rpIdHash + UV + Counter).
 * 4. مصادقة ثنائية صارمة للحذف تفرض وجود jti وتطابقه الإلزامي بين التذكرة والجلسة.
 * 5. تشفير وتجزئة رمز PIN لبوابة الموكل بخوارزمية Salted PBKDF2-SHA256 مع ترقية تلقائية سلسة.
 * 6. منع الربط العابر للمكاتب (Cross-Tenant Reference Matrix) وتطابق client_id مع case_id.
 * 7. فرض أسرار Telegram و Payment Webhooks ومنع تكرار الأحداث (Idempotency Key).
 * 8. حصر صلاحيات البحث الدلالي RPC Legal Brain على service_role فقط وسد ثغرة عزل المكاتب.
 * ============================================================================
 */

// ============================================================================
// [0] سياسات الأمان، القواميس، والدوال المساعدة (Helpers & Dictionaries)
// ============================================================================
const WORKER_VERSION = 'V5.6.0';

const DEFAULT_ALLOWED_ORIGINS = [
    'https://moakkil.karakibs.com',
    'https://moakkil-app.pages.dev',
    'http://localhost:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500'
];

const getAllowedOriginsList = (env) => {
    const raw = env?.ALLOWED_ORIGINS || '';
    const fromEnv = raw.split(',').map(o => o.trim().replace(/\/$/, '')).filter(Boolean);
    return Array.from(new Set([...fromEnv, ...DEFAULT_ALLOWED_ORIGINS]));
};

const isOriginTrusted = (origin, env, requestUrl = '') => {
    if (!origin) return true;
    const normalized = String(origin).trim().replace(/\/$/, '');
    const allowedList = getAllowedOriginsList(env);
    if (allowedList.includes(normalized)) return true;
    if (requestUrl) {
        try {
            if (new URL(requestUrl).origin === normalized) return true;
        } catch (e) {}
    }
    return false;
};

const buildCorsHeaders = (request, env) => {
    const reqOrigin = (request?.headers?.get('Origin') || '').trim().replace(/\/$/, '');
    const allowedList = getAllowedOriginsList(env);
    const allowOrigin = (reqOrigin && isOriginTrusted(reqOrigin, env, request?.url))
        ? reqOrigin
        : (allowedList[0] || 'https://moakkil.karakibs.com');

    return {
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-device-id, apikey, Prefer, x-file-name, x-client-id, x-case-id, x-action-token, x-portal-token, x-portal-session-token',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Content-Security-Policy': "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com 'unsafe-inline'; style-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://fonts.googleapis.com 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com data:; img-src 'self' https: data: blob:; connect-src 'self' https://moakkil.karakibs.com https://*.workers.dev https://*.supabase.co; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';"
    };
};

const SUPER_ADMIN_UUID = '00000000-0000-0000-0000-000000000000';
const MAX_R2_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB الحد الأقصى للملف الواحد

const ALLOWED_R2_EXTENSIONS = new Set([
    'pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'txt', 'xls', 'xlsx', 'csv'
]);
const ALLOWED_LOGO_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);

const getUTCNow = () => new Date();

const getAmmanDateString = (d = new Date()) => {
    try {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Amman',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).format(d);
    } catch (e) {
        const fallback = new Date(d.getTime() + (3 * 60 * 60 * 1000));
        return fallback.toISOString().split('T')[0];
    }
};

const formatDateTimeAR = (val) => {
    if (!val) return 'غير محدد';
    try {
        const d = new Date(val);
        return d.toLocaleString('ar-JO', {
            timeZone: 'Asia/Amman',
            dateStyle: 'full',
            timeStyle: 'short'
        });
    } catch (e) { return val; }
};

const safeTG = (str) => (str || '').toString().replace(/</g, '&lt;').replace(/>/g, '&gt;');

const base64UrlEncode = (buffer) => {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
};

const base64UrlDecodeToBytes = (b64UrlStr) => {
    if (!b64UrlStr || typeof b64UrlStr !== 'string') return new Uint8Array(0);
    const base64 = b64UrlStr.replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (base64.length % 4)) % 4;
    const binStr = atob(base64 + '='.repeat(padLen));
    return Uint8Array.from(binStr, c => c.charCodeAt(0));
};

// 🛡️ توحيد مسميات دوال ترميز وفك ترميز Base64URL عبر الباك إند لمنع ReferenceError
const base64UrlDecode = base64UrlDecodeToBytes;
const base64UrlDecodeText = (b64UrlStr) => new TextDecoder().decode(base64UrlDecodeToBytes(b64UrlStr));


// تحويل توقيع ECDSA من صيغة ASN.1 DER (القادمة من WebAuthn) إلى صيغة IEEE P1363 (المطلوبة في WebCrypto)
const convertEcdsaAsn1ToP1363 = (sigBytes) => {
    try {
        if (sigBytes.length === 64) return sigBytes;
        if (sigBytes[0] !== 0x30) return sigBytes;
        let offset = 2;
        if (sigBytes[1] & 0x80) offset += (sigBytes[1] & 0x7f);
        if (sigBytes[offset] !== 0x02) return sigBytes;
        const rLen = sigBytes[offset + 1];
        let rBytes = sigBytes.slice(offset + 2, offset + 2 + rLen);
        offset += 2 + rLen;
        if (sigBytes[offset] !== 0x02) return sigBytes;
        const sLen = sigBytes[offset + 1];
        let sBytes = sigBytes.slice(offset + 2, offset + 2 + sLen);

        while (rBytes.length > 32 && rBytes[0] === 0x00) rBytes = rBytes.slice(1);
        while (sBytes.length > 32 && sBytes[0] === 0x00) sBytes = sBytes.slice(1);
        if (rBytes.length > 32 || sBytes.length > 32) return sigBytes;

        const rawSig = new Uint8Array(64);
        rawSig.set(rBytes, 32 - rBytes.length);
        rawSig.set(sBytes, 64 - sBytes.length);
        return rawSig;
    } catch (e) {
        return sigBytes;
    }
};

// استيراد والتحقق من صحة المفتاح العام بصيغة SPKI الحقيقية (يرفض أي قيمة بديلة مثل webauthn_verified)
const importWebAuthnSpkiPublicKey = async (publicKeyB64) => {
    if (!publicKeyB64 || typeof publicKeyB64 !== 'string' || publicKeyB64 === 'webauthn_verified' || publicKeyB64.length < 40) {
        return null;
    }
    try {
        const pubKeyBytes = base64UrlDecodeToBytes(publicKeyB64);
        if (pubKeyBytes.length < 32) return null;
        try {
            const ecKey = await crypto.subtle.importKey(
                'spki',
                pubKeyBytes.buffer,
                { name: 'ECDSA', namedCurve: 'P-256' },
                false,
                ['verify']
            );
            return { key: ecKey, alg: 'ES256' };
        } catch (ecErr) {
            const rsaKey = await crypto.subtle.importKey(
                'spki',
                pubKeyBytes.buffer,
                { name: 'RSASSA-PKCS1-v1_5', hash: { name: 'SHA-256' } },
                false,
                ['verify']
            );
            return { key: rsaKey, alg: 'RS256' };
        }
    } catch (e) {
        return null;
    }
};

// التحقق التشفيري الصارم من WebAuthn Assertion (بدون أي مسار تجاوز)
const verifyWebAuthnAssertion = async ({
    publicKeyB64,
    authenticatorDataB64,
    clientDataJSONB64,
    signatureB64,
    expectedChallenge,
    storedCounter = 0,
    env = null,
    requestUrl = '',
    requireUserVerification = true
}) => {
    try {
        if (!authenticatorDataB64 || !clientDataJSONB64 || !signatureB64 || !expectedChallenge) {
            return { valid: false, error: 'بيانات التحقق البيومتري (WebAuthn Assertion) ناقصة.' };
        }

        // 1. رفض أي مفتاح عام مفقود أو يستخدم القيمة القديمة webauthn_verified
        const importedPubKey = await importWebAuthnSpkiPublicKey(publicKeyB64);
        if (!importedPubKey) {
            return { valid: false, error: 'المفتاح العام للبصمة غير صالح أو غير مشفر بصيغة SPKI. يرجى إعادة تسجيل البصمة.' };
        }

        const clientDataBytes = base64UrlDecodeToBytes(clientDataJSONB64);
        const clientDataText = new TextDecoder().decode(clientDataBytes);
        const clientData = JSON.parse(clientDataText);

        // 2. فحص نوع العملية (webauthn.get)
        if (clientData.type !== 'webauthn.get') {
            return { valid: false, error: 'نوع عملية WebAuthn غير صالح.' };
        }

        // 3. فحص التحدي العشوائي الخادمي (Challenge)
        const receivedChallengeBytes = base64UrlDecodeToBytes(clientData.challenge);
        const expectedChallengeBytes = base64UrlDecodeToBytes(expectedChallenge);
        if (!receivedChallengeBytes.length || base64UrlEncode(receivedChallengeBytes) !== base64UrlEncode(expectedChallengeBytes)) {
            return { valid: false, error: 'رمز التحدي الأمني (Challenge) غير مطابق أو منتهي الصلاحية.' };
        }

        // 4. فحص النطاق الموثوق (Origin Validation)
        const clientOrigin = String(clientData.origin || '').trim().replace(/\/$/, '');
        if (!clientOrigin || !isOriginTrusted(clientOrigin, env, requestUrl)) {
            return { valid: false, error: 'نطاق مصدر البصمة (Origin) غير موثوق أمنياً.' };
        }
        let expectedRpId = '';
        try {
            const parsedOrigin = new URL(clientOrigin);
            const isLocal = parsedOrigin.hostname === 'localhost' || parsedOrigin.hostname === '127.0.0.1';
            if (parsedOrigin.protocol !== 'https:' && !isLocal) {
                return { valid: false, error: 'يجب إجراء المصادقة البيومترية عبر اتصال مشفر (HTTPS).' };
            }
            expectedRpId = parsedOrigin.hostname;
        } catch (e) {
            return { valid: false, error: 'صيغة نطاق البصمة (Origin) غير صالحة.' };
        }

        const authDataBytes = base64UrlDecodeToBytes(authenticatorDataB64);
        if (authDataBytes.length < 37) {
            return { valid: false, error: 'بيانات المُصادق (authenticatorData) غير صالحة.' };
        }

        // 5. فحص بصمة النطاق (rpIdHash - أول 32 بايت من authenticatorData)
        const expectedRpIdHashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(expectedRpId));
        const expectedRpIdHash = new Uint8Array(expectedRpIdHashBuf);
        const receivedRpIdHash = authDataBytes.slice(0, 32);
        for (let i = 0; i < 32; i++) {
            if (receivedRpIdHash[i] !== expectedRpIdHash[i]) {
                return { valid: false, error: 'بصمة النطاق (RP ID Hash) في بيانات البصمة غير مطابقة.' };
            }
        }

        // 6. فحص راية تواجد المستخدم (UP - bit 0) وراية التحقق البيومتري الفعلي (UV - bit 2)
        const flags = authDataBytes[32];
        if ((flags & 0x01) === 0) {
            return { valid: false, error: 'لم يتم تأكيد حضور المستخدم (User Present).' };
        }
        if (requireUserVerification && (flags & 0x04) === 0) {
            return { valid: false, error: 'لم يتم التحقق البيومتري الفعلي من هوية المستخدم (User Verification Required).' };
        }

        // 7. فحص عداد الاستخدام (Sign Counter) ضد نسخ المفاتيح
        const signCountView = new DataView(authDataBytes.buffer, authDataBytes.byteOffset + 33, 4);
        const newCounter = signCountView.getUint32(0, false);
        if (storedCounter > 0 && newCounter > 0 && newCounter <= storedCounter) {
            return { valid: false, error: 'تحذير أمني: عداد البصمة يشير إلى احتمالية نسخ المفتاح.' };
        }

        // 8. التحقق الإلزامي من التوقيع التشفيري (Cryptographic Signature Verification)
        const clientDataHashBuffer = await crypto.subtle.digest('SHA-256', clientDataBytes);
        const clientDataHash = new Uint8Array(clientDataHashBuffer);

        const signedData = new Uint8Array(authDataBytes.length + clientDataHash.length);
        signedData.set(authDataBytes, 0);
        signedData.set(clientDataHash, authDataBytes.length);

        const rawSigBytes = base64UrlDecodeToBytes(signatureB64);
        let isVerified = false;

        if (importedPubKey.alg === 'ES256') {
            const p1363Sig = convertEcdsaAsn1ToP1363(rawSigBytes);
            isVerified = await crypto.subtle.verify(
                { name: 'ECDSA', hash: { name: 'SHA-256' } },
                importedPubKey.key,
                p1363Sig,
                signedData
            );
        } else {
            isVerified = await crypto.subtle.verify(
                { name: 'RSASSA-PKCS1-v1_5' },
                importedPubKey.key,
                rawSigBytes,
                signedData
            );
        }

        if (!isVerified) {
            return { valid: false, error: 'التوقيع التشفيري للبصمة غير صحيح.' };
        }

        return { valid: true, newCounter };
    } catch (err) {
        return { valid: false, error: 'تعذر التحقق من البصمة البيومترية: ' + err.message };
    }
};

const generateSecureOTP = () => {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    return (100000 + (array[0] % 900000)).toString();
};

const sanitizeUserRecord = (userObj, viewerRole = 'staff') => {
    if (!userObj || typeof userObj !== 'object') return userObj;
    const clean = { ...userObj };
    delete clean.password;
    delete clean.password_hash;
    delete clean.pin_code;
    if (viewerRole !== 'admin' && viewerRole !== 'super_admin') {
        delete clean.salary;
        delete clean.salary_details;
        delete clean.base_salary;
        delete clean.financial_notes;
    }
    return clean;
};

const SENSITIVE_AUDIT_KEYS = new Set([
    'password', 'password_hash', 'pin_code', 'access_pin', 'access_pin_hash', 'access_pin_salt', 'secret_notes',
    'salary', 'salary_details', 'base_salary', 'financial_notes',
    'case_embedding', 'embedding', 'public_token', 'access_token',
    'action_token', 'client_signature_data', 'public_key'
]);

// 🛡️ تطهير عميق متكرر (Deep Recursive Sanitize) لبيانات التدقيق الأمني (mo_activity_logs)
const sanitizeAuditPayload = (dataObj, depth = 0) => {
    if (dataObj === null || dataObj === undefined) return null;
    if (depth > 6) return '[كائن متداخل محجوب]';
    if (Array.isArray(dataObj)) {
        return dataObj.map(item => (typeof item === 'object' && item !== null) ? sanitizeAuditPayload(item, depth + 1) : item);
    }
    if (typeof dataObj !== 'object') return dataObj;

    const clean = {};
    for (const [k, v] of Object.entries(dataObj)) {
        if (SENSITIVE_AUDIT_KEYS.has(k) || /password|secret|pin|token|salary|embedding|hash|salt/i.test(k)) {
            clean[k] = '[محجوب أمنياً]';
        } else if (typeof v === 'object' && v !== null) {
            clean[k] = sanitizeAuditPayload(v, depth + 1);
        } else {
            clean[k] = v;
        }
    }
    return clean;
};

// قائمة السماح (Whitelist) لبيانات القضية المعروضة في بوابة الموكل
const sanitizePortalCaseData = (caseObj) => {
    if (!caseObj || typeof caseObj !== 'object') return {};
    const allowedFields = [
        'id', 'firm_id', 'client_id', 'case_internal_id', 'internal_id',
        'current_court', 'court_name', 'court_chamber', 'court_case_number',
        'case_year', 'litigation_degree', 'case_type', 'status', 'current_stage',
        'opponent_name', 'agreed_fees', 'total_agreed_fees', 'total_paid',
        'deadline_date', 'missing_docs_request', 'signature_request',
        'client_signature_data', 'created_at', 'updated_at'
    ];
    const safeCase = {};
    for (const key of allowedFields) {
        if (key in caseObj) safeCase[key] = caseObj[key];
    }
    return safeCase;
};

const PROTECTED_USER_FIELDS_FOR_STAFF = [
    'role', 'permissions', 'can_login', 'is_active', 'firm_id',
    'salary', 'salary_details', 'base_salary', 'max_users'
];

const PROTECTED_FIRM_BILLING_FIELDS = [
    'id', 'subscription_end_date', 'max_users', 'is_active',
    'created_at', 'max_storage', 'max_cases', 'plan_type'
];

const IMMUTABLE_SYSTEM_FIELDS = [
    'id', 'firm_id', 'created_at'
];

const keyDictionary = {
    'status': 'الحالة', 'appt_date': 'تاريخ الموعد', 'amount': 'المبلغ', 'notes': 'الملاحظات',
    'firm_name': 'اسم المكتب', 'max_users': 'الحد الأقصى للموظفين', 'is_active': 'حالة التفعيل',
    'subscription_end_date': 'تاريخ انتهاء الاشتراك', 'phone': 'رقم الهاتف', 'address': 'العنوان',
    'primary_color': 'اللون الأساسي', 'accent_color': 'اللون الثانوي', 'currency': 'العملة',
    'currency_code': 'العملة', 'tax_rate': 'نسبة الضريبة', 'tax_percent': 'نسبة الضريبة',
    'inv_prefix': 'بادئة الفواتير', 'invoice_prefix': 'بادئة الفواتير',
    'allow_hard_delete': 'السماح بالحذف النهائي', 'legal_terms': 'الشروط القانونية',
    'logo_url': 'رابط الشعار', 'full_name': 'الاسم الكامل', 'national_id': 'الرقم الوطني',
    'client_type': 'نوع الموكل', 'confidentiality_level': 'مستوى السرية', 'title': 'العنوان',
    'type': 'النوع', 'case_internal_id': 'رقم الملف الداخلي', 'case_type': 'تصنيف القضية',
    'opponent_name': 'اسم الخصم', 'opponent_lawyer': 'وكيل الخصم', 'current_court': 'المحكمة المختصة',
    'court_room': 'الدائرة / القاعة', 'court_case_number': 'رقم الدعوى في المحكمة', 'case_year': 'سنة الدعوى',
    'litigation_degree': 'درجة التقاضي', 'current_judge': 'هيئة القضاة', 'court_clerk': 'قلم المحكمة / الكاتب',
    'execution_file_number': 'رقم الملف التنفيذي', 'statute_of_limitations_date': 'تاريخ التقادم / السقوط',
    'judgment_date': 'تاريخ صدور الحكم', 'police_station_ref': 'رقم الضبط الشرطي', 'prosecution_ref': 'رقم التحقيق المدعي العام',
    'co_plaintiffs': 'المدعون المشتركون', 'co_defendants': 'المدعى عليهم المشتركون', 'experts_and_witnesses': 'الخبراء والشهود',
    'power_of_attorney_number': 'رقم الوكالة ونوعها', 'poa_details': 'تفاصيل الوكالة والتفويض',
    'closure_reason': 'سبب إغلاق الملف', 'physical_archive_location': 'موقع الحفظ الورقي (الأرشيف)',
    'court_fees_paid': 'الرسوم القضائية المدفوعة', 'court_deposits': 'الأمانات والودائع القضائية',
    'case_tags': 'وسوم القضية', 'priority_level': 'درجة الأهمية', 'current_stage': 'المرحلة الإجرائية',
    'missing_docs_request': 'طلب استكمال نواقص من الموكل', 'signature_request': 'طلب توقيع إلكتروني من الموكل',
    'claim_amount': 'قيمة المطالبة', 'agreed_fees': 'الأتعاب المتفق عليها', 'total_agreed_fees': 'الأتعاب المتفق عليها',
    'paid_amount': 'المبلغ المقبوض', 'remaining_amount': 'المبلغ المتبقي',
    'success_prob': 'نسبة النجاح المتوقعة', 'success_probability': 'نسبة النجاح المتوقعة',
    'settings': 'الإعدادات', 'permissions': 'الصلاحيات', 'update_title': 'عنوان الإجراء',
    'update_details': 'تفاصيل الإجراء', 'next_hearing_date': 'موعد الجلسة القادمة',
    'description': 'البيان', 'due_date': 'تاريخ الاستحقاق', 'expense_date': 'تاريخ المصروف',
    'is_visible_to_client': 'إتاحة الرؤية للموكل', 'file_name': 'اسم المستند', 'file_category': 'تصنيف المستند',
    'expiry_date': 'تاريخ انتهاء الوثيقة', 'assigned_lawyer_id': 'المحامون المسندون', 'assigned_to': 'الموظفون المسند إليهم',
    'can_login': 'صلاحية الدخول للنظام', 'role': 'الدور الوظيفي', 'specialization': 'التخصص القانوني',
    'syndicate_number': 'الرقم النقابي', 'email': 'البريد الإلكتروني', 'work_phone': 'هاتف العمل',
    'nationality': 'الجنسية', 'occupation': 'المهنة / النشاط', 'represented_by': 'المفوض بالتوقيع',
    'authorized_person_id': 'رقم هوية المفوض', 'payment_terms': 'شروط الدفع', 'credit_limit': 'الحد الائتماني',
    'tax_number': 'الرقم الضريبي', 'bank_details': 'الحساب البنكي (IBAN)', 'referral_source': 'مصدر المعرفة بالمكتب',
    'emergency_contact': 'جهة اتصال الطوارئ', 'client_portal_active': 'تفعيل بوابة الموكل', 'case_outcome': 'منطوق الحكم / النتيجة',
    'lawsuit_facts': 'وقائع الدعوى', 'lawsuit_text': 'نص لائحة الدعوى', 'legal_basis': 'الأسانيد القانونية',
    'final_requests': 'الطلبات الختامية', 'is_deleted': 'حالة الأرشفة/الحذف',
    'can_delete': 'صلاحية الحذف', 'can_finance': 'صلاحية الإدارة المالية', 'can_manage_users': 'صلاحية إدارة الموارد البشرية'
};

const translateKey = (k) => keyDictionary[k] || k;

const isEmptyAuditVal = (val) => {
    if (val === null || val === undefined || val === '') return true;
    if (typeof val === 'string' && val.trim() === '') return true;
    if (Array.isArray(val) && val.length === 0) return true;
    if (typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length === 0) return true;
    return false;
};

const ZERO_DEFAULT_NUMERIC_KEYS = new Set([
    'court_fees_paid', 'court_deposits', 'claim_amount', 'agreed_fees',
    'total_agreed_fees', 'amount', 'paid_amount', 'remaining_amount', 'credit_limit'
]);

const formatVal = (val) => {
    if (isEmptyAuditVal(val)) return 'فارغ';
    if (typeof val === 'boolean') return val ? 'نعم' : 'لا';
    if (typeof val === 'string') {
        const trimmed = val.trim();
        if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) return trimmed.split('T')[0];
        return trimmed.length > 140 ? trimmed.substring(0, 140) + '...' : trimmed;
    }
    if (Array.isArray(val)) return val.length > 0 ? val.join('، ') : 'فارغ';
    return String(val);
};

const normalizePinCode = (pin) => {
    if (!pin) return '';
    return String(pin)
        .trim()
        .replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660))
        .replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0))
        .toUpperCase();
};

/**
 * 🛡️ تجزئة رمز PIN بوابة الموكل مع الملح (Salted PBKDF2-SHA256 Hash)
 */
const hashPinCode = async (pin, salt = null) => {
    const clean = normalizePinCode(pin);
    if (!clean) return { hash: null, salt: null };
    const actualSalt = salt || crypto.randomUUID().replace(/-/g, '');
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        enc.encode(clean),
        { name: 'PBKDF2' },
        false,
        ['deriveBits']
    );
    const derivedBits = await crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            salt: enc.encode(actualSalt),
            iterations: 100000,
            hash: 'SHA-256'
        },
        keyMaterial,
        256
    );
    const hashHex = Array.from(new Uint8Array(derivedBits))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    return { hash: hashHex, salt: actualSalt };
};

/**
 * 🛡️ التحقق الكريبتوغرافي من رمز PIN مع التوافق التنازلي والترقية السلسة
 */
const verifyPinCode = async (inputPin, storedPin, storedHash, storedSalt) => {
    const cleanInput = normalizePinCode(inputPin);
    if (!cleanInput) return false;

    // 1. التحقق عبر التجزئة المملحة (إذا كانت متوفرة)
    if (storedHash && storedSalt) {
        try {
            const { hash: computedHash } = await hashPinCode(cleanInput, storedSalt);
            if (computedHash && computedHash === storedHash) return true;
        } catch (e) {
            console.error('PIN verify error:', e);
        }
    }

    // 2. Fallback مؤقت لدعم الرموز القديمة قبل الترقية
    if (storedPin && normalizePinCode(storedPin) === cleanInput) {
        return true;
    }

    return false;
};

/**
 * 🛡️ معالجة وتجزئة رمز PIN لبوابة الموكل مركزياً وحذفه فوراً من الـ Payload
 */
const processAndSecureCasePin = async (body, isUpdate = false) => {
    if (!body || typeof body !== 'object') return;
    if (body.access_pin !== undefined) {
        const rawPin = body.access_pin;
        delete body.access_pin; // 🛡️ حذف فوري وإلزامي من كائن الطلب لمنع كتابته كنص صريح

        const cleanPin = normalizePinCode(rawPin);
        if (cleanPin) {
            const { hash: pHash, salt: pSalt } = await hashPinCode(cleanPin);
            body.access_pin_hash = pHash;
            body.access_pin_salt = pSalt;
        } else if (isUpdate) {
            body.access_pin_hash = null;
            body.access_pin_salt = null;
        }
    }
};

/**
 * 🛡️ إبطال فوري لجميع جلسات بوابة الموكل للقضية المحددة في KV
 */
const invalidatePortalSessions = async (env, caseId) => {
    if (!env?.MOAKKIL_KV || !caseId) return;
    const newVer = Date.now().toString();
    await env.MOAKKIL_KV.put('case_auth_ver:' + caseId, newVer, { expirationTtl: 86400 * 30 });
};

const buildChangesList = (oldObj, newObj, prefix = '') => {
    let diffs = [];
    let safeOld = typeof oldObj === 'object' && oldObj !== null ? oldObj : {};
    let safeNew = typeof newObj === 'object' && newObj !== null ? newObj : {};

    if (typeof safeOld === 'string') try { safeOld = JSON.parse(safeOld); } catch (e) { safeOld = {}; }
    if (typeof safeNew === 'string') try { safeNew = JSON.parse(safeNew); } catch (e) { safeNew = {}; }

    // نفحص فقط الحقول المرسلة فعلياً في التعديل (safeNew) لتجنب اعتبار الحقول غير المرسلة "فارغة"
    const keys = Object.keys(safeNew);

    const ignoredKeys = new Set([
        'updated_at', 'client_last_seen', 'id', 'firm_id', 'created_at', 'last_login',
        'last_status_change', 'current_session_device', 'user_agent_hash', 'avatar_url',
        'case_embedding', 'embedding', 'password', 'password_hash', 'secret_notes', 'access_pin', 'access_pin_hash', 'access_pin_salt', 'portal_session_token',
        'public_token', '_human_log', '_changes_list'
    ]);

    for (let key of keys) {
        if (ignoredKeys.has(key) || /password|secret|pin|token|hash|salt|salary|embedding/i.test(key)) continue;
        // تجنب تكرار وقائع الدعوى مرتين إذا أُرسلت كـ lawsuit_facts و lawsuit_text معاً
        if (key === 'lawsuit_text' && safeNew.lawsuit_facts !== undefined) continue;

        let oldV = safeOld[key];
        let newV = safeNew[key];

        // تجاهل الحقل إذا كانت القيمة القديمة والجديدة فارغتين (مثل null مقابل "" أو [])
        if (isEmptyAuditVal(oldV) && isEmptyAuditVal(newV)) continue;

        // تجاهل الحقول الرقمية الاختيارية عندما تكون null قديماً و 0 حديثاً (أو العكس)
        if (ZERO_DEFAULT_NUMERIC_KEYS.has(key)) {
            const oldNum = isEmptyAuditVal(oldV) ? 0 : Number(oldV);
            const newNum = isEmptyAuditVal(newV) ? 0 : Number(newV);
            if (!Number.isNaN(oldNum) && !Number.isNaN(newNum) && oldNum === newNum) continue;
        }

        if (JSON.stringify(oldV) !== JSON.stringify(newV)) {
            let isOldObj = typeof oldV === 'object' && oldV !== null && !Array.isArray(oldV);
            let isNewObj = typeof newV === 'object' && newV !== null && !Array.isArray(newV);

            if (isOldObj || isNewObj) {
                diffs = diffs.concat(buildChangesList(oldV || {}, newV || {}, `${prefix}${translateKey(key)} ➔ `));
            } else {
                let oldStr = formatVal(oldV);
                let newStr = formatVal(newV);
                if (oldStr === newStr) continue;
                diffs.push(`• ${prefix}${translateKey(key)}: من (${oldStr}) ⬅️ إلى (${newStr})`);
            }
        }
    }
    return diffs;
};

export default {
    // ============================================================================
    // [1] المحرك الأوتوماتيكي اليومي (Cron Triggers & R2 Backups)
    // ============================================================================
    async scheduled(event, env, ctx) {
        if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
            console.error("Critical Error: Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment.");
            return;
        }
        const tgToken = env.TG_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN;
        const r2Bucket = env.MOAKKIL_R2 || env.MY_BUCKET;

        const db = async (endpoint, options = {}) => {
            const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${endpoint}`, {
                ...options,
                headers: {
                    'apikey': env.SUPABASE_SERVICE_KEY,
                    'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                }
            });
            return await r.json();
        };

        const sendTG = async (chatId, msg) => {
            if (!tgToken || !chatId) return;
            await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'HTML' })
            }).catch((err) => console.error("TG Send Error:", err));
        };

        const sendNotification = async (notifBody) => {
            await fetch(`${env.SUPABASE_URL}/rest/v1/mo_notifications`, {
                method: 'POST',
                headers: {
                    'apikey': env.SUPABASE_SERVICE_KEY,
                    'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify(notifBody)
            });
        };

        try {
            const nowUTC = getUTCNow();
            const dateStr = getAmmanDateString(nowUTC);
            const [ammanYear, ammanMonth, ammanDay] = dateStr.split('-').map(Number);

            const firms = await db('mo_firms?select=*,mo_users(telegram_id,role)', { method: 'GET' }).catch(() => []);

            for (const firm of firms) {
                if (!firm.subscription_end_date) continue;

                const adminUser = firm.mo_users?.find(u => u.role === 'admin' && u.telegram_id);
                const adminTgId = adminUser ? adminUser.telegram_id : null;

                const endDate = new Date(firm.subscription_end_date);
                const createdAt = new Date(firm.created_at);

                const diffTime = endDate - nowUTC;
                const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                const ageDays = Math.floor((nowUTC - createdAt) / (1000 * 60 * 60 * 24));

                if (daysLeft === 2 && adminTgId) {
                    const lockKey = `sub_warn2_${firm.id}_${dateStr}`;
                    if (!env.MOAKKIL_KV || !(await env.MOAKKIL_KV.get(lockKey))) {
                        if (env.MOAKKIL_KV) await env.MOAKKIL_KV.put(lockKey, "true", { expirationTtl: 86400 });
                        await sendTG(adminTgId, `⚠️ <b>تنبيه من نظام موكّل</b>\n\nتحية طيبة،\nنود إعلامكم بأن اشتراك مكتبكم سينتهي بعد <b>يومين</b>.\nيرجى التجديد لضمان عدم توقف الخدمة.`);
                    }
                }

                if (daysLeft === 0 && adminTgId) {
                    const lockKey = `sub_exp0_${firm.id}_${dateStr}`;
                    if (!env.MOAKKIL_KV || !(await env.MOAKKIL_KV.get(lockKey))) {
                        if (env.MOAKKIL_KV) await env.MOAKKIL_KV.put(lockKey, "true", { expirationTtl: 86400 });
                        await sendTG(adminTgId, `🔴 <b>إشعار انتهاء الاشتراك</b>\n\nلقد انتهى اشتراككم اليوم. تم منحكم <b>فترة سماح لمدة 3 أيام</b> لتسيير أعمالكم العاجلة.\nبعدها سيتوقف حساب الموظفين.`);
                    }
                }

                if (ageDays > 0 && ageDays % 365 === 0) {
                    const lockKey = `anniversary_${firm.id}_${dateStr}`;
                    if (!env.MOAKKIL_KV || !(await env.MOAKKIL_KV.get(lockKey))) {
                        if (env.MOAKKIL_KV) await env.MOAKKIL_KV.put(lockKey, "true", { expirationTtl: 86400 });
                        const newEndDate = new Date(endDate);
                        newEndDate.setMonth(newEndDate.getMonth() + 1);
                        await db(`mo_firms?id=eq.${firm.id}`, { method: 'PATCH', body: JSON.stringify({ subscription_end_date: newEndDate.toISOString() }) });
                        await db('mo_billing_history', { method: 'POST', body: JSON.stringify({ firm_id: firm.id, action_type: 'هدية سنوية', months_added: 1 }) });
                        if (adminTgId) await sendTG(adminTgId, `🎉 <b>ذكرى سنوية سعيدة!</b>\n\nمضى عام كامل على انضمامكم لعائلة نظام موكّل.\n🎁 <b>هديتنا لكم:</b> تم تمديد اشتراككم لمدة <b>شهر مجاناً</b>!`);
                    }
                }

                if (r2Bucket && adminTgId) {
                    const backupLockKey = `daily_backup_lock_${firm.id}_${dateStr}`;
                    const alreadyBackedUp = env.MOAKKIL_KV ? await env.MOAKKIL_KV.get(backupLockKey) : null;

                    if (!alreadyBackedUp) {
                        const backupData = {};
                        const tablesToBackup = ['mo_clients', 'mo_cases', 'mo_users', 'mo_installments', 'mo_case_updates', 'mo_appointments', 'mo_files', 'mo_expenses', 'mo_activity_logs'];
                        for (const t of tablesToBackup) {
                            const rows = await db(`${t}?firm_id=eq.${firm.id}`).catch(() => []);
                            backupData[t] = t === 'mo_users' && Array.isArray(rows) ? rows.map(u => sanitizeUserRecord(u, 'admin')) : rows;
                        }
                        const backupStr = JSON.stringify(backupData);
                        await r2Bucket.put(`backups/${firm.id}/${dateStr}.json`, backupStr);

                        if (env.MOAKKIL_KV) {
                            await env.MOAKKIL_KV.put(backupLockKey, "true", { expirationTtl: 86400 });
                        }

                        await sendTG(adminTgId, `💾 <b>النسخ الاحتياطي السحابي (أوتوماتيكي)</b>\n\nتم أخذ نسخة احتياطية مشفرة لجميع بيانات المكتب (قضايا، موكلين، مالية، ومواعيد) بنجاح وحفظها في خوادم Cloudflare R2 الآمنة.`);
                    }
                }

                if (ammanDay === 1 && adminTgId) {
                    const monthLockKey = `monthly_report_lock_${firm.id}_${ammanYear}_${ammanMonth}`;
                    const alreadySentMonth = env.MOAKKIL_KV ? await env.MOAKKIL_KV.get(monthLockKey) : null;
                    if (!alreadySentMonth) {
                        if (env.MOAKKIL_KV) await env.MOAKKIL_KV.put(monthLockKey, "true", { expirationTtl: 86400 * 2 });
                        await sendTG(adminTgId, `📊 <b>إشعار دوري</b>\n\nيتم الآن تجميع تقارير الإنجاز الشهرية للموكلين. يمكنكم مراجعتها في بوابة الموكلين.`);
                    }
                }
            }

            const users = await db('mo_users?is_active=eq.true&select=*,mo_firms(firm_name)', { method: 'GET' }).catch(() => []);
            for (const user of users) {
                if (user.date_of_birth && user.telegram_id) {
                    const dob = new Date(user.date_of_birth);
                    if (dob.getUTCDate() === ammanDay && (dob.getUTCMonth() + 1) === ammanMonth) {
                        const bdayLock = `bday_lock_${user.id}_${dateStr}`;
                        if (!env.MOAKKIL_KV || !(await env.MOAKKIL_KV.get(bdayLock))) {
                            if (env.MOAKKIL_KV) await env.MOAKKIL_KV.put(bdayLock, "true", { expirationTtl: 86400 });
                            await sendTG(user.telegram_id, `🎂 <b>عيد ميلاد سعيد!</b>\n\nعائلة نظام موكّل وإدارة مكتب (${safeTG(user.mo_firms?.firm_name) || 'المكتب'}) يتمنون لك عاماً مليئاً بالنجاح والتألق! 🎉✨`);
                        }
                    }
                }

                if (user.syndicate_expiry_date && user.telegram_id) {
                    const synEndDate = new Date(user.syndicate_expiry_date);
                    const synDaysLeft = Math.ceil((synEndDate - nowUTC) / (1000 * 60 * 60 * 24));
                    if (synDaysLeft === 7) {
                        const synLock7 = `syn_lock_7_${user.id}_${dateStr}`;
                        if (!env.MOAKKIL_KV || !(await env.MOAKKIL_KV.get(synLock7))) {
                            if (env.MOAKKIL_KV) await env.MOAKKIL_KV.put(synLock7, "true", { expirationTtl: 86400 });
                            await sendTG(user.telegram_id, `⚖️ <b>تذكير نقابي مهني</b>\n\nالزميل/ة العزيز/ة، هويتك النقابية ستنتهي بعد <b>أسبوع واحد</b>. يرجى تجديدها.`);
                        }
                    } else if (synDaysLeft === 0) {
                        const synLock0 = `syn_lock_0_${user.id}_${dateStr}`;
                        if (!env.MOAKKIL_KV || !(await env.MOAKKIL_KV.get(synLock0))) {
                            if (env.MOAKKIL_KV) await env.MOAKKIL_KV.put(synLock0, "true", { expirationTtl: 86400 });
                            await sendTG(user.telegram_id, `🚨 <b>تنبيه هام جداً</b>\n\nالزميل/ة العزيز/ة، لقد انتهت صلاحية هويتك النقابية اليوم!`);
                        }
                    }
                }
            }

            const tomorrowDateObj = new Date(nowUTC.getTime() + (24 * 60 * 60 * 1000));
            const tomorrowStr = getAmmanDateString(tomorrowDateObj);
            const todayStr = dateStr;

            const upcomingAppts = await db(`mo_appointments?status=eq.مجدول&appt_date=gte.${tomorrowStr}T00:00:00&appt_date=lte.${tomorrowStr}T23:59:59&select=*`, { method: 'GET' }).catch(() => []);

            let staffSchedule = {};

            for (const appt of upcomingAppts) {
                if (appt.is_deleted) continue;
                if (!appt.assigned_to || !Array.isArray(appt.assigned_to)) continue;
                for (const sId of appt.assigned_to) {
                    if (!staffSchedule[sId]) staffSchedule[sId] = [];
                    staffSchedule[sId].push(appt);
                }
            }

            for (const sId in staffSchedule) {
                const staff = await db(`mo_users?id=eq.${sId}&select=id,telegram_id,full_name`).then(res => res[0]).catch(() => null);
                if (!staff) continue;

                if (env.MOAKKIL_KV) {
                    const lockKey = `cron_spam_lock_${staff.id}_${todayStr}`;
                    const alreadySent = await env.MOAKKIL_KV.get(lockKey);
                    if (alreadySent) continue;
                    await env.MOAKKIL_KV.put(lockKey, "true", { expirationTtl: 86400 });
                }

                const apptsList = staffSchedule[sId];

                await sendNotification({
                    user_id: staff.id,
                    firm_id: apptsList[0].firm_id,
                    title: '📋 جدول أعمالك لغدٍ',
                    message: `لديك (${apptsList.length}) موعد/مهمة غداً. يرجى مراجعة الجدول.`,
                    action_url: `/app.html#agenda`,
                    is_read: false,
                    created_at: getUTCNow().toISOString(),
                    created_by: staff.id
                });

                if (staff.telegram_id) {
                    let msgHtml = `📋 <b>جدول أعمالك لغدٍ (${tomorrowStr})</b>\n\nعزيزي ${safeTG(staff.full_name)}، لديك المهام التالية:\n`;
                    apptsList.forEach((a, idx) => {
                        msgHtml += `\n${idx + 1}. [${safeTG(a.type)}] ${safeTG(a.title)}`;
                    });
                    msgHtml += `\n\nنتمنى لك يوماً موفقاً! ⚖️`;
                    await sendTG(staff.telegram_id, msgHtml);
                }
            }

        } catch (err) { console.error("Cron Job Error:", err); }
    },

    // ============================================================================
    // [2] المحرك الأساسي لاستقبال الطلبات (API Fetch Engine)
    // ============================================================================
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const method = request.method;
        const tgToken = env.TG_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN;
        const r2Bucket = env.MOAKKIL_R2 || env.MY_BUCKET;
        const corsHeaders = buildCorsHeaders(request, env);

        const path = url.pathname.replace(/\/+/g, '/').replace(/\/$/, '') || '/';

        if (path === '/loaderio-723548b5344693fd75bc9a8c1fd76bf0' || path === '/loaderio-723548b5344693fd75bc9a8c1fd76bf0.txt' || path === '/loaderio-723548b5344693fd75bc9a8c1fd76bf0.html') {
            return new Response('loaderio-723548b5344693fd75bc9a8c1fd76bf0', {
                status: 200,
                headers: { 'Content-Type': 'text/plain', ...corsHeaders }
            });
        }

        // 🛡️ فحص الـ Origin الصارم قبل معالجة أي طلب متصفح متقاطع (CORS Enforcement)
        const reqOrigin = request.headers.get('Origin');
        if (reqOrigin && !isOriginTrusted(reqOrigin, env)) {
            return new Response(JSON.stringify({ error: 'مرفوض أمنياً: النطاق المرسل للطلب غير مصرح له (Untrusted Origin).' }), {
                status: 403,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        if (method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

        const createRes = (data, status = 200) => new Response(JSON.stringify(data), {
            status, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

        if (path === '/api/system/version' && method === 'GET') {
            return createRes({ version: WORKER_VERSION, status: 'secure' });
        }

        // 🛑 حظر العمل بمفاتيح افتراضية نصية (Fail-Closed Security)
        const jwtSecret = env.JWT_SECRET;
        if (!jwtSecret || jwtSecret.length < 16 || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
            return createRes({ error: 'خطأ أمني في إعدادات الخادم: الأسرار الأساسية (JWT_SECRET / SUPABASE) غير مضبوطة في البيئة الآمنة.' }, 500);
        }

        const SUPER_ADMIN_PHONE = env.SUPER_ADMIN_PHONE || null;
        const SUPER_ADMIN_TG = env.SUPER_ADMIN_TG || null;

        // ------------------ دوال التشفير الأساسية والتحقق الكريبتوغرافي (JWT) ------------------
        const generateToken = async (payload) => {
            const enc = new TextEncoder();
            const nowSec = Math.floor(Date.now() / 1000);
            const defaultTtl = payload.role === 'super_admin' ? 43200 : 604800;
            const fullPayload = {
                ...payload,
                jti: payload.jti || crypto.randomUUID(),
                iat: nowSec,
                exp: payload.exp || (nowSec + defaultTtl)
            };
            const encodeB64 = (obj) => btoa(String.fromCodePoint(...enc.encode(JSON.stringify(obj)))).replace(/[+/=]/g, m => ({ '+': '-', '/': '_', '=': '' }[m]));
            const data = `${encodeB64({ alg: "HS256", typ: "JWT" })}.${encodeB64(fullPayload)}`;
            const key = await crypto.subtle.importKey("raw", enc.encode(jwtSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
            const signature = await crypto.subtle.sign("HMAC", key, enc.encode(data));
            const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/[+/=]/g, m => ({ '+': '-', '/': '_', '=': '' }[m]));
            return `${data}.${sigB64}`;
        };

        const verifyToken = async (token) => {
            try {
                if (!token || typeof token !== 'string') return null;
                const parts = token.split('.');
                if (parts.length !== 3) return null;

                // 1. التحقق الكريبتوغرافي الصارم من التوقيع (HMAC-SHA256)
                const enc = new TextEncoder();
                const key = await crypto.subtle.importKey("raw", enc.encode(jwtSecret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
                const dataToVerify = enc.encode(`${parts[0]}.${parts[1]}`);
                const sigBase64 = parts[2].replace(/-/g, '+').replace(/_/g, '/');
                const padLen = (4 - (sigBase64.length % 4)) % 4;
                const sigBytes = Uint8Array.from(atob(sigBase64 + '='.repeat(padLen)), c => c.charCodeAt(0));

                const isValidSignature = await crypto.subtle.verify("HMAC", key, sigBytes, dataToVerify);
                if (!isValidSignature) return null;

                // 2. فك الـ Payload وفحص الحقول الإلزامية وتاريخ الصلاحية (exp)
                const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
                const payloadPad = (4 - (payloadBase64.length % 4)) % 4;
                const payloadBinStr = atob(payloadBase64 + '='.repeat(payloadPad));
                const payloadBytes = Uint8Array.from(payloadBinStr, c => c.charCodeAt(0));
                const payload = JSON.parse(new TextDecoder().decode(payloadBytes));

                if (!payload || !payload.phone || !payload.uid || !payload.role) return null;
                if (payload.role !== 'super_admin' && !payload.firm_id) return null;

                const nowSec = Math.floor(Date.now() / 1000);
                if (!payload.exp || payload.exp < nowSec) return null;

                // ضمان وجود معرف جلسة موحد (jti) دائماً لربط التذاكر الأمنية
                if (!payload.jti) {
                    payload.jti = `jti_${crypto.randomUUID()}`;
                }

                // 3. فحص الجلسة الأحادية الإلزامي في Cloudflare KV (Fail-Closed)
                if (!env.MOAKKIL_KV) return null;
                const savedToken = await env.MOAKKIL_KV.get(`session:${payload.phone}`);
                if (!savedToken || savedToken !== token) return null;

                return payload;
            } catch (e) { return null; }
        };

        // ------------------ دوال الاتصال بقاعدة البيانات والإشعارات ------------------
        const db = async (endpoint, options = {}) => {
            const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${endpoint}`, {
                ...options,
                headers: {
                    'apikey': env.SUPABASE_SERVICE_KEY,
                    'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation',
                    ...options.headers
                }
            });
            if (options.method === 'DELETE' && r.status === 204) return { success: true };
            const data = await r.json();
            if (!r.ok) throw new Error(data.message || JSON.stringify(data));
            return data;
        };

        const sendTG = async (chatId, msg) => {
            if (!tgToken || !chatId) return;
            await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'HTML' })
            }).catch(() => {});
        };

        const syncCaseEmbedding = async (caseId, firmId, bodyObj, oldObj = {}) => {
            if (!env.AI || !caseId) return;
            try {
                const facts = bodyObj.lawsuit_facts || bodyObj.lawsuit_text || oldObj.lawsuit_facts || oldObj.lawsuit_text || '';
                const legal = bodyObj.legal_basis || oldObj.legal_basis || '';
                const type = bodyObj.case_type || oldObj.case_type || '';
                const combinedText = `${type}\n${facts}\n${legal}`.trim();

                if (combinedText.length < 15) return;

                const embRes = await env.AI.run('@cf/baai/bge-m3', { text: [combinedText.substring(0, 4000)] });
                if (embRes && embRes.data && embRes.data[0]) {
                    await db(`mo_cases?id=eq.${caseId}&firm_id=eq.${firmId}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ case_embedding: embRes.data[0] })
                    });
                }
            } catch (e) {
                console.error("Auto-Embedding Error:", e);
            }
        };

        const sendNotification = async (notifBody) => {
            const r = await fetch(`${env.SUPABASE_URL}/rest/v1/mo_notifications`, {
                method: 'POST',
                headers: {
                    'apikey': env.SUPABASE_SERVICE_KEY,
                    'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify(notifBody)
            });

            if (!r.ok) return;

            try {
                if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
                    const devices = await db(`mo_user_devices?user_id=eq.${notifBody.user_id}&select=*`).catch(() => []);

                    for (const device of devices) {
                        const targetEndpoint = device.endpoint || device.device_token;
                        if (!targetEndpoint || !targetEndpoint.startsWith('http')) continue;

                        await fetch(targetEndpoint, {
                            method: 'POST',
                            headers: {
                                'TTL': '60',
                                'Urgency': 'high',
                                'Topic': 'moakkil_alert'
                            }
                        }).catch(() => {});
                    }
                } else if (env.PUSH_GATEWAY_URL) {
                    const devices = await db(`mo_user_devices?user_id=eq.${notifBody.user_id}&select=*`).catch(() => []);
                    if (devices.length > 0) {
                        await fetch(env.PUSH_GATEWAY_URL, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ devices, payload: { title: notifBody.title, body: notifBody.message, url: notifBody.action_url } })
                        }).catch(() => {});
                    }
                }
            } catch (e) { console.error("Web Push Error:", e); }
        };

        const updateCaseFinancials = async (caseId, firmId) => {
            if (!caseId) return;
            try {
                const installments = await db(`mo_installments?case_id=eq.${encodeURIComponent(caseId)}&firm_id=eq.${encodeURIComponent(firmId)}&status=eq.مدفوعة&select=amount,is_deleted`);
                const validInst = installments.filter(inst => !inst.is_deleted);
                const totalPaid = validInst.reduce((sum, inst) => sum + (Number(inst.amount) || 0), 0);
                await db(`mo_cases?id=eq.${encodeURIComponent(caseId)}&firm_id=eq.${encodeURIComponent(firmId)}`, { method: 'PATCH', body: JSON.stringify({ total_paid: totalPaid }) });
            } catch (err) {}
        };

        try {
            // ============================================================================
            // [3] المسارات العامة والمستقلة (Webhooks)
            // ============================================================================
            if (path === '/api/webhook/telegram' && method === 'POST') {
                // 🛡️ إلزامية التحقق من X-Telegram-Bot-Api-Secret-Token (Fail-Closed Webhook Security)
                if (!env.TELEGRAM_WEBHOOK_SECRET || String(env.TELEGRAM_WEBHOOK_SECRET).trim().length < 12) {
                    return createRes({ error: 'Telegram webhook is disabled: TELEGRAM_WEBHOOK_SECRET must be configured in Cloudflare Secrets.' }, 503);
                }
                const tgSecretHeader = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
                if (!tgSecretHeader || tgSecretHeader !== env.TELEGRAM_WEBHOOK_SECRET) {
                    return createRes({ error: 'Unauthorized Webhook Request' }, 401);
                }
                try {
                    const update = await request.json();

                    if (update.message && update.message.text) {
                        const chatId = update.message.chat.id;
                        const text = update.message.text.trim();

                        if (text === '/id' || text === '/start') {
                            const replyMsg = `أهلاً بك في نظام موكّل ⚖️\n\nالرقم التعريفي (ID) الخاص بك هو:\n<code>${chatId}</code>\n\nيرجى نسخ هذا الرقم وإعطائه لمدير النظام ليتمكن من إضافتك كمستخدم مصرح له وتفعيل الإشعارات.`;
                            await sendTG(chatId, replyMsg);
                        }
                        else if (text.startsWith('/start ')) {
                            const clientToken = text.split(' ')[1]?.trim();
                            if (!clientToken || clientToken.length < 16) {
                                return createRes({ status: 'ok' });
                            }
                            let clientData = await db(`mo_clients?access_token=eq.${encodeURIComponent(clientToken)}&select=id,firm_id,full_name,telegram_id,client_portal_active`).catch(() => []);
                            if (!clientData || clientData.length === 0) {
                                const caseByToken = await db(`mo_cases?public_token=eq.${encodeURIComponent(clientToken)}&select=client_id,is_deleted`).catch(() => []);
                                if (caseByToken && caseByToken.length > 0 && !caseByToken[0].is_deleted) {
                                    clientData = await db(`mo_clients?id=eq.${caseByToken[0].client_id}&select=id,firm_id,full_name,telegram_id,client_portal_active`).catch(() => []);
                                }
                            }

                            if (clientData && clientData.length > 0) {
                                const targetClient = clientData[0];
                                if (targetClient.client_portal_active === false) {
                                    await sendTG(chatId, `⚠️ عذراً، تم إيقاف بوابة الموكل لهذا الملف من قبل إدارة المكتب.`);
                                    return createRes({ status: 'ok' });
                                }
                                // 🛡️ منع اختطاف الربط إذا كان حساب الموكل مربوطاً مسبقاً بحساب تيليغرام آخر
                                if (targetClient.telegram_id && String(targetClient.telegram_id) !== String(chatId)) {
                                    await sendTG(chatId, `🛡️ هذا الملف مرتبط مسبقاً بحساب تيليغرام آخر. لتغيير الحساب المعتمد، يرجى مراجعة إدارة مكتب المحاماة لإلغاء الربط السابق أولاً.`);
                                    return createRes({ status: 'ok' });
                                }

                                const clientId = targetClient.id;
                                let r2PhotoUrl = null;

                                try {
                                    if (tgToken && r2Bucket) {
                                        const photosRes = await fetch(`https://api.telegram.org/bot${tgToken}/getUserProfilePhotos?user_id=${chatId}`);
                                        const photosData = await photosRes.json();

                                        if (photosData.ok && photosData.result.total_count > 0) {
                                           const fileId = photosData.result.photos[0].pop().file_id;
                                            const fileRes = await fetch(`https://api.telegram.org/bot${tgToken}/getFile?file_id=${fileId}`);
                                            const fileData = await fileRes.json();

                                            if (fileData.ok) {
                                                const filePath = fileData.result.file_path;
                                                const photoStream = await fetch(`https://api.telegram.org/file/bot${tgToken}/${filePath}`);

                                                const r2Key = `avatars/client_${clientId}_${Date.now()}.jpg`;
                                                await r2Bucket.put(r2Key, photoStream.body, {
                                                    httpMetadata: { contentType: 'image/jpeg' }
                                                });

                                                r2PhotoUrl = env.R2_PUBLIC_URL ? `${env.R2_PUBLIC_URL}/${r2Key}` : r2Key;
                                            }
                                        }
                                    }
                                } catch (picErr) { console.error("Failed to fetch/upload Telegram Photo:", picErr); }

                                const updatePayload = { telegram_id: chatId.toString() };
                                if (r2PhotoUrl) updatePayload.avatar_url = r2PhotoUrl;

                                await db(`mo_clients?id=eq.${clientId}`, {
                                    method: 'PATCH',
                                    body: JSON.stringify(updatePayload)
                                });

                                await sendTG(chatId, `أهلاً بك أستاذ/ة ${safeTG(targetClient.full_name)} ⚖️\nتم ربط حسابك بنجاح بنظام إدارة المكتب.\nستصلك هنا إشعارات الجلسات وإيصالات الدفع فور صدورها.`);
                            }
                        }
                    }
                    return createRes({ status: 'ok' });
                } catch (e) {
                    return createRes({ error: 'Webhook Error' }, 500);
                }
            }

            if (path === '/api/public/payment/webhook' && method === 'POST') {
                if (!env.PAYMENT_WEBHOOK_SECRET || String(env.PAYMENT_WEBHOOK_SECRET).trim().length < 16) {
                    return createRes({ error: 'Payment webhook is disabled until PAYMENT_WEBHOOK_SECRET is configured.' }, 403);
                }
                const rawBody = await request.text();
                const sigHeader = (request.headers.get('x-payment-signature') || '').trim();
                const tsHeader = (request.headers.get('x-payment-timestamp') || '').trim();
                if (!sigHeader || !tsHeader) {
                    return createRes({ error: 'Missing payment webhook signature or timestamp.' }, 401);
                }
                const tsSec = parseInt(tsHeader, 10);
                const nowSec = Math.floor(Date.now() / 1000);
                if (isNaN(tsSec) || Math.abs(nowSec - tsSec) > 300) {
                    return createRes({ error: 'Payment webhook timestamp expired (Replay protection).' }, 401);
                }
                const enc = new TextEncoder();
                const hmacKey = await crypto.subtle.importKey('raw', enc.encode(env.PAYMENT_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
                const macBuf = await crypto.subtle.sign('HMAC', hmacKey, enc.encode(`${tsHeader}.${rawBody}`));
                const expectedHex = Array.from(new Uint8Array(macBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
                if (sigHeader.toLowerCase() !== expectedHex) {
                    return createRes({ error: 'Invalid payment webhook HMAC signature.' }, 401);
                }
                const parsedEvent = JSON.parse(rawBody || '{}');
                const eventId = parsedEvent.event_id || parsedEvent.id;
                if (eventId && env.MOAKKIL_KV) {
                    const seen = await env.MOAKKIL_KV.get(`payment_evt:${eventId}`);
                    if (seen) return createRes({ success: true, duplicate: true });
                    await env.MOAKKIL_KV.put(`payment_evt:${eventId}`, '1', { expirationTtl: 86400 });
                }
                return createRes({ success: true, message: "Payment webhook verified and received" });
            }

            // 🛡️ دالة التحقق الموحدة من جلسة بوابة الموكل (Server-Side Portal Session Verification)
            const verifyPortalSession = async (req, reqUrl, expectedToken, caseObj) => {
                if (!caseObj) return { valid: false, status: 404, error: 'القضية غير موجودة.' };
                if (caseObj.is_deleted === true) return { valid: false, status: 404, error: 'القضية مؤرشفة أو غير نشطة.' };
                if (caseObj.client_portal_active === false) return { valid: false, status: 403, error: 'تم تعطيل بوابة الموكل لهذه القضية من قبل إدارة المكتب.' };
                if (!caseObj.access_pin && !caseObj.access_pin_hash) return { valid: true };
                if (!env.MOAKKIL_KV) return { valid: false, status: 500, error: 'محرك الجلسات KV غير متصل.' };

                const portalSessionToken = (
                    req.headers.get('x-portal-session-token') ||
                    reqUrl.searchParams.get('portal_session_token') ||
                    ''
                ).trim();

                if (!portalSessionToken || !portalSessionToken.startsWith('psess_')) {
                    return { valid: false, status: 401, error: 'يرجى تسجيل الدخول برمز الـ PIN أولاً للوصول لبيانات ومستندات القضية.', require_pin: true };
                }

                const sessRaw = await env.MOAKKIL_KV.get(`portal_session:${portalSessionToken}`);
                if (!sessRaw) {
                    return { valid: false, status: 401, error: 'انتهت صلاحية جلسة بوابة الموكل أو تم تسجيل الخروج. يرجى إدخال رمز الـ PIN مجدداً.', require_pin: true };
                }

                let sessObj = null;
                try { sessObj = JSON.parse(sessRaw); } catch (e) { return { valid: false, status: 401, error: 'جلسة البوابة غير صالحة.', require_pin: true }; }

                if (
                    !sessObj ||
                    String(sessObj.public_token) !== String(expectedToken) ||
                    String(sessObj.case_id) !== String(caseObj.id) ||
                    String(sessObj.firm_id) !== String(caseObj.firm_id)
                ) {
                    return { valid: false, status: 403, error: 'تذكرة جلسة البوابة لا تطابق هذه القضية.', require_pin: true };
                }

                // 🛡️ فحص إصدار المصادقة (Auth Version) لإبطال الجلسات فورياً عند تغيير الـ PIN أو تعطيل البوابة
                const currentCaseVer = await env.MOAKKIL_KV.get('case_auth_ver:' + caseObj.id);
                if (currentCaseVer && sessObj.auth_version && String(sessObj.auth_version) !== String(currentCaseVer)) {
                    return { valid: false, status: 401, error: 'تم إبطال الجلسة لتحديث بيانات الأمان أو تغيير رمز الدخول. يرجى تسجيل الدخول مجدداً.', require_pin: true };
                }

                return { valid: true, portalSessionToken, sessionData: sessObj };
            };

            // ============================================================================
            // [R2] مسار تحميل الملفات الآمن الخاص بالموكلين (بوابة الموكل - محصن بـ Portal Session وملكية السجل)
            // ============================================================================
            if (path === '/api/public/r2/download' && method === 'GET') {
                try {
                    const key = url.searchParams.get('key');
                    const clientToken = (url.searchParams.get('client_token') || url.searchParams.get('token') || '').trim();

                    if (!key || key.includes('..') || key.startsWith('/')) {
                        return createRes({ error: 'معلومات التحميل مفقودة أو غير صالحة' }, 400);
                    }

                    if (!r2Bucket) return createRes({ error: 'محرك التخزين السحابي R2 غير متصل' }, 500);

                    if (clientToken) {
                        let isAuthorizedClient = false;
                        let authorizedFirmId = null;
                        let authorizedClientId = null;
                        let authorizedCaseId = null;

                        const caseCheck = await db(`mo_cases?public_token=eq.${encodeURIComponent(clientToken)}&select=id,firm_id,client_id,access_pin,access_pin_hash,access_pin_salt,client_portal_active,is_deleted`).catch(() => []);
                        if (caseCheck && caseCheck.length > 0 && !caseCheck[0].is_deleted) {
                            const portalAuth = await verifyPortalSession(request, url, clientToken, caseCheck[0]);
                            if (!portalAuth.valid) {
                                return createRes({ error: portalAuth.error, require_pin: true }, portalAuth.status);
                            }
                            const clStatus = await db(`mo_clients?id=eq.${caseCheck[0].client_id}&select=client_portal_active`).catch(() => []);
                            if (!clStatus.length || clStatus[0].client_portal_active !== false) {
                                authorizedFirmId = caseCheck[0].firm_id;
                                authorizedClientId = caseCheck[0].client_id;
                                authorizedCaseId = caseCheck[0].id;
                            }
                        }

                        if (authorizedFirmId && key.startsWith(`files/${authorizedFirmId}/`)) {
                            const fileRecords = await db(`mo_files?firm_id=eq.${authorizedFirmId}&or=(file_url.eq.${encodeURIComponent(key)},drive_file_id.eq.${encodeURIComponent(key)})&select=id,client_id,case_id,is_visible_to_client,is_deleted`).catch(() => []);

                            if (fileRecords && fileRecords.length > 0) {
                                const fRec = fileRecords[0];
                                const belongsToClientOrCase = (authorizedClientId && String(fRec.client_id) === String(authorizedClientId)) ||
                                                              (authorizedCaseId && String(fRec.case_id) === String(authorizedCaseId));
                                if (belongsToClientOrCase && !fRec.is_deleted && fRec.is_visible_to_client === true) {
                                    isAuthorizedClient = true;
                                }
                            }
                        }

                        if (!isAuthorizedClient) return createRes({ error: 'غير مصرح لك بتحميل هذا الملف أو لم يتم إتاحته للموكل' }, 403);
                    } else {
                        const authHeader = request.headers.get('Authorization');
                        const session = authHeader ? await verifyToken(authHeader.split(' ')[1]) : null;
                        if (!session) return createRes({ error: 'غير مصرح لك للوصول لهذا الملف' }, 401);

                        if (!key.startsWith(`files/${session.firm_id}/`)) return createRes({ error: 'غير مصرح للوصول لملفات مكاتب أخرى' }, 403);

                        const parts = key.split('/');
                        const clientFolder = parts[2];
                        const caseId = parts[3];

                        // اشتراط وجود سجل فعلي في mo_files أو mo_users للمسار الداخلي (إلا إذا كان شعار المكتب في مسار الشعارات المعتمد)
                        const isFirmLogo = /^files\/[a-zA-Z0-9_-]+\/logos\/firm_logo_/.test(key);
                        const isHrAsset = (clientFolder === 'HR' && (caseId === 'Avatars' || caseId === 'Docs'));

                        if (!isFirmLogo) {
                            let isRegisteredFile = false;
                            if (isHrAsset) {
                                const staffList = await db(`mo_users?firm_id=eq.${session.firm_id}&select=id,avatar_url,staff_documents`).catch(() => []);
                                isRegisteredFile = (staffList || []).some(u =>
                                    u.avatar_url === key ||
                                    (Array.isArray(u.staff_documents) && u.staff_documents.some(d => d && d.url === key))
                                );
                            } else {
                                const fileRecs = await db(`mo_files?firm_id=eq.${session.firm_id}&or=(file_url.eq.${encodeURIComponent(key)},drive_file_id.eq.${encodeURIComponent(key)})&select=id,case_id,is_deleted`).catch(() => []);
                                isRegisteredFile = !!(fileRecs && fileRecs.length > 0 && !fileRecs[0].is_deleted);
                            }
                            if (!isRegisteredFile) {
                                return createRes({ error: 'الملف غير مسجل في قاعدة بيانات المكتب أو تم حذفه.' }, 404);
                            }
                        }

                        if (!isFirmLogo && !isHrAsset && caseId && caseId !== 'general') {
                            const caseCheck = await db(`mo_cases?id=eq.${encodeURIComponent(caseId)}&firm_id=eq.${session.firm_id}&select=id,confidentiality_level,assigned_lawyer_id,is_deleted`).catch(() => []);
                            if (!caseCheck.length || caseCheck[0].is_deleted) {
                                return createRes({ error: 'مرفوض: القضية المرجعية لهذا الملف غير موجودة.' }, 404);
                            }
                            const cInfo = caseCheck[0];
                            if (cInfo.confidentiality_level === 'سري' && session.role !== 'admin' && session.role !== 'super_admin') {
                                if (!cInfo.assigned_lawyer_id || !cInfo.assigned_lawyer_id.includes(session.uid)) {
                                    return createRes({ error: 'مرفوض: هذا الملف يتبع لقضية سرية لست مخولاً بالاطلاع عليها.' }, 403);
                                }
                            }
                        }
                    }

                    const object = await r2Bucket.get(key);

                    if (object === null) {
                        return createRes({ error: 'الملف غير موجود أو تم حذفه من السحابة' }, 404);
                    }

                    const headers = new Headers();
                    object.writeHttpMetadata(headers);
                    headers.set('etag', object.httpEtag);
                    Object.keys(corsHeaders).forEach(k => headers.set(k, corsHeaders[k]));

                    return new Response(object.body, { headers });

                } catch (e) {
                    console.error("[Public R2 Error]:", e);
                    return createRes({ error: 'حدث خطأ أثناء معالجة الملف السحابي' }, 500);
                }
            }

            // ============================================================================
            // [4] المصادقة والحماية، البصمة الحيوية، وتدقيق الكوتا (Authentication & Security)
            // ============================================================================
            if (path === '/api/auth/request-otp' && method === 'POST') {
                const { phone } = await request.json();
                if (!phone) return createRes({ error: 'رقم الهاتف مطلوب' }, 400);

                if (env.MOAKKIL_KV) {
                    const reqAttempts = parseInt(await env.MOAKKIL_KV.get(`otp_req_rate:${phone}`) || "0");
                    if (reqAttempts >= 6) {
                        return createRes({ error: 'تم تجاوز الحد المسموح لطلب الرمز. يرجى الانتظار 10 دقائق.' }, 429);
                    }
                    await env.MOAKKIL_KV.put(`otp_req_rate:${phone}`, (reqAttempts + 1).toString(), { expirationTtl: 600 });
                }

                if (SUPER_ADMIN_PHONE && phone === SUPER_ADMIN_PHONE) {
                    if (!SUPER_ADMIN_TG) return createRes({ error: 'معرف تيليغرام الإدارة العليا غير مضبوط في البيئة الآمنة.' }, 500);
                    const otp = generateSecureOTP();
                    if (env.MOAKKIL_KV) {
                        await env.MOAKKIL_KV.put(`otp:${phone}`, otp, { expirationTtl: 300 });
                        await env.MOAKKIL_KV.delete(`otp_verify_brute:${phone}`);
                    }
                    await sendTG(SUPER_ADMIN_TG, `👨‍💻 <b>دخول الإدارة العليا - نظام موكّل</b>\n\nكود التحقق الخاص بك:\n<code>${otp}</code>\n\nصالح لمدة 5 دقائق.`);
                    return createRes({ success: true, message: "تم إرسال الكود لتيليغرام المشرف العام" });
                }

                const users = await db(`mo_users?phone=eq.${encodeURIComponent(phone)}&select=*,mo_firms(firm_name,is_active,subscription_end_date,max_users)`);
                if (!users.length) return createRes({ error: 'الرقم غير مسجل بالنظام' }, 403);

                const user = users[0];
                const firm = user.mo_firms;

                if (!user.is_active || !user.can_login) return createRes({ error: 'تم إيقاف حسابك من قبل الإدارة.' }, 403);
                if (!firm?.is_active) return createRes({ error: 'تم إيقاف حساب المكتب من قبل الإدارة العليا.' }, 403);

                if (firm?.subscription_end_date) {
                    const gracePeriodEnd = new Date(firm.subscription_end_date);
                    gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 3);
                    if (getUTCNow() > gracePeriodEnd) return createRes({ error: 'انتهت صلاحية اشتراك المكتب. يرجى التجديد.' }, 402);
                }

                if (user.role !== 'admin' && firm?.max_users) {
                    const activeUsersCount = await db(`mo_users?firm_id=eq.${user.firm_id}&can_login=eq.true&select=id`).then(res => res.length).catch(() => 0);
                    if (activeUsersCount > firm.max_users) {
                        return createRes({ error: 'عذراً، تم تقليص كوتا المكتب وتجاوز العدد المسموح. يرجى مراجعة الإدارة لترتيب الحسابات.' }, 403);
                    }
                }

                const otp = generateSecureOTP();
                if (env.MOAKKIL_KV) {
                    await env.MOAKKIL_KV.put(`otp:${phone}`, otp, { expirationTtl: 300 });
                    await env.MOAKKIL_KV.delete(`otp_verify_brute:${phone}`);
                }

                let targetTgId = user.telegram_id;
                if (!targetTgId) {
                    const hubUsers = await db(`hub_users?phone_number=eq.${encodeURIComponent(phone)}&select=telegram_id`).catch(() => []);
                    if (hubUsers.length) targetTgId = hubUsers[0].telegram_id;
                }

                if (targetTgId) await sendTG(targetTgId, `🔐 كود الدخول لنظام موكّل:\n\n<code>${otp}</code>\n\nصالح لمدة 5 دقائق، الموظف: ${safeTG(user.full_name)}\nالتوقيت: ${formatDateTimeAR(getUTCNow().toISOString())}`);
                return createRes({ success: true, message: "تم إرسال الكود لتيليغرام" });
            }

            if (path === '/api/auth/verify-otp' && method === 'POST') {
                const { phone, otp } = await request.json();
                const deviceId = request.headers.get('x-device-id') || 'unknown';
                if (!phone || !otp) return createRes({ error: 'بيانات التحقق ناقصة' }, 400);

                if (env.MOAKKIL_KV) {
                    let attempts = parseInt(await env.MOAKKIL_KV.get(`otp_verify_brute:${phone}`) || "0");
                    if (attempts >= 5) {
                        await env.MOAKKIL_KV.delete(`otp:${phone}`);
                        return createRes({ error: 'تم استنفاد محاولات إدخال الرمز. يرجى طلب رمز جديد.' }, 429);
                    }
                    const fetched = await env.MOAKKIL_KV.get(`otp:${phone}`);
                    if (!fetched || fetched !== String(otp).trim()) {
                        await env.MOAKKIL_KV.put(`otp_verify_brute:${phone}`, (attempts + 1).toString(), { expirationTtl: 300 });
                        return createRes({ error: 'الكود غير صحيح أو منتهي الصلاحية' }, 401);
                    }
                    await env.MOAKKIL_KV.delete(`otp_verify_brute:${phone}`);
                } else {
                    return createRes({ error: 'خدمة التحقق السحابي KV غير مفعلة' }, 500);
                }

                if (SUPER_ADMIN_PHONE && phone === SUPER_ADMIN_PHONE) {
                    const token = await generateToken({ uid: SUPER_ADMIN_UUID, role: 'super_admin', phone: SUPER_ADMIN_PHONE, name: 'الإدارة العليا' });
                    if (env.MOAKKIL_KV) {
                        await env.MOAKKIL_KV.put(`session:${phone}`, token, { expirationTtl: 43200 });
                        await env.MOAKKIL_KV.delete(`otp:${phone}`);
                    }
                    return createRes({ success: true, token, user: { id: SUPER_ADMIN_UUID, role: 'super_admin', full_name: 'الإدارة العليا', phone: SUPER_ADMIN_PHONE } });
                }

                const users = await db(`mo_users?phone=eq.${encodeURIComponent(phone)}&select=*,mo_firms(is_active,subscription_end_date)`);
                if (!users.length) return createRes({ error: 'المستخدم غير موجود' }, 404);
                const u = users[0];

                if (!u.is_active || !u.can_login) return createRes({ error: 'تم إيقاف حسابك من قبل الإدارة.' }, 403);
                if (u.mo_firms && !u.mo_firms.is_active) return createRes({ error: 'تم إيقاف حساب المكتب من قبل الإدارة العليا.' }, 403);

                const token = await generateToken({ uid: u.id, firm_id: u.firm_id, role: u.role, name: u.full_name, phone: u.phone, permissions: u.permissions });

                await db(`mo_users?id=eq.${u.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ current_session_device: deviceId, last_login: getUTCNow().toISOString(), last_status_change: getUTCNow().toISOString() })
                }).catch(e => console.error("Device Tracking Error:", e));

                if (env.MOAKKIL_KV) {
                    await env.MOAKKIL_KV.put(`session:${phone}`, token, { expirationTtl: 604800 });
                    await env.MOAKKIL_KV.delete(`otp:${phone}`);
                }
                return createRes({ success: true, token, user: sanitizeUserRecord(u, u.role) });
            }

            // 🛡️ مسار توليد تحدي WebAuthn الخادمي المؤقت (Server-Side WebAuthn Challenge)
            if (path === '/api/auth/webauthn-challenge' && method === 'POST') {
                if (!env.MOAKKIL_KV) return createRes({ error: 'محرك الجلسات KV غير متصل' }, 500);
                const body = await request.json().catch(() => ({}));
                const authHeader = request.headers.get('Authorization');
                const session = authHeader ? await verifyToken(authHeader.split(' ')[1]) : null;

                const targetKey = session?.uid || body.phone;
                if (!targetKey) return createRes({ error: 'مطلوب جلسة نشطة أو رقم الهاتف لتوليد التحدي الأمني.' }, 400);

                const randomBytes = new Uint8Array(32);
                crypto.getRandomValues(randomBytes);
                const challenge = base64UrlEncode(randomBytes);

                await env.MOAKKIL_KV.put(`webauthn_chal:${targetKey}`, challenge, { expirationTtl: 120 });
                return createRes({ success: true, challenge });
            }

            if (path === '/api/auth/biometric-register' && method === 'POST') {
                const authHeader = request.headers.get('Authorization');
                const session = authHeader ? await verifyToken(authHeader.split(' ')[1]) : null;
                if (!session) return createRes({ error: 'جلسة غير صالحة' }, 401);
                if (!env.MOAKKIL_KV) return createRes({ error: 'محرك الجلسات KV غير متصل' }, 500);

                const { credential_id, public_key, public_key_spki, device_name, challenge, clientDataJSON } = await request.json();
                if (!credential_id || String(credential_id).length < 12) return createRes({ error: 'معرف البصمة غير صالح' }, 400);

                // 🛡️ إلزامية التحقق من الـ Challenge الخادمي عند تسجيل البصمة (Fail-Closed)
                const expectedChal = await env.MOAKKIL_KV.get(`webauthn_chal:${session.uid}`);
                await env.MOAKKIL_KV.delete(`webauthn_chal:${session.uid}`);
                if (!expectedChal || !challenge || expectedChal !== challenge) {
                    return createRes({ error: 'انتهت صلاحية تحدي الأمان (Challenge) أو لم يتم طلبه من الخادم. يرجى المحاولة مجدداً.' }, 400);
                }

                if (clientDataJSON) {
                    try {
                        const cdObj = JSON.parse(new TextDecoder().decode(base64UrlDecodeToBytes(clientDataJSON)));
                        if (cdObj.type !== 'webauthn.create' || cdObj.challenge !== expectedChal) {
                            return createRes({ error: 'بيانات استجابة WebAuthn غير متطابقة مع تحدي التسجيل.' }, 400);
                        }
                        if (!cdObj.origin || !isOriginTrusted(cdObj.origin, env)) {
                            return createRes({ error: 'مرفوض أمنياً: نطاق تسجيل البصمة (Origin) غير موثوق.' }, 403);
                        }
                    } catch (e) {
                        return createRes({ error: 'تعذر التحقق من بيانات تسجيل WebAuthn.' }, 400);
                    }
                }

                const candidatePubKey = (public_key_spki || public_key || '').trim();
                const importedKey = await importWebAuthnSpkiPublicKey(candidatePubKey);
                if (!importedKey) {
                    return createRes({ error: 'مرفوض أمنياً: متصفحك لم يرسل مفتاحاً عاماً قياسياً (SPKI Public Key) صالحاً للتحقق التشفيري.' }, 400);
                }

                if (session.role === 'super_admin') {
                    if (SUPER_ADMIN_PHONE) {
                        await env.MOAKKIL_KV.put(`biometric:${SUPER_ADMIN_PHONE}`, JSON.stringify({
                            credential_id,
                            public_key: candidatePubKey,
                            counter: 0
                        }));
                    }
                    return createRes({ success: true, message: "تم تسجيل بصمة الإدارة العليا بنجاح" });
                }

                // حذف أي سجل قديم لنفس الـ credential_id ثم إدراج المفتاح العام الجديد
                await db(`mo_user_credentials?credential_id=eq.${encodeURIComponent(credential_id)}&user_id=eq.${encodeURIComponent(session.uid)}`, { method: 'DELETE' }).catch(() => {});
                await db('mo_user_credentials', {
                    method: 'POST',
                    body: JSON.stringify({
                        user_id: session.uid,
                        credential_id,
                        public_key: candidatePubKey,
                        counter: 0,
                        device_name: device_name || 'جهاز موثق'
                    })
                }).catch(e => console.error(e));

                return createRes({ success: true, message: "تم تسجيل البصمة والمفتاح العام لجهازك بنجاح" });
            }

            if (path === '/api/auth/biometric-login' && method === 'POST') {
                const { credential_id, phone, authenticatorData, clientDataJSON, signature } = await request.json();
                const deviceId = request.headers.get('x-device-id') || 'unknown';

                if (!credential_id || !phone) return createRes({ error: 'بيانات غير مكتملة' }, 400);

                if (env.MOAKKIL_KV) {
                    const bioAttempts = parseInt(await env.MOAKKIL_KV.get(`bio_brute:${phone}`) || "0");
                    if (bioAttempts >= 5) return createRes({ error: 'تم تجاوز عدد محاولات الدخول بالبصمة. يرجى الدخول برمز OTP.' }, 429);
                }

                const expectedChal = env.MOAKKIL_KV ? await env.MOAKKIL_KV.get(`webauthn_chal:${phone}`) : null;
                if (env.MOAKKIL_KV && expectedChal) {
                    await env.MOAKKIL_KV.delete(`webauthn_chal:${phone}`);
                }

                if (SUPER_ADMIN_PHONE && phone === SUPER_ADMIN_PHONE) {
                    if (env.MOAKKIL_KV) {
                        const savedRaw = await env.MOAKKIL_KV.get(`biometric:${SUPER_ADMIN_PHONE}`);
                        let savedObj = null;
                        if (savedRaw) {
                            try { savedObj = JSON.parse(savedRaw); } catch (e) { savedObj = null; }
                        }

                        if (savedObj && savedObj.credential_id === credential_id) {
                            if (!expectedChal || !authenticatorData || !clientDataJSON || !signature) {
                                return createRes({ error: 'مطلوب توقيع بيومتري كامل (WebAuthn Assertion) للدخول.' }, 401);
                            }
                            const assertionCheck = await verifyWebAuthnAssertion({
                                publicKeyB64: savedObj.public_key,
                                authenticatorDataB64: authenticatorData,
                                clientDataJSONB64: clientDataJSON,
                                signatureB64: signature,
                                expectedChallenge: expectedChal,
                                storedCounter: savedObj.counter || 0,
                                env,
                                requestUrl: request.url
                            });
                            if (!assertionCheck.valid) {
                                const bioAttempts = parseInt(await env.MOAKKIL_KV.get(`bio_brute:${phone}`) || "0");
                                await env.MOAKKIL_KV.put(`bio_brute:${phone}`, (bioAttempts + 1).toString(), { expirationTtl: 600 });
                                return createRes({ error: assertionCheck.error }, 401);
                            }

                            savedObj.counter = assertionCheck.newCounter || (savedObj.counter + 1);
                            await env.MOAKKIL_KV.put(`biometric:${SUPER_ADMIN_PHONE}`, JSON.stringify(savedObj));
                            await env.MOAKKIL_KV.delete(`bio_brute:${phone}`);

                            const token = await generateToken({ uid: SUPER_ADMIN_UUID, role: 'super_admin', phone: SUPER_ADMIN_PHONE, name: 'الإدارة العليا' });
                            await env.MOAKKIL_KV.put(`session:${phone}`, token, { expirationTtl: 43200 });
                            return createRes({ success: true, token, user: { id: SUPER_ADMIN_UUID, role: 'super_admin', full_name: 'الإدارة العليا', phone: SUPER_ADMIN_PHONE } });
                        }
                        const bioAttempts = parseInt(await env.MOAKKIL_KV.get(`bio_brute:${phone}`) || "0");
                        await env.MOAKKIL_KV.put(`bio_brute:${phone}`, (bioAttempts + 1).toString(), { expirationTtl: 600 });
                    }
                    return createRes({ error: 'البصمة غير مسجلة للإدارة العليا في هذا المتصفح. يرجى تسجيل الدخول أولاً برقم الهاتف.' }, 401);
                }

                const creds = await db(`mo_user_credentials?credential_id=eq.${encodeURIComponent(credential_id)}&select=id,user_id,public_key,counter,mo_users(*,mo_firms(is_active,subscription_end_date,max_users))`);
                if (!creds.length || !creds[0].mo_users) {
                    if (env.MOAKKIL_KV) {
                        const bioAttempts = parseInt(await env.MOAKKIL_KV.get(`bio_brute:${phone}`) || "0");
                        await env.MOAKKIL_KV.put(`bio_brute:${phone}`, (bioAttempts + 1).toString(), { expirationTtl: 600 });
                    }
                    return createRes({ error: 'البصمة غير مسجلة في النظام.' }, 401);
                }

                const credRecord = creds[0];
                const user = credRecord.mo_users;
                if (user.phone !== phone) {
                    if (env.MOAKKIL_KV) {
                        const bioAttempts = parseInt(await env.MOAKKIL_KV.get(`bio_brute:${phone}`) || "0");
                        await env.MOAKKIL_KV.put(`bio_brute:${phone}`, (bioAttempts + 1).toString(), { expirationTtl: 600 });
                    }
                    return createRes({ error: 'بيانات البصمة لا تطابق رقم الهاتف المدخل.' }, 401);
                }

                // التحقق التشفيري الإلزامي من توقيع WebAuthn
                if (!expectedChal || !authenticatorData || !clientDataJSON || !signature) {
                    return createRes({ error: 'مطلوب توقيع بيومتري حي (WebAuthn Assertion) لإتمام الدخول.' }, 401);
                }
                const assertionCheck = await verifyWebAuthnAssertion({
                    publicKeyB64: credRecord.public_key,
                    authenticatorDataB64: authenticatorData,
                    clientDataJSONB64: clientDataJSON,
                    signatureB64: signature,
                    expectedChallenge: expectedChal,
                    storedCounter: credRecord.counter || 0,
                    env,
                    requestUrl: request.url
                });
                if (!assertionCheck.valid) {
                    if (env.MOAKKIL_KV) {
                        const bioAttempts = parseInt(await env.MOAKKIL_KV.get(`bio_brute:${phone}`) || "0");
                        await env.MOAKKIL_KV.put(`bio_brute:${phone}`, (bioAttempts + 1).toString(), { expirationTtl: 600 });
                    }
                    return createRes({ error: assertionCheck.error }, 401);
                }

                if (!user.is_active || !user.can_login) return createRes({ error: 'تم إيقاف حسابك من قبل الإدارة.' }, 403);
                if (user.mo_firms && !user.mo_firms.is_active) return createRes({ error: 'تم إيقاف حساب المكتب من قبل الإدارة العليا.' }, 403);

                if (user.mo_firms?.subscription_end_date) {
                    const gracePeriodEnd = new Date(user.mo_firms.subscription_end_date);
                    gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 3);
                    if (getUTCNow() > gracePeriodEnd) return createRes({ error: 'انتهت صلاحية اشتراك المكتب. يرجى التجديد.' }, 402);
                }

                if (user.role !== 'admin' && user.mo_firms?.max_users) {
                    const activeUsersCount = await db(`mo_users?firm_id=eq.${user.firm_id}&can_login=eq.true&select=id`).then(res => res.length).catch(() => 0);
                    if (activeUsersCount > user.mo_firms.max_users) {
                        return createRes({ error: 'عذراً، تم تقليص كوتا المكتب وتجاوز العدد المسموح. يرجى مراجعة الإدارة لترتيب الحسابات.' }, 403);
                    }
                }

                if (env.MOAKKIL_KV) await env.MOAKKIL_KV.delete(`bio_brute:${phone}`);

                // تحديث عداد البصمة في قاعدة البيانات
                if (assertionCheck.newCounter) {
                    await db(`mo_user_credentials?id=eq.${credRecord.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ counter: assertionCheck.newCounter })
                    }).catch(() => {});
                }

                const token = await generateToken({ uid: credRecord.user_id, firm_id: user.firm_id, role: user.role, name: user.full_name, phone: user.phone, permissions: user.permissions });

                await db(`mo_users?id=eq.${credRecord.user_id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ current_session_device: deviceId, last_login: getUTCNow().toISOString(), last_status_change: getUTCNow().toISOString() })
                }).catch(e => console.error("Device Tracking Error:", e));

                if (env.MOAKKIL_KV) await env.MOAKKIL_KV.put(`session:${user.phone}`, token, { expirationTtl: 604800 });
                return createRes({ success: true, token, user: sanitizeUserRecord(user, user.role) });
            }

            // 🛡️ مسار تسجيل الخروج الخادمي وإبطال الجلسة وتذاكر الحذف في KV (/api/auth/logout)
            if (path === '/api/auth/logout' && method === 'POST') {
                const authHeader = request.headers.get('Authorization');
                const token = authHeader ? authHeader.split(' ')[1] : null;
                const session = token ? await verifyToken(token) : null;

                if (session && env.MOAKKIL_KV) {
                    if (session.phone) await env.MOAKKIL_KV.delete(`session:${session.phone}`);
                    await env.MOAKKIL_KV.delete(`action_mfa:${session.uid}`);
                    await env.MOAKKIL_KV.delete(`webauthn_chal:${session.uid}`);
                    const lastTicket = await env.MOAKKIL_KV.get(`last_action_ticket:${session.uid}`);
                    if (lastTicket) {
                        await env.MOAKKIL_KV.delete(`action_ticket:${lastTicket}`);
                        await env.MOAKKIL_KV.delete(`last_action_ticket:${session.uid}`);
                    }

                    if (session.firm_id) {
                        await db('mo_activity_logs', {
                            method: 'POST',
                            body: JSON.stringify({
                                firm_id: session.firm_id,
                                user_id: session.uid,
                                action_type: 'LOGOUT',
                                entity_type: 'mo_users',
                                entity_id: session.uid,
                                new_data: { _human_log: `قام ${session.name || 'المستخدم'} بتسجيل الخروج الآمن وإنهاء الجلسة السحابية.` },
                                created_at: getUTCNow().toISOString()
                            })
                        }).catch(() => {});
                    }
                }
                return createRes({ success: true, message: 'تم إنهاء الجلسة وتسجيل الخروج بنجاح' });
            }

            // ============================================================================
            // [5] بوابة الموكل العامة وعمليات التحقق المجانية (Public Portal & Verification)
            // ============================================================================
            if (path === '/api/public/client/login' && method === 'POST') {
                const { case_number, access_pin, token } = await request.json();
                const lockId = case_number || token || 'unknown';

                if (env.MOAKKIL_KV) {
                    let attempts = parseInt(await env.MOAKKIL_KV.get(`brute:${lockId}`) || "0");
                    attempts += 1;
                    if (attempts > 5) return createRes({ error: 'تم تجاوز الحد الأقصى للمحاولات. يرجى الانتظار 15 دقيقة.' }, 429);
                    await env.MOAKKIL_KV.put(`brute:${lockId}`, attempts.toString(), { expirationTtl: 900 });
                }

                const normalizedInputPin = normalizePinCode(access_pin);
                if (!normalizedInputPin) {
                    return createRes({ error: 'يرجى إدخال رمز الدخول السري (PIN).' }, 400);
                }

                let queryStr = '';
                if (token) {
                    queryStr = `mo_cases?public_token=eq.${encodeURIComponent(token)}&select=id,firm_id,public_token,client_id,access_pin,access_pin_hash,access_pin_salt,is_deleted`;
                } else if (case_number) {
                    queryStr = `mo_cases?case_internal_id=eq.${encodeURIComponent(case_number)}&select=id,firm_id,public_token,client_id,access_pin,access_pin_hash,access_pin_salt,is_deleted`;
                } else {
                    return createRes({ error: 'بيانات القضية غير مكتملة.' }, 400);
                }

                const cases = await db(queryStr).catch(() => []);
                let matchedCase = null;
                for (const c of (cases || [])) {
                    if (c.is_deleted) continue;
                    const isPinValid = await verifyPinCode(access_pin, c.access_pin, c.access_pin_hash, c.access_pin_salt);
                    if (isPinValid) {
                        matchedCase = c;
                        // الترقية التلقائية إلى تجزئة مملحة ومسح النص الصريح فوراً (Lazy Salted Hash Migration & Plaintext Wipe)
                        if (!c.access_pin_hash && access_pin) {
                            try {
                                const { hash: pHash, salt: pSalt } = await hashPinCode(access_pin);
                                if (pHash && pSalt) {
                                    await db(`mo_cases?id=eq.${c.id}`, {
                                        method: 'PATCH',
                                        body: JSON.stringify({ access_pin_hash: pHash, access_pin_salt: pSalt, access_pin: null })
                                    }).catch(() => {});
                                }
                            } catch (migErr) {}
                        }
                        break;
                    }
                }
                if (!matchedCase) return createRes({ error: 'رقم القضية أو رمز الدخول (PIN) غير صحيح' }, 401);

                if (matchedCase.client_id) {
                    const clientCheck = await db(`mo_clients?id=eq.${matchedCase.client_id}&select=client_portal_active`).catch(() => []);
                    if (clientCheck.length && clientCheck[0].client_portal_active === false) {
                        return createRes({ error: 'عذراً، تم إيقاف صلاحية الدخول لبوابة الموكل من قبل إدارة المكتب.' }, 403);
                    }
                }

                const portalSessionToken = `psess_${crypto.randomUUID()}`;
                if (env.MOAKKIL_KV) {
                    const currentCaseVer = await env.MOAKKIL_KV.get('case_auth_ver:' + matchedCase.id) || '1';
                    await env.MOAKKIL_KV.delete(`brute:${lockId}`);
                    await env.MOAKKIL_KV.put(`portal_session:${portalSessionToken}`, JSON.stringify({
                        public_token: matchedCase.public_token,
                        case_id: matchedCase.id,
                        client_id: matchedCase.client_id,
                        firm_id: matchedCase.firm_id,
                        auth_version: currentCaseVer,
                        created_at: Date.now()
                    }), { expirationTtl: 7200 });
                }
                return createRes({ success: true, token: matchedCase.public_token, portal_session_token: portalSessionToken });
            }

            // 🛡️ مسار تسجيل خروج الموكل وإبطال تذكرة جلسة البوابة في KV (POST /api/public/client/logout)
            if (path === '/api/public/client/logout' && method === 'POST') {
                const body = await request.json().catch(() => ({}));
                const portalSessionToken = (
                    request.headers.get('x-portal-session-token') ||
                    body.portal_session_token ||
                    url.searchParams.get('portal_session_token') ||
                    ''
                ).trim();

                if (portalSessionToken && portalSessionToken.startsWith('psess_') && env.MOAKKIL_KV) {
                    await env.MOAKKIL_KV.delete(`portal_session:${portalSessionToken}`);
                }
                return createRes({ success: true, message: 'تم إنهاء جلسة بوابة الموكل بنجاح.' });
            }

            if (path === '/api/public/client' && method === 'GET') {
                const token = url.searchParams.get('token')?.trim();
                if (!token) return createRes({ error: 'عذراً، رابط القضية مفقود.' }, 400);

                const cases = await db(`mo_cases?public_token=eq.${encodeURIComponent(token)}&select=*`);

                if (!cases || !cases.length || cases[0].is_deleted) return createRes({ error: 'القضية غير موجودة في النظام. قد يكون الرابط قديماً أو تم سحب الصلاحية.' }, 404);

                const c = cases[0];

                // 🛡️ إلزامية التحقق من جلسة البوابة المستقلة (portal_session_token) بدون أي علم مشترك
                const portalAuth = await verifyPortalSession(request, url, token, c);
                if (!portalAuth.valid) {
                    return createRes({ error: portalAuth.error, require_pin: true }, portalAuth.status);
                }

                const [cl, upd, firm, fl, inst, exp, appts] = await Promise.all([
                    db(`mo_clients?id=eq.${c.client_id}&select=id,full_name,client_type,client_portal_active,telegram_id,avatar_url`).catch(() => []),
                    db(`mo_case_updates?case_id=eq.${c.id}&is_visible_to_client=eq.true&order=created_at.desc`).catch(() => []),
                    db(`mo_firms?id=eq.${c.firm_id}&select=id,firm_name,firm_phone,firm_address,logo_url,primary_color,accent_color,currency_code`).catch(() => []),
                    db(`mo_files?case_id=eq.${c.id}&is_visible_to_client=eq.true`).catch(() => []),
                    db(`mo_installments?case_id=eq.${c.id}`).catch(() => []),
                    db(`mo_expenses?case_id=eq.${c.id}`).catch(() => []),
                    db(`mo_appointments?client_id=eq.${c.client_id}&order=appt_date.desc`).catch(() => [])
                ]);

                const clientObj = cl && cl.length ? cl[0] : {};
                if (clientObj.client_portal_active === false) {
                    return createRes({ error: 'تم تعطيل البوابة الإلكترونية لهذا الملف من قبل إدارة المكتب.' }, 403);
                }

                const safeFiles = (fl || []).filter(f => !f.is_deleted && f.is_visible_to_client === true);

                await db(`mo_cases?id=eq.${c.id}`, { method: 'PATCH', body: JSON.stringify({ client_last_seen: getUTCNow().toISOString() }) }).catch(() => {});

                // تطبيق قائمة السماح (Whitelist) لبيانات القضية وتوحيد حقول المكتب للواجهة
                const safeCaseData = sanitizePortalCaseData(c);
                const rawFirm = firm && firm.length ? firm[0] : {};
                const normalizedFirm = {
                    ...rawFirm,
                    phone: rawFirm.firm_phone || rawFirm.phone || '',
                    address: rawFirm.firm_address || rawFirm.address || '',
                    currency: rawFirm.currency_code || rawFirm.currency || 'د.أ'
                };

                return createRes({
                    client: clientObj,
                    case: safeCaseData,
                    updates: (upd || []).filter(u => !u.is_deleted),
                    firm: normalizedFirm,
                    files: safeFiles,
                    installments: (inst || []).filter(i => !i.is_deleted),
                    expenses: (exp || []).filter(e => !e.is_deleted),
                    appointments: (appts || []).filter(a => !a.is_deleted)
                });
            }

            // 🛡️ مسار رفع المستندات الناقصة من بوابة الموكل (POST /api/public/client/upload-missing-doc)
            if (path === '/api/public/client/upload-missing-doc' && method === 'POST') {
                const token = url.searchParams.get('token')?.trim() || request.headers.get('x-portal-token')?.trim();
                if (!token) return createRes({ error: 'رابط القضية مفقود' }, 400);

                const contentLength = parseInt(request.headers.get('content-length') || '0', 10);
                if (contentLength > MAX_R2_UPLOAD_BYTES) {
                    return createRes({ error: 'حجم الملف يتجاوز الحد الأقصى المسموح به (25 ميجابايت).' }, 413);
                }

                const cases = await db(`mo_cases?public_token=eq.${encodeURIComponent(token)}&select=id,firm_id,client_id,case_internal_id,access_pin,access_pin_hash,access_pin_salt,missing_docs_request,assigned_lawyer_id,is_deleted`).catch(() => []);
                if (!cases.length || cases[0].is_deleted) return createRes({ error: 'القضية غير موجودة' }, 404);
                const c = cases[0];

                const portalAuth = await verifyPortalSession(request, url, token, c);
                if (!portalAuth.valid) {
                    return createRes({ error: portalAuth.error, require_pin: true }, portalAuth.status);
                }

                const filename = request.headers.get('x-file-name') || 'missing_doc.pdf';
                const decodedName = decodeURIComponent(filename);
                const ext = decodedName.includes('.') ? decodedName.split('.').pop().toLowerCase() : '';
                if (ext && !ALLOWED_R2_EXTENSIONS.has(ext)) {
                    return createRes({ error: `امتداد الملف (${ext}) غير مسموح به أمنياً.` }, 400);
                }

                if (!r2Bucket) return createRes({ error: 'محرك التخزين السحابي R2 غير متصل' }, 500);

                const safeName = encodeURIComponent(decodedName);
                const r2Key = `files/${c.firm_id}/${c.client_id || 'general'}/${c.id}/${Date.now()}_${safeName}`;
                await r2Bucket.put(r2Key, request.body);

                const docTitle = c.missing_docs_request ? `مستند مطلوب: ${c.missing_docs_request}` : decodedName;
                const fileInserted = await db('mo_files', {
                    method: 'POST',
                    body: JSON.stringify({
                        firm_id: c.firm_id,
                        client_id: c.client_id,
                        case_id: c.id,
                        file_name: docTitle,
                        file_type: 'بينة',
                        file_url: r2Key,
                        drive_file_id: r2Key,
                        is_visible_to_client: true,
                        created_at: getUTCNow().toISOString()
                    })
                });

                await db(`mo_cases?id=eq.${c.id}&firm_id=eq.${c.firm_id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ missing_docs_request: null })
                });

                await db('mo_activity_logs', {
                    method: 'POST',
                    body: JSON.stringify({
                        firm_id: c.firm_id,
                        user_id: null,
                        action_type: 'CREATE',
                        entity_type: 'mo_files',
                        entity_id: fileInserted[0]?.id || c.id,
                        new_data: { file_name: docTitle, _human_log: `قام الموكل برفع المستند المطلوب (${docTitle}) للقضية رقم (${c.case_internal_id || c.id}) عبر بوابة الموكل.` },
                        created_at: getUTCNow().toISOString()
                    })
                }).catch(() => {});

                return createRes({ success: true, r2_key: r2Key, message: 'تم رفع المستند بنجاح وإرساله للمكتب.' });
            }

            // 🛡️ مسار حفظ التوقيع الإلكتروني المُصادق من بوابة الموكل (POST /api/public/client/submit-signature)
            if (path === '/api/public/client/submit-signature' && method === 'POST') {
                const body = await request.json().catch(() => ({}));
                const token = body.token || url.searchParams.get('token')?.trim();
                const signatureData = body.signature_data;

                if (!token || !signatureData || !String(signatureData).startsWith('data:image/')) {
                    return createRes({ error: 'بيانات التوقيع الإلكتروني غير صالحة أو ناقصة.' }, 400);
                }

                const cases = await db(`mo_cases?public_token=eq.${encodeURIComponent(token)}&select=id,firm_id,client_id,case_internal_id,access_pin,access_pin_hash,access_pin_salt,signature_request,is_deleted`).catch(() => []);
                if (!cases.length || cases[0].is_deleted) return createRes({ error: 'القضية غير موجودة' }, 404);
                const c = cases[0];

                const portalAuth = await verifyPortalSession(request, url, token, c);
                if (!portalAuth.valid) {
                    return createRes({ error: portalAuth.error, require_pin: true }, portalAuth.status);
                }

                const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
                const signedAt = getUTCNow().toISOString();

                await db(`mo_cases?id=eq.${c.id}&firm_id=eq.${c.firm_id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({
                        client_signature_data: signatureData,
                        signature_request: null
                    })
                });

                await db('mo_activity_logs', {
                    method: 'POST',
                    body: JSON.stringify({
                        firm_id: c.firm_id,
                        user_id: null,
                        action_type: 'UPDATE',
                        entity_type: 'mo_cases',
                        entity_id: c.id,
                        new_data: {
                            signed_at: signedAt,
                            client_ip: clientIp,
                            _human_log: `قام الموكل بالتوقيع الإلكتروني المُصادق على مستند القضية رقم (${c.case_internal_id || c.id}) من العنوان الرقمي (${clientIp}).`
                        },
                        created_at: signedAt
                    })
                }).catch(() => {});

                return createRes({ success: true, message: 'تم اعتماد وتوثيق التوقيع الإلكتروني بنجاح.' });
            }

            if (path === '/api/public/verify-receipt' && method === 'GET') {
                const id = url.searchParams.get('id');
                if (!id) return createRes({ error: 'معرف الإيصال مفقود' }, 400);
                try {
                    const inst = await db(`mo_installments?id=eq.${encodeURIComponent(id)}&select=id,amount,due_date,status,is_deleted,created_at,mo_cases(case_internal_id,mo_clients(full_name)),mo_firms(firm_name)`);
                    if (!inst || !inst.length || inst[0].is_deleted || inst[0].status !== 'مدفوعة') {
                        return createRes({ error: 'الإيصال غير موجود أو غير مسدد أو تم إلغاؤه' }, 404);
                    }
                    return createRes({ success: true, data: inst[0] });
                } catch (e) { return createRes({ error: 'صيغة المعرف غير صالحة' }, 400); }
            }

            if (path === '/api/public/verify-cv' && method === 'GET') {
                const id = url.searchParams.get('id');
                if (!id) return createRes({ error: 'معرف الموظف مفقود' }, 400);
                try {
                    const user = await db(`mo_users?id=eq.${encodeURIComponent(id)}&is_active=eq.true&select=id,full_name,role,phone,specialization,bar_association_number,syndicate_number,avatar_url,mo_firms(firm_name,firm_phone,firm_address,logo_url)`);
                    if (!user || !user.length) return createRes({ error: 'ملف الموظف غير موجود أو غير نشط' }, 404);
                    return createRes({ success: true, data: user[0] });
                } catch (e) { return createRes({ error: 'صيغة المعرف غير صالحة' }, 400); }
            }

            // ============================================================================
            // [6] مسارات الإدارة العليا (Super Admin Engine)
            // ============================================================================
            if (path.startsWith('/api/super')) {
                const authHeader = request.headers.get('Authorization');
                const session = authHeader ? await verifyToken(authHeader.split(' ')[1]) : null;

                if (!session || session.role !== 'super_admin') return createRes({ error: 'Access Denied: صلاحيات إدارية غير كافية' }, 403);

                let bodyParsed = null;
                if (method === 'POST' || method === 'PATCH') bodyParsed = await request.clone().json().catch(() => ({}));

                if (path === '/api/super/stats' && method === 'GET') {
                    const [firms, users, cases] = await Promise.all([
                        db('mo_firms?select=id', { method: 'GET' }).catch(() => []),
                        db('mo_users?select=id', { method: 'GET' }).catch(() => []),
                        db('mo_cases?select=id', { method: 'GET' }).catch(() => [])
                    ]);
                    return createRes({ firms_count: firms.length || 0, users_count: users.length || 0, cases_count: cases.length || 0 });
                }

                if (path === '/api/super/firms' && method === 'GET') {
                    return createRes(await db('mo_firms?select=*,mo_users(count)', { method: 'GET' }).catch(() => []));
                }

                if (path === '/api/super/firms' && method === 'PATCH') {
                    const updatePayload = {};
                    if (bodyParsed.max_users !== undefined) updatePayload.max_users = bodyParsed.max_users;
                    if (bodyParsed.is_active !== undefined) updatePayload.is_active = bodyParsed.is_active;
                    if (bodyParsed.firm_name !== undefined) updatePayload.firm_name = bodyParsed.firm_name;
                    if (bodyParsed.subscription_end_date !== undefined) updatePayload.subscription_end_date = bodyParsed.subscription_end_date;

                    const res = await db(`mo_firms?id=eq.${encodeURIComponent(bodyParsed.id)}`, {
                        method: 'PATCH',
                        body: JSON.stringify(updatePayload)
                    });

                    if (bodyParsed.is_active === false && env.MOAKKIL_KV) {
                        const firmUsers = await db(`mo_users?firm_id=eq.${encodeURIComponent(bodyParsed.id)}&select=phone`).catch(() => []);
                        for (const fu of firmUsers) {
                            if (fu.phone) await env.MOAKKIL_KV.delete(`session:${fu.phone}`);
                        }
                    }

                    await db('mo_activity_logs', {
                        method: 'POST',
                        body: JSON.stringify({
                            firm_id: bodyParsed.id,
                            user_id: session.uid,
                            action_type: 'UPDATE',
                            entity_type: 'mo_firms',
                            entity_id: bodyParsed.id,
                            new_data: { ...updatePayload, _human_log: `قامت الإدارة العليا بتحديث بيانات واشتراك المكتب.` },
                            created_at: getUTCNow().toISOString()
                        })
                    }).catch(() => {});

                    return createRes(res);
                }

                if (path === '/api/super/renew-firm' && method === 'POST') {
                    const { id, add_months } = bodyParsed;
                    const firmData = await db(`mo_firms?id=eq.${encodeURIComponent(id)}&select=subscription_end_date`).catch(() => []);
                    if (!firmData.length) return createRes({ error: 'المكتب غير موجود' }, 404);

                    let currentEndDate = firmData[0].subscription_end_date ? new Date(firmData[0].subscription_end_date) : getUTCNow();
                    if (currentEndDate < getUTCNow()) currentEndDate = getUTCNow();
                    currentEndDate.setMonth(currentEndDate.getMonth() + parseInt(add_months));

                    const res = await db(`mo_firms?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ subscription_end_date: currentEndDate.toISOString(), is_active: true }) });
                    await db('mo_billing_history', { method: 'POST', body: JSON.stringify({ firm_id: id, action_type: 'تجديد اشتراك', months_added: parseInt(add_months) }) });
                    return createRes({ success: true, data: res });
                }

                if (path === '/api/super/register-firm' && method === 'POST') {
                    const { firm_name, subscription_months, max_users, admin_name, admin_phone, telegram_id } = bodyParsed;
                    const endDate = getUTCNow(); endDate.setMonth(endDate.getMonth() + (parseInt(subscription_months) || 1));
                    const newFirm = await db('mo_firms', { method: 'POST', body: JSON.stringify({ firm_name: firm_name, max_users: parseInt(max_users) || 5, is_active: true, subscription_end_date: endDate.toISOString() }) });
                    await db('mo_billing_history', { method: 'POST', body: JSON.stringify({ firm_id: newFirm[0].id, action_type: 'اشتراك جديد', months_added: parseInt(subscription_months) || 1 }) });
                    await db('mo_users', { method: 'POST', body: JSON.stringify({ firm_id: newFirm[0].id, full_name: admin_name, phone: admin_phone, telegram_id: telegram_id || null, role: 'admin', is_active: true, can_login: true }) });
                    if (telegram_id) await sendTG(telegram_id, `🎊 <b>أهلاً بك في نظام موكّل</b>\n\nتم تسجيل مكتبكم (${safeTG(firm_name)}) بنجاح.\nمدة الاشتراك: <b>${subscription_months} شهر</b>.`);
                    return createRes({ success: true, firm: newFirm[0] });
                }
                return createRes({ error: 'المسار غير موجود' }, 404);
            }

            // ============================================================================
            // [7] جدار الحماية للعمليات الداخلية (Core System API Firewall)
            // ============================================================================
            const authHeader = request.headers.get('Authorization');
            const session = authHeader ? await verifyToken(authHeader.split(' ')[1]) : null;
            if (!session) return createRes({ error: 'الجلسة منتهية أو تم تسجيل الدخول من جهاز آخر' }, 401);

            if (path === '/api/ai/agree' && method === 'GET' && env.AI) {
                if (session.role !== 'admin' && session.role !== 'super_admin') {
                    return createRes({ error: 'هذا المسار مخصص لمدير النظام فقط.' }, 403);
                }
                try {
                    const aiRes = await env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', { prompt: "agree" });
                    return createRes({ success: true, message: "تمت الموافقة بنجاح على شروط Meta! محرك الرؤية يعمل الآن.", response: aiRes });
                } catch (e) { return createRes({ error: e.message }, 500); }
            }

            if (session.role === 'super_admin') return createRes({ error: 'السوبر أدمن يملك صلاحية لمسارات الإدارة العليا فقط' }, 403);

            // التحقق اللحظي من حالة الموظف والمكتب ومزامنة الدور والصلاحيات من قاعدة البيانات
            const activeCheck = await db(`mo_users?id=eq.${encodeURIComponent(session.uid)}&firm_id=eq.${encodeURIComponent(session.firm_id)}&select=is_active,can_login,role,permissions,pin_code,mo_firms(is_active,subscription_end_date)`).catch(() => []);
            if (!activeCheck.length || !activeCheck[0].is_active || !activeCheck[0].can_login || (activeCheck[0].mo_firms && !activeCheck[0].mo_firms.is_active)) {
                if (env.MOAKKIL_KV && session.phone) await env.MOAKKIL_KV.delete(`session:${session.phone}`);
                return createRes({ error: 'تم إيقاف الحساب أو المكتب من قبل الإدارة.' }, 401);
            }
            session.role = activeCheck[0].role;
            session.permissions = activeCheck[0].permissions;
            const userDbPin = activeCheck[0].pin_code || null;

            if (path === '/api/auth/heartbeat' && method === 'POST') {
                await db(`mo_users?id=eq.${encodeURIComponent(session.uid)}`, {
                    method: 'PATCH',
                    body: JSON.stringify({
                        last_status_change: getUTCNow().toISOString(),
                        last_login: getUTCNow().toISOString()
                    })
                }).catch(() => {});
                return createRes({ success: true });
            }

            // طلب رمز تأكيد إجراء حساس عبر تيليغرام (MFA Action OTP Request - مفصول تماماً عن OTP الدخول مع Rate Limit مستقل)
            if (path === '/api/auth/request-action-token' && method === 'POST') {
                if (!env.MOAKKIL_KV) return createRes({ error: 'محرك الجلسات KV غير متصل' }, 500);

                const reqRate = parseInt(await env.MOAKKIL_KV.get(`action_mfa_req_rate:${session.uid}`) || "0");
                if (reqRate >= 5) {
                    return createRes({ error: 'تم تجاوز الحد المسموح لطلب رمز تأكيد الحذف. يرجى الانتظار 10 دقائق.' }, 429);
                }
                await env.MOAKKIL_KV.put(`action_mfa_req_rate:${session.uid}`, (reqRate + 1).toString(), { expirationTtl: 600 });

                const mfaBrute = parseInt(await env.MOAKKIL_KV.get(`action_mfa_brute:${session.uid}`) || "0");
                if (mfaBrute >= 5) {
                    return createRes({ error: 'تم قفل محاولات الحذف مؤقتاً لتجاوز الحد المسموح. يرجى الانتظار 10 دقائق.' }, 429);
                }

                const otp = generateSecureOTP();
                // 🛡️ لا نمسح عداد المحاولات الفاشلة (action_mfa_brute) عند طلب رمز جديد لمنع التخمين اللانهائي
                await env.MOAKKIL_KV.put(`action_mfa:${session.uid}`, otp, { expirationTtl: 300 });

                const uRow = await db(`mo_users?id=eq.${encodeURIComponent(session.uid)}&select=telegram_id,full_name`).catch(() => []);
                if (!uRow.length || !uRow[0].telegram_id) {
                    return createRes({ error: 'حسابك غير مربوط بتيليغرام لاستلام رمز الحذف. يرجى استخدام البصمة أو مراجعة الإدارة.' }, 400);
                }
                await sendTG(uRow[0].telegram_id, `🛡️ <b>رمز تأكيد عملية حذف حساسة</b>\n\nالرمز السري لمرة واحدة:\n<code>${otp}</code>\n\nصالح لمدة 5 دقائق.`);
                return createRes({ success: true, message: 'تم إرسال رمز التأكيد الأمني إلى تيليغرام.' });
            }

            // 🛡️ إصدار تذكرة حذف موقعة لمرة واحدة ومربوطة بالجلسة والعملية والسجل (POST /api/auth/verify-action-mfa)
            if (path === '/api/auth/verify-action-mfa' && method === 'POST') {
                if (!env.MOAKKIL_KV) return createRes({ error: 'محرك الجلسات KV غير متصل' }, 500);

                const mfaBrute = parseInt(await env.MOAKKIL_KV.get(`action_mfa_brute:${session.uid}`) || "0");
                if (mfaBrute >= 5) {
                    return createRes({ error: 'تم تجاوز محاولات التحقق الأمني للحذف. يرجى الانتظار 10 دقائق.' }, 429);
                }

                const body = await request.json().catch(() => ({}));
                const { method: mfaMethod, code, credential_id, authenticatorData, clientDataJSON, signature, target_table, target_id } = body;

                let isVerified = false;

                if (mfaMethod === 'biometric') {
                    const expectedChal = await env.MOAKKIL_KV.get(`webauthn_chal:${session.uid}`);
                    await env.MOAKKIL_KV.delete(`webauthn_chal:${session.uid}`);

                    const creds = await db(`mo_user_credentials?user_id=eq.${encodeURIComponent(session.uid)}&credential_id=eq.${encodeURIComponent(credential_id || '')}&select=id,public_key,counter`).catch(() => []);
                    if (!creds.length || !expectedChal) {
                        await env.MOAKKIL_KV.put(`action_mfa_brute:${session.uid}`, (mfaBrute + 1).toString(), { expirationTtl: 600 });
                        return createRes({ error: 'البصمة غير مسجلة لهذا الحساب أو انتهت صلاحية التحدي الأمني.' }, 401);
                    }

                    const assertionCheck = await verifyWebAuthnAssertion({
                        publicKeyB64: creds[0].public_key,
                        authenticatorDataB64: authenticatorData,
                        clientDataJSONB64: clientDataJSON,
                        signatureB64: signature,
                        expectedChallenge: expectedChal,
                        storedCounter: creds[0].counter || 0,
                        env,
                        requestUrl: request.url
                    });

                    if (!assertionCheck.valid) {
                        await env.MOAKKIL_KV.put(`action_mfa_brute:${session.uid}`, (mfaBrute + 1).toString(), { expirationTtl: 600 });
                        return createRes({ error: assertionCheck.error }, 401);
                    }

                    if (assertionCheck.newCounter) {
                        await db(`mo_user_credentials?id=eq.${creds[0].id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ counter: assertionCheck.newCounter })
                        }).catch(() => {});
                    }
                    isVerified = true;
                } else {
                    const cleanCode = String(code || '').trim();
                    if (cleanCode.length < 4) {
                        return createRes({ error: 'رمز التأكيد غير صالح.' }, 400);
                    }

                    // 1. فحص رمز Action MFA المرسل عبر تيليغرام (مفصول عن OTP الدخول)
                    const kvActionOtp = await env.MOAKKIL_KV.get(`action_mfa:${session.uid}`);
                    if (kvActionOtp && kvActionOtp === cleanCode) {
                        await env.MOAKKIL_KV.delete(`action_mfa:${session.uid}`);
                        isVerified = true;
                    }

                    // 2. فحص PIN الموظف أو PIN الإدارة المضبوط صراحةً (لإصدار تذكرة act_UUID لمرة واحدة فقط)
                    if (!isVerified && userDbPin && String(userDbPin) === cleanCode) {
                        isVerified = true;
                    }
                    if (!isVerified) {
                        const firmRow = await db(`mo_firms?id=eq.${session.firm_id}&select=settings`).catch(() => []);
                        const firmAdminPin = firmRow[0]?.settings?.admin_pin || firmRow[0]?.settings?.security_pin || null;
                        if (firmAdminPin && String(firmAdminPin) === cleanCode) {
                            isVerified = true;
                        }
                    }
                }

                if (!isVerified) {
                    await env.MOAKKIL_KV.put(`action_mfa_brute:${session.uid}`, (mfaBrute + 1).toString(), { expirationTtl: 600 });
                    return createRes({ error: 'رمز المصادقة الثنائية للحذف غير صحيح.' }, 401);
                }

                await env.MOAKKIL_KV.delete(`action_mfa_brute:${session.uid}`);
                const actionTicket = `act_${crypto.randomUUID()}`;
                const actionJti = session.jti || `jti_${crypto.randomUUID()}`;
                await env.MOAKKIL_KV.put(`action_ticket:${actionTicket}`, JSON.stringify({
                    uid: session.uid,
                    firm_id: session.firm_id,
                    jti: actionJti,
                    target_table: target_table || '*',
                    target_id: target_id ? String(target_id).replace('eq.', '') : '*'
                }), { expirationTtl: 90 });
                await env.MOAKKIL_KV.put(`last_action_ticket:${session.uid}`, actionTicket, { expirationTtl: 90 });

                return createRes({ success: true, action_token: actionTicket });
            }

            if (path === '/api/notifications/subscribe' && method === 'POST') {
                const body = await request.json();
                if (!body.endpoint) return createRes({ error: 'Endpoint is required' }, 400);

                const existing = await db(`mo_user_devices?device_token=eq.${encodeURIComponent(body.endpoint)}&select=id`).catch(() => []);
                if (existing && existing.length > 0) {
                    await db(`mo_user_devices?id=eq.${existing[0].id}`, { method: 'PATCH', body: JSON.stringify({ user_id: session.uid, last_active: getUTCNow().toISOString() }) }).catch(() => {});
                } else {
                    await db('mo_user_devices', {
                        method: 'POST',
                        body: JSON.stringify({
                            user_id: session.uid,
                            device_token: body.endpoint,
                            device_type: "web",
                            last_active: getUTCNow().toISOString()
                        })
                    }).catch(() => {});
                }
                return createRes({ success: true });
            }

            // ============================================================================
            // تعارض المصالح وتوليد العقود الذكية
            // ============================================================================
            if ((path === '/api/conflict-check' || path === '/api/check-conflict') && method === 'GET') {
                const name = url.searchParams.get('name');
                if (!name) return createRes({ error: 'يرجى تمرير الاسم للبحث' }, 400);
                const safeName = encodeURIComponent(decodeURIComponent(name).replace(/[*(),]/g, ''));
                const clients = await db(`mo_clients?firm_id=eq.${session.firm_id}&full_name=ilike.*${safeName}*&select=id,full_name,national_id`).catch(() => []);
                const opponents = await db(`mo_cases?firm_id=eq.${session.firm_id}&opponent_name=ilike.*${safeName}*&select=id,case_internal_id,opponent_name`).catch(() => []);
                return createRes({ clients, opponents, has_conflict: (clients.length > 0 || opponents.length > 0) });
            }

            if (path === '/api/contracts/generate' && method === 'POST') {
                const { template_text, client_id, case_id, additional_vars } = await request.json();
                let clientData = {};
                if (client_id) {
                    const c = await db(`mo_clients?id=eq.${encodeURIComponent(client_id)}&firm_id=eq.${session.firm_id}&select=*`).catch(() => []);
                    if (c.length) clientData = c[0];
                }
                const f = await db(`mo_firms?id=eq.${session.firm_id}&select=*`).catch(() => []);
                const firmData = f.length ? f[0] : {};

                let generatedText = template_text || "";
                generatedText = generatedText.replace(/{{client_name}}/g, clientData.full_name || '______________');
                generatedText = generatedText.replace(/{{national_id}}/g, clientData.national_id || '______________');
                generatedText = generatedText.replace(/{{client_phone}}/g, clientData.phone || '______________');
                generatedText = generatedText.replace(/{{client_address}}/g, clientData.address || '______________');
                generatedText = generatedText.replace(/{{firm_name}}/g, firmData.firm_name || '______________');
                generatedText = generatedText.replace(/{{date}}/g, new Date().toISOString().split('T')[0]);

                if (additional_vars) {
                    for (let key in additional_vars) {
                        generatedText = generatedText.replace(new RegExp(`{{${key}}}`, 'g'), additional_vars[key]);
                    }
                }
                return createRes({ success: true, generated_text: generatedText });
            }

            // ============================================================================
            // [8] التخزين السحابي المحمي (Cloudflare R2 Integrations - Ownership & Size Validated)
            // ============================================================================
            // 🛡️ مسار آمن لتزويد الواجهة بالمفتاح العام لإشعارات Web Push دون كشف أي أسرار
            if (path === '/api/vapid-public-key' && method === 'GET') {
                const publicKey = env.VAPID_PUBLIC_KEY || '';
                return createRes({ vapid_public_key: publicKey });
            }

            // 🛡️ مسار الإدارة العليا المنفصل لإدارة المكتبة التشريعية العامة (Super Admin Global Legal Brain)
            if (path.startsWith('/api/admin/legal-brain')) {
                const adminKey = request.headers.get('x-super-admin-key') || '';
                if (!env.SUPER_ADMIN_PASSWORD || adminKey !== env.SUPER_ADMIN_PASSWORD) {
                    return createRes({ error: 'غير مصرح: الوصول للمكتبة العامة مقتصر على الإدارة العليا للنظام.' }, 401);
                }
                if (method === 'GET') {
                    const docs = await db('legal_brain?firm_id=is.null&order=category.asc,title.asc').catch(() => []);
                    return createRes(docs);
                }
                if (method === 'POST') {
                    const docBody = await request.json();
                    docBody.firm_id = null;
                    docBody.is_public = true;
                    const r = await db('legal_brain', { method: 'POST', body: JSON.stringify(docBody) });
                    return createRes(r);
                }
                if (method === 'PATCH') {
                    const docId = url.searchParams.get('id');
                    if (!docId) return createRes({ error: 'معرف المستند مطلوب.' }, 400);
                    const docBody = await request.json();
                    delete docBody.firm_id;
                    docBody.is_public = true;
                    const cleanDocId = docId.replace('eq.', '');
                    const r = await db(`legal_brain?id=eq.${encodeURIComponent(cleanDocId)}&firm_id=is.null`, { method: 'PATCH', body: JSON.stringify(docBody) });
                    return createRes(r);
                }
                if (method === 'DELETE') {
                    const docId = url.searchParams.get('id');
                    if (!docId) return createRes({ error: 'معرف المستند مطلوب.' }, 400);
                    const cleanDocId = docId.replace('eq.', '');
                    await db(`legal_brain?id=eq.${encodeURIComponent(cleanDocId)}&firm_id=is.null`, { method: 'DELETE' });
                    return createRes({ success: true, message: 'تم حذف المستند العام بنجاح.' });
                }
            }

            if (path === '/api/r2/upload' && method === 'POST') {
                const contentLength = parseInt(request.headers.get('content-length') || '0', 10);
                if (contentLength > MAX_R2_UPLOAD_BYTES) {
                    return createRes({ error: 'حجم الملف يتجاوز الحد الأقصى المسموح به (25 ميجابايت).' }, 413);
                }

                const filename = request.headers.get('x-file-name');
                const clientId = decodeURIComponent(request.headers.get('x-client-id') || 'general').replace(/[^a-zA-Z0-9_-]/g, '');
                const caseId = decodeURIComponent(request.headers.get('x-case-id') || 'general').replace(/[^a-zA-Z0-9_-]/g, '');
                const firmId = session.firm_id;

                const decodedName = filename ? decodeURIComponent(filename) : '';
                const ext = decodedName.includes('.') ? decodedName.split('.').pop().toLowerCase() : '';
                if (ext && !ALLOWED_R2_EXTENSIONS.has(ext)) {
                    return createRes({ error: `امتداد الملف (${ext}) غير مسموح به أمنياً.` }, 400);
                }

                const isLogoUpload = (clientId === 'logos' || decodedName.startsWith('firm_logo_'));
                if (isLogoUpload) {
                    if (session.role !== 'admin') {
                        return createRes({ error: 'مرفوض أمنياً: رفع شعار المكتب مقتصر على المدير العام فقط.' }, 403);
                    }
                    if (!ext || !ALLOWED_LOGO_EXTENSIONS.has(ext)) {
                        return createRes({ error: 'مرفوض: يجب أن يكون شعار المكتب بصيغة صورة صالحة (png, jpg, jpeg, webp).' }, 400);
                    }
                    const cleanLogoName = decodedName.startsWith('firm_logo_') ? encodeURIComponent(decodedName) : `firm_logo_${Date.now()}.${ext}`;
                    const logoKey = `files/${firmId}/logos/${cleanLogoName}`;
                    if (!r2Bucket) return createRes({ error: 'R2 غير متصل بالنظام بعد.' }, 500);
                    await r2Bucket.put(logoKey, request.body);
                    return createRes({ success: true, r2_key: logoKey });
                }

                if (clientId && clientId !== 'general' && !clientId.startsWith('temp_')) {
                    const clCheck = await db(`mo_clients?id=eq.${encodeURIComponent(clientId)}&firm_id=eq.${firmId}&select=id`).catch(() => []);
                    if (!clCheck.length) return createRes({ error: 'مرفوض أمنياً: الموكل المحدد لا ينتمي لمكتبك.' }, 403);
                }
                if (caseId && caseId !== 'general' && !caseId.startsWith('temp_')) {
                    const csCheck = await db(`mo_cases?id=eq.${encodeURIComponent(caseId)}&firm_id=eq.${firmId}&select=id,client_id,confidentiality_level,assigned_lawyer_id`).catch(() => []);
                    if (!csCheck.length) return createRes({ error: 'مرفوض أمنياً: القضية المحددة لا تنتمي لمكتبك.' }, 403);
                    if (csCheck[0].confidentiality_level === 'سري' && session.role !== 'admin' && !(csCheck[0].assigned_lawyer_id || []).includes(session.uid)) {
                        return createRes({ error: 'مرفوض أمنياً: لا تملك صلاحية رفع ملفات لهذه القضية السرية.' }, 403);
                    }
                    // 🛡️ مطابقة client_id مع client_id الفعلي للقضية عند تمرير الاثنين معاً
                    if (clientId && clientId !== 'general' && !clientId.startsWith('temp_') && csCheck[0].client_id && String(csCheck[0].client_id) !== String(clientId)) {
                        return createRes({ error: 'مرفوض أمنياً: القضية المحددة لا تتبع للموكل المحدد في طلب الرفع.' }, 403);
                    }
                }

                const safeName = filename ? encodeURIComponent(decodedName) : crypto.randomUUID();
                const r2Key = `files/${firmId}/${clientId || 'general'}/${caseId || 'general'}/${Date.now()}_${safeName}`;

                if (!r2Bucket) return createRes({ error: 'R2 غير متصل بالنظام بعد.' }, 500);

                await r2Bucket.put(r2Key, request.body);
                return createRes({ success: true, r2_key: r2Key });
            }

            // 🛡️ مسار تنظيف الملفات اليتيمة من R2 عند فشل حفظ السجل في mo_files (DELETE /api/r2/orphan)
            if (path === '/api/r2/orphan' && method === 'DELETE') {
                const key = url.searchParams.get('key');
                if (!key || key.includes('..') || !key.startsWith(`files/${session.firm_id}/`)) {
                    return createRes({ error: 'مسار الملف غير صالح أو لا ينتمي لمكتبك.' }, 403);
                }
                // التأكد من عدم وجود سجل مرتبط به في mo_files قبل حذفه من R2
                const linked = await db(`mo_files?firm_id=eq.${session.firm_id}&or=(file_url.eq.${encodeURIComponent(key)},drive_file_id.eq.${encodeURIComponent(key)})&select=id`).catch(() => []);
                if (linked && linked.length > 0) {
                    return createRes({ error: 'لا يمكن حذف هذا الملف من مسار التنظيف لأنه مرتبط بسجل فعلي في الأرشيف.' }, 409);
                }
                if (r2Bucket) {
                    await r2Bucket.delete(key).catch(() => {});
                }
                return createRes({ success: true, message: 'تم تنظيف الملف السحابي اليتيم بنجاح.' });
            }

            if (path === '/api/r2/download' && method === 'GET') {
                const key = url.searchParams.get('key');

                if (!key || key.includes('..') || !key.startsWith(`files/${session.firm_id}/`)) {
                    return createRes({ error: 'غير مصرح للوصول لهذا الملف' }, 403);
                }

                const parts = key.split('/');
                const clientFolder = parts[2];
                const caseId = parts[3];

                // 🛡️ إغلاق فجوة المسار الداخلي: اشتراط وجود سجل فعلي غير محذوف في mo_files أو mo_users (إلا إذا كان شعار المكتب)
                const isFirmLogo = /^files\/[a-zA-Z0-9_-]+\/logos\/firm_logo_/.test(key);
                const isHrAsset = (clientFolder === 'HR' && (caseId === 'Avatars' || caseId === 'Docs'));

                if (!isFirmLogo) {
                    let isRegisteredFile = false;
                    if (isHrAsset) {
                        const staffList = await db(`mo_users?firm_id=eq.${session.firm_id}&select=id,avatar_url,staff_documents`).catch(() => []);
                        isRegisteredFile = (staffList || []).some(u =>
                            u.avatar_url === key ||
                            (Array.isArray(u.staff_documents) && u.staff_documents.some(d => d && d.url === key))
                        );
                    } else {
                        const fileRecs = await db(`mo_files?firm_id=eq.${session.firm_id}&or=(file_url.eq.${encodeURIComponent(key)},drive_file_id.eq.${encodeURIComponent(key)})&select=id,case_id,client_id,is_deleted`).catch(() => []);
                        isRegisteredFile = !!(fileRecs && fileRecs.length > 0 && !fileRecs[0].is_deleted);
                    }
                    if (!isRegisteredFile) {
                        return createRes({ error: 'مرفوض أمنياً: هذا الملف غير مسجل في أرشيف المكتب أو تم حذفه.' }, 404);
                    }
                }

                if (!isFirmLogo && !isHrAsset && caseId && caseId !== 'general') {
                    const caseCheck = await db(`mo_cases?id=eq.${encodeURIComponent(caseId)}&firm_id=eq.${session.firm_id}&select=id,confidentiality_level,assigned_lawyer_id,is_deleted`).catch(() => []);
                    // رفض التحميل فوراً إذا لم يُعثر على القضية المرجعية
                    if (!caseCheck.length || caseCheck[0].is_deleted) {
                        return createRes({ error: 'مرفوض أمنياً: القضية المرجعية لهذا الملف غير موجودة.' }, 404);
                    }
                    const cInfo = caseCheck[0];
                    if (cInfo.confidentiality_level === 'سري' && session.role !== 'admin' && session.role !== 'super_admin') {
                        if (!cInfo.assigned_lawyer_id || !cInfo.assigned_lawyer_id.includes(session.uid)) {
                            return createRes({ error: 'مرفوض: هذا الملف يتبع لقضية سرية لست مخولاً بالاطلاع عليها.' }, 403);
                        }
                    }
                }

                if (!r2Bucket) return createRes({ error: 'R2 غير متصل بالنظام بعد.' }, 500);

                const obj = await r2Bucket.get(key);
                if (!obj) return createRes({ error: 'الملف غير موجود في التخزين' }, 404);

                const headers = new Headers();
                obj.writeHttpMetadata(headers);
                headers.set('etag', obj.httpEtag);

                const originalName = decodeURIComponent(parts.slice(4).join('_') || 'document');

                headers.set('Content-Disposition', `inline; filename="${encodeURIComponent(originalName)}"`);
                Object.keys(corsHeaders).forEach(k => headers.set(k, corsHeaders[k]));

                return new Response(obj.body, { headers });
            }

            // ============================================================================
            // [9] محركات الذكاء الاصطناعي والصياغة القانونية (AI & RAG Engine - Llama 3.3 & Vision)
            // ============================================================================
            const TEXT_LLM_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
            const VISION_LLM_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';

            const runTextLLM = async (messages, temp = 0.3, maxTokens = 2000) => {
                try {
                    const res = await env.AI.run(TEXT_LLM_MODEL, { messages, temperature: temp, max_tokens: maxTokens });
                    return res.response;
                } catch (err) {
                    const fallback = await env.AI.run(VISION_LLM_MODEL, { messages, temperature: temp, max_tokens: maxTokens });
                    return fallback.response;
                }
            };

            if (path === '/api/ai/cross-case' && method === 'POST' && env.AI) {
                try {
                    const { case_id, facts } = await request.json();
                    if (!facts) return createRes({ error: 'نص الوقائع غير موجود' }, 400);

                    const embeddingRes = await env.AI.run('@cf/baai/bge-m3', { text: [facts] });
                    const vector = embeddingRes.data[0];

                    const similarCases = await db('rpc/match_cases', {
                        method: 'POST',
                        body: JSON.stringify({ query_embedding: vector, match_threshold: 0.55, match_count: 3, p_firm_id: session.firm_id })
                    }).catch(() => []);

                    if (!similarCases || similarCases.length === 0) {
                        return createRes({ recommendation: "لا توجد سوابق مشابهة بشكل كافٍ في أرشيف المكتب لاستخلاص استراتيجية منها. سيقوم النظام بفهرسة القضايا تلقائياً عند حفظ وقائعها.", similar_cases: [] });
                    }

                    const contextText = similarCases.map((c, i) => `سابقة رقم ${i + 1} (ملف ${c.case_internal_id}):\nالوقائع: ${c.lawsuit_facts}\nالدفاع/الأسانيد: ${c.legal_basis}\nالنتيجة: ${c.case_outcome || 'غير محدد'}`).join('\n\n');

                    const prompt = `أنت كبير المستشارين في مكتب المحاماة. قضيتنا الجديدة وقائعها كالتالي:\n"${facts}"\n\nوهذه سوابق مشابهة من أرشيف مكتبنا:\n${contextText}\n\nاستخلص استراتيجية دفاع مركزة وناجحة لهذه القضية الجديدة بناءً على السوابق، واذكر الدفوع التي نجحت في الماضي. لا تكتب أي مقدمات حوارية.`;

                    const replyText = await runTextLLM([
                        { role: "system", content: "أنت محامي نقض استراتيجي خبير في القوانين الأردنية." },
                        { role: "user", content: prompt }
                    ], 0.3, 1800);

                    return createRes({ recommendation: replyText, similar_cases: similarCases });
                } catch (e) { return createRes({ error: 'خطأ في المحرك الذكي: ' + e.message }, 500); }
            }

            if (path === '/api/ai/ocr' && method === 'POST' && env.AI) {
                try {
                    const requestData = await request.json();

                    if (requestData.is_text_extracted === true && requestData.file_type === 'pdf') {
                        const extractedText = requestData.payload;
                        const summaryText = await runTextLLM([
                            {
                                role: "system",
                                content: "أنت محامي خبير. قم بقراءة هذا النص القانوني المستخرج وقدم ملخصاً دقيقاً وموجزاً لأهم ما جاء فيه باللغة العربية. لا تضف أي مقدمات."
                            },
                            { role: "user", content: extractedText.substring(0, 6000) }
                        ], 0.3, 1500);
                        return createRes(summaryText);
                    }
                    else if (requestData.image_base_64 || (requestData.file_type === 'image' && requestData.payload)) {
                        const base64Data = requestData.image_base_64 || requestData.payload;
                        const binaryString = atob(base64Data);
                        const bytes = new Uint8Array(binaryString.length);
                        for (let i = 0; i < binaryString.length; i++) {
                            bytes[i] = binaryString.charCodeAt(i);
                        }

                        const promptMessage = requestData.is_id_card ?
                            `أنت خبير في قراءة الهويات والمستندات الرسمية الأردنية. اقرأ الصورة المرفقة بدقة واستخرج منها "الاسم الرباعي" و "الرقم الوطني".
أعد النتيجة بصيغة JSON حصرية تحتوي فقط على المفتاحين: "full_name" و "national_id".` :
                            `أنت محامي خبير.
اقرأ هذه الصورة المرفقة واستخرج النص الموجود فيها، ثم قدم ملخصاً قانونياً موجزاً لمعناها باللغة العربية. لا تكتب أي مقدمات.`;

                        const aiRes = await env.AI.run(VISION_LLM_MODEL, {
                            prompt: promptMessage,
                            image: [...bytes],
                            temperature: 0.3,
                            repetition_penalty: 1.18,
                            max_tokens: 1000
                        });

                        if (requestData.is_id_card) {
                            const match = aiRes.response.match(/\{[\s\S]*\}/);
                            const jsonStr = match ? match[0] : "{}";
                            return createRes(JSON.parse(jsonStr));
                        } else {
                            return createRes(aiRes.response);
                        }
                    } else {
                        return createRes({ error: 'لم يتم استلام نص أو صورة صالحة للمعالجة.' }, 400);
                    }

                } catch (e) {
                    return createRes({ error: 'حدث خطأ في محرك الذكاء الاصطناعي: ' + e.message }, 500);
                }
            }

            if (path === '/api/ai/process' && method === 'POST' && env.AI) {
                try {
                    const body = await request.json();
                    const { type, content, history } = body;

                    let queryText = "";
                    if (typeof content === 'string') {
                        queryText = content;
                    } else if (history && Array.isArray(history) && history.length > 0) {
                        queryText = history[history.length - 1].content;
                    } else if (type === 'auto_draft' && content && content.case_facts) {
                        queryText = content.case_facts;
                    }

                    let legalContext = "";
                    if (queryText && (type === 'legal_advisor' || type === 'deep_legal_analysis' || type === 'auto_draft')) {
                        try {
                            const embeddingResponse = await env.AI.run('@cf/baai/bge-m3', { text: [queryText] });
                            const vector = embeddingResponse.data[0];

                            // 🛡️ تمرير p_firm_id صراحةً إلى search_legal_brain لضمان العزل داخل SQL
                            const searchRes = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/search_legal_brain`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'apikey': env.SUPABASE_SERVICE_KEY,
                                    'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`
                                },
                                body: JSON.stringify({
                                    query_embedding: vector,
                                    match_threshold: 0.5,
                                    match_count: 5,
                                    p_firm_id: session.firm_id
                                })
                            });

                            if (searchRes.ok) {
                                const legalDocs = await searchRes.json();
                                if (legalDocs && legalDocs.length > 0) {
                                    const safeDocs = legalDocs.filter(doc => !doc.firm_id || String(doc.firm_id) === String(session.firm_id));
                                    legalContext = safeDocs.map(doc => `[${doc.category} - المادة ${doc.article_number}]: ${doc.original_text}`).join('\n\n');
                                }
                            }
                        } catch (ragError) {
                            console.error("[RAG Error]:", ragError);
                        }
                    }

                    if (type === 'legal_advisor' || type === 'deep_legal_analysis') {
                        let systemPrompt = "";
                        if (type === 'deep_legal_analysis') {
                            systemPrompt = `أنت قاضٍ محنك ومحامي نقض أردني ذو خبرة استثنائية. 
مهمتك هي تحليل الوقائع واستخراج الثغرات القانونية، والدفوع الشكلية والموضوعية بدقة متناهية وفق التشريعات الأردنية واجتهادات محكمة التمييز.
ابحث عن التناقضات، وقدم استراتيجية تضمن كسب القضية.
النصوص القانونية المستخرجة من العقل القانوني (السياق الملزم):
${legalContext ? legalContext : "استند إلى القواعد العامة في القانون المدني وأصول المحاكمات الأردني."}`;
                        } else {
                            systemPrompt = `أنت مستشار قانوني أردني ومحامي متمرس. لغتك العربية فصحى، رصينة، وقانونية بحتة. يمنع استخدام اللغة الإنجليزية أو كتابة أي مقدمات حوارية.
النصوص القانونية للاستئناس (السياق الملزم):
${legalContext}`;
                        }

                        let messages = [{ role: "system", content: systemPrompt }];

                        if (history && Array.isArray(history) && history.length > 0) {
                            const validHistory = history.filter(msg => msg.role && msg.content);
                            messages.push(...validHistory);
                        } else if (content) {
                            messages.push({ role: "user", content: typeof content === 'string' ? content : JSON.stringify(content) });
                        }

                        const replyText = await runTextLLM(messages, 0.35, 2500);
                        return createRes({ reply: replyText, rag_applied: !!legalContext });
                    }

                    if (type === 'auto_draft') {
                        const { case_facts, similar_cases } = content;
                        const prompt = `أنت محامي أردني خبير تقوم بصياغة مذكرة قانونية رصينة لتقديمها للمحكمة.
الوقائع الحالية للقضية: ${case_facts}
السوابق والتشريعات للاستئناس: ${similar_cases || ''}
${legalContext ? `النصوص التشريعية ذات الصلة:\n${legalContext}` : ''}
تعليمات: صغ المذكرة باللغة العربية الفصحى فقط، مقسمة بوضوح إلى (الوقائع، الأسانيد القانونية، والطلبات الختامية).
لا تكتب أي مقدمات مثل "إليك المذكرة". ابدأ فوراً بصيغة اللائحة الرسمية.`;

                        const draftText = await runTextLLM([
                            { role: "system", content: "أنت خبير قانوني أردني في صياغة اللوائح والمذكرات القضائية." },
                            { role: "user", content: prompt }
                        ], 0.35, 2500);
                        return createRes({ draft: draftText });
                    }

                    if (type === 'data_extractor') {
                        const rawResponse = await runTextLLM([
                            {
                                role: "system",
                                content: `أنت خبير قانوني أردني. استخرج البيانات من النص ونظمها في كائن JSON صالح فقط بدون أي نص خارجه. يجب أن تكون القيم باللغة العربية. المفاتيح المطلوبة: "lawsuit_facts", "legal_basis", "final_requests" (مصفوفة), "opponent_name", "claim_amount", "next_hearing_date" (بصيغة YYYY-MM-DD إن وجد).`
                            },
                            { role: "user", content: typeof content === 'string' ? content : JSON.stringify(content) }
                        ], 0.1, 2000);
                        try {
                            const match = rawResponse.match(/\{[\s\S]*\}/);
                            const jsonStr = match ? match[0] : "{}";
                            return createRes({ extracted_json: JSON.parse(jsonStr) });
                        } catch (e) {
                            return createRes({ extracted_json: rawResponse });
                        }
                    }

                    return createRes({ error: 'نوع المعالجة غير مدعوم' }, 400);

                } catch (e) {
                    return createRes({ error: 'حدث خطأ في محرك الذكاء الاصطناعي: ' + e.message }, 500);
                }
            }

            // ============================================================================
            // [10] محرك البحث الدلالي والعميق (Semantic Search)
            // ============================================================================
            if (path === '/api/search' && method === 'GET') {
                const rawQ = url.searchParams.get('q') || '';
                const safeQ = rawQ.replace(/[*(),]/g, '').trim();
                if (!safeQ || safeQ.length < 2) return createRes({ cases: [], clients: [], files: [], brain: [] });

                const encodedSearch = encodeURIComponent(safeQ);
                const requestAi = url.searchParams.get('ai') === 'true';

                let brainResults = [];
                if (requestAi && env.AI) {
                    try {
                        const embeddingRes = await env.AI.run('@cf/baai/bge-m3', { text: [safeQ] });
                        const vector = embeddingRes?.data?.[0];
                        if (vector) {
                            const rawBrain = await db('rpc/search_legal_brain', {
                                method: 'POST',
                                body: JSON.stringify({
                                    query_embedding: vector,
                                    match_threshold: 0.65,
                                    match_count: 5,
                                    p_firm_id: session.firm_id
                                })
                            }).catch(() => []);
                            brainResults = (rawBrain || []).filter(doc => !doc.firm_id || String(doc.firm_id) === String(session.firm_id));
                        }
                    } catch (e) { console.error("Embedding Error:", e); }
                } else {
                    // بحث نصي فوري في العقل القانوني بدون استدعاء نموذج AI مكلف في كل ضربة زر
                    const rawBrain = await db(`legal_brain?or=(title.ilike.*${encodedSearch}*,category.ilike.*${encodedSearch}*)&select=id,firm_id,title,category,article_number,original_text&limit=3`).catch(() => []);
                    brainResults = (rawBrain || []).filter(doc => !doc.firm_id || String(doc.firm_id) === String(session.firm_id));
                }

                // 1. استعلام القضايا مع تحديد الحقول المطلوبة خفيفاً ودون تكرار معامل or
                const caseQuery = `mo_cases?firm_id=eq.${session.firm_id}&is_deleted=eq.false&or=(case_internal_id.ilike.*${encodedSearch}*,opponent_name.ilike.*${encodedSearch}*,current_court.ilike.*${encodedSearch}*)&select=id,case_internal_id,opponent_name,status,confidentiality_level,assigned_lawyer_id,is_deleted&limit=10`;
                let rawCases = await db(caseQuery).catch(() => []);

                // فلترة القضايا السرية في الذاكرة لغير المدراء بدقة لمنع كسر استعلام PostgREST
                let filteredCases = (rawCases || []).filter(c => {
                    if (session.role === 'admin' || session.role === 'super_admin') return true;
                    if (c.confidentiality_level === 'سري') {
                        return Array.isArray(c.assigned_lawyer_id) && c.assigned_lawyer_id.includes(session.uid);
                    }
                    return true;
                }).slice(0, 5);

                // 2. استعلام الموكلين مع تحديد الحقول المطلوبة
                const clientQuery = `mo_clients?firm_id=eq.${session.firm_id}&is_deleted=eq.false&or=(full_name.ilike.*${encodedSearch}*,national_id.ilike.*${encodedSearch}*,phone.ilike.*${encodedSearch}*)&select=id,full_name,phone,national_id,confidentiality_level,is_deleted&limit=10`;
                let rawClients = await db(clientQuery).catch(() => []);

                // فلترة الموكلين السريين في الذاكرة لغير المدراء
                let filteredClients = rawClients;
                if (session.role !== 'admin' && session.role !== 'super_admin') {
                    const myCases = await db(`mo_cases?firm_id=eq.${session.firm_id}&assigned_lawyer_id=cs.{${session.uid}}&select=client_id`).catch(() => []);
                    const myClientIds = new Set((myCases || []).map(c => c.client_id).filter(Boolean));
                    filteredClients = (rawClients || []).filter(cl => {
                        if (cl.confidentiality_level === 'سري') {
                            return myClientIds.has(cl.id);
                        }
                        return true;
                    });
                }
                filteredClients = (filteredClients || []).slice(0, 5);

                // 3. استعلام المستندات والأرشيف (mo_files)
                const fileQuery = `mo_files?firm_id=eq.${session.firm_id}&or=(file_name.ilike.*${encodedSearch}*,display_desc.ilike.*${encodedSearch}*)&select=id,file_name,file_type,file_url,display_desc,case_id,client_id&limit=5`;
                const rawFiles = await db(fileQuery).catch(() => []);

                return createRes({
                    cases: filteredCases,
                    clients: filteredClients,
                    files: rawFiles || [],
                    brain: brainResults
                });
            }

            // ============================================================================
            // [11] المحرك الديناميكي (Dynamic CRUD) ونظام المزامنة والرقابة (Offline Sync & Audit)
            // ============================================================================
            const routeMap = {
                '/api/clients': 'mo_clients', '/api/cases': 'mo_cases', '/api/users': 'mo_users',
                '/api/installments': 'mo_installments', '/api/updates': 'mo_case_updates',
                '/api/appointments': 'mo_appointments', '/api/hearings': 'mo_appointments',
                '/api/tasks': 'mo_appointments', '/api/files': 'mo_files',
                '/api/notifications': 'mo_notifications', '/api/expenses': 'mo_expenses',
                '/api/firms': 'mo_firms', '/api/history': 'mo_activity_logs',
                '/api/legal_brain': 'legal_brain'
            };

            // 🛡️ التحقق الخادمي الصارم للمصادقة الثنائية عند الحذف (حصرياً تذكرة act_UUID لمرة واحدة مربوطة بالجلسة والعملية والسجل)
            const verifyActionToken = async (rawToken, targetTable = '*', targetId = '*') => {
                if (!rawToken || typeof rawToken !== 'string') {
                    return { valid: false, error: 'مطلوب تذكرة مصادقة ثنائية صالحة لمرة واحدة (act_UUID) لإتمام عملية الحذف.' };
                }
                const tokenVal = rawToken.trim();
                if (!tokenVal.startsWith('act_') || tokenVal.length < 20) {
                    return { valid: false, error: 'مرفوض أمنياً: عمليات الحذف تقبل حصرياً تذاكر الحذف الموقعة لمرة واحدة (act_UUID) الصادرة من /api/auth/verify-action-mfa.' };
                }

                if (!env.MOAKKIL_KV) {
                    return { valid: false, error: 'محرك التحقق السحابي KV غير متصل.' };
                }

                const mfaBrute = parseInt(await env.MOAKKIL_KV.get(`action_mfa_brute:${session.uid}`) || "0");
                if (mfaBrute >= 5) {
                    return { valid: false, error: 'تم تجاوز محاولات إدخال رمز تأكيد الحذف. يرجى الانتظار 10 دقائق.' };
                }

                const ticketRaw = await env.MOAKKIL_KV.get(`action_ticket:${tokenVal}`);
                if (!ticketRaw) {
                    await env.MOAKKIL_KV.put(`action_mfa_brute:${session.uid}`, (mfaBrute + 1).toString(), { expirationTtl: 600 });
                    return { valid: false, error: 'تذكرة الحذف منتهية الصلاحية أو تم استهلاكها مسبقاً.' };
                }
                // استهلاك التذكرة فوراً لضمان عدم إعادة استخدامها (One-Time Use)
                await env.MOAKKIL_KV.delete(`action_ticket:${tokenVal}`);
                await env.MOAKKIL_KV.delete(`last_action_ticket:${session.uid}`);

                let ticket = null;
                try { ticket = JSON.parse(ticketRaw); } catch (e) { return { valid: false, error: 'تذكرة الحذف تالفة.' }; }

                if (String(ticket.uid) !== String(session.uid) || String(ticket.firm_id) !== String(session.firm_id)) {
                    return { valid: false, error: 'تذكرة الحذف لا تطابق هوية المستخدم أو المكتب الحالي.' };
                }
                // 🛡️ التحقق الإلزامي الصارم من وجود وتطابق معرف الجلسة (jti) لمنع أي تجاوز عند غياب الحقل
                if (!ticket.jti || !session.jti || String(ticket.jti) !== String(session.jti)) {
                    return { valid: false, error: 'تذكرة الحذف غير مربوطة بجلسة صالحة أو صدرت في جلسة سابقة/أخرى.' };
                }
                if (!ticket.target_table || ticket.target_table === '*' || (targetTable !== '*' && ticket.target_table !== targetTable)) {
                    return { valid: false, error: 'تذكرة الحذف غير مربوطة بجدول محدد أو مخصصة لجدول آخر.' };
                }
                const cleanTargetId = String(targetId || '*').replace('eq.', '');
                if (!ticket.target_id || ticket.target_id === '*' || (cleanTargetId !== '*' && String(ticket.target_id) !== cleanTargetId)) {
                    return { valid: false, error: 'تذكرة الحذف غير مربوطة بسجل محدد أو مخصصة لسجل آخر.' };
                }

                await env.MOAKKIL_KV.delete(`action_mfa_brute:${session.uid}`);
                return { valid: true };
            };

            // 🛡️ منع ربط سجلات مكتب بسجلات مكتب آخر (Cross-Tenant Reference Validation) لجميع العلاقات
            const validateCrossTenantReferences = async (table, bodyObj) => {
                if (!bodyObj || typeof bodyObj !== 'object') return { valid: true };

                // 1. فحص client_id
                let verifiedClientId = null;
                if (bodyObj.client_id && !String(bodyObj.client_id).startsWith('temp_')) {
                    const cl = await db(`mo_clients?id=eq.${encodeURIComponent(bodyObj.client_id)}&firm_id=eq.${session.firm_id}&select=id,confidentiality_level`).catch(() => []);
                    if (!cl.length) {
                        return { valid: false, status: 403, error: 'مرفوض أمنياً: الموكل المرجعي لا ينتمي لمكتبك.' };
                    }
                    verifiedClientId = String(cl[0].id);
                }

                // 2.1 فحص مستلم الإشعار user_id للتأكد من انتمائه لنفس المكتب (منع إرسال إشعارات خارج المكتب)
                if (table === 'mo_notifications' && bodyObj.user_id) {
                    const targetUser = await db(`mo_users?id=eq.${encodeURIComponent(bodyObj.user_id)}&firm_id=eq.${session.firm_id}&select=id`).catch(() => []);
                    if (!targetUser.length) {
                        return { valid: false, status: 403, error: 'مرفوض أمنياً: المستلم المحدد للإشعار لا ينتمي لمكتبك.' };
                    }
                }

                // 2. فحص جميع حقول ربط القضايا الفردية (case_id, related_case_id, parent_case_id) بشكل مستقل ومطابقة الموكل
                const caseFields = ['case_id', 'related_case_id', 'parent_case_id'];
                for (const cField of caseFields) {
                    const refCaseId = bodyObj[cField];
                    if (refCaseId && !String(refCaseId).startsWith('temp_')) {
                        const cs = await db(`mo_cases?id=eq.${encodeURIComponent(refCaseId)}&firm_id=eq.${session.firm_id}&select=id,client_id,confidentiality_level,assigned_lawyer_id`).catch(() => []);
                        if (!cs.length) {
                            return { valid: false, status: 403, error: `مرفوض أمنياً: القضية المرجعية (${cField}) لا تنتمي لمكتبك.` };
                        }
                        if (cs[0].confidentiality_level === 'سري' && session.role !== 'admin' && session.role !== 'super_admin') {
                            if (!Array.isArray(cs[0].assigned_lawyer_id) || !cs[0].assigned_lawyer_id.includes(session.uid)) {
                                return { valid: false, status: 403, error: 'مرفوض أمنياً: لا تملك صلاحية إضافة أو ربط سجلات بهذه القضية السرية.' };
                            }
                        }
                        // مطابقة الموكل مع القضية عند إرسالهما معاً في الجداول الفرعية
                        if ((cField === 'case_id' || cField === 'related_case_id') && verifiedClientId && cs[0].client_id && String(cs[0].client_id) !== verifiedClientId) {
                            return { valid: false, status: 403, error: 'مرفوض أمنياً: القضية المرجعية لا تتبع للموكل المحدد في نفس السجل.' };
                        }
                    }
                }

                // 3. فحص مصفوفة القضايا المرتبطة (related_cases_ids في mo_cases)
                if (Array.isArray(bodyObj.related_cases_ids) && bodyObj.related_cases_ids.length > 0) {
                    const cleanCaseIds = [...new Set(bodyObj.related_cases_ids.filter(id => id && !String(id).startsWith('temp_')).map(id => encodeURIComponent(String(id))))];
                    if (cleanCaseIds.length > 0) {
                        const validCases = await db(`mo_cases?firm_id=eq.${session.firm_id}&id=in.(${cleanCaseIds.join(',')})&select=id`).catch(() => []);
                        if (validCases.length !== cleanCaseIds.length) {
                            return { valid: false, status: 403, error: 'مرفوض أمنياً: إحدى القضايا المرتبطة في (related_cases_ids) لا تنتمي لمكتبك.' };
                        }
                    }
                }

                // 4. فحص قوائم الموظفين والمحامين المسندين (assigned_lawyer_id و assigned_to عندما تكون مصفوفة)
                for (const arrField of ['assigned_lawyer_id', 'assigned_to']) {
                    const lawyersArray = bodyObj[arrField];
                    if (Array.isArray(lawyersArray) && lawyersArray.length > 0) {
                        const cleanIds = [...new Set(lawyersArray.filter(id => id && !String(id).startsWith('temp_')).map(id => encodeURIComponent(String(id))))];
                        if (cleanIds.length > 0) {
                            const validUsers = await db(`mo_users?firm_id=eq.${session.firm_id}&id=in.(${cleanIds.join(',')})&select=id`).catch(() => []);
                            if (validUsers.length !== cleanIds.length) {
                                return { valid: false, status: 403, error: `مرفوض أمنياً: أحد الموظفين في (${arrField}) لا ينتمي لمكتبك.` };
                            }
                        }
                    }
                }

                // 5. فحص جميع حقول المستخدمين الفردية في المخطط (user_id, created_by, added_by, uploaded_by, staff_id, assigned_to الفردي)
                const singleUserFields = ['user_id', 'created_by', 'added_by', 'uploaded_by', 'staff_id', 'assigned_to'];
                for (const uField of singleUserFields) {
                    const refUserId = bodyObj[uField];
                    if (refUserId && !Array.isArray(refUserId) && typeof refUserId === 'string' && !refUserId.startsWith('temp_')) {
                        const uCheck = await db(`mo_users?id=eq.${encodeURIComponent(refUserId)}&firm_id=eq.${session.firm_id}&select=id`).catch(() => []);
                        if (!uCheck.length) {
                            return { valid: false, status: 403, error: `مرفوض أمنياً: المستخدم المرجعي (${uField}) لا ينتمي لمكتبك.` };
                        }
                    }
                }

                return { valid: true };
            };

            // 🛡️ دالة فحص السرية للجداول الفرعية وسجل النشاط
            const filterOutConfidentialSubRecords = async (table, rows) => {
                if (!Array.isArray(rows) || rows.length === 0 || session.role === 'admin' || session.role === 'super_admin') {
                    return rows;
                }
                if (!['mo_case_updates', 'mo_files', 'mo_installments', 'mo_expenses', 'mo_appointments', 'mo_activity_logs'].includes(table)) {
                    return rows;
                }
                const secretCases = await db(`mo_cases?firm_id=eq.${session.firm_id}&confidentiality_level=eq.سري&select=id,assigned_lawyer_id`).catch(() => []);
                if (!secretCases || secretCases.length === 0) return rows;

                const forbiddenCaseIds = new Set(
                    secretCases
                        .filter(sc => !Array.isArray(sc.assigned_lawyer_id) || !sc.assigned_lawyer_id.includes(session.uid))
                        .map(sc => String(sc.id))
                );
                if (forbiddenCaseIds.size === 0) return rows;

                return rows.filter(r => {
                    const linkedCaseId = r.case_id || r.related_case_id || (table === 'mo_activity_logs' && r.entity_type === 'mo_cases' ? r.entity_id : null);
                    if (linkedCaseId && forbiddenCaseIds.has(String(linkedCaseId))) return false;
                    return true;
                });
            };

            // 🛡️ دالة التحقق من صلاحيات الكتابة والمالية وتنظيف الحقول الحساسة (RBAC & Field Whitelisting)
            const validateAndSanitizeWrite = (httpMethod, table, bodyObj, targetCleanId = null) => {
                if (table === 'mo_activity_logs') {
                    return { allowed: false, status: 403, error: 'مرفوض أمنياً: سجل الرقابة محمي للقراءة فقط ولا يمكن تعديله أو حذفه.' };
                }

                // السماح لمدير المكتب أو المخولين بإضافة وتعديل قوالب المكتبة السحابية الخاصة بالمكتب في legal_brain
                if (table === 'legal_brain') {
                    if (session.role !== 'admin' && session.permissions?.can_edit !== true) {
                        return { allowed: false, status: 403, error: 'مرفوض: لا تملك صلاحية تعديل المكتبة القانونية.' };
                    }
                }

                // فرض صلاحية المالية (can_finance) خادمياً على المقبوضات والمصروفات
                if ((table === 'mo_installments' || table === 'mo_expenses') && session.role !== 'admin' && session.role !== 'super_admin') {
                    if (session.permissions && session.permissions.can_finance === false) {
                        return { allowed: false, status: 403, error: 'مرفوض أمنياً: لا تملك صلاحية تنفيذ عمليات مالية (can_finance).' };
                    }
                }

                if (httpMethod === 'PATCH') {
                    for (const sysField of IMMUTABLE_SYSTEM_FIELDS) {
                        delete bodyObj[sysField];
                    }
                    delete bodyObj.is_deleted;
                }

                if (table === 'mo_firms') {
                    if (httpMethod !== 'PATCH') {
                        return { allowed: false, status: 403, error: 'مرفوض: لا يمكن إنشاء أو حذف مكتب من هذا المسار.' };
                    }
                    if (session.role !== 'admin') {
                        return { allowed: false, status: 403, error: 'مرفوض: تعديل إعدادات المكتب مقتصر على المدير العام فقط.' };
                    }
                    for (const f of PROTECTED_FIRM_BILLING_FIELDS) {
                        delete bodyObj[f];
                    }
                }

                if (table === 'mo_users') {
                    if (httpMethod === 'POST' && session.role !== 'admin') {
                        return { allowed: false, status: 403, error: 'مرفوض: إضافة موظفين جدد مقتصرة على مدير المكتب فقط.' };
                    }
                    if (httpMethod === 'PATCH') {
                        if (session.role !== 'admin') {
                            if (String(targetCleanId) !== String(session.uid)) {
                                return { allowed: false, status: 403, error: 'مرفوض: لا يمكنك تعديل بيانات موظف آخر.' };
                            }
                            for (const f of PROTECTED_USER_FIELDS_FOR_STAFF) {
                                delete bodyObj[f];
                            }
                        } else {
                            if (bodyObj.role === 'super_admin') bodyObj.role = 'admin';
                            delete bodyObj.firm_id;
                        }
                    }
                    if (httpMethod === 'POST' && bodyObj.role === 'super_admin') {
                        bodyObj.role = 'admin';
                    }
                }

                return { allowed: true };
            };

            const triggerSmartNotifications = async (httpMethod, tableName, reqBody, entityId, oldData, isBulkSync = false) => {
                try {
                    if (tableName === 'mo_notifications' || tableName === 'mo_activity_logs') return;

                    let notifyIds = [];
                    let entityName = "سجل";
                    const safeBody = reqBody || {};
                    let itemDesc = safeBody.title || oldData?.title || safeBody.case_internal_id || oldData?.case_internal_id || safeBody.full_name || oldData?.full_name || safeBody.update_title || oldData?.update_title || safeBody.file_name || oldData?.file_name || safeBody.firm_name || oldData?.firm_name || "";
                    let link = '/app.html';
                    let tgMsgToAssigned = null;
                    let tgMsgToClient = null;
                    let tgMsgToAdmin = null;
                    let actionDetails = "";
                    let changes = [];

                    const nowIso = getUTCNow().toISOString();
                    const exactTimeAR = formatDateTimeAR(nowIso);

                    let deepClientName = 'غير محدد';
                    let deepCaseInternalId = 'غير محدد';

                    if (safeBody.client_id || oldData?.client_id) {
                        const cid = safeBody.client_id || oldData?.client_id;
                        const cData = await db(`mo_clients?id=eq.${encodeURIComponent(cid)}&firm_id=eq.${session.firm_id}&select=full_name`).catch(() => []);
                        if (cData && cData[0]) deepClientName = cData[0].full_name;
                    }
                    if (safeBody.case_id || oldData?.case_id) {
                        const csid = safeBody.case_id || oldData?.case_id;
                        const cData = await db(`mo_cases?id=eq.${encodeURIComponent(csid)}&firm_id=eq.${session.firm_id}&select=case_internal_id,mo_clients(full_name)`).catch(() => []);
                        if (cData && cData[0]) {
                            deepCaseInternalId = cData[0].case_internal_id;
                            deepClientName = cData[0].mo_clients?.full_name || deepClientName;
                        }
                    }

                    const mapNames = {
                        'mo_clients': 'موكل', 'mo_cases': 'قضية', 'mo_users': 'موظف',
                        'mo_installments': 'دفعة مالية', 'mo_case_updates': 'إجراء قضية',
                        'mo_appointments': 'موعد/مهمة', 'mo_files': 'مستند',
                        'mo_expenses': 'مصروف مالي', 'mo_firms': 'إعدادات المكتب',
                        'legal_brain': 'قالب/مستند مكتبة'
                    };
                    entityName = mapNames[tableName] || "سجل";

                    if (httpMethod === 'PATCH' && oldData) {
                        changes = buildChangesList(oldData, safeBody);
                        // إذا لم يتغير أي حقل فعلياً، لا نسجل ضوضاء فارغة ولا نرسل إشعارات وهمية
                        if (changes.length === 0) return;

                        actionDetails = `\n\n🔄 <b>الحقول المعدلة فقط:</b>\n` + changes.map(c => safeTG(c)).join('\n');
                        if (tableName !== 'mo_clients' && deepClientName !== 'غير محدد') actionDetails += `\n👤 الموكل المرتبط: ${safeTG(deepClientName)}`;
                    } else if (httpMethod === 'POST') {
                        if (tableName === 'mo_appointments') {
                            const apptDate = safeBody.appt_date ? formatDateTimeAR(safeBody.appt_date) : 'غير محدد';
                            actionDetails = `\n\n✨ <b>التفاصيل المضافة:</b>\n📅 الموعد: ${apptDate}\n🏷️ النوع: ${safeTG(safeBody.type)}`;
                            if (deepClientName !== 'غير محدد') actionDetails += `\n👤 مع الموكل: ${safeTG(deepClientName)}`;
                        } else if (tableName === 'mo_cases') {
                            actionDetails = `\n\n✨ <b>التفاصيل المضافة:</b>\n⚖️ الخصم: ${safeTG(safeBody.opponent_name)}\n🏛 المحكمة: ${safeTG(safeBody.current_court)}`;
                            if (safeBody.claim_amount) actionDetails += `\n💰 المطالبة: ${safeBody.claim_amount} د.أ`;
                            if (deepClientName !== 'غير محدد') actionDetails += `\n👤 الموكل: ${safeTG(deepClientName)}`;
                        } else if (tableName === 'mo_clients') {
                            actionDetails = `\n\n✨ <b>التفاصيل المضافة:</b>\n📱 الهاتف: ${safeTG(safeBody.phone)}`;
                            if (safeBody.national_id) actionDetails += `\n🆔 الرقم الوطني: ${safeTG(safeBody.national_id)}`;
                        } else if (tableName === 'mo_case_updates') {
                            actionDetails = `\n\n✨ <b>التفاصيل المضافة:</b>\n📝 البيان: ${safeTG(safeBody.update_details)}`;
                            if (safeBody.next_hearing_date) actionDetails += `\n📅 الجلسة القادمة: ${formatVal(safeBody.next_hearing_date)}`;
                            if (deepCaseInternalId !== 'غير محدد') actionDetails += `\nملف رقم: ${safeTG(deepCaseInternalId)}`;
                        } else if (tableName === 'mo_installments') {
                            actionDetails = `\n\n✨ <b>التفاصيل المضافة:</b>\n💰 المبلغ: ${safeBody.amount} د.أ\n📅 تاريخ الاستحقاق: ${formatVal(safeBody.due_date)}`;
                            if (deepClientName !== 'غير محدد') actionDetails += `\n👤 الموكل: ${safeTG(deepClientName)}`;
                        } else if (tableName === 'mo_expenses') {
                            actionDetails = `\n\n✨ <b>التفاصيل المضافة:</b>\n💸 المصروف: ${safeBody.amount} د.أ\n📝 البيان: ${safeTG(safeBody.description)}`;
                        } else {
                            actionDetails = `\n\n✨ تم إضافة ${entityName} جديد (${safeTG(itemDesc)}).`;
                        }
                    } else if (httpMethod === 'DELETE') {
                        actionDetails = `\n\n🗑️ تم أرشفة/حذف ${entityName} (${safeTG(itemDesc)}) من العرض النشط.`;
                    }

                    // 🧠 توليد ملخص ذكي وواضح عبر الذكاء الاصطناعي المدمج في Cloudflare (يوضح بالضبط ما تم تعديله فقط، ومن قام به، وفي أي يوم وساعة)
                    const actionVerb = httpMethod === 'POST' ? 'بإضافة' : (httpMethod === 'PATCH' ? 'بتعديل' : 'بأرشفة/حذف');
                    const plainDetails = changes.length > 0
                        ? changes.join(' | ')
                        : actionDetails.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

                    let humanReadableLog = `قام "${session.name}" يوم ${exactTimeAR} ${actionVerb} ${entityName} (${itemDesc || deepCaseInternalId || 'عام'}): ${plainDetails}`;

                    if (env.AI && !isBulkSync && (httpMethod === 'PATCH' ? changes.length > 0 : true)) {
                        try {
                            const aiPrompt = httpMethod === 'PATCH'
                                ? `الموظف: ${session.name}\nالتوقيت: ${exactTimeAR}\nالسجل المعدل: ${entityName} (${itemDesc || deepCaseInternalId || ''})\nالموكل المرتبط: ${deepClientName}\nالتعديلات الفعلية فقط:\n${changes.join('\n')}\n\nاكتب جملة رقابية واضحة ومباشرة باللغة العربية توضح بالضبط ما الذي قام الموظف بتعديله فقط (من القيمة القديمة إلى القيمة الجديدة) مع ذكر اسم الموظف واليوم والساعة بدقة. لا تذكر أي حقل لم يتغير ولا تكتب مقدمات.`
                                : `الموظف: ${session.name}\nالتوقيت: ${exactTimeAR}\nالعملية: ${actionVerb} ${entityName} (${itemDesc || deepCaseInternalId || ''})\nالتفاصيل:\n${plainDetails}\n\nاكتب جملة رقابية واضحة وموجزة باللغة العربية توضح هذه العملية مع ذكر اسم الموظف واليوم والساعة بدقة بدون مقدمات.`;

                            const aiSummary = await Promise.race([
                                runTextLLM([
                                    { role: "system", content: "أنت مدقق أمني ذكي في نظام إدارة مكاتب محاماة. مهمتك صياغة سجل تدقيق عربي فصيح ومباشر ودقيق جداً في سطرين كحد أقصى يوضح فقط ما تم تعديله ومن قام به وفي أي يوم وساعة بدون أي حشو أو مقدمات." },
                                    { role: "user", content: aiPrompt }
                                ], 0.1, 250),
                                new Promise((_, reject) => setTimeout(() => reject(new Error('AI_AUDIT_TIMEOUT')), 3000))
                            ]);

                            if (aiSummary && typeof aiSummary === 'string' && aiSummary.trim().length > 15) {
                                humanReadableLog = aiSummary.trim();
                            }
                        } catch (aiErr) {
                            // في حال تأخر الذكاء الاصطناعي نعتمد الصياغة الدقيقة المهيكلة تلقائياً
                        }
                    }

                    if (safeBody.next_hearing_date && (!oldData || safeBody.next_hearing_date !== oldData.next_hearing_date)) {
                        const targetClientId = safeBody.client_id || oldData?.client_id;
                        const targetCaseId = safeBody.case_id || oldData?.case_id || entityId;
                        await db('mo_appointments', {
                            method: 'POST',
                            body: JSON.stringify({
                                firm_id: session.firm_id,
                                title: `موعد جلسة أوتوماتيكي: ${itemDesc}`,
                                appt_date: safeBody.next_hearing_date,
                                type: 'جلسة محكمة',
                                status: 'مجدول',
                                client_id: targetClientId || null,
                                related_case_id: targetCaseId || null,
                                is_auto_deadline: true,
                                assigned_to: safeBody.assigned_lawyer_id || oldData?.assigned_lawyer_id || [session.uid]
                            })
                        }).catch(() => {});

                        if (targetClientId && !isBulkSync) {
                            const cData = await db(`mo_clients?id=eq.${encodeURIComponent(targetClientId)}&firm_id=eq.${session.firm_id}&select=full_name,telegram_id`).catch(() => []);
                            if (cData && cData[0] && cData[0].telegram_id) {
                                await sendTG(cData[0].telegram_id, `⚖️ <b>إشعار بموعد جلسة قادمة</b>\n\nالموكل الكريم ${safeTG(cData[0].full_name)}،\nنعلمكم أنه تم تحديد موعد جلسة لقضيتكم بتاريخ: <b>${formatVal(safeBody.next_hearing_date)}</b>.`);
                            }
                        }
                    }

                    // 🛡️ تطهير عميق متكرر لبيانات التدقيق قبل الحفظ مع حفظ قائمة التغييرات والملخص الذكي
                    const cleanOldAudit = sanitizeAuditPayload(oldData);
                    const cleanNewAudit = reqBody
                        ? { ...sanitizeAuditPayload(reqBody), _human_log: humanReadableLog, _changes_list: changes }
                        : { _human_log: humanReadableLog, _changes_list: changes };

                    await db('mo_activity_logs', {
                        method: 'POST',
                        body: JSON.stringify({
                            firm_id: session.firm_id,
                            user_id: session.uid,
                            action_type: httpMethod === 'POST' ? 'CREATE' : (httpMethod === 'PATCH' ? 'UPDATE' : 'DELETE'),
                            entity_type: tableName,
                            entity_id: entityId,
                            old_data: cleanOldAudit,
                            new_data: cleanNewAudit,
                            created_at: nowIso
                        })
                    }).catch(e => console.error("Audit Error:", e));

                    if (isBulkSync) return;

                    const aiTelegramBlock = `\n\n🤖 <b>توضيح السجل الذكي (AI):</b>\n${safeTG(humanReadableLog)}`;

                    if (tableName === 'mo_appointments') {
                        link = '/app.html#agenda';
                        const assignedList = safeBody.assigned_to || oldData?.assigned_to || [];
                        if (Array.isArray(assignedList)) notifyIds.push(...assignedList);

                        tgMsgToAssigned = `📋 <b>إشعار ${entityName}</b>\n\n📌 العنوان: ${safeTG(itemDesc)}${actionDetails}${aiTelegramBlock}\n\n👤 بواسطة: <b>${safeTG(session.name)}</b>\n⏰ الوقت: ${exactTimeAR}`;

                        if (safeBody.client_id || oldData?.client_id) {
                            const cid = safeBody.client_id || oldData?.client_id;
                            const clientData = await db(`mo_clients?id=eq.${encodeURIComponent(cid)}&firm_id=eq.${session.firm_id}&select=full_name,telegram_id`).catch(() => []);
                            if (clientData && clientData[0] && clientData[0].telegram_id && httpMethod !== 'DELETE') {
                                const apptDate = safeBody.appt_date || oldData?.appt_date;
                                tgMsgToClient = `📅 <b>تأكيد موعد</b>\n\nالسيد/ة ${safeTG(clientData[0].full_name)}،\nتم إدراج موعد لكم بعنوان: ${safeTG(itemDesc)}\n⏰ التاريخ والوقت: ${formatDateTimeAR(apptDate)}\n\nنأمل التواجد بالموعد المحدد.`;
                            }
                        }
                    }
                    else if (tableName === 'mo_cases') {
                        link = `/case-details.html?id=${entityId}`;
                        const assignedLawyers = safeBody.assigned_lawyer_id || oldData?.assigned_lawyer_id || [];
                        if (Array.isArray(assignedLawyers)) notifyIds.push(...assignedLawyers);

                        tgMsgToAssigned = `⚖️ <b>إشعار ${entityName}</b>\n\nملف رقم: (${safeTG(itemDesc || '--')})${actionDetails}${aiTelegramBlock}\n\n👤 بواسطة: <b>${safeTG(session.name)}</b>\n⏰ الوقت: ${exactTimeAR}`;
                    }
                    else if (['mo_case_updates', 'mo_files', 'mo_expenses', 'mo_installments'].includes(tableName)) {
                        const cId = safeBody.case_id || oldData?.case_id;
                        link = `/case-details.html?id=${cId}`;

                        if (cId) {
                            const cData = await db(`mo_cases?id=eq.${encodeURIComponent(cId)}&firm_id=eq.${session.firm_id}&select=assigned_lawyer_id,case_internal_id,mo_clients(full_name,telegram_id)`).catch(() => []);
                            if (cData && cData[0]) {
                                if (Array.isArray(cData[0].assigned_lawyer_id)) notifyIds.push(...cData[0].assigned_lawyer_id);
                                const caseNum = cData[0].case_internal_id;
                                const clientName = cData[0].mo_clients?.full_name || 'غير محدد';

                                tgMsgToAssigned = `🔔 <b>إشعار ${entityName}</b>\n\nملف رقم (${safeTG(caseNum)})\n👤 الموكل: ${safeTG(clientName)}${actionDetails}${aiTelegramBlock}\n\n👤 بواسطة: <b>${safeTG(session.name)}</b>\n⏰ الوقت: ${exactTimeAR}`;

                                if (tableName === 'mo_case_updates' && safeBody.is_visible_to_client && cData[0].mo_clients?.telegram_id && httpMethod !== 'DELETE') {
                                    tgMsgToClient = `📝 <b>تحديث في قضيتكم</b>\n\nالسيد/ة ${safeTG(clientName)}، تم إضافة إجراء جديد لقضيتكم:\n"${safeTG(safeBody.update_title)}"\n\nيرجى زيارة البوابة لمزيد من التفاصيل.`;
                                }

                                if (tableName === 'mo_installments' && safeBody.status === 'مدفوعة' && cData[0].mo_clients?.telegram_id && httpMethod !== 'DELETE') {
                                    const receiptLink = `${url.origin}/api/public/verify-receipt?id=${entityId}`;
                                    tgMsgToClient = `✅ <b>تأكيد استلام دفعة مالية</b>\n\nالموكل الكريم ${safeTG(clientName)}،\nتم استلام دفعة بقيمة <b>${safeBody.amount}</b> لحساب قضيتكم رقم (${safeTG(caseNum)}).\n\n📄 <b>لتحميل الإيصال الرقمي المعتمد (PDF):</b>\n<a href="${receiptLink}">اضغط هنا لعرض الإيصال</a>`;
                                }
                            }
                        }
                    }

                    const admins = await db(`mo_users?firm_id=eq.${session.firm_id}&role=in.(admin,super_admin)&select=id,telegram_id`).catch(() => []);

                    tgMsgToAdmin = `👁️ <b>مراقبة النظام الذكية (الإدارة)</b>\n\n🛠️ <b>العملية:</b> ${httpMethod === 'POST' ? 'إضافة' : (httpMethod === 'PATCH' ? 'تعديل' : 'أرشفة/حذف')} ${entityName}\n👤 <b>بواسطة:</b> ${safeTG(session.name)}\n📌 <b>السجل:</b> ${safeTG(itemDesc || deepCaseInternalId || 'عام')}\n⏰ <b>اليوم والساعة:</b> ${exactTimeAR}${actionDetails}${aiTelegramBlock}`;

                    admins.forEach(a => {
                        if (a.id !== session.uid) {
                            notifyIds.push(a.id);
                            if (a.telegram_id) sendTG(a.telegram_id, tgMsgToAdmin);
                        }
                    });

                    if (tgMsgToClient) {
                        const targetCId = safeBody.client_id || oldData?.client_id || (await db(`mo_cases?id=eq.${encodeURIComponent(safeBody.case_id || oldData?.case_id)}&firm_id=eq.${session.firm_id}&select=client_id`).then(r => r[0]?.client_id).catch(() => null));
                        if (targetCId) {
                            const cTg = await db(`mo_clients?id=eq.${encodeURIComponent(targetCId)}&firm_id=eq.${session.firm_id}&select=telegram_id`).then(r => r[0]?.telegram_id).catch(() => null);
                            if (cTg) await sendTG(cTg, tgMsgToClient);
                        }
                    }

                    notifyIds = [...new Set(notifyIds)].filter(id => id !== session.uid);

                    if (notifyIds.length > 0) {
                        const actionTitle = httpMethod === 'POST' ? `إضافة ${entityName} جديد` : (httpMethod === 'PATCH' ? `تعديل ${entityName} (${itemDesc || deepCaseInternalId || ''})` : `أرشفة/حذف ${entityName}`);
                        const actionBody = humanReadableLog;

                        const targetUsers = await db(`mo_users?firm_id=eq.${session.firm_id}&id=in.(${notifyIds.join(',')})&select=id,telegram_id,role`).catch(() => []);

                        for (const tUser of targetUsers) {
                            await sendNotification({
                                user_id: tUser.id, firm_id: session.firm_id,
                                title: actionTitle, message: actionBody,
                                action_url: link, is_read: false,
                                created_by: session.uid, created_at: nowIso
                            });

                            if (tgMsgToAssigned && tUser.telegram_id && tUser.role !== 'admin' && tUser.role !== 'super_admin') {
                                await sendTG(tUser.telegram_id, tgMsgToAssigned);
                            }
                        }
                    }
                } catch (err) { console.error("Smart Notification Engine Error:", err); }
            };

            const executeSafeDelete = async (table, cleanId, firmId, allowHardDelete) => {
                if (!allowHardDelete) {
                    try {
                        await db(`${table}?id=eq.${encodeURIComponent(cleanId)}&firm_id=eq.${encodeURIComponent(firmId)}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ is_deleted: true })
                        });
                        return { soft_deleted: true };
                    } catch (softErr) {
                        if (['mo_cases', 'mo_appointments', 'mo_installments'].includes(table)) {
                            await db(`${table}?id=eq.${encodeURIComponent(cleanId)}&firm_id=eq.${encodeURIComponent(firmId)}`, {
                                method: 'PATCH',
                                body: JSON.stringify({ status: 'ملغي/مؤرشف' })
                            });
                            return { soft_deleted: true };
                        }
                        throw new Error('الحذف النهائي معطل في إعدادات المكتب، ويرجى تفعيل عمود الأرشفة (is_deleted) لهذا الجدول.');
                    }
                }
                await db(`${table}?id=eq.${encodeURIComponent(cleanId)}&firm_id=eq.${encodeURIComponent(firmId)}`, { method: 'DELETE' });
                return { hard_deleted: true };
            };

            // ============================================================================
            // مسار المزامنة الأوفلاين (Offline Sync Endpoint Firewall - Unified with Live CRUD)
            // ============================================================================
            if (path === '/api/sync/offline' && method === 'POST') {
                const { actions } = await request.json();
                const headerActionToken = request.headers.get('x-action-token');
                let results = [];

                for (let action of (actions || [])) {
                    const table = routeMap[action.endpoint];
                    if (!table) continue;

                    // 🛡️ رفض أي عملية في الطابور تنتمي لمستخدم أو مكتب آخر
                    if (action.uid && String(action.uid) !== String(session.uid)) {
                        results.push({ action_id: action.id, status: 'failed', reason: 'مرفوض أمنياً: العملية مسجلة لمستخدم آخر.' });
                        continue;
                    }
                    if (action.firm_id && String(action.firm_id) !== String(session.firm_id)) {
                        results.push({ action_id: action.id, status: 'failed', reason: 'مرفوض أمنياً: العملية مسجلة لمكتب آخر.' });
                        continue;
                    }

                    try {
                        if (action.method === 'POST') {
                            const check = validateAndSanitizeWrite('POST', table, action.body || {});
                            if (!check.allowed) {
                                results.push({ action_id: action.id, status: 'failed', reason: check.error });
                                continue;
                            }

                            const refCheck = await validateCrossTenantReferences(table, action.body || {});
                            if (!refCheck.valid) {
                                results.push({ action_id: action.id, status: 'failed', reason: refCheck.error });
                                continue;
                            }

                            action.body.firm_id = session.firm_id;
                            if (action.body.id && action.body.id.toString().startsWith('temp_')) delete action.body.id;
                            if (table === 'mo_cases') {
                                if (!action.body.public_token) action.body.public_token = crypto.randomUUID();
                                await processAndSecureCasePin(action.body, false);
                            }

                            const r = await db(table, { method: 'POST', body: JSON.stringify(action.body) });
                            const newId = r[0]?.id;
                            results.push({ temp_id: action.id, new_id: newId, status: 'success' });

                            if (table === 'mo_installments' && action.body.case_id) {
                                await updateCaseFinancials(action.body.case_id, session.firm_id);
                            }
                            if (table === 'mo_cases' && newId && ctx) {
                                ctx.waitUntil(syncCaseEmbedding(newId, session.firm_id, action.body));
                            }
                            await triggerSmartNotifications('POST', table, action.body, newId, null, true);
                        }
                        else if (action.method === 'PATCH') {
                            let cleanId = (action.id || '').replace('eq.', '');
                            if (!cleanId.startsWith('temp_')) {
                                const check = validateAndSanitizeWrite('PATCH', table, action.body || {}, cleanId);
                                if (!check.allowed) {
                                    results.push({ target_id: cleanId, status: 'failed', reason: check.error });
                                    continue;
                                }

                                const refCheck = await validateCrossTenantReferences(table, action.body || {});
                                if (!refCheck.valid) {
                                    results.push({ target_id: cleanId, status: 'failed', reason: refCheck.error });
                                    continue;
                                }

                                const oldDataArr = await db(`${table}?id=eq.${encodeURIComponent(cleanId)}&firm_id=eq.${session.firm_id}&select=*`).catch(() => []);
                                if (oldDataArr.length) {
                                    if (table === 'mo_cases' && session.role !== 'admin' && session.role !== 'super_admin') {
                                        if (!(oldDataArr[0].assigned_lawyer_id || []).includes(session.uid)) {
                                            results.push({ target_id: cleanId, status: 'failed', reason: 'مرفوض: لا تملك صلاحية تعديل هذه القضية.' });
                                            continue;
                                        }
                                    }

                                    if (table === 'mo_cases' && action.body) {
                                        const hadPin = action.body.access_pin !== undefined;
                                        await processAndSecureCasePin(action.body, true);
                                        if (hadPin || action.body.is_deleted === true || action.body.client_portal_active === false) {
                                            await invalidatePortalSessions(env, cleanId);
                                        }
                                    }

                                    await db(`${table}?id=eq.${encodeURIComponent(cleanId)}&firm_id=eq.${session.firm_id}`, { method: 'PATCH', body: JSON.stringify(action.body) });

                                    if (table === 'mo_installments') {
                                        await updateCaseFinancials(action.body.case_id || oldDataArr[0].case_id, session.firm_id);
                                    }
                                    if (table === 'mo_cases' && ctx) {
                                        ctx.waitUntil(syncCaseEmbedding(cleanId, session.firm_id, action.body, oldDataArr[0]));
                                    }
                                    await triggerSmartNotifications('PATCH', table, action.body, cleanId, oldDataArr[0], true);
                                    results.push({ target_id: cleanId, status: 'success' });
                                }
                            }
                        }
                        else if (action.method === 'DELETE') {
                            let cleanId = (action.id || '').replace('eq.', '');
                            if (!cleanId.startsWith('temp_')) {
                                if (table === 'mo_users' || table === 'mo_activity_logs' || table === 'mo_firms') {
                                    results.push({ target_id: cleanId, status: 'failed', reason: 'مرفوض: لا يمكن حذف هذا السجل.' });
                                    continue;
                                }

                                const syncMfaToken = action.action_token || headerActionToken;
                                const mfaCheck = await verifyActionToken(syncMfaToken, table, cleanId);
                                if (!mfaCheck.valid) {
                                    results.push({ target_id: cleanId, status: 'failed', reason: mfaCheck.error });
                                    continue;
                                }

                                if (table === 'mo_clients') {
                                    const checkCases = await db(`mo_cases?client_id=eq.${encodeURIComponent(cleanId)}&firm_id=eq.${session.firm_id}&select=id,is_deleted`).catch(() => []);
                                    if (checkCases.filter(c => !c.is_deleted).length > 0) {
                                        results.push({ target_id: cleanId, status: 'failed', reason: 'مرفوض: لا يمكن حذف الموكل لوجود قضايا نشطة مرتبطة به.' });
                                        continue;
                                    }
                                }

                                const oldDataArr = await db(`${table}?id=eq.${encodeURIComponent(cleanId)}&firm_id=eq.${session.firm_id}&select=*`).catch(() => []);
                                if (oldDataArr.length) {
                                    if (session.role !== 'admin' && session.role !== 'super_admin' && !session.permissions?.can_delete) {
                                        if (['mo_case_updates', 'mo_files', 'mo_expenses'].includes(table)) {
                                            const parentCase = await db(`mo_cases?id=eq.${encodeURIComponent(oldDataArr[0].case_id)}&firm_id=eq.${session.firm_id}&select=assigned_lawyer_id`);
                                            if (!parentCase[0]?.assigned_lawyer_id?.includes(session.uid)) {
                                                results.push({ target_id: cleanId, status: 'failed', reason: 'صلاحية الحذف مقتصرة على المحامي المسند للقضية.' });
                                                continue;
                                            }
                                        } else {
                                            results.push({ target_id: cleanId, status: 'failed', reason: 'مرفوض: لا تملك صلاحية الحذف.' });
                                            continue;
                                        }
                                    }

                                    const firmData = await db(`mo_firms?id=eq.${session.firm_id}&select=settings`).catch(() => []);
                                    const firmSettings = (firmData.length && firmData[0].settings) ? firmData[0].settings : {};
                                    await executeSafeDelete(table, cleanId, session.firm_id, firmSettings.allow_hard_delete === true);
                                    if (table === 'mo_installments' && oldDataArr[0].case_id) {
                                        await updateCaseFinancials(oldDataArr[0].case_id, session.firm_id);
                                    }
                                    await triggerSmartNotifications('DELETE', table, null, cleanId, oldDataArr[0], true);
                                    results.push({ target_id: cleanId, status: 'success' });
                                }
                            }
                        }
                    } catch (e) {
                        results.push({ action_id: action.id, status: 'failed', reason: e.message });
                    }
                }
                return createRes({ success: true, synced_items: results });
            }

            // ============================================================================
            // العمليات اللحظية المباشرة (Live CRUD)
            // ============================================================================
            let table = null;
            for (const r in routeMap) { if (path.startsWith(r)) { table = routeMap[r]; break; } }

            if (table) {
                if (method === 'GET') {
                    // حماية سجل الرقابة للمدراء فقط، أو لسجل قضية غير سرية مخول بها المحامي
                    if (table === 'mo_activity_logs' && session.role !== 'admin' && session.role !== 'super_admin') {
                        const caseIdFilter = url.searchParams.get('entity_id');
                        if (!caseIdFilter) return createRes({ error: 'سجل الرقابة الشامل مقتصر على إدارة المكتب فقط.' }, 403);
                    }

                    // فحص صلاحيات المالية (can_finance) عند استعراض الجداول المالية الشاملة بدون فلتر قضية محددة
                    if ((table === 'mo_installments' || table === 'mo_expenses') && session.role !== 'admin' && session.role !== 'super_admin') {
                        if (session.permissions && session.permissions.can_finance === false && !url.searchParams.get('case_id')) {
                            return createRes({ error: 'مرفوض: لا تملك صلاحية الاطلاع على السجل المالي الشامل للمكتب.' }, 403);
                        }
                    }

                    let query = `${table}`;

                    if (table === 'mo_firms') {
                        query += `?id=eq.${session.firm_id}`;
                    } else if (table === 'legal_brain') {
                        query += `?or=(firm_id.is.null,firm_id.eq.${session.firm_id})`;
                    } else if (table === 'mo_notifications') {
                        query += `?firm_id=eq.${session.firm_id}&user_id=eq.${session.uid}`;
                    } else {
                        query += `?firm_id=eq.${session.firm_id}`;
                    }

                    if (table === 'mo_cases' && session.role !== 'admin') {
                        query += `&or=(confidentiality_level.eq.عادي,confidentiality_level.is.null,assigned_lawyer_id.cs.{${session.uid}})`;
                    }

                    if (table === 'mo_clients' && session.role !== 'admin') {
                        const myCases = await db(`mo_cases?firm_id=eq.${session.firm_id}&assigned_lawyer_id=cs.{${session.uid}}&select=client_id`).catch(() => []);
                        const myClientIds = [...new Set(myCases.map(c => c.client_id).filter(Boolean))];
                        query += myClientIds.length > 0 ? `&or=(confidentiality_level.eq.عادي,confidentiality_level.is.null,id.in.(${myClientIds.join(',')}))` : `&or=(confidentiality_level.eq.عادي,confidentiality_level.is.null)`;
                    }

                    // 🛡️ تدقيق الفلاتر ومنع حقن معاملات PostgREST أو العلاقات غير المصرحة
                    url.searchParams.forEach((v, k) => {
                        const safeKey = k.replace(/[^a-zA-Z0-9_]/g, '');
                        if (!safeKey || safeKey === 'firm_id' || safeKey === 'user_id') return;

                        if (safeKey === 'select') {
                            if (/mo_users|mo_activity_logs|mo_user_credentials/i.test(v)) {
                                query += `&select=*`;
                            } else {
                                query += `&select=${v}`;
                            }
                        } else if (safeKey === 'order' || safeKey === 'limit' || safeKey === 'offset') {
                            query += `&${safeKey}=${encodeURIComponent(v)}`;
                        } else if (safeKey === 'or' || safeKey === 'and') {
                            if (!/firm_id/i.test(v)) query += `&${safeKey}=${v}`;
                        } else {
                            const hasOp = /^(eq|neq|gt|gte|lt|lte|like|ilike|is|in|cs|cd)\./.test(v);
                            if (hasOp) {
                                const dotIdx = v.indexOf('.');
                                const op = v.slice(0, dotIdx);
                                const valPart = encodeURIComponent(v.slice(dotIdx + 1));
                                query += `&${safeKey}=${op}.${valPart}`;
                            } else {
                                query += `&${safeKey}=eq.${encodeURIComponent(v)}`;
                            }
                        }
                    });

                    if (!url.searchParams.has('order')) query += `&order=created_at.desc`;

                    const rows = await db(query);
                    let activeRows = Array.isArray(rows) ? rows.filter(r => r.is_deleted !== true) : rows;

                    if (table === 'mo_users' && Array.isArray(activeRows)) {
                        activeRows = activeRows.map(u => sanitizeUserRecord(u, session.role));
                    }

                    if (table === 'legal_brain' && Array.isArray(activeRows)) {
                        activeRows = activeRows.filter(doc => !doc.firm_id || String(doc.firm_id) === String(session.firm_id));
                    }

                    activeRows = await filterOutConfidentialSubRecords(table, activeRows);

                    return createRes(activeRows);
                }

                if (method === 'POST') {
                    const body = await request.json();

                    const writeCheck = validateAndSanitizeWrite('POST', table, body);
                    if (!writeCheck.allowed) return createRes({ error: writeCheck.error }, writeCheck.status);

                    const refCheck = await validateCrossTenantReferences(table, body);
                    if (!refCheck.valid) return createRes({ error: refCheck.error }, refCheck.status);

                    body.firm_id = session.firm_id;

                    if (table === 'mo_cases') {
                        // 🛡️ فحص حصة القضايا المسموح بها في باقة المكتب (Max Cases Quota)
                        const firmData = await db(`mo_firms?id=eq.${session.firm_id}&select=max_cases,settings`).catch(() => []);
                        const maxCases = firmData[0]?.max_cases || firmData[0]?.settings?.max_cases || 50;
                        const currentCases = await db(`mo_cases?firm_id=eq.${session.firm_id}&is_deleted=neq.true&select=id`).catch(() => []);
                        if (currentCases.length >= maxCases) {
                            return createRes({ error: `تجاوزت الحد الأقصى للقضايا المسموح بها في باقتك (${maxCases} قضية). يرجى ترقية الاشتراك.` }, 402);
                        }

                        if (body.lawsuit_text && !body.lawsuit_facts) body.lawsuit_facts = body.lawsuit_text;
                        if (body.lawsuit_facts && !body.lawsuit_text) body.lawsuit_text = body.lawsuit_facts;
                        if (!body.public_token) body.public_token = crypto.randomUUID();
                        await processAndSecureCasePin(body, false);
                    }

                    if (table === 'legal_brain') {
                        // 🛡️ منع إنشاء سجلات عامة من قبل المستخدمين العاديين
                        body.is_public = false;
                        body.firm_id = session.firm_id;
                    }

                    if (table === 'mo_activity_logs') {
                        // 🛡️ فرض هوية المستخدم والمكتب ومنع تزوير سجلات التدقيق
                        body.firm_id = session.firm_id;
                        body.user_id = session.uid;
                    }

                    if (table === 'mo_users' && body.can_login === true) {
                        const firmData = await db(`mo_firms?id=eq.${session.firm_id}&select=max_users`).catch(() => []);
                        const currentUsers = await db(`mo_users?firm_id=eq.${session.firm_id}&can_login=eq.true&select=id`);
                        const maxAllowed = firmData.length ? firmData[0].max_users : 5;
                        if (currentUsers.length >= maxAllowed) return createRes({ error: 'تجاوزت الحد الأقصى للحسابات المصرح لها بالدخول في باقتك' }, 402);
                    }

                    const result = await db(table, { method: 'POST', body: JSON.stringify(body) });
                    const createdId = result[0]?.id;

                    if (table === 'mo_installments' && body.case_id) await updateCaseFinancials(body.case_id, session.firm_id);
                    if (table === 'mo_cases' && createdId && ctx) {
                        ctx.waitUntil(syncCaseEmbedding(createdId, session.firm_id, body));
                    }

                    if (ctx) ctx.waitUntil(triggerSmartNotifications('POST', table, body, createdId, null, false));
                    else await triggerSmartNotifications('POST', table, body, createdId, null, false);

                    if (table === 'mo_users' && Array.isArray(result)) {
                        return createRes(result.map(u => sanitizeUserRecord(u, session.role)));
                    }
                    return createRes(result);
                }

                if (method === 'PATCH') {
                    const body = await request.json();
                    let entityId = url.searchParams.get('id');
                    if (!entityId || !entityId.startsWith('eq.')) return createRes({ error: 'يجب تحديد المُعرف (ID)' }, 400);
                    const cleanId = entityId.replace('eq.', '');

                    if (cleanId.includes('temp_')) return createRes({ error: 'هذا سجل مؤقت، جاري المزامنة، يرجى الانتظار ثوانٍ.' }, 400);

                    const writeCheck = validateAndSanitizeWrite('PATCH', table, body, cleanId);
                    if (!writeCheck.allowed) return createRes({ error: writeCheck.error }, writeCheck.status);

                    const refCheck = await validateCrossTenantReferences(table, body);
                    if (!refCheck.valid) return createRes({ error: refCheck.error }, refCheck.status);

                    const filterQuery = table === 'mo_firms'
                        ? `${table}?id=eq.${session.firm_id}&select=*`
                        : (table === 'mo_notifications'
                            ? `${table}?id=eq.${encodeURIComponent(cleanId)}&firm_id=eq.${session.firm_id}&user_id=eq.${session.uid}&select=*`
                            : `${table}?id=eq.${encodeURIComponent(cleanId)}&firm_id=eq.${session.firm_id}&select=*`);

                    const oldDataArr = await db(filterQuery);
                    if (!oldDataArr.length) return createRes({ error: 'السجل غير موجود أو لا تملك صلاحية تعديله' }, 404);
                    const oldData = oldDataArr[0];

                    if (['mo_case_updates', 'mo_files', 'mo_installments', 'mo_expenses', 'mo_appointments'].includes(table)) {
                        const parentCaseId = oldData.case_id || oldData.related_case_id;
                        if (parentCaseId && session.role !== 'admin') {
                            const pCase = await db(`mo_cases?id=eq.${encodeURIComponent(parentCaseId)}&firm_id=eq.${session.firm_id}&select=confidentiality_level,assigned_lawyer_id`).catch(() => []);
                            if (pCase.length && pCase[0].confidentiality_level === 'سري' && !(pCase[0].assigned_lawyer_id || []).includes(session.uid)) {
                                return createRes({ error: 'مرفوض: هذا السجل مرتبط بقضية سرية لا تملك صلاحية تعديلها.' }, 403);
                            }
                        }
                    }

                    if (table === 'mo_cases') {
                        if (session.role !== 'admin' && !(oldData.assigned_lawyer_id || []).includes(session.uid)) {
                            return createRes({ error: 'لا تملك صلاحية تعديل هذه القضية لأنك لست المحامي المسند إليها.' }, 403);
                        }
                        if (body.lawsuit_text && !body.lawsuit_facts) body.lawsuit_facts = body.lawsuit_text;
                        if (body.lawsuit_facts && !body.lawsuit_text) body.lawsuit_text = body.lawsuit_facts;
                        const hadPinUpdate = body.access_pin !== undefined;
                        await processAndSecureCasePin(body, true);
                        if (hadPinUpdate || body.client_portal_active === false || body.is_deleted === true) {
                            await invalidatePortalSessions(env, cleanId);
                        }
                    }

                    if (table === 'legal_brain') {
                        delete body.is_public;
                        body.firm_id = session.firm_id;
                        if (oldData.firm_id === null || oldData.is_public === true) {
                            return createRes({ error: 'مرفوض أمنياً: لا يمكن تعديل الوثائق والتشريعات العامة المشتركة.' }, 403);
                        }
                    }

                    if (table === 'mo_users' && body.can_login === true && oldData.can_login !== true) {
                        const firmData = await db(`mo_firms?id=eq.${session.firm_id}&select=max_users`).catch(() => []);
                        const currentUsers = await db(`mo_users?firm_id=eq.${session.firm_id}&can_login=eq.true&select=id`);
                        const maxAllowed = firmData.length ? firmData[0].max_users : 5;
                        if (currentUsers.length >= maxAllowed) return createRes({ error: 'تجاوزت الحد الأقصى للحسابات المصرح لها بالدخول في باقتك' }, 402);
                    }

                    const updateUrl = table === 'mo_firms'
                        ? `${table}?id=eq.${session.firm_id}`
                        : (table === 'mo_notifications'
                            ? `${table}?id=eq.${encodeURIComponent(cleanId)}&firm_id=eq.${session.firm_id}&user_id=eq.${session.uid}`
                            : `${table}?id=eq.${encodeURIComponent(cleanId)}&firm_id=eq.${session.firm_id}`);

                    const result = await db(updateUrl, { method: 'PATCH', body: JSON.stringify(body) });

                    // 🛡️ إبطال جلسة الموظف فوراً في KV عند إيقافه أو تغيير دوره أو صلاحياته أو رقم هاتفه
                    if (table === 'mo_users' && (body.can_login === false || body.is_active === false || body.role !== undefined || body.permissions !== undefined || body.phone !== undefined) && oldData.phone && env.MOAKKIL_KV) {
                        await env.MOAKKIL_KV.delete(`session:${oldData.phone}`);
                    }

                    if (table === 'mo_installments') await updateCaseFinancials(body.case_id || oldData.case_id, session.firm_id);
                    if (table === 'mo_cases' && ctx) {
                        ctx.waitUntil(syncCaseEmbedding(cleanId, session.firm_id, body, oldData));
                    }

                    if (ctx) ctx.waitUntil(triggerSmartNotifications('PATCH', table, body, cleanId, oldData, false));
                    else await triggerSmartNotifications('PATCH', table, body, cleanId, oldData, false);

                    if (table === 'mo_users' && Array.isArray(result)) {
                        return createRes(result.map(u => sanitizeUserRecord(u, session.role)));
                    }
                    return createRes(result);
                }

                if (method === 'DELETE') {
                    if (table === 'mo_activity_logs' || table === 'mo_firms') {
                        return createRes({ error: 'مرفوض أمنياً: لا يمكن حذف سجلات هذا الجدول.' }, 403);
                    }

                    if (table === 'mo_users') return createRes({ error: 'للحفاظ على سلامة النظام، لا يمكن حذف الموظف نهائياً. يرجى إيقاف حسابه بدلاً من ذلك.' }, 403);

                    let entityId = url.searchParams.get('id');
                    if (!entityId || !entityId.startsWith('eq.')) return createRes({ error: 'يجب تحديد المُعرف للحذف' }, 400);
                    const cleanId = entityId.replace('eq.', '');

                    // 🛡️ التحقق الحقيقي من المصادقة الثنائية للحذف (One-Time Scoped x-action-token)
                    const actionToken = request.headers.get('x-action-token');
                    const mfaCheck = await verifyActionToken(actionToken, table, cleanId);
                    if (!mfaCheck.valid) {
                        return createRes({ error: mfaCheck.error }, 403);
                    }

                    const firmData = await db(`mo_firms?id=eq.${session.firm_id}&select=settings`).catch(() => []);
                    const firmSettings = (firmData.length && firmData[0].settings) ? firmData[0].settings : {};

                    if (table === 'mo_clients') {
                        const checkCases = await db(`mo_cases?client_id=eq.${encodeURIComponent(cleanId)}&firm_id=eq.${session.firm_id}&select=id,is_deleted`).catch(() => []);
                        const activeCases = checkCases.filter(c => !c.is_deleted);
                        if (activeCases.length > 0) return createRes({ error: 'مرفوض: لا يمكن حذف الموكل لوجود قضايا نشطة مرتبطة به في النظام.' }, 403);
                    }

                    const oldDataArr = await db(`${table}?id=eq.${encodeURIComponent(cleanId)}&firm_id=eq.${session.firm_id}&select=*`);
                    if (!oldDataArr.length) return createRes({ error: 'السجل غير موجود أو لا ينتمي لمكتبك' }, 404);

                    if (session.role !== 'admin' && !session.permissions?.can_delete) {
                        if (['mo_case_updates', 'mo_files', 'mo_expenses'].includes(table)) {
                            const parentCase = await db(`mo_cases?id=eq.${encodeURIComponent(oldDataArr[0].case_id)}&firm_id=eq.${session.firm_id}&select=assigned_lawyer_id`);
                            if (!parentCase[0]?.assigned_lawyer_id?.includes(session.uid)) return createRes({ error: 'صلاحية الحذف مقتصرة على المحامي المسند للقضية فقط' }, 403);
                        } else return createRes({ error: 'صلاحية الحذف ممنوحة للمدير العام فقط' }, 403);
                    }

                    await executeSafeDelete(table, cleanId, session.firm_id, firmSettings.allow_hard_delete === true);

                    if (table === 'mo_installments' && oldDataArr[0].case_id) await updateCaseFinancials(oldDataArr[0].case_id, session.firm_id);

                    if (ctx) ctx.waitUntil(triggerSmartNotifications('DELETE', table, null, cleanId, oldDataArr[0], false));
                    else await triggerSmartNotifications('DELETE', table, null, cleanId, oldDataArr[0], false);

                    return createRes({ success: true, message: "تمت عملية الحذف/الأرشفة بنجاح" });
                }
            }
            return createRes({ error: `المسار البرمجي المطلوب غير موجود (404) - Path: ${path}` }, 404);

        } catch (e) {
            return createRes({ error: "حدث خطأ داخلي في الخادم: " + e.message }, 500);
        }
    }
};