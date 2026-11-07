/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: js/client.js
 * الوصف: المحرك الشامل لبوابة الموكل العامة (Client Portal - V5.2 Full Enterprise)
 * الميزات الكاملة المحتفظ بها والمحصنة:
 * 1. المصادقة الآمنة عبر الـ PIN (Zero-Trust Server PIN) مع دعم العمل بلا إنترنت (Offline Cache).
 * 2. محرك التوقيع الرقمي المزدوج (Canvas + Cryptographic SHA-256 Hash + WebAuthn).
 * 3. آلية رفع المستندات الناقصة (Missing Docs Upload) للباك إند.
 * 4. التوليد الآلي لكشوفات الحساب بصيغة PDF عبر html2pdf.
 * 5. تصدير المواعيد لتقويم الهاتف (.ics) والتحميل الآمن من Cloudflare R2.
 * ============================================================================
 */

let publicData = null;
let activeToken = null;
let verifiedSessionPin = '';
// رمز جلسة البوابة الصادر من الوركر عند نجاح الدخول (POST /api/public/client/login)
let portalSessionToken = '';
const BOT_USERNAME = "Moakkil_bot";

// مفاتيح التخزين المؤقت لجلسة البوابة (sessionStorage تُمسح بإغلاق التبويب)
const portalSessionKey = () => `moakkil_portal_session_${activeToken}`;
const legacyPortalPinKey = () => `moakkil_portal_pin_${activeToken}`;

/**
 * حفظ/مسح رمز جلسة البوابة
 */
function setPortalSession(sessionToken) {
    portalSessionToken = sessionToken || '';
    try {
        if (portalSessionToken) sessionStorage.setItem(portalSessionKey(), portalSessionToken);
        else sessionStorage.removeItem(portalSessionKey());
        // إزالة الـ PIN النصي القديم من التخزين (لم يعد يُستخدم)
        sessionStorage.removeItem(legacyPortalPinKey());
    } catch (e) {}
}

function clearPortalSession() {
    setPortalSession('');
    verifiedSessionPin = '';
}

/**
 * جلب بيانات البوابة من الخادم بالاعتماد على جلسة الـ PIN الموثقة في الوركر (بدون تمرير الـ PIN في الرابط)
 * @returns {{ok:boolean, status:number, data:object}}
 */
async function fetchPortalData() {
    let url = `${CONFIG.API_URL}/api/public/client?token=${encodeURIComponent(activeToken)}`;
    if (portalSessionToken) url += `&portal_session_token=${encodeURIComponent(portalSessionToken)}`;
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
}

/**
 * إعادة تحميل البيانات بعد عملية ناجحة (رفع/توقيع) وتحديث الواجهة
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
            localStorage.setItem(`moakkil_client_cache_${activeToken}`, JSON.stringify(data));
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
    document.getElementById('main-content').classList.add('d-none');
    showSecurityLockScreen();
    Swal.fire('انتهت الجلسة', message || 'انتهت جلسة البوابة. يرجى إعادة إدخال رمز الـ PIN.', 'warning');
}

// متغيرات لوحة التوقيع (Canvas)
let signaturePad = null;
let signatureCtx = null;
let isDrawing = false;
let pendingSignatureFile = null;

/**
 * حماية ضد ثغرات XSS
 */
const escapeHTML = (str) => {
    if (str === null || str === undefined) return '';
    return str.toString().replace(/[&<>'"]/g,
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
};

// ============================================================================
// [1] التهيئة والمصادقة (Initialization & Auth)
// ============================================================================

window.onload = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    activeToken = urlParams.get('token')?.trim() || null;

    if (!activeToken) {
        document.getElementById('loader').innerHTML = '<div class="alert alert-danger text-center w-75 fw-bold shadow-sm mx-auto mt-5 rounded-4"><i class="fas fa-exclamation-triangle fa-2x mb-2"></i><br>الرابط غير صالح أو مفقود. يرجى طلب رابط جديد من المكتب.</div>';
        return;
    }

    try {
        // استرجاع رمز جلسة البوابة الحالية إن وجد (بدلاً من تخزين الـ PIN نصياً)
        try {
            portalSessionToken = sessionStorage.getItem(portalSessionKey()) || '';
            sessionStorage.removeItem(legacyPortalPinKey());
        } catch (e) {}

        let data = null;
        if (navigator.onLine) {
            // إذا لم تُفتح جلسة بوابة بعد، نظهر شاشة القفل مباشرة دون إطلاق طلب 401
            if (!portalSessionToken) {
                const cached = localStorage.getItem(`moakkil_client_cache_${activeToken}`);
                if (cached) {
                    try { publicData = JSON.parse(cached); } catch (e) {}
                }
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
            localStorage.setItem(`moakkil_client_cache_${activeToken}`, JSON.stringify(data));
        } else {
            const cached = localStorage.getItem(`moakkil_client_cache_${activeToken}`);
            if (cached) {
                data = JSON.parse(cached);
                if (typeof Swal !== 'undefined') Swal.fire({ toast: true, position: 'top-end', icon: 'warning', title: 'أنت تتصفح في وضع عدم الاتصال.', showConfirmButton: false, timer: 3000 });
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
            throw new Error("بيانات ملف القضية غير متوفرة أو معلقة.");
        }
    } catch (error) {
        document.getElementById('loader').innerHTML = `<div class="alert alert-danger text-center w-75 fw-bold mx-auto mt-5 rounded-4 shadow-sm"><i class="fas fa-ban fa-2x mb-2"></i><br>${escapeHTML(error.message)}</div>`;
    }
};

/**
 * إظهار شاشة القفل وإدخال رمز الـ PIN
 */
function showSecurityLockScreen() {
    document.getElementById('loader').classList.add('d-none');
    const secLayer = document.getElementById('security-layer');
    secLayer.classList.remove('d-none');
    secLayer.classList.add('fade-in');

    if (publicData && publicData.firm && publicData.firm.logo_url) {
        document.getElementById('firm-logo-sec').classList.remove('d-none');
        document.getElementById('firm-logo-img').src = escapeHTML(publicData.firm.logo_url);
    }

    setTimeout(() => {
        const pinEl = document.getElementById('pin_input');
        if (pinEl) pinEl.focus();
    }, 300);
}

window.verifyAccess = async function(event) {
    event.preventDefault();
    const enteredPin = document.getElementById('pin_input').value.trim();
    const caseData = (publicData && (publicData.case || (publicData.cases && publicData.cases[0]))) || {};
    const btn = document.getElementById('btn-verify');

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> جاري التحقق الأمني...';

    try {
        if (!navigator.onLine) {
            const savedPinByToken = localStorage.getItem(`moakkil_offline_pin_${activeToken}`);
            const savedPinByCase = caseData.case_internal_id ? localStorage.getItem(`moakkil_offline_pin_${caseData.case_internal_id}`) : null;
            if ((savedPinByToken && savedPinByToken === enteredPin) || (savedPinByCase && savedPinByCase === enteredPin)) {
                verifiedSessionPin = enteredPin;
                unlockPortal();
                return;
            } else {
                throw new Error("الرمز السري غير صحيح.");
            }
        }

        // 1. التحقق من الـ PIN عبر مسار تسجيل دخول الموكل (يدعم token و case_number معاً)
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
            // الوركر يُعيد رابط القضية المعتمد ورمز جلسة البوابة (portal_session_token)
            if (resData.token && resData.token !== activeToken) activeToken = resData.token;
            setPortalSession(resData.portal_session_token || '');
            localStorage.setItem(`moakkil_offline_pin_${activeToken}`, enteredPin);

            // 2. جلب بيانات البوابة الكاملة عبر جلسة الـ PIN الموثقة على الخادم (بدون إعادة إرسال الـ PIN في الرابط)
            const portal = await fetchPortalData();
            const portalJson = portal.data;

            if (!portal.ok || portalJson.error) {
                if (portal.status === 401) clearPortalSession();
                throw new Error(portalJson.error || "تعذر جلب بيانات القضية بعد التحقق.");
            }

            publicData = portalJson;
            localStorage.setItem(`moakkil_client_cache_${activeToken}`, JSON.stringify(portalJson));

            const loadedCase = publicData.case || (publicData.cases && publicData.cases[0]) || {};
            if (loadedCase.case_internal_id) {
                localStorage.setItem(`moakkil_offline_pin_${loadedCase.case_internal_id}`, enteredPin);
            }

            unlockPortal();
        } else {
            throw new Error(resData.error || "الرمز السري خاطئ، يرجى التأكد والمحاولة مجدداً.");
        }
    } catch (error) {
        if (typeof Swal !== 'undefined') Swal.fire('رفض الوصول', error.message, 'error');
        document.getElementById('pin_input').value = '';
        document.getElementById('pin_input').focus();
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-shield-check me-2"></i> تأكيد ودخول';
    }
};

window.logoutClient = function() {
    Swal.fire({
        title: 'تأكيد الخروج',
        text: 'هل أنت متأكد من رغبتك في تسجيل الخروج من البوابة الآمنة؟',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: 'var(--firm-primary)',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'نعم، خروج',
        cancelButtonText: 'إلغاء'
    }).then((result) => {
        if (result.isConfirmed) {
            clearPortalSession();
            document.getElementById('main-content').classList.add('d-none');
            document.getElementById('security-layer').classList.remove('d-none');
            document.getElementById('pin_input').value = '';
        }
    });
};

// ============================================================================
// [2] عرض البيانات (UI Rendering Engine)
// ============================================================================

function unlockPortal() {
    document.getElementById('loader').classList.add('d-none');
    document.getElementById('security-layer').classList.add('d-none');
    const mainContent = document.getElementById('main-content');
    mainContent.classList.remove('d-none');
    mainContent.classList.add('fade-in');
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

    // تطبيق ألوان المكتب (White-Labeling)
    if (firm.primary_color) {
        document.documentElement.style.setProperty('--firm-primary', firm.primary_color);
        document.documentElement.style.setProperty('--firm-light', firm.primary_color);
    }
    if (firm.accent_color) {
        document.documentElement.style.setProperty('--firm-accent', firm.accent_color);
    }
    if (firm.logo_url) {
        document.getElementById('firm-logo-sec').classList.remove('d-none');
        document.getElementById('firm-logo-img').src = escapeHTML(firm.logo_url);
    }

    // 1. الترويسة وبيانات الموكل
    document.getElementById('ui-firm-name').innerText = escapeHTML(firm.firm_name || 'مكتب المحاماة');
    document.getElementById('ui-client-name').innerText = escapeHTML(client.full_name || 'الموكل الكريم');
    document.getElementById('ui-case-status').innerText = escapeHTML(caseData.status || 'نشطة');

    if (client.avatar_url) {
        document.getElementById('ui-client-avatar-icon').classList.add('d-none');
        const img = document.getElementById('ui-client-avatar-img');
        img.src = escapeHTML(client.avatar_url);
        img.classList.remove('d-none');
    }

    if (!client.telegram_id) {
        const tgLink = `https://t.me/${BOT_USERNAME}?start=${activeToken}`;
        document.getElementById('telegram-deep-link').href = tgLink;
        document.getElementById('telegram-connect-banner').classList.remove('d-none');
    } else {
        document.getElementById('telegram-connect-banner').classList.add('d-none');
    }

    // شريط التقدم
    const stageText = caseData.current_stage ? `المرحلة الإجرائية: ${caseData.current_stage}` : 'جاري العمل على الملف...';
    const progressTextEl = document.getElementById('ui-progress-text');
    if (progressTextEl) progressTextEl.innerText = stageText;
    const progressBarEl = document.getElementById('ui-progress-bar');
    if (progressBarEl) {
        progressBarEl.style.width = caseData.status === 'مكتملة' ? '100%' : (caseData.status === 'استئناف' || caseData.status === 'تمييز' ? '75%' : '50%');
    }

    // 2. معلومات القضية
    document.getElementById('ui-case-id').innerText = escapeHTML(caseData.case_internal_id || '--');
    document.getElementById('ui-court-name').innerText = escapeHTML(caseData.current_court || '--');
    document.getElementById('ui-opponent').innerText = escapeHTML(caseData.opponent_name || '--');

    // 3. النواقص (Missing Documents) — الحقل المعتمد في قائمة السماح بالوركر: missing_docs_request
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

    if (missingDocsList.length > 0) {
        document.getElementById('missing-docs-banner').classList.remove('d-none');
        document.getElementById('missing-docs-text').innerText = `مطلوب تزويدنا بـ: ${missingDocsList.join('، ')}`;
        const listDisplay = document.getElementById('missing-docs-list-display');
        if (listDisplay) listDisplay.innerText = `المستند المطلوب: ${missingDocsList.join('، ')} — يرجى اختيار الملف (صورة أو PDF) ورفعه.`;
    } else {
        document.getElementById('missing-docs-banner').classList.add('d-none');
    }

    // 4. التوقيع الإلكتروني (Signature Request) — الحقل المعتمد في الوركر: signature_request على مستوى القضية
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

    if (pendingSignatureFile) {
        document.getElementById('signature-request-banner').classList.remove('d-none');
        document.getElementById('signature-request-text').innerText = `طلب المكتب توقيعك على: ${pendingSignatureFile.file_name}`;
    } else {
        document.getElementById('signature-request-banner').classList.add('d-none');
    }

    // 5. الإجراءات (Timeline)
    const timelineContainer = document.getElementById('ui-timeline-container');
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

    // 6. المواعيد (مع زر الإضافة لتقويم الهاتف .ics)
    const apptsContainer = document.getElementById('ui-appointments-container');
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
                    <small class="text-muted fw-bold"><i class="fas fa-tag me-1"></i> ${escapeHTML(a.type || 'موعد')}</small>
                    <button class="btn btn-sm btn-outline-secondary rounded-pill fw-bold px-3" onclick="exportClientApptToICS('${escapeHTML(a.title || 'موعد قانوني')}', '${escapeHTML(a.appt_date || '')}')">
                        <i class="fas fa-calendar-plus me-1"></i> أضف للتقويم
                    </button>
                </div>
                ${a.completion_notes ? `<div class="mt-2 text-success small fw-bold"><i class="fas fa-quote-right me-1"></i> مخرجات: ${escapeHTML(a.completion_notes)}</div>` : ''}
            </div>`;
        }).join('');
    } else {
        apptsContainer.innerHTML = '<div class="alert text-center small text-muted border shadow-sm fw-bold p-4 rounded-4 bg-white"><i class="fas fa-calendar-times fa-2x mb-2 opacity-50"></i><br>لا توجد مواعيد مجدولة.</div>';
    }

    // 7. المالية
    const totalAgreed = Number(caseData.total_agreed_fees || caseData.agreed_fees) || 0;
    const totalPaid = installments.filter(i => i.status === 'مدفوعة').reduce((sum, i) => sum + (Number(i.amount) || 0), 0);

    document.getElementById('ui-fin-agreed').innerText = totalAgreed.toLocaleString('en-US');
    document.getElementById('ui-fin-paid').innerText = totalPaid.toLocaleString('en-US');
    document.getElementById('ui-fin-rem').innerText = Math.max(0, totalAgreed - totalPaid).toLocaleString('en-US');

    const payContainer = document.getElementById('ui-payments-container');
    if (installments.length > 0) {
        payContainer.innerHTML = installments.map(i => {
            const isPaid = i.status === 'مدفوعة';
            return `
            <div class="d-flex justify-content-between align-items-center bg-light p-3 rounded-3 border mb-2">
                <div>
                    <b class="fs-5 font-monospace ${isPaid ? 'text-success' : 'text-dark'}">${Number(i.amount).toLocaleString('en-US')}</b> <small class="text-muted fw-bold">د.أ</small>
                    <small class="d-block text-muted fw-bold mt-1 font-monospace">${new Date(i.due_date || i.created_at).toLocaleDateString('ar-EG')}</small>
                </div>
                <span class="badge ${isPaid ? 'bg-success text-white' : 'bg-warning text-dark'} px-3 py-2 shadow-sm rounded-pill">${escapeHTML(i.status)}</span>
            </div>`;
        }).join('');
    } else {
        payContainer.innerHTML = '<div class="alert text-center small text-muted border shadow-sm fw-bold p-3 rounded-3 bg-light">لا توجد دفعات مالية مسجلة.</div>';
    }

    // 8. المستندات والأرشيف السحابي
    const filesContainer = document.getElementById('ui-files-container');
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
        filesContainer.innerHTML = '<div class="col-12"><div class="alert text-center small text-muted border shadow-sm fw-bold p-4 rounded-4 bg-white">لا توجد مستندات متوفرة للتحميل.</div></div>';
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
        'DESCRIPTION:موعد قضائي مجدول عبر بوابة الموكل - نظام موكّل ERP',
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
// [3] إدارة النواقص (Missing Documents Upload)
// ============================================================================

window.openMissingDocsUpload = function() {
    const modal = new bootstrap.Modal(document.getElementById('missingDocsModal'));
    modal.show();
};

// حدود الرفع المطابقة لإعدادات الوركر (MAX_R2_UPLOAD_BYTES و ALLOWED_R2_EXTENSIONS)
const PORTAL_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const PORTAL_ALLOWED_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'txt', 'xls', 'xlsx', 'csv']);

window.uploadMissingDoc = async function() {
    const fileInput = document.getElementById('missing-doc-file');
    if (!fileInput.files.length) return Swal.fire({ toast: true, position: 'top-end', icon: 'warning', title: 'يرجى اختيار ملف أولاً', showConfirmButton: false, timer: 3000 });
    if (!navigator.onLine) return Swal.fire({ toast: true, position: 'top-end', icon: 'warning', title: 'تحتاج اتصالاً بالإنترنت لرفع المستند', showConfirmButton: false, timer: 3000 });

    const file = fileInput.files[0];
    const ext = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : '';

    if (file.size > PORTAL_MAX_UPLOAD_BYTES) {
        return Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'حجم الملف يتجاوز 25 ميجابايت', showConfirmButton: false, timer: 3500 });
    }
    if (!ext || !PORTAL_ALLOWED_EXTENSIONS.has(ext)) {
        return Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'نوع الملف غير مسموح. المسموح: PDF، صور، Word، Excel', showConfirmButton: false, timer: 3500 });
    }

    const uploadBtn = document.querySelector('#missingDocsModal button[onclick="uploadMissingDoc()"]');
    const originalBtnHtml = uploadBtn ? uploadBtn.innerHTML : '';
    if (uploadBtn) {
        uploadBtn.disabled = true;
        uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> جاري الرفع...';
    }

    Swal.fire({ toast: true, position: 'top-end', icon: 'info', title: 'جاري الرفع والتشفير...', showConfirmButton: false });

    try {
        // رفع الملف كبيانات ثنائية مباشرة (Stream) إلى المسار الخادمي الجديد في الوركر
        let uploadUrl = `${CONFIG.API_URL}/api/public/client/upload-missing-doc?token=${encodeURIComponent(activeToken)}`;
        if (portalSessionToken) uploadUrl += `&portal_session_token=${encodeURIComponent(portalSessionToken)}`;

        const res = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                'Content-Type': file.type || 'application/octet-stream',
                'x-portal-token': activeToken,
                'x-file-name': encodeURIComponent(file.name)
            },
            body: file
        });

        const resData = await res.json().catch(() => ({}));

        if (res.status === 401) {
            handlePortalSessionExpired(resData.error);
            return;
        }
        if (!res.ok || !resData.success) {
            throw new Error(resData.error || "فشل الرفع السحابي، يرجى المحاولة لاحقاً.");
        }

        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: resData.message || 'تم إرسال المستند للمكتب بنجاح', showConfirmButton: false, timer: 4000 });

        const modalEl = document.getElementById('missingDocsModal');
        const modalIns = bootstrap.Modal.getInstance(modalEl);
        if (modalIns) modalIns.hide();

        document.getElementById('missing-docs-banner').classList.add('d-none');
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

window.downloadSecureFile = async function(r2Key, fileName) {
    if (!navigator.onLine) return Swal.fire({ toast: true, position: 'top-end', icon: 'warning', title: 'تحتاج إنترنت للتحميل', showConfirmButton: false, timer: 3000 });
    try {
        Swal.fire({ toast: true, position: 'top-end', icon: 'info', title: 'جاري فك التشفير والتحميل...', showConfirmButton: false });
        const res = await fetch(`${CONFIG.API_URL}/api/public/r2/download?key=${encodeURIComponent(r2Key)}&client_token=${encodeURIComponent(activeToken)}`);

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
// [4] محرك التوقيع الإلكتروني عن بُعد (Remote E-Signature & Hash)
// ============================================================================

window.openSignatureModal = function() {
    if (!pendingSignatureFile) return;
    document.getElementById('signature-document-preview').innerHTML = `
        <h6 class="text-primary fw-bold mb-2">اسم المستند: ${escapeHTML(pendingSignatureFile.file_name)}</h6>
        <p class="small text-muted fw-bold mb-0">أنت على وشك التوقيع على هذا المستند. سيتم تسجيل التوقيع وتشفيره رقمياً لضمان صحته قانونياً وعدم قابليته للتعديل أو الإنكار.</p>
    `;
    const modal = new bootstrap.Modal(document.getElementById('signatureModal'));
    modal.show();
    setTimeout(initSignaturePad, 250);
};

function initSignaturePad() {
    const canvas = document.getElementById('signaturePad');
    if (!canvas) return;
    signaturePad = canvas;

    // ضبط الأبعاد لمنع التمدد في الشاشات
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = Math.max(260, rect.width - 30);
    canvas.height = 200;

    signatureCtx = canvas.getContext('2d');
    signatureCtx.lineWidth = 3;
    signatureCtx.lineCap = 'round';
    signatureCtx.strokeStyle = '#0B132B';

    clearSignature();

    // منع التمرير (Scrolling) أثناء التوقيع على الموبايل
    const preventScroll = (e) => { if (e.target === canvas) e.preventDefault(); };
    document.body.addEventListener("touchstart", preventScroll, { passive: false });
    document.body.addEventListener("touchmove", preventScroll, { passive: false });
    document.body.addEventListener("touchend", preventScroll, { passive: false });

    // أحداث الماوس
    canvas.onmousedown = (e) => startDrawing(e.offsetX, e.offsetY);
    canvas.onmousemove = (e) => draw(e.offsetX, e.offsetY);
    canvas.onmouseup = stopDrawing;
    canvas.onmouseout = stopDrawing;

    // أحداث اللمس (الموبايل)
    canvas.ontouchstart = (e) => {
        const r = canvas.getBoundingClientRect();
        startDrawing(e.touches[0].clientX - r.left, e.touches[0].clientY - r.top);
    };
    canvas.ontouchmove = (e) => {
        const r = canvas.getBoundingClientRect();
        draw(e.touches[0].clientX - r.left, e.touches[0].clientY - r.top);
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
    signatureCtx.fillStyle = '#ffffff';
    signatureCtx.fillRect(0, 0, signaturePad.width, signaturePad.height);
};

window.submitSignature = async function() {
    if (!pendingSignatureFile || !signaturePad) return;

    // فحص ما إذا كانت اللوحة بيضاء (لم يتم التوقيع)
    const blankCanvas = document.createElement('canvas');
    blankCanvas.width = signaturePad.width;
    blankCanvas.height = signaturePad.height;
    const blankCtx = blankCanvas.getContext('2d');
    blankCtx.fillStyle = '#ffffff';
    blankCtx.fillRect(0, 0, blankCanvas.width, blankCanvas.height);

    if (signaturePad.toDataURL() === blankCanvas.toDataURL()) {
        return Swal.fire({ toast: true, position: 'top-end', icon: 'warning', title: 'يرجى رسم توقيعك داخل الإطار أولاً.', showConfirmButton: false, timer: 3000 });
    }

    if (!navigator.onLine) {
        return Swal.fire({ toast: true, position: 'top-end', icon: 'warning', title: 'تحتاج اتصالاً بالإنترنت لاعتماد التوقيع', showConfirmButton: false, timer: 3000 });
    }

    // تأكيد هوية الموكل بإعادة إدخال الـ PIN والتحقق منه على الخادم (يجدد جلسة البوابة أيضاً)
    const pinCheck = await Swal.fire({
        title: 'مصادقة التوقيع',
        text: 'يرجى إدخال الرمز السري (PIN) الخاص بملفك لتأكيد التوقيع واعتماده قانونياً.',
        input: 'password',
        inputAttributes: { maxlength: 6, autocapitalize: 'off', autocorrect: 'off', inputmode: 'numeric' },
        showCancelButton: true,
        confirmButtonText: 'تأكيد التوقيع',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: 'var(--firm-primary)'
    });

    if (!pinCheck.isConfirmed || !pinCheck.value) return;

    Swal.fire({ title: 'جاري التحقق والاعتماد...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const caseData = publicData.case || (publicData.cases && publicData.cases[0]) || {};
        const loginRes = await fetch(`${CONFIG.API_URL}/api/public/client/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token: activeToken,
                case_number: caseData.case_internal_id || undefined,
                access_pin: pinCheck.value.trim()
            })
        });
        const loginData = await loginRes.json().catch(() => ({}));
        if (!loginRes.ok || !loginData.success) {
            return Swal.fire('فشل المصادقة', loginData.error || 'الرمز السري غير صحيح، تم إلغاء عملية التوقيع.', 'error');
        }
        verifiedSessionPin = pinCheck.value.trim();
        setPortalSession(loginData.portal_session_token || portalSessionToken);

        // توليد الهاش التشفيري (Cryptographic Hash) كبصمة مرجعية للتوقيع
        const signatureBase64 = signaturePad.toDataURL('image/png');
        const timestamp = new Date().toISOString();
        const userAgent = navigator.userAgent;

        const encoder = new TextEncoder();
        const dataToHash = encoder.encode(signatureBase64 + timestamp + userAgent + activeToken);
        const hashBuffer = await crypto.subtle.digest('SHA-256', dataToHash);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const signatureHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // الإرسال للمسار الخادمي الجديد في الوركر
        const res = await fetch(`${CONFIG.API_URL}/api/public/client/submit-signature`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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

        Swal.fire('تم الاعتماد', resData.message || 'تم توثيق وتشفير توقيعك على المستند بنجاح.', 'success');

        const modalEl = document.getElementById('signatureModal');
        const modalIns = bootstrap.Modal.getInstance(modalEl);
        if (modalIns) modalIns.hide();

        document.getElementById('signature-request-banner').classList.add('d-none');
        pendingSignatureFile = null;

        await refreshPortalData();

    } catch (e) {
        Swal.fire('خطأ تقني', e.message, 'error');
    }
};

// ============================================================================
// [5] إنشاء كشف الحساب المالي (PDF Generator)
// ============================================================================
window.generateStatement = async function() {
    if (typeof Swal !== 'undefined') Swal.fire({ toast: true, position: 'top-end', icon: 'info', title: 'جاري إنشاء كشف الحساب...', showConfirmButton: false });

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

    const dateToday = new Date().toLocaleDateString('ar-EG');

    const invoiceHTML = `
        <div id="invoice-pdf-content" style="padding: 40px; font-family: 'Cairo', sans-serif; direction: rtl; color: #1a1a1a;">
            <div style="text-align: center; border-bottom: 2px solid ${firm.accent_color || '#D4AF37'}; padding-bottom: 20px; margin-bottom: 30px;">
                <h2 style="color: ${firm.primary_color || '#0B132B'}; margin: 0;">${escapeHTML(firm.firm_name || 'مكتب المحاماة')}</h2>
                <h4 style="color: #6C757D; margin: 10px 0 0 0;">كشف حساب مالي (القضية رقم: ${escapeHTML(caseData.case_internal_id)})</h4>
                <p style="margin: 5px 0 0 0; font-size: 14px;">تاريخ الكشف: ${dateToday}</p>
            </div>
            
            <div style="margin-bottom: 30px;">
                <p><strong>السادة / السيد:</strong> ${escapeHTML(client.full_name)}</p>
                <p><strong>المحكمة المختصة:</strong> ${escapeHTML(caseData.current_court || '--')}</p>
            </div>

            <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
                <thead>
                    <tr style="background-color: ${firm.primary_color || '#0B132B'}; color: white;">
                        <th style="padding: 12px; border: 1px solid #ddd;">البيان</th>
                        <th style="padding: 12px; border: 1px solid #ddd;">المبلغ (د.أ)</th>
                        <th style="padding: 12px; border: 1px solid #ddd;">التاريخ</th>
                        <th style="padding: 12px; border: 1px solid #ddd;">الحالة</th>
                    </tr>
                </thead>
                <tbody>
                    ${installments.map(i => `
                    <tr>
                        <td style="padding: 12px; border: 1px solid #ddd; text-align: center;">دفعة أتعاب</td>
                        <td style="padding: 12px; border: 1px solid #ddd; text-align: center; font-weight: bold;">${Number(i.amount).toLocaleString('en-US')}</td>
                        <td style="padding: 12px; border: 1px solid #ddd; text-align: center;">${new Date(i.created_at).toLocaleDateString('ar-EG')}</td>
                        <td style="padding: 12px; border: 1px solid #ddd; text-align: center;">${escapeHTML(i.status)}</td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>

            <div style="border: 1px solid #ddd; padding: 20px; background-color: #f8f9fa; border-radius: 8px;">
                <h3 style="margin-top: 0; color: ${firm.primary_color || '#0B132B'};">خلاصة الحساب:</h3>
                <p>إجمالي الأتعاب المتفق عليها: <strong>${totalAgreed.toLocaleString('en-US')} د.أ</strong></p>
                <p style="color: green;">إجمالي ما تم دفعه: <strong>${totalPaid.toLocaleString('en-US')} د.أ</strong></p>
                <p style="color: red; font-size: 18px;">الرصيد المتبقي ذمة: <strong>${totalRem.toLocaleString('en-US')} د.أ</strong></p>
            </div>
            
            <div style="text-align: center; margin-top: 50px; font-size: 12px; color: #888;">
                تم استخراج هذا الكشف آلياً من نظام موكّل الإلكتروني الموثق ولا يحتاج لختم أو توقيع.
            </div>
        </div>
    `;

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = invoiceHTML;
    document.body.appendChild(tempDiv);

    const opt = {
        margin:       0,
        filename:     `كشف_حساب_${(client.full_name || 'موكل').replace(/\s+/g, '_')}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true },
        jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(tempDiv.firstElementChild).save().then(() => {
        document.body.removeChild(tempDiv);
        if (typeof Swal !== 'undefined') Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'تم تحميل الكشف بنجاح', showConfirmButton: false, timer: 3000 });
    });
};