/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: js/client.js
 * الإصدار: V5.6 Enterprise Edition (Zero-Trust Public Client Portal Engine)
 * ============================================================================
 * الخصائص والميزات المحصنة:
 * 1. بنية Zero-Trust المشفرة: إدارة جلسات البوابة المستقلة (portal_session_token عبر x-portal-session-token).
 * 2. تشفير الكاش المحلي (PBKDF2 + AES-GCM 256-bit): التخزين المشفر للعمل في وضع عدم الاتصال بصلاحية 24 ساعة دون حفظ الـ PIN نهائياً.
 * 3. تسجيل خروج خادمي فوري (/api/public/client/logout) يبطل الجلسة من KV ويمسح أي بيانات من الجهاز.
 * 4. لوحة توقيع رقمي عالية النقاء (High-DPI Retina Canvas) وتوليد بصمة تشفيرية SHA-256 لمنع الإنكار.
 * 5. رفع المستندات الناقصة كدفق ثنائي مباشر ومحمي (Stream) إلى Cloudflare R2 بحد أقصى 25 ميغابايت.
 * 6. تصدير مواعيد الجلسات القضائية إلى تقويم الهواتف الذكية القياسي (.ics).
 * 7. توليد كشوفات الحساب المالية بصيغة PDF أنيقة بالهوية البصرية الرسمية للمكتب المحاماة.
 * ============================================================================
 */

let publicData = null;
let activeToken = null;
let verifiedSessionPin = '';
let portalSessionToken = '';
const BOT_USERNAME = "Moakkil_bot";
const PORTAL_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 ساعة كحد أقصى للكاش المشفر

// مفاتيح التخزين لجلسة البوابة
const portalSessionKey = () => `moakkil_portal_session_${activeToken}`;
const encryptedPortalCacheKey = () => `moakkil_encrypted_portal_${activeToken}`;

/**
 * تنظيف أي بقايا قديمة غير مشفرة لبيانات الموكل أو الـ PIN من localStorage
 */
function purgeLegacyPlaintextPortalStorage(caseInternalId = '') {
    try {
        if (activeToken) {
            localStorage.removeItem(`moakkil_offline_pin_${activeToken}`);
            localStorage.removeItem(`moakkil_client_cache_${activeToken}`);
        }
        if (caseInternalId) {
            localStorage.removeItem(`moakkil_offline_pin_${caseInternalId}`);
        }
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && (k.startsWith('moakkil_offline_pin_') || k.startsWith('moakkil_client_cache_'))) {
                keysToRemove.push(k);
            }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch (e) {}
}

/**
 * توحيد صيغة رمز الدخول (PIN) ليقبل الأرقام والأحرف (العربية أو اللاتينية) بدون حساسية لحالة الأحرف
 */
function normalizePin(rawPin) {
    if (!rawPin) return '';
    return String(rawPin)
        .trim()
        .replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660))
        .replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0))
        .toUpperCase();
}

/**
 * اشتقاق مفتاح تشفير AES-GCM 256-bit من رمز الـ PIN ورابط القضية عبر PBKDF2
 */
async function derivePortalAesKey(pin, saltBytes) {
    const enc = new TextEncoder();
    const cleanPin = normalizePin(pin);
    const baseKey = await window.crypto.subtle.importKey(
        'raw',
        enc.encode(`${cleanPin}:${activeToken || ''}`),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );
    return await window.crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: saltBytes,
            iterations: 100000,
            hash: 'SHA-256'
        },
        baseKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * حفظ بيانات البوابة بشكل مشفر (AES-GCM) في localStorage مع تاريخ انتهاء صلاحية (24 ساعة)
 * لا يتم حفظ الـ PIN نهائياً، ولا يمكن فك تشفير البيانات إلا بإدخال الـ PIN الصحيح
 */
async function saveEncryptedPortalCache(dataObj, pin) {
    if (!pin || !activeToken || !window.crypto || !window.crypto.subtle) return;
    try {
        purgeLegacyPlaintextPortalStorage(dataObj?.case?.case_internal_id);
        const salt = window.crypto.getRandomValues(new Uint8Array(16));
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const aesKey = await derivePortalAesKey(pin, salt);
        const payloadStr = JSON.stringify({
            expiresAt: Date.now() + PORTAL_CACHE_TTL_MS,
            data: dataObj
        });
        const cipherBuf = await window.crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            aesKey,
            new TextEncoder().encode(payloadStr)
        );
        const toB64 = (arr) => window.btoa(String.fromCharCode(...new Uint8Array(arr)));
        localStorage.setItem(encryptedPortalCacheKey(), JSON.stringify({
            s: toB64(salt),
            iv: toB64(iv),
            ct: toB64(cipherBuf),
            exp: Date.now() + PORTAL_CACHE_TTL_MS
        }));
    } catch (e) {
        console.warn('Encrypted cache save skipped:', e);
    }
}

/**
 * محاولة فك تشفير بيانات البوابة عند انقطاع الإنترنت باستخدام الـ PIN الذي أدخله الموكل
 */
async function loadEncryptedPortalCache(pin) {
    if (!pin || !activeToken || !window.crypto || !window.crypto.subtle) return null;
    try {
        const raw = localStorage.getItem(encryptedPortalCacheKey());
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !parsed.s || !parsed.iv || !parsed.ct) return null;
        if (parsed.exp && Date.now() > parsed.exp) {
            localStorage.removeItem(encryptedPortalCacheKey());
            return null;
        }
        const fromB64 = (b64) => Uint8Array.from(window.atob(b64), c => c.charCodeAt(0));
        const aesKey = await derivePortalAesKey(pin, fromB64(parsed.s));
        const plainBuf = await window.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: fromB64(parsed.iv) },
            aesKey,
            fromB64(parsed.ct)
        );
        const decoded = JSON.parse(new TextDecoder().decode(plainBuf));
        if (!decoded || (decoded.expiresAt && Date.now() > decoded.expiresAt)) {
            localStorage.removeItem(encryptedPortalCacheKey());
            return null;
        }
        return decoded.data || null;
    } catch (e) {
        // فشل فك التشفير يعني أن الـ PIN المدخل غير صحيح
        return null;
    }
}

/**
 * حفظ ومسح تذكرة جلسة البوابة
 */
function setPortalSession(sessionToken) {
    portalSessionToken = sessionToken || '';
    try {
        if (portalSessionToken) sessionStorage.setItem(portalSessionKey(), portalSessionToken);
        else sessionStorage.removeItem(portalSessionKey());
        sessionStorage.removeItem(`moakkil_portal_pin_${activeToken}`);
    } catch (e) {}
}

function clearPortalSession(wipeEncryptedCache = false) {
    setPortalSession('');
    verifiedSessionPin = '';
    purgeLegacyPlaintextPortalStorage();
    if (wipeEncryptedCache && activeToken) {
        try { localStorage.removeItem(encryptedPortalCacheKey()); } catch (e) {}
    }
}

/**
 * جلب بيانات البوابة من الخادم بتمرير x-portal-session-token في الترويسة
 */
async function fetchPortalData() {
    const url = `${CONFIG.API_URL}/api/public/client?token=${encodeURIComponent(activeToken)}`;
    const headers = {};
    if (portalSessionToken) {
        headers['x-portal-session-token'] = portalSessionToken;
    }
    const res = await fetch(url, { headers });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
}

/**
 * إعادة تحميل البيانات بعد عملية ناجحة (رفع مستند / توقيع) وتحديث الواجهة فورياً
 */
async function refreshPortalData() {
    try {
        const { ok, status, data } = await fetchPortalData();
        if (status === 401 && data.require_pin) {
            clearPortalSession();
            showSecurityLockScreen();
            return;
        }
        if (ok && data && !data.error) {
            publicData = data;
            if (verifiedSessionPin) {
                await saveEncryptedPortalCache(data, verifiedSessionPin);
            }
            renderClientPortal();
        }
    } catch (e) {
        console.warn('Portal refresh failed:', e);
    }
}

/**
 * معالجة انتهاء جلسة البوابة (401) أثناء الرفع أو التوقيع
 */
function handlePortalSessionExpired(message) {
    clearPortalSession();
    ['missingDocsModal', 'signatureModal'].forEach(id => {
        const el = document.getElementById(id);
        const ins = el ? bootstrap.Modal.getInstance(el) : null;
        if (ins) ins.hide();
    });
    document.getElementById('main-content')?.classList.add('d-none');
    showSecurityLockScreen();
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            title: 'انتهت الجلسة',
            text: message || 'انتهت صلاحية جلسة البوابة الآمنة. يرجى إعادة إدخال رمز الدخول السري.',
            icon: 'warning',
            confirmButtonColor: 'var(--firm-primary)'
        });
    }
}

// متغيرات لوحة التوقيع الرقمي
let signaturePad = null;
let signatureCtx = null;
let isDrawing = false;
let pendingSignatureFile = null;

/**
 * دالة الحماية ضد هجمات حقن النصوص (XSS Protection)
 */
const escapeHTML = (str) => {
    if (str === null || str === undefined) return '';
    return str.toString().replace(/[&<>'"]/g,
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
};

// ============================================================================
// [1] التهيئة والمصادقة (Initialization & Auth Engine)
// ============================================================================

window.onload = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    activeToken = urlParams.get('token')?.trim() || null;

    const loader = document.getElementById('loader');

    if (!activeToken) {
        if (loader) {
            loader.innerHTML = `
                <div class="alert alert-danger text-center w-75 fw-bold shadow-sm mx-auto mt-5 rounded-4">
                    <i class="fas fa-exclamation-triangle fa-2x mb-3 text-danger"></i><br>
                    رابط القضية غير صالح أو مفقود.<br>
                    <small class="text-muted mt-2 d-block">يرجى مراجعة الرابط المرسل إليك من مكتب المحاماة.</small>
                </div>`;
        }
        return;
    }

    try {
        purgeLegacyPlaintextPortalStorage();
        try {
            portalSessionToken = sessionStorage.getItem(portalSessionKey()) || '';
        } catch (e) {}

        let data = null;
        if (navigator.onLine) {
            // إذا لم تُفتح جلسة بوابة بعد، نظهر شاشة القفل مباشرة دون إطلاق طلب 401
            if (!portalSessionToken) {
                showSecurityLockScreen();
                return;
            }

            const portal = await fetchPortalData();
            data = portal.data;

            // إذا انتهت جلسة الـ PIN في الوركر (401 require_pin)، نعيد عرض شاشة القفل بهدوء
            if (portal.status === 401 && data.require_pin) {
                clearPortalSession();
                showSecurityLockScreen();
                return;
            }

            if (!portal.ok) {
                throw new Error(data.error || "الملف غير موجود أو تم إيقاف صلاحية الوصول من قبل الإدارة.");
            }
        } else {
            // في وضع عدم الاتصال، نطلب إدخال الـ PIN أولاً لفك تشفير الكاش المحلي المشفر
            const hasEncrypted = localStorage.getItem(encryptedPortalCacheKey());
            if (hasEncrypted) {
                showSecurityLockScreen();
                return;
            } else {
                throw new Error("لا يوجد اتصال بالإنترنت لتحميل ملف القضية لأول مرة.");
            }
        }

        if (data && (data.case || (data.cases && data.cases.length > 0))) {
            publicData = data;
            if (portalSessionToken && navigator.onLine) {
                unlockPortal();
            } else {
                showSecurityLockScreen();
            }
        } else {
            throw new Error("بيانات ملف القضية غير متوفرة حالياً.");
        }
    } catch (error) {
        if (loader) {
            loader.innerHTML = `
                <div class="alert alert-danger text-center w-75 fw-bold mx-auto mt-5 rounded-4 shadow-sm">
                    <i class="fas fa-ban fa-2x mb-3 text-danger"></i><br>
                    ${escapeHTML(error.message)}
                </div>`;
        }
    }
};

/**
 * إظهار شاشة القفل وإدخال رمز الدخول السري
 */
function showSecurityLockScreen() {
    document.getElementById('loader')?.classList.add('d-none');
    const secLayer = document.getElementById('security-layer');
    if (secLayer) {
        secLayer.classList.remove('d-none');
        secLayer.classList.add('fade-in');
    }

    if (publicData && publicData.firm && publicData.firm.logo_url) {
        const logoSec = document.getElementById('firm-logo-sec');
        const logoImg = document.getElementById('firm-logo-img');
        if (logoSec && logoImg) {
            logoSec.classList.remove('d-none');
            logoImg.src = escapeHTML(publicData.firm.logo_url);
        }
    }

    setTimeout(() => {
        const pinEl = document.getElementById('pin_input');
        if (pinEl) pinEl.focus();
    }, 300);
}

/**
 * التحقق من رمز الدخول (PIN) وفتح البوابة
 */
window.verifyAccess = async function(event) {
    if (event) event.preventDefault();
    const pinInput = document.getElementById('pin_input');
    if (!pinInput) return;
    const enteredPin = normalizePin(pinInput.value);
    const caseData = (publicData && (publicData.case || (publicData.cases && publicData.cases[0]))) || {};
    const btn = document.getElementById('btn-verify');

    if (!enteredPin) {
        if (typeof Swal !== 'undefined') {
            Swal.fire({ toast: true, position: 'top-end', icon: 'warning', title: 'يرجى إدخال رمز الدخول السري', showConfirmButton: false, timer: 2500 });
        }
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> جاري التحقق الأمني المشفر...';
    }

    try {
        if (!navigator.onLine) {
            const decryptedData = await loadEncryptedPortalCache(enteredPin);
            if (decryptedData && (decryptedData.case || (decryptedData.cases && decryptedData.cases.length > 0))) {
                verifiedSessionPin = enteredPin;
                publicData = decryptedData;
                if (typeof Swal !== 'undefined') {
                    Swal.fire({ toast: true, position: 'top-end', icon: 'warning', title: 'أنت تتصفح النسخة المشفرة المحفوظة دون اتصال.', showConfirmButton: false, timer: 3000 });
                }
                unlockPortal();
                return;
            } else {
                throw new Error("الرمز السري غير صحيح أو انتهت صلاحية النسخة المشفرة المحفوظة (24 ساعة).");
            }
        }

        // 1. التحقق من الـ PIN عبر مسار تسجيل دخول الموكل بالوركر
        const res = await fetch(`${CONFIG.API_URL}/api/public/client/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token: activeToken,
                case_number: caseData.case_internal_id || undefined,
                access_pin: enteredPin
            })
        });

        const resData = await res.json().catch(() => ({}));

        if (res.ok && resData.success) {
            verifiedSessionPin = enteredPin;
            if (resData.token && resData.token !== activeToken) activeToken = resData.token;
            setPortalSession(resData.portal_session_token || '');

            // 2. جلب بيانات البوابة الكاملة عبر جلسة البوابة الموثقة خادمياً (x-portal-session-token)
            const portal = await fetchPortalData();
            const portalJson = portal.data;

            if (!portal.ok || portalJson.error) {
                if (portal.status === 401) clearPortalSession();
                throw new Error(portalJson.error || "تعذر جلب تفاصيل القضية بعد التحقق.");
            }

            publicData = portalJson;
            // حفظ نسخة مشفرة AES-GCM صالحة لـ 24 ساعة بدون تخزين الـ PIN إطلاقاً
            await saveEncryptedPortalCache(portalJson, enteredPin);

            unlockPortal();
        } else {
            throw new Error(resData.error || "رمز الدخول السري غير صحيح، يرجى المحاولة مجدداً.");
        }
    } catch (error) {
        if (typeof Swal !== 'undefined') Swal.fire('رفض الوصول', error.message, 'error');
        if (pinInput) {
            pinInput.value = '';
            pinInput.focus();
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-shield-alt me-2"></i> تأكيد ودخول آمن';
        }
    }
};

/**
 * تسجيل الخروج الآمن وإنهاء جلسة البوابة خادمياً ومحلياً
 */
window.logoutClient = function() {
    if (typeof Swal === 'undefined') {
        clearPortalSession(true);
        window.location.reload();
        return;
    }

    Swal.fire({
        title: 'تأكيد تسجيل الخروج',
        text: 'هل أنت متأكد من رغبتك في تسجيل الخروج ومسح بيانات الجلسة من هذا الجهاز؟',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: 'var(--firm-primary)',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'نعم، تسجيل خروج آمن',
        cancelButtonText: 'إلغاء'
    }).then(async (result) => {
        if (result.isConfirmed) {
            const currentSessionToken = portalSessionToken;
            clearPortalSession(true);
            publicData = null;

            if (currentSessionToken && navigator.onLine) {
                try {
                    await fetch(`${CONFIG.API_URL}/api/public/client/logout`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-portal-session-token': currentSessionToken
                        },
                        body: JSON.stringify({ token: activeToken, portal_session_token: currentSessionToken }),
                        keepalive: true
                    });
                } catch (e) {}
            }

            document.getElementById('main-content')?.classList.add('d-none');
            const secLayer = document.getElementById('security-layer');
            if (secLayer) secLayer.classList.remove('d-none');
            const pinEl = document.getElementById('pin_input');
            if (pinEl) {
                pinEl.value = '';
                pinEl.focus();
            }
        }
    });
};

// ============================================================================
// [2] محرك عرض الواجهة (UI Rendering Engine V5.6)
// ============================================================================

function unlockPortal() {
    document.getElementById('loader')?.classList.add('d-none');
    document.getElementById('security-layer')?.classList.add('d-none');
    const mainContent = document.getElementById('main-content');
    if (mainContent) {
        mainContent.classList.remove('d-none');
        mainContent.classList.add('fade-in');
    }
    renderClientPortal();
}

function renderClientPortal() {
    if (!publicData) return;
    const firm = publicData.firm || {};
    const client = publicData.client || {};
    const caseData = publicData.case || (publicData.cases && publicData.cases[0]) || {};
    const updates = publicData.updates || [];
    const files = publicData.files || [];
    const installments = publicData.installments || [];
    const appointments = publicData.appointments || [];

    // تطبيق ألوان وهوية المكتب (White-Labeling V5.6)
    if (firm.primary_color) {
        document.documentElement.style.setProperty('--firm-primary', firm.primary_color);
        document.documentElement.style.setProperty('--firm-light', firm.primary_color);
    }
    if (firm.accent_color) {
        document.documentElement.style.setProperty('--firm-accent', firm.accent_color);
    }
    if (firm.logo_url) {
        const logoSec = document.getElementById('firm-logo-sec');
        const logoImg = document.getElementById('firm-logo-img');
        if (logoSec && logoImg) {
            logoSec.classList.remove('d-none');
            logoImg.src = escapeHTML(firm.logo_url);
        }
    }

    // 1. الترويسة ومعلومات الموكل
    const firmNameEl = document.getElementById('ui-firm-name');
    if (firmNameEl) firmNameEl.innerText = firm.firm_name || 'مكتب المحاماة';
    
    const clientNameEl = document.getElementById('ui-client-name');
    if (clientNameEl) clientNameEl.innerText = client.full_name || 'الموكل الكريم';
    
    const caseStatusEl = document.getElementById('ui-case-status');
    if (caseStatusEl) caseStatusEl.innerText = caseData.status || 'نشطة';

    if (client.avatar_url) {
        document.getElementById('ui-client-avatar-icon')?.classList.add('d-none');
        const img = document.getElementById('ui-client-avatar-img');
        if (img) {
            img.src = escapeHTML(client.avatar_url);
            img.classList.remove('d-none');
        }
    }

    // ربط تيليغرام
    const tgBanner = document.getElementById('telegram-connect-banner');
    const tgLink = document.getElementById('telegram-deep-link');
    if (tgBanner && tgLink) {
        if (!client.telegram_id) {
            tgLink.href = `https://t.me/${BOT_USERNAME}?start=${activeToken}`;
            tgBanner.classList.remove('d-none');
        } else {
            tgBanner.classList.add('d-none');
        }
    }

    // شريط التقدم الإجرائي
    const stageText = caseData.current_stage ? `المرحلة: ${caseData.current_stage}` : 'جاري متابعة الإجراءات...';
    const progressTextEl = document.getElementById('ui-progress-text');
    if (progressTextEl) progressTextEl.innerText = stageText;
    
    const progressBarEl = document.getElementById('ui-progress-bar');
    if (progressBarEl) {
        let pct = '50%';
        if (caseData.status === 'مكتملة') pct = '100%';
        else if (caseData.status === 'استئناف' || caseData.status === 'تمييز') pct = '75%';
        else if (caseData.status === 'جديدة') pct = '25%';
        progressBarEl.style.width = pct;
        progressBarEl.setAttribute('aria-valuenow', pct.replace('%', ''));
    }

    // 2. معلومات القضية الأساسية
    const caseIdEl = document.getElementById('ui-case-id');
    if (caseIdEl) caseIdEl.innerText = caseData.case_internal_id || '--';
    
    const courtNameEl = document.getElementById('ui-court-name');
    if (courtNameEl) courtNameEl.innerText = caseData.current_court || '--';
    
    const opponentEl = document.getElementById('ui-opponent');
    if (opponentEl) opponentEl.innerText = caseData.opponent_name || '--';

    // 3. النواقص والمستندات المطلوبة (Missing Documents Request)
    let missingDocsList = [];
    try {
        const rawMissing = caseData.missing_docs_request ?? caseData.missing_documents;
        if (Array.isArray(rawMissing)) {
            missingDocsList = rawMissing;
        } else if (typeof rawMissing === 'string' && rawMissing.trim()) {
            const trimmed = rawMissing.trim();
            if (trimmed.startsWith('[')) {
                try { missingDocsList = JSON.parse(trimmed); } catch (e) { missingDocsList = [trimmed]; }
            } else {
                missingDocsList = [trimmed];
            }
        }
        missingDocsList = (missingDocsList || []).map(x => String(x).trim()).filter(Boolean);
    } catch (e) {}

    const missingBanner = document.getElementById('missing-docs-banner');
    const missingText = document.getElementById('missing-docs-text');
    const listDisplay = document.getElementById('missing-docs-list-display');
    if (missingBanner && missingText) {
        if (missingDocsList.length > 0) {
            missingBanner.classList.remove('d-none');
            missingText.innerText = `مطلوب تزويدنا بـ: ${missingDocsList.join('، ')}`;
            if (listDisplay) listDisplay.innerText = `المستند المطلوب: ${missingDocsList.join('، ')} — يرجى اختيار الملف (صورة أو PDF) ورفعه.`;
        } else {
            missingBanner.classList.add('d-none');
        }
    }

    // 4. التوقيع الإلكتروني المطلوب (Signature Request)
    pendingSignatureFile = null;
    const sigReq = caseData.signature_request;
    if (sigReq) {
        let sigTitle = 'مستند قانوني';
        if (typeof sigReq === 'string') {
            sigTitle = sigReq.trim() || sigTitle;
        } else if (typeof sigReq === 'object') {
            sigTitle = sigReq.title || sigReq.file_name || sigReq.document_name || sigTitle;
        }
        pendingSignatureFile = { file_name: sigTitle, source: 'case_signature_request' };
    }

    const sigBanner = document.getElementById('signature-request-banner');
    const sigText = document.getElementById('signature-request-text');
    if (sigBanner && sigText) {
        if (pendingSignatureFile) {
            sigBanner.classList.remove('d-none');
            sigText.innerText = `طلب المكتب توقيعك على: ${pendingSignatureFile.file_name}`;
        } else {
            sigBanner.classList.add('d-none');
        }
    }

    // 5. سجل الإجراءات (Timeline)
    const timelineContainer = document.getElementById('ui-timeline-container');
    if (timelineContainer) {
        if (updates.length > 0) {
            timelineContainer.innerHTML = updates.map(u => `
                <div class="timeline-item fade-in mb-3">
                    <small class="fw-bold font-monospace" style="color: var(--firm-primary);"><i class="fas fa-clock me-1"></i> ${new Date(u.created_at).toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}</small>
                    <h6 class="fw-bold mb-2 mt-2 fs-5" style="color: var(--firm-primary);">${escapeHTML(u.update_title)}</h6>
                    <p class="small text-muted mb-0 fw-bold lh-lg">${escapeHTML(u.update_details)}</p>
                    ${u.next_hearing_date ? `<div class="mt-3 p-2 bg-light rounded border border-danger border-opacity-25 text-danger small fw-bold"><i class="fas fa-gavel me-1"></i> موعد الجلسة القادمة: ${new Date(u.next_hearing_date).toLocaleDateString('ar-EG')}</div>` : ''}
                </div>`).join('');
        } else {
            timelineContainer.innerHTML = '<div class="alert text-center small text-muted border shadow-sm fw-bold p-4 rounded-4 bg-white"><i class="fas fa-info-circle fa-2x mb-2 opacity-50"></i><br>لا توجد إجراءات مسجلة حتى الآن.</div>';
        }
    }

    // 6. المواعيد والجلسات (مع خيار تصدير التقويم .ics)
    const apptsContainer = document.getElementById('ui-appointments-container');
    if (apptsContainer) {
        if (appointments.length > 0) {
            apptsContainer.innerHTML = appointments.map(a => {
                let statusClass = a.status === 'منجز' ? 'appt-completed' : (a.status === 'ملغي' ? 'appt-canceled' : '');
                let icon = a.status === 'منجز' ? 'fa-check-circle text-success' : (a.status === 'ملغي' ? 'fa-times-circle text-danger' : 'fa-clock text-primary');
                let badgeBg = a.status === 'منجز' ? 'bg-success' : (a.status === 'ملغي' ? 'bg-danger' : 'bg-primary');

                return `
                <div class="timeline-item fade-in mb-3 ${statusClass}">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <small class="fw-bold font-monospace text-muted"><i class="fas ${icon} me-1"></i> ${new Date(a.appt_date).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })}</small>
                        <span class="badge ${badgeBg} bg-opacity-10 text-${badgeBg.replace('bg-', '')} border border-${badgeBg.replace('bg-', '')} border-opacity-25 rounded-pill px-3 py-1">${escapeHTML(a.status)}</span>
                    </div>
                    <h6 class="fw-bold mb-1 mt-2 fs-5" style="color: var(--firm-primary);">${escapeHTML(a.title)}</h6>
                    <div class="d-flex justify-content-between align-items-center mt-2">
                        <small class="text-muted fw-bold"><i class="fas fa-tag me-1"></i> ${escapeHTML(a.type || 'موعد قضائي')}</small>
                        <button class="btn btn-sm btn-outline-secondary rounded-pill fw-bold px-3" onclick="exportClientApptToICS('${escapeHTML(a.title || 'موعد قضائي')}', '${escapeHTML(a.appt_date || '')}')">
                            <i class="fas fa-calendar-plus me-1"></i> أضف للتقويم
                        </button>
                    </div>
                    ${a.completion_notes ? `<div class="mt-2 text-success small fw-bold"><i class="fas fa-quote-right me-1"></i> مخرجات الجلسة: ${escapeHTML(a.completion_notes)}</div>` : ''}
                </div>`;
            }).join('');
        } else {
            apptsContainer.innerHTML = '<div class="alert text-center small text-muted border shadow-sm fw-bold p-4 rounded-4 bg-white"><i class="fas fa-calendar-times fa-2x mb-2 opacity-50"></i><br>لا توجد مواعيد مجدولة حالياً.</div>';
        }
    }

    // 7. الذمة المالية وسجل الدفعات
    const totalAgreed = Number(caseData.total_agreed_fees || caseData.agreed_fees) || 0;
    const totalPaid = installments.filter(i => i.status === 'مدفوعة').reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
    const totalRem = Math.max(0, totalAgreed - totalPaid);

    const agreedEl = document.getElementById('ui-fin-agreed');
    if (agreedEl) agreedEl.innerText = totalAgreed.toLocaleString('en-US');
    
    const paidEl = document.getElementById('ui-fin-paid');
    if (paidEl) paidEl.innerText = totalPaid.toLocaleString('en-US');
    
    const remEl = document.getElementById('ui-fin-rem');
    if (remEl) remEl.innerText = totalRem.toLocaleString('en-US');

    const payContainer = document.getElementById('ui-payments-container');
    if (payContainer) {
        if (installments.length > 0) {
            payContainer.innerHTML = installments.map(i => {
                const isPaid = i.status === 'مدفوعة';
                return `
                <div class="d-flex justify-content-between align-items-center bg-light p-3 rounded-3 border mb-2">
                    <div>
                        <b class="fs-5 font-monospace ${isPaid ? 'text-success' : 'text-dark'}">${Number(i.amount).toLocaleString('en-US')}</b> <small class="text-muted fw-bold">${escapeHTML(firm.currency || 'د.أ')}</small>
                        <small class="d-block text-muted fw-bold mt-1 font-monospace">${new Date(i.due_date || i.created_at).toLocaleDateString('ar-EG')}</small>
                    </div>
                    <span class="badge ${isPaid ? 'bg-success text-white' : 'bg-warning text-dark'} px-3 py-2 shadow-sm rounded-pill">${escapeHTML(i.status)}</span>
                </div>`;
            }).join('');
        } else {
            payContainer.innerHTML = '<div class="alert text-center small text-muted border shadow-sm fw-bold p-3 rounded-3 bg-light">لا توجد دفعات مالية مسجلة.</div>';
        }
    }

    // 8. المستندات والأرشيف السحابي المشفر
    const filesContainer = document.getElementById('ui-files-container');
    if (filesContainer) {
        if (files.length > 0) {
            filesContainer.innerHTML = files.map(f => {
                const fileKeyOrUrl = f.file_url || f.gdrive_file_id || '';
                const isR2 = fileKeyOrUrl && !fileKeyOrUrl.startsWith('http');
                const viewBtn = isR2
                    ? `<button class="btn btn-sm btn-outline-primary bg-white w-100 fw-bold rounded-pill shadow-sm" onclick="downloadSecureFile('${escapeHTML(fileKeyOrUrl)}', '${escapeHTML(f.file_name)}')"><i class="fas fa-lock me-1"></i> تحميل آمن</button>`
                    : `<a href="${escapeHTML(fileKeyOrUrl || '#')}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-outline-primary bg-white w-100 fw-bold rounded-pill shadow-sm"><i class="fas fa-external-link-alt me-1"></i> عرض</a>`;

                let signBadge = '';
                if (f.signature_hash) {
                    signBadge = `<div class="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 mt-2 w-100"><i class="fas fa-signature me-1"></i> مُوَقَّع إلكترونياً</div>`;
                }

                return `
                <div class="col-6 col-md-4 mb-3 fade-in">
                    <div class="bg-white p-3 text-center border rounded-4 shadow-sm h-100 d-flex flex-column">
                        <span class="badge bg-light text-muted border mb-2 mx-auto text-truncate" style="max-width:90%;">${escapeHTML(f.file_category || 'مستند')}</span>
                        <i class="fas fa-file-pdf fa-3x mb-2 text-danger opacity-75"></i>
                        <h6 class="small fw-bold text-truncate mb-3 mt-auto" style="color: var(--firm-primary);" title="${escapeHTML(f.file_name)}">${escapeHTML(f.file_name)}</h6>
                        ${viewBtn}
                        ${signBadge}
                    </div>
                </div>`;
            }).join('');
        } else {
            filesContainer.innerHTML = '<div class="col-12"><div class="alert text-center small text-muted border shadow-sm fw-bold p-4 rounded-4 bg-white">لا توجد مستندات متوفرة للتحميل حالياً.</div></div>';
        }
    }
}

/**
 * تصدير الموعد إلى ملف تقويم الهاتف القياسي (.ics)
 */
window.exportClientApptToICS = function(title, dateStr) {
    if (!dateStr) return;
    const start = new Date(dateStr);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const fmt = (d) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    const ics = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Moakkil Client Portal//AR',
        'BEGIN:VEVENT',
        `UID:moakkil-client-${Date.now()}@moakkil.erp`,
        `DTSTAMP:${fmt(new Date())}`,
        `DTSTART:${fmt(start)}`,
        `DTEND:${fmt(end)}`,
        `SUMMARY:${title}`,
        'DESCRIPTION:موعد قضائي مجدول عبر بوابة الموكل - نظام موكّل لإدارة المحاماة',
        'END:VEVENT',
        'END:VCALENDAR'
    ].join('\r\n');

    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Moakkil_Appt_${Date.now()}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
};

// ============================================================================
// [3] إدارة رفع النواقص (Missing Documents Direct R2 Stream)
// ============================================================================

window.openMissingDocsUpload = function() {
    const modalEl = document.getElementById('missingDocsModal');
    if (modalEl) {
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
    }
};

const PORTAL_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const PORTAL_ALLOWED_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'txt', 'xls', 'xlsx', 'csv']);

window.uploadMissingDoc = async function() {
    const fileInput = document.getElementById('missing-doc-file');
    if (!fileInput || !fileInput.files.length) {
        return Swal.fire({ toast: true, position: 'top-end', icon: 'warning', title: 'يرجى اختيار ملف أولاً', showConfirmButton: false, timer: 3000 });
    }
    if (!navigator.onLine) {
        return Swal.fire({ toast: true, position: 'top-end', icon: 'warning', title: 'تحتاج اتصالاً بالإنترنت لرفع المستند', showConfirmButton: false, timer: 3000 });
    }

    const file = fileInput.files[0];
    const ext = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : '';

    if (file.size > PORTAL_MAX_UPLOAD_BYTES) {
        return Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'حجم الملف يتجاوز 25 ميجابايت', showConfirmButton: false, timer: 3500 });
    }
    if (!ext || !PORTAL_ALLOWED_EXTENSIONS.has(ext)) {
        return Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'نوع الملف غير مسموح به (المسموح: PDF، صور، Word، Excel)', showConfirmButton: false, timer: 3500 });
    }

    const uploadBtn = document.querySelector('#missingDocsModal button[onclick="uploadMissingDoc()"]');
    const originalBtnHtml = uploadBtn ? uploadBtn.innerHTML : '';
    if (uploadBtn) {
        uploadBtn.disabled = true;
        uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> جاري الرفع السحابي...';
    }

    Swal.fire({ toast: true, position: 'top-end', icon: 'info', title: 'جاري رفع وتشفير المستند...', showConfirmButton: false });

    try {
        const uploadUrl = `${CONFIG.API_URL}/api/public/client/upload-missing-doc?token=${encodeURIComponent(activeToken)}`;
        const uploadHeaders = {
            'Content-Type': file.type || 'application/octet-stream',
            'x-portal-token': activeToken,
            'x-file-name': encodeURIComponent(file.name)
        };
        if (portalSessionToken) uploadHeaders['x-portal-session-token'] = portalSessionToken;

        const res = await fetch(uploadUrl, {
            method: 'POST',
            headers: uploadHeaders,
            body: file
        });

        const resData = await res.json().catch(() => ({}));

        if (res.status === 401) {
            handlePortalSessionExpired(resData.error);
            return;
        }
        if (!res.ok || !resData.success) {
            throw new Error(resData.error || "فشل الرفع السحابي للمستند.");
        }

        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: resData.message || 'تم إرسال المستند للمكتب بنجاح', showConfirmButton: false, timer: 4000 });

        const modalEl = document.getElementById('missingDocsModal');
        const modalIns = modalEl ? bootstrap.Modal.getInstance(modalEl) : null;
        if (modalIns) modalIns.hide();

        document.getElementById('missing-docs-banner')?.classList.add('d-none');
        fileInput.value = '';

        await refreshPortalData();
    } catch (e) {
        Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'خطأ: ' + e.message, showConfirmButton: false, timer: 3500 });
    } finally {
        if (uploadBtn) {
            uploadBtn.disabled = false;
            uploadBtn.innerHTML = originalBtnHtml;
        }
    }
};

/**
 * تحميل الملفات المشفرة بأمان من أرشيف R2
 */
window.downloadSecureFile = async function(r2Key, fileName) {
    if (!navigator.onLine) {
        return Swal.fire({ toast: true, position: 'top-end', icon: 'warning', title: 'تحتاج اتصالاً بالإنترنت للتحميل', showConfirmButton: false, timer: 3000 });
    }
    try {
        Swal.fire({ toast: true, position: 'top-end', icon: 'info', title: 'جاري فك التشفير والتحميل...', showConfirmButton: false });
        const dlHeaders = {};
        if (portalSessionToken) dlHeaders['x-portal-session-token'] = portalSessionToken;

        const res = await fetch(`${CONFIG.API_URL}/api/public/r2/download?key=${encodeURIComponent(r2Key)}&client_token=${encodeURIComponent(activeToken)}`, {
            headers: dlHeaders
        });

        if (res.status === 401) {
            const errData = await res.json().catch(() => ({}));
            handlePortalSessionExpired(errData.error);
            return;
        }
        if (res.status === 403) throw new Error('صلاحية التحميل مرفوضة أمنياً.');
        if (!res.ok) throw new Error('الملف غير متوفر حالياً في الأرشيف السحابي.');

        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName || 'document.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
    } catch (e) {
        Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'خطأ: ' + e.message, showConfirmButton: false, timer: 3000 });
    }
};

// ============================================================================
// [4] محرك التوقيع الإلكتروني المُصادق (High-DPI Retina Canvas & Cryptographic Hash)
// ============================================================================

window.openSignatureModal = function() {
    if (!pendingSignatureFile) return;
    const previewEl = document.getElementById('signature-document-preview');
    if (previewEl) {
        previewEl.innerHTML = `
            <h6 class="text-primary fw-bold mb-2">اسم المستند: ${escapeHTML(pendingSignatureFile.file_name)}</h6>
            <p class="small text-muted fw-bold mb-0">أنت على وشك اعتماد التوقيع الإلكتروني على هذا المستند. سيتم تسجيل التوقيع وتشفيره رقمياً ببصمة SHA-256 موثقة لضمان حجيتها القانونية الكاملة وعدم قابليتها للإنكار.</p>
        `;
    }
    const modalEl = document.getElementById('signatureModal');
    if (modalEl) {
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
        setTimeout(initSignaturePad, 250);
    }
};

function initSignaturePad() {
    const canvas = document.getElementById('signaturePad');
    if (!canvas) return;
    signaturePad = canvas;

    // دعم شاشات Retina فائقة الدقة (High-DPI Support)
    const dpr = window.devicePixelRatio || 1;
    const parent = canvas.parentElement;
    const rect = parent ? parent.getBoundingClientRect() : { width: 300 };
    const cssWidth = Math.max(260, rect.width - 32);
    const cssHeight = 200;

    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(cssHeight * dpr);

    signatureCtx = canvas.getContext('2d');
    signatureCtx.scale(dpr, dpr);
    signatureCtx.lineWidth = 3;
    signatureCtx.lineCap = 'round';
    signatureCtx.lineJoin = 'round';
    signatureCtx.strokeStyle = '#0B132B';

    clearSignature();

    // منع التمرير غير المقصود أثناء التوقيع باللمس على الهواتف
    const preventScroll = (e) => { if (e.target === canvas) e.preventDefault(); };
    document.body.addEventListener("touchstart", preventScroll, { passive: false });
    document.body.addEventListener("touchmove", preventScroll, { passive: false });
    document.body.addEventListener("touchend", preventScroll, { passive: false });

    // أحداث الماوس
    canvas.onmousedown = (e) => startDrawing(e.offsetX, e.offsetY);
    canvas.onmousemove = (e) => draw(e.offsetX, e.offsetY);
    canvas.onmouseup = stopDrawing;
    canvas.onmouseout = stopDrawing;

    // أحداث اللمس
    canvas.ontouchstart = (e) => {
        const r = canvas.getBoundingClientRect();
        const t = e.touches[0];
        startDrawing(t.clientX - r.left, t.clientY - r.top);
    };
    canvas.ontouchmove = (e) => {
        const r = canvas.getBoundingClientRect();
        const t = e.touches[0];
        draw(t.clientX - r.left, t.clientY - r.top);
    };
    canvas.ontouchend = stopDrawing;
}

function startDrawing(x, y) {
    isDrawing = true;
    signatureCtx.beginPath();
    signatureCtx.moveTo(x, y);
}

function draw(x, y) {
    if (!isDrawing) return;
    signatureCtx.lineTo(x, y);
    signatureCtx.stroke();
}

function stopDrawing() {
    isDrawing = false;
}

window.clearSignature = function() {
    if (!signatureCtx || !signaturePad) return;
    const dpr = window.devicePixelRatio || 1;
    signatureCtx.save();
    signatureCtx.setTransform(1, 0, 0, 1, 0, 0);
    signatureCtx.fillStyle = '#FFFFFF';
    signatureCtx.fillRect(0, 0, signaturePad.width, signaturePad.height);
    signatureCtx.restore();
};

window.submitSignature = async function() {
    if (!pendingSignatureFile || !signaturePad) return;

    // التحقق من أن اللوحة ليست بيضاء
    const blankCanvas = document.createElement('canvas');
    blankCanvas.width = signaturePad.width;
    blankCanvas.height = signaturePad.height;
    const blankCtx = blankCanvas.getContext('2d');
    blankCtx.fillStyle = '#FFFFFF';
    blankCtx.fillRect(0, 0, blankCanvas.width, blankCanvas.height);

    if (signaturePad.toDataURL() === blankCanvas.toDataURL()) {
        return Swal.fire({ toast: true, position: 'top-end', icon: 'warning', title: 'يرجى رسم توقيعك داخل الإطار أولاً', showConfirmButton: false, timer: 3000 });
    }

    if (!navigator.onLine) {
        return Swal.fire({ toast: true, position: 'top-end', icon: 'warning', title: 'تحتاج اتصالاً بالإنترنت لاعتماد التوقيع', showConfirmButton: false, timer: 3000 });
    }

    // تأكيد هوية الموكل بإعادة إدخال رمز الـ PIN لإضفاء الحجية القانونية
    const pinCheck = await Swal.fire({
        title: 'مصادقة التوقيع',
        text: 'يرجى إدخال الرمز السري (PIN) الخاص بملف قضيتك لتأكيد التوقيع واعتماده قانونياً.',
        input: 'text',
        inputAttributes: {
            maxlength: 12,
            autocapitalize: 'characters',
            autocorrect: 'off',
            spellcheck: 'false',
            inputmode: 'text',
            dir: 'ltr',
            style: 'text-align:center; letter-spacing:8px; font-weight:900; text-transform:uppercase; font-family:monospace; font-size:1.5rem;'
        },
        showCancelButton: true,
        confirmButtonText: 'تأكيد التوقيع',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: 'var(--firm-primary)'
    });

    if (!pinCheck.isConfirmed || !pinCheck.value) return;
    const normalizedSigPin = normalizePin(pinCheck.value);

    Swal.fire({ title: 'جاري التحقق والاعتماد المشفر...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const caseData = publicData.case || (publicData.cases && publicData.cases[0]) || {};
        const loginRes = await fetch(`${CONFIG.API_URL}/api/public/client/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token: activeToken,
                case_number: caseData.case_internal_id || undefined,
                access_pin: normalizedSigPin
            })
        });
        const loginData = await loginRes.json().catch(() => ({}));
        if (!loginRes.ok || !loginData.success) {
            return Swal.fire('فشل المصادقة', loginData.error || 'الرمز السري غير صحيح، تم إلغاء عملية التوقيع.', 'error');
        }
        verifiedSessionPin = normalizedSigPin;
        setPortalSession(loginData.portal_session_token || portalSessionToken);

        // توليد الهاش التشفيري SHA-256
        const signatureBase64 = signaturePad.toDataURL('image/png');
        const timestamp = new Date().toISOString();
        const userAgent = navigator.userAgent;

        const encoder = new TextEncoder();
        const dataToHash = encoder.encode(signatureBase64 + timestamp + userAgent + activeToken);
        const hashBuffer = await crypto.subtle.digest('SHA-256', dataToHash);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const signatureHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        const sigHeaders = { 'Content-Type': 'application/json' };
        if (portalSessionToken) sigHeaders['x-portal-session-token'] = portalSessionToken;

        const res = await fetch(`${CONFIG.API_URL}/api/public/client/submit-signature`, {
            method: 'POST',
            headers: sigHeaders,
            body: JSON.stringify({
                token: activeToken,
                portal_session_token: portalSessionToken || undefined,
                signature_data: signatureBase64,
                signature_hash: signatureHash,
                metadata: { timestamp, userAgent }
            })
        });

        const resData = await res.json().catch(() => ({}));

        if (res.status === 401) {
            handlePortalSessionExpired(resData.error);
            return;
        }
        if (!res.ok || !resData.success) {
            throw new Error(resData.error || "تعذر حفظ التوقيع في الخادم.");
        }

        Swal.fire('تم الاعتماد بنجاح', resData.message || 'تم توثيق وتشفير توقيعك على المستند بنجاح.', 'success');

        const modalEl = document.getElementById('signatureModal');
        const modalIns = modalEl ? bootstrap.Modal.getInstance(modalEl) : null;
        if (modalIns) modalIns.hide();

        document.getElementById('signature-request-banner')?.classList.add('d-none');
        pendingSignatureFile = null;

        await refreshPortalData();
    } catch (e) {
        Swal.fire('خطأ تقني', e.message, 'error');
    }
};

// ============================================================================
// [5] إنشاء كشف الحساب المالي (PDF Statement Generator)
// ============================================================================

window.generateStatement = async function() {
    if (typeof Swal !== 'undefined') {
        Swal.fire({ toast: true, position: 'top-end', icon: 'info', title: 'جاري إعداد كشف الحساب...', showConfirmButton: false });
    }

    if (typeof html2pdf === 'undefined') {
        await new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
            script.onload = resolve;
            document.head.appendChild(script);
        });
    }

    const firm = publicData.firm || {};
    const client = publicData.client || {};
    const caseData = publicData.case || (publicData.cases && publicData.cases[0]) || {};
    const installments = publicData.installments || [];

    const totalAgreed = Number(caseData.total_agreed_fees || caseData.agreed_fees) || 0;
    const totalPaid = installments.filter(i => i.status === 'مدفوعة').reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
    const totalRem = Math.max(0, totalAgreed - totalPaid);
    const currency = firm.currency || 'د.أ';
    const dateToday = new Date().toLocaleDateString('ar-EG');

    const invoiceHTML = `
        <div id="invoice-pdf-content" style="padding: 40px; font-family: 'Cairo', sans-serif; direction: rtl; color: #0B132B; background: #FFFFFF;">
            <div style="text-align: center; border-bottom: 2px solid ${firm.accent_color || '#D4AF37'}; padding-bottom: 20px; margin-bottom: 30px;">
                <h2 style="color: ${firm.primary_color || '#0B132B'}; margin: 0; font-weight: 800;">${escapeHTML(firm.firm_name || 'مكتب المحاماة')}</h2>
                <h4 style="color: #5A6578; margin: 10px 0 0 0; font-weight: 700;">كشف حساب مالي رسمي (الملف رقم: ${escapeHTML(caseData.case_internal_id)})</h4>
                <p style="margin: 5px 0 0 0; font-size: 14px; color: #888;">تاريخ الإصدار: ${dateToday}</p>
                ${firm.address ? `<p style="margin: 3px 0 0 0; font-size: 13px; color: #888;">${escapeHTML(firm.address)}</p>` : ''}
            </div>
            
            <div style="margin-bottom: 30px; line-height: 2;">
                <p style="margin: 0;"><strong>الموكل الكريم:</strong> ${escapeHTML(client.full_name)}</p>
                <p style="margin: 0;"><strong>المحكمة المختصة:</strong> ${escapeHTML(caseData.current_court || '--')}</p>
                <p style="margin: 0;"><strong>الطرف الخصم:</strong> ${escapeHTML(caseData.opponent_name || '--')}</p>
            </div>

            <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
                <thead>
                    <tr style="background-color: ${firm.primary_color || '#0B132B'}; color: white;">
                        <th style="padding: 12px; border: 1px solid #DDD; text-align: center;">البيان</th>
                        <th style="padding: 12px; border: 1px solid #DDD; text-align: center;">المبلغ (${escapeHTML(currency)})</th>
                        <th style="padding: 12px; border: 1px solid #DDD; text-align: center;">تاريخ الاستحقاق</th>
                        <th style="padding: 12px; border: 1px solid #DDD; text-align: center;">الحالة</th>
                    </tr>
                </thead>
                <tbody>
                    ${installments.length > 0 ? installments.map(i => `
                    <tr>
                        <td style="padding: 12px; border: 1px solid #DDD; text-align: center;">دفعة أتعاب موثقة</td>
                        <td style="padding: 12px; border: 1px solid #DDD; text-align: center; font-weight: bold;">${Number(i.amount).toLocaleString('en-US')}</td>
                        <td style="padding: 12px; border: 1px solid #DDD; text-align: center;">${new Date(i.due_date || i.created_at).toLocaleDateString('ar-EG')}</td>
                        <td style="padding: 12px; border: 1px solid #DDD; text-align: center; font-weight: bold; color: ${i.status === 'مدفوعة' ? '#1F7A5C' : '#B3372F'};">${escapeHTML(i.status)}</td>
                    </tr>
                    `).join('') : `
                    <tr>
                        <td colspan="4" style="padding: 16px; border: 1px solid #DDD; text-align: center; color: #888;">لا توجد دفعات مسجلة</td>
                    </tr>
                    `}
                </tbody>
            </table>

            <div style="border: 1px solid #E2E8F0; padding: 22px; background-color: #FAF8F3; border-radius: 12px; margin-bottom: 30px;">
                <h4 style="margin-top: 0; color: ${firm.primary_color || '#0B132B'}; font-weight: 800;">خلاصة الموقف المالي:</h4>
                <p style="margin: 6px 0;">إجمالي الأتعاب المتفق عليها: <strong>${totalAgreed.toLocaleString('en-US')} ${escapeHTML(currency)}</strong></p>
                <p style="margin: 6px 0; color: #1F7A5C;">إجمالي المسدد فعلياً: <strong>${totalPaid.toLocaleString('en-US')} ${escapeHTML(currency)}</strong></p>
                <p style="margin: 6px 0; color: #B3372F; font-size: 17px;">الرصيد المتبقي بذمة الموكل: <strong>${totalRem.toLocaleString('en-US')} ${escapeHTML(currency)}</strong></p>
            </div>
            
            <div style="text-align: center; margin-top: 50px; font-size: 12px; color: #888; border-top: 1px solid #EEE; padding-top: 15px;">
                تم استخراج هذا الكشف آلياً وموثقاً عبر نظام موكّل لإدارة المحاماة V5.6.
            </div>
        </div>
    `;

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = invoiceHTML;
    document.body.appendChild(tempDiv);

    const opt = {
        margin:       0.3,
        filename:     `كشف_حساب_${(client.full_name || 'موكل').replace(/\s+/g, '_')}_${caseData.case_internal_id || 'ملف'}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true },
        jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
    };

    try {
        await html2pdf().set(opt).from(tempDiv.firstElementChild).save();
        if (typeof Swal !== 'undefined') {
            Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'تم تحميل كشف الحساب بنجاح', showConfirmButton: false, timer: 3000 });
        }
    } catch (err) {
        console.error('PDF generation error:', err);
    } finally {
        document.body.removeChild(tempDiv);
    }
};
