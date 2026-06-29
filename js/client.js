/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: js/client.js
 * الوصف: المحرك الشامل لبوابة الموكل العامة (Client Portal)
 * الميزات:
 * 1. المصادقة الآمنة عبر الـ PIN مع دعم العمل بلا إنترنت (Offline Cache).
 * 2. محرك التوقيع الرقمي المزدوج (Canvas + Cryptographic SHA-256 Hash + WebAuthn).
 * 3. آلية رفع المستندات الناقصة (Missing Docs Upload) للباك إند.
 * 4. التوليد الآلي لكشوفات الحساب بصيغة PDF.
 * ============================================================================
 */

let publicData = null;
let activeToken = null;
const BOT_USERNAME = "Moakkil_bot";

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
    activeToken = urlParams.get('token');

    if (!activeToken) {
        document.getElementById('loader').innerHTML = '<div class="alert alert-danger text-center w-75 fw-bold shadow-sm mx-auto mt-5 rounded-4"><i class="fas fa-exclamation-triangle fa-2x mb-2"></i><br>الرابط غير صالح أو مفقود. يرجى طلب رابط جديد من المكتب.</div>';
        return;
    }

    try {
        let data = null;
        if (navigator.onLine) {
            const res = await fetch(`${CONFIG.API_URL}/api/public/client?token=${activeToken}`);
            data = await res.json();
            if (!res.ok) throw new Error(data.error || "الملف غير موجود أو تم إيقاف صلاحية الوصول من قبل الإدارة.");
            localStorage.setItem(`moakkil_client_cache_${activeToken}`, JSON.stringify(data));
        } else {
            const cached = localStorage.getItem(`moakkil_client_cache_${activeToken}`);
            if (cached) {
                data = JSON.parse(cached);
                if (typeof Swal !== 'undefined') Swal.fire({ toast: true, position: 'top-end', icon: 'warning', title: 'أنت تتصفح في وضع عدم الاتصال.', showConfirmButton: false, timer: 3000 });
            } else throw new Error("لا يوجد اتصال بالإنترنت لتحميل ملف القضية لأول مرة.");
        }

        if (data && (data.case || (data.cases && data.cases.length > 0))) {
            publicData = data;
            document.getElementById('loader').classList.add('d-none');
            document.getElementById('security-layer').classList.remove('d-none');
            document.getElementById('security-layer').classList.add('fade-in');
            
            if(publicData.firm && publicData.firm.logo_url) {
                document.getElementById('firm-logo-sec').classList.remove('d-none');
                document.getElementById('firm-logo-img').src = escapeHTML(publicData.firm.logo_url);
            }
            
            setTimeout(() => document.getElementById('pin_input').focus(), 300);
        } else {
            throw new Error("بيانات ملف القضية غير متوفرة أو معلقة.");
        }
    } catch (error) {
        document.getElementById('loader').innerHTML = `<div class="alert alert-danger text-center w-75 fw-bold mx-auto mt-5 rounded-4 shadow-sm"><i class="fas fa-ban fa-2x mb-2"></i><br>${escapeHTML(error.message)}</div>`;
    }
};

window.verifyAccess = async function(event) {
    event.preventDefault();
    const enteredPin = document.getElementById('pin_input').value;
    const caseData = publicData.case || publicData.cases[0] || {};
    const btn = document.getElementById('btn-verify');
    
    btn.disabled = true; 
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> جاري التحقق الأمني...';

    try {
        if (!navigator.onLine) {
            const savedPin = localStorage.getItem(`moakkil_offline_pin_${caseData.case_internal_id}`);
            if (savedPin === enteredPin) { unlockPortal(); return; } 
            else throw new Error("الرمز السري غير صحيح.");
        }

        const res = await fetch(`${CONFIG.API_URL}/api/public/client/login`, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ case_number: caseData.case_internal_id, access_pin: enteredPin })
        });
        
        const resData = await res.json();
        
        if (res.ok && resData.success) {
            localStorage.setItem(`moakkil_offline_pin_${caseData.case_internal_id}`, enteredPin);
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
    document.getElementById('security-layer').classList.add('d-none');
    const mainContent = document.getElementById('main-content');
    mainContent.classList.remove('d-none');
    mainContent.classList.add('fade-in');
    renderClientPortal();
}

function renderClientPortal() {
    const firm = publicData.firm || {};
    const client = publicData.client || {};
    const caseData = publicData.case || publicData.cases[0] || {};
    const updates = publicData.updates || [];
    const files = publicData.files || [];
    const installments = publicData.installments || [];
    const appointments = publicData.appointments || [];

    // 1. الترويسة وبيانات המوكل
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
    }

    // 2. معلومات القضية
    document.getElementById('ui-case-id').innerText = escapeHTML(caseData.case_internal_id || '--');
    document.getElementById('ui-court-name').innerText = escapeHTML(caseData.current_court || '--');
    document.getElementById('ui-opponent').innerText = escapeHTML(caseData.opponent_name || '--');

    // 3. النواقص (Missing Documents)
    let missingDocsList = [];
    try {
        if (typeof caseData.missing_documents === 'string') missingDocsList = JSON.parse(caseData.missing_documents);
        else if (Array.isArray(caseData.missing_documents)) missingDocsList = caseData.missing_documents;
    } catch(e) {}

    if (missingDocsList && missingDocsList.length > 0) {
        document.getElementById('missing-docs-banner').classList.remove('d-none');
        document.getElementById('missing-docs-text').innerText = `مطلوب تزويدنا بـ: ${missingDocsList.join('، ')}`;
    } else {
        document.getElementById('missing-docs-banner').classList.add('d-none');
    }

    // 4. التوقيع الإلكتروني (Signature Request)
    pendingSignatureFile = files.find(f => f.requires_signature === true && !f.signature_hash);
    if (pendingSignatureFile) {
        document.getElementById('signature-request-banner').classList.remove('d-none');
        document.getElementById('signature-request-text').innerText = `طلب المكتب توقيعك على: ${escapeHTML(pendingSignatureFile.file_name)}`;
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

    // 6. المواعيد
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
                    <span class="badge ${badgeBg} bg-opacity-10 text-${badgeBg.replace('bg-','')} border border-${badgeBg.replace('bg-','')} border-opacity-25 rounded-pill px-3 py-1">${escapeHTML(a.status)}</span>
                </div>
                <h6 class="fw-bold mb-1 mt-2 fs-5" style="color: var(--firm-primary);">${escapeHTML(a.title)}</h6>
                <small class="text-muted fw-bold"><i class="fas fa-tag me-1"></i> ${escapeHTML(a.type || 'موعد')}</small>
                ${a.completion_notes ? `<div class="mt-2 text-success small fw-bold"><i class="fas fa-quote-right me-1"></i> مخرجات: ${escapeHTML(a.completion_notes)}</div>` : ''}
            </div>`;
        }).join('');
    } else {
        apptsContainer.innerHTML = '<div class="alert text-center small text-muted border shadow-sm fw-bold p-4 rounded-4 bg-white"><i class="fas fa-calendar-times fa-2x mb-2 opacity-50"></i><br>لا توجد مواعيد مجدولة.</div>';
    }

    // 7. المالية
    const totalAgreed = Number(caseData.total_agreed_fees) || 0;
    const totalPaid = installments.filter(i => i.status === 'مدفوعة').reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
    
    document.getElementById('ui-fin-agreed').innerText = totalAgreed.toLocaleString('en-US');
    document.getElementById('ui-fin-paid').innerText = totalPaid.toLocaleString('en-US');
    document.getElementById('ui-fin-rem').innerText = (totalAgreed - totalPaid).toLocaleString('en-US');

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
            const isR2 = f.file_url && !f.file_url.startsWith('http');
            const viewBtn = isR2 
                ? `<button class="btn btn-sm btn-outline-primary bg-white w-100 fw-bold rounded-pill shadow-sm" onclick="downloadSecureFile('${escapeHTML(f.file_url)}', '${escapeHTML(f.file_name)}')"><i class="fas fa-lock me-1"></i> تحميل آمن</button>`
                : `<a href="${escapeHTML(f.file_url || '#')}" target="_blank" class="btn btn-sm btn-outline-primary bg-white w-100 fw-bold rounded-pill shadow-sm"><i class="fas fa-external-link-alt me-1"></i> عرض</a>`;
            
            let signBadge = '';
            if (f.signature_hash) {
                signBadge = `<div class="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 mt-2 w-100"><i class="fas fa-signature me-1"></i> مُوَقَّع إلكترونياً</div>`;
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

// ============================================================================
// [3] إدارة النواقص (Missing Documents Upload)
// ============================================================================

window.openMissingDocsUpload = function() {
    const modal = new bootstrap.Modal(document.getElementById('missingDocsModal'));
    modal.show();
};

window.uploadMissingDoc = async function() {
    const fileInput = document.getElementById('missing-doc-file');
    if (!fileInput.files.length) return Swal.fire({toast: true, position: 'top-end', icon: 'warning', title: 'يرجى اختيار ملف أولاً', showConfirmButton: false, timer: 3000});
    
    const file = fileInput.files[0];
    const caseData = publicData.case || publicData.cases[0] || {};

    Swal.fire({toast: true, position: 'top-end', icon: 'info', title: 'جاري الرفع والتشفير...', showConfirmButton: false});

    try {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async () => {
            const base64 = reader.result.split(',')[1];
            const payload = {
                token: activeToken,
                case_id: caseData.id,
                file_name: file.name,
                file_type: file.type,
                file_data: base64
            };

            const res = await fetch(`${CONFIG.API_URL}/api/public/upload-missing-doc`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error("فشل الرفع السحابي، يرجى المحاولة لاحقاً.");

            Swal.fire({toast: true, position: 'top-end', icon: 'success', title: 'تم إرسال المستند للمكتب بنجاح', showConfirmButton: false, timer: 4000});
            
            const modalEl = document.getElementById('missingDocsModal');
            const modalIns = bootstrap.Modal.getInstance(modalEl);
            if(modalIns) modalIns.hide();
            
            document.getElementById('missing-docs-banner').classList.add('d-none');
            fileInput.value = '';
            
            // إعادة تحميل البيانات صامتاً لتحديث الواجهة
            fetch(`${CONFIG.API_URL}/api/public/client?token=${activeToken}`).then(r=>r.json()).then(d=>{ publicData=d; renderClientPortal(); });
        };
    } catch (e) {
        Swal.fire({toast: true, position: 'top-end', icon: 'error', title: 'خطأ: ' + e.message, showConfirmButton: false, timer: 3000});
    }
};

window.downloadSecureFile = async function(r2Key, fileName) {
    if (!navigator.onLine) return Swal.fire({toast: true, position: 'top-end', icon: 'warning', title: 'تحتاج إنترنت للتحميل', showConfirmButton: false, timer: 3000});
    try {
        Swal.fire({toast: true, position: 'top-end', icon: 'info', title: 'جاري فك التشفير والتحميل...', showConfirmButton: false});
        const res = await fetch(`${CONFIG.API_URL}/api/public/r2/download?key=${encodeURIComponent(r2Key)}&client_token=${activeToken}`);
        
        if (res.status === 401) throw new Error('صلاحية التحميل مرفوضة أمنياً.');
        if (!res.ok) throw new Error('الملف غير متوفر حالياً في الأرشيف السحابي.');
        
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = fileName || 'document.pdf';
        document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url);
    } catch (e) {
        Swal.fire({toast: true, position: 'top-end', icon: 'error', title: 'خطأ: ' + e.message, showConfirmButton: false, timer: 3000});
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
    initSignaturePad();
};

function initSignaturePad() {
    const canvas = document.getElementById('signaturePad');
    if(!canvas) return;
    
    // ضبط الأبعاد لمنع التمدد في الشاشات
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width - 30; // حواف بسيطة
    canvas.height = 200;
    
    signatureCtx = canvas.getContext('2d');
    signatureCtx.lineWidth = 3;
    signatureCtx.lineCap = 'round';
    signatureCtx.strokeStyle = '#0B132B';
    
    clearSignature(); // لضمان خلفية بيضاء نظيفة

    // منع التمرير (Scrolling) أثناء التوقيع على الموبايل
    const preventScroll = (e) => { if(e.target === canvas) e.preventDefault(); };
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
    if(!signatureCtx || !signaturePad) return;
    signatureCtx.fillStyle = '#ffffff';
    signatureCtx.fillRect(0, 0, signaturePad.width, signaturePad.height);
};

window.submitSignature = async function() {
    if (!pendingSignatureFile) return;

    // فحص ما إذا كانت اللوحة بيضاء (لم يتم التوقيع)
    const blankCanvas = document.createElement('canvas');
    blankCanvas.width = signaturePad.width; blankCanvas.height = signaturePad.height;
    const blankCtx = blankCanvas.getContext('2d');
    blankCtx.fillStyle = '#ffffff'; blankCtx.fillRect(0, 0, blankCanvas.width, blankCanvas.height);
    
    if (signaturePad.toDataURL() === blankCanvas.toDataURL()) {
        return Swal.fire({toast: true, position: 'top-end', icon: 'warning', title: 'يرجى رسم توقيعك داخل الإطار أولاً.', showConfirmButton: false, timer: 3000});
    }

    // طلب التحقق عبر البصمة (WebAuthn) إن وجد، وإلا نطلب הـ PIN الخاص بالبوابة كبديل أمني
    let authConfirmed = false;
    
    if (window.PublicKeyCredential) {
        try {
            const challenge = new Uint8Array(32);
            window.crypto.getRandomValues(challenge);
            await navigator.credentials.get({
                publicKey: {
                    challenge: challenge,
                    rpId: window.location.hostname,
                    userVerification: "required",
                    timeout: 60000
                }
            });
            authConfirmed = true; // تمت المصادقة البيومترية
        } catch (e) {
            console.warn("Biometric verification failed or cancelled, falling back to PIN.", e);
        }
    }

    // إذا فشلت البصمة أو لم يدعمها الجهاز، نطلب הـ PIN للتوثيق الإضافي
    if (!authConfirmed) {
        const pinCheck = await Swal.fire({
            title: 'مصادقة التوقيع',
            text: 'يرجى إدخال الرمز السري (PIN) الخاص بملفك لتأكيد التوقيع واعتماده قانونياً.',
            input: 'password',
            inputAttributes: { maxlength: 6, autocapitalize: 'off', autocorrect: 'off' },
            showCancelButton: true,
            confirmButtonText: 'تأكيد التوقيع',
            cancelButtonText: 'إلغاء',
            confirmButtonColor: 'var(--firm-primary)'
        });

        if (!pinCheck.isConfirmed || !pinCheck.value) return;
        
        const caseData = publicData.case || publicData.cases[0] || {};
        const savedPin = localStorage.getItem(`moakkil_offline_pin_${caseData.case_internal_id}`);
        
        if (pinCheck.value !== savedPin) {
            return Swal.fire('فشل المصادقة', 'الرمز السري غير صحيح، تم إلغاء عملية التوقيع.', 'error');
        }
    }

    // توليد الهاش التشفيري (Cryptographic Hash)
    Swal.fire({title: 'جاري التشفير والاعتماد...', allowOutsideClick: false, didOpen: () => Swal.showLoading()});
    
    try {
        const signatureBase64 = signaturePad.toDataURL('image/png');
        const timestamp = new Date().toISOString();
        const userAgent = navigator.userAgent;
        
        const encoder = new TextEncoder();
        const dataToHash = encoder.encode(signatureBase64 + timestamp + userAgent + activeToken);
        const hashBuffer = await crypto.subtle.digest('SHA-256', dataToHash);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const signatureHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // إرسال للباك إند (نستدعي مسار عام مخصص لاستقبال التواقيع)
        const res = await fetch(`${CONFIG.API_URL}/api/public/submit-signature`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token: activeToken,
                file_id: pendingSignatureFile.id,
                signature_base64: signatureBase64,
                signature_hash: signatureHash,
                metadata: { timestamp, userAgent }
            })
        });

        if (!res.ok) throw new Error("تعذر حفظ التوقيع في الخادم.");

        Swal.fire('تم الاعتماد', 'تم توثيق وتشفير توقيعك على المستند بنجاح.', 'success');
        
        const modalEl = document.getElementById('signatureModal');
        const modalIns = bootstrap.Modal.getInstance(modalEl);
        if(modalIns) modalIns.hide();
        
        document.getElementById('signature-request-banner').classList.add('d-none');
        pendingSignatureFile = null;
        
        // إعادة تحميل البيانات لتحديث حالة الملف
        fetch(`${CONFIG.API_URL}/api/public/client?token=${activeToken}`).then(r=>r.json()).then(d=>{ publicData=d; renderClientPortal(); });

    } catch (e) {
        Swal.fire('خطأ تقني', e.message, 'error');
    }
};

// ============================================================================
// [5] إنشاء كشف الحساب المالي (PDF Generator)
// ============================================================================
window.generateStatement = async function() {
    if(typeof Swal !== 'undefined') Swal.fire({toast: true, position: 'top-end', icon: 'info', title: 'جاري إنشاء كشف الحساب...', showConfirmButton: false});

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
    const caseData = publicData.case || publicData.cases[0] || {};
    const installments = publicData.installments || [];
    
    const totalAgreed = Number(caseData.total_agreed_fees) || 0;
    const totalPaid = installments.filter(i => i.status === 'مدفوعة').reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
    const totalRem = totalAgreed - totalPaid;

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
        filename:     `كشف_حساب_${client.full_name.replace(/\s+/g, '_')}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true },
        jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(tempDiv.firstElementChild).save().then(() => {
        document.body.removeChild(tempDiv);
        if(typeof Swal !== 'undefined') Swal.fire({toast: true, position: 'top-end', icon: 'success', title: 'تم تحميل الكشف بنجاح', showConfirmButton: false, timer: 3000});
    });
};