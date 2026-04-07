// js/client.js - محرك بوابة الموكل العامة (التحقق بالرقم السري وعرض البيانات المتطورة بأمان)
// التحديثات: ربط نظام الحماية من التخمين (Brute-Force)، ودعم وضع عدم الاتصال (Offline Cache).

let publicData = null;

// حماية من XSS (لحماية الواجهة من أي نصوص خبيثة)
const escapeHTML = (str) => {
    if (!str) return '';
    return str.toString().replace(/[&<>'"]/g, tag => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag] || tag));
};

window.onload = async () => {
    // التقاط الـ Token العميق من الرابط
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    if (!token) {
        document.getElementById('loader').innerHTML = '<div class="alert alert-danger text-center w-75 fw-bold shadow-sm">الرابط غير صالح أو منتهي الصلاحية.</div>';
        return;
    }

    try {
        let data = null;
        
        // 1. دعم وضع الأوفلاين (Offline Mode)
        if (navigator.onLine) {
            // الاتصال الآمن بالمحرك السحابي للعموم
            const res = await fetch(`${CONFIG.API_URL}/api/public/client?token=${token}`);
            data = await res.json();
            
            if (!res.ok) throw new Error(data.error || "الملف غير موجود");
            
            // حفظ نسخة آمنة في المتصفح للحالات التي ينقطع فيها الإنترنت
            localStorage.setItem(`moakkil_client_cache_${token}`, JSON.stringify(data));
        } else {
            // جلب البيانات من الكاش المحلي
            const cached = localStorage.getItem(`moakkil_client_cache_${token}`);
            if (cached) {
                data = JSON.parse(cached);
                if (typeof Swal !== 'undefined') {
                    Swal.fire({ toast: true, position: 'top-end', icon: 'warning', title: 'أنت بوضع عدم الاتصال. يتم عرض آخر نسخة محفوظة.', showConfirmButton: false, timer: 5000 });
                }
            } else {
                throw new Error("لا يوجد اتصال بالإنترنت ولا توجد نسخة محفوظة مسبقاً لهذا الملف.");
            }
        }

        // التوافق مع التعديلات البرمجية (دعم object مباشر أو مصفوفة)
        if (data && (data.case || (data.cases && data.cases.length > 0))) {
            publicData = data;
            
            // تطبيق هوية المكتب (الألوان واللوغو) إن وجدت
            applyFirmIdentity(data.firm);
            
            // إخفاء التحميل وإظهار شاشة إدخال الرمز السري (PIN)
            document.getElementById('loader').classList.add('d-none');
            document.getElementById('security-layer').classList.remove('d-none');
            document.getElementById('pin_input').focus();
        } else {
            throw new Error("الملف غير موجود أو تم إغلاقه.");
        }
    } catch (error) {
        document.getElementById('loader').innerHTML = `<div class="alert alert-danger text-center w-75 fw-bold shadow-sm"><i class="fas fa-exclamation-triangle fa-2x mb-2 d-block"></i> تعذر الوصول للملف: ${escapeHTML(error.message)}</div>`;
    }
};

function applyFirmIdentity(firm) {
    if (!firm) return;
    const root = document.documentElement;
    if (firm.primary_color) root.style.setProperty('--firm-primary', firm.primary_color);
    if (firm.accent_color) root.style.setProperty('--firm-accent', firm.accent_color);
    
    if (firm.logo_url) {
        const logoImg = document.getElementById('firm-logo-img');
        if(logoImg) {
            logoImg.src = escapeHTML(firm.logo_url);
            document.getElementById('firm-logo-sec').classList.remove('d-none');
        }
    }
}

// دالة التحقق من صحة الـ PIN المرتبطة بالسيرفر لحماية التخمين (Brute-Force)
async function verifyAccess(event) {
    event.preventDefault();
    const enteredPin = document.getElementById('pin_input').value;
    
    // استخراج بيانات القضية
    const caseData = publicData.case || publicData.cases[0] || {};
    
    const btn = document.getElementById('btn-verify');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> جاري التحقق الأمني...';

    try {
        if (!navigator.onLine) {
            // في حالة الأوفلاين، نعتمد على الكاش المحلي المؤقت للـ PIN إن وجد
            const savedPin = localStorage.getItem(`moakkil_offline_pin_${caseData.case_internal_id}`);
            if (savedPin && savedPin === enteredPin) {
                unlockPortal();
                return;
            } else {
                throw new Error("لا يمكن التحقق من الرمز السري بدون إنترنت (تأكد من الرمز أو اتصل بالشبكة).");
            }
        }

        // الاتصال بمسار الـ API المخصص للتحقق لمنع التخمين
        const res = await fetch(`${CONFIG.API_URL}/api/public/client/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ case_number: caseData.case_internal_id, access_pin: enteredPin })
        });
        const data = await res.json();

        if (res.ok) {
            // حفظ الـ PIN محلياً للسماح بالدخول الأوفلاين لاحقاً
            localStorage.setItem(`moakkil_offline_pin_${caseData.case_internal_id}`, enteredPin);
            unlockPortal();
        } else if (res.status === 429) {
            throw new Error("تجاوزت الحد الأقصى للمحاولات الخاطئة. يرجى المحاولة بعد 15 دقيقة لدواعي أمنية.");
        } else {
            throw new Error("الرمز السري الذي أدخلته غير صحيح. يرجى التأكد من محاميك.");
        }

    } catch (error) {
        Swal.fire('تنبيه أمني!', error.message, 'error');
        document.getElementById('pin_input').value = '';
        document.getElementById('pin_input').focus();
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-shield-alt me-1"></i> دخول للوحة المتابعة';
    }
}

// دالة فك القفل وعرض البيانات
function unlockPortal() {
    document.getElementById('security-layer').classList.add('d-none');
    document.getElementById('main-content').classList.remove('d-none');
    renderClientPortal();
    
    Swal.fire({
        toast: true, position: 'top-end', icon: 'success', title: 'تم التحقق بنجاح', showConfirmButton: false, timer: 2000
    });
}

// دالة رسم وتعبئة بيانات الموكل بشكل جميل
function renderClientPortal() {
    const firm = publicData.firm || {};
    const client = publicData.client || {};
    const caseData = publicData.case || publicData.cases[0] || {};
    const updates = publicData.updates || [];
    const files = publicData.files || [];
    const installments = publicData.installments || [];
    const expenses = publicData.expenses || [];

    // الترويسة وشريط التقدم (Progress Bar)
    document.getElementById('ui-firm-name').innerText = escapeHTML(firm.firm_name || 'مكتب المحاماة');
    document.getElementById('ui-client-name').innerText = escapeHTML(client.full_name || 'الموكل الكريم');
    document.getElementById('ui-case-status').innerText = escapeHTML(caseData.status || 'نشطة');
    
    let progress = 50;
    let progressText = 'العمل جاري في القضية';
    let progressColor = 'bg-primary';

    if (caseData.status === 'مغلقة' || caseData.status === 'مكتملة' || caseData.status === 'محفوظة') {
        progress = 100; progressText = 'مكتملة ومغلقة'; progressColor = 'bg-success';
    } else if (caseData.status === 'قيد الاستئناف' || caseData.litigation_degree === 'استئناف' || caseData.litigation_degree === 'تمييز') {
        progress = 75; progressText = 'مراحل التقاضي العليا'; progressColor = 'bg-warning';
    } else {
        progress = 50; progressText = 'نشطة وقيد المتابعة'; progressColor = 'bg-accent';
    }

    const pBar = document.getElementById('ui-progress-bar');
    if (pBar) {
        pBar.style.width = progress + '%';
        pBar.className = `progress-bar progress-bar-striped progress-bar-animated ${progressColor}`;
    }
    const pText = document.getElementById('ui-progress-text');
    if (pText) pText.innerText = progressText;

    if(firm.logo_url) {
        document.getElementById('ui-firm-logo').src = escapeHTML(firm.logo_url);
        document.getElementById('ui-firm-logo-container').classList.remove('d-none');
    }

    // معلومات القضية
    document.getElementById('ui-case-id').innerText = escapeHTML(caseData.case_internal_id || '--');
    document.getElementById('ui-litigation').innerText = escapeHTML(caseData.litigation_degree || '--');
    document.getElementById('ui-court-name').innerText = escapeHTML(caseData.current_court || '--');
    document.getElementById('ui-opponent').innerText = escapeHTML(caseData.opponent_name || '--');

    // البيانات الشخصية (KYC)
    if (document.getElementById('ui-client-phone')) document.getElementById('ui-client-phone').innerText = escapeHTML(client.phone || '--');
    if (document.getElementById('ui-client-national')) document.getElementById('ui-client-national').innerText = escapeHTML(client.national_id || '--');
    if (document.getElementById('ui-client-nationality')) document.getElementById('ui-client-nationality').innerText = escapeHTML(client.nationality || 'أردني');
    if (document.getElementById('ui-client-dob')) document.getElementById('ui-client-dob').innerText = escapeHTML(client.date_of_birth || '--');
    if (document.getElementById('ui-client-address')) document.getElementById('ui-client-address').innerText = escapeHTML(client.address || '--');

    // الإجراءات مع بطاقات الذكاء الاصطناعي
    const timelineContainer = document.getElementById('ui-timeline-container');
    if (updates.length > 0) {
        timelineContainer.innerHTML = updates.map(u => {
            let aiHtml = '';
            if (u.ai_extracted_entities && Object.keys(u.ai_extracted_entities).length > 0) {
                const ai = u.ai_extracted_entities;
                aiHtml = `<div class="mt-2 p-2 bg-light border border-info rounded" style="font-size: 0.8rem;">
                            <b class="text-info"><i class="fas fa-robot"></i> استخلاص آلي:</b>
                            ${ai.next_hearing_date ? `<span class="badge bg-white text-dark border ms-1 mt-1">موعد الجلسة: ${escapeHTML(ai.next_hearing_date)}</span>` : ''}
                          </div>`;
            }
            return `
            <div class="timeline-item">
                <small class="text-primary fw-bold">${new Date(u.created_at).toLocaleDateString('ar-EG')}</small>
                <h6 class="fw-bold mb-1 mt-1" style="color: var(--firm-primary);">${escapeHTML(u.update_title)}</h6>
                <p class="small text-muted mb-0">${escapeHTML(u.update_details)}</p>
                ${u.hearing_date ? `<small class="text-success fw-bold d-block mt-2"><i class="fas fa-calendar-check"></i> الجلسة المحددة: ${escapeHTML(u.hearing_date)}</small>` : ''}
                ${aiHtml}
            </div>`;
        }).join('');
    } else {
        timelineContainer.innerHTML = '<div class="alert alert-light text-center small text-muted border shadow-sm">لا توجد إجراءات مسجلة حتى الآن.</div>';
    }

    // المالية (ملخص دقيق للعميل)
    const totalAgreed = Number(caseData.total_agreed_fees) || 0;
    const totalPaid = installments.filter(i => i.status === 'مدفوعة').reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const totalRemaining = (totalAgreed + totalExpenses) - totalPaid;

    document.getElementById('ui-fin-agreed').innerText = totalAgreed.toLocaleString();
    document.getElementById('ui-fin-paid').innerText = totalPaid.toLocaleString();
    document.getElementById('ui-fin-rem').innerText = totalRemaining.toLocaleString();

    // الدفعات
    const payContainer = document.getElementById('ui-payments-container');
    if (installments.length > 0) {
        payContainer.innerHTML = installments.map(i => {
            const isPaid = i.status === 'مدفوعة';
            return `
            <div class="d-flex justify-content-between align-items-center p-3 mb-2 bg-white rounded border shadow-sm border-start border-4 ${isPaid ? 'border-success' : 'border-warning'}">
                <div>
                    <b class="${isPaid ? 'text-success' : 'text-dark'} fs-6">${Number(i.amount).toLocaleString()} د.أ</b>
                    <small class="d-block text-muted">تاريخ: ${escapeHTML(i.due_date || new Date(i.created_at).toLocaleDateString('ar-EG'))}</small>
                </div>
                <span class="badge ${isPaid ? 'bg-success' : 'bg-warning text-dark'}">${escapeHTML(i.status)}</span>
            </div>`;
        }).join('');
    } else {
        payContainer.innerHTML = '<div class="text-center p-3 text-muted small border bg-light rounded shadow-sm">لا توجد دفعات مسجلة.</div>';
    }

    // المصروفات
    const expContainer = document.getElementById('ui-expenses-container');
    if (expenses.length > 0) {
        expContainer.innerHTML = expenses.map(e => `
            <div class="d-flex justify-content-between align-items-center p-3 mb-2 bg-white rounded border shadow-sm border-start border-4 border-danger">
                <div>
                    <b class="text-danger fs-6">${Number(e.amount).toLocaleString()} د.أ</b>
                    <small class="d-block text-muted">${escapeHTML(e.description)}</small>
                </div>
                <small class="text-muted"><i class="fas fa-calendar-alt"></i> ${escapeHTML(e.expense_date)}</small>
            </div>
        `).join('');
    } else {
        expContainer.innerHTML = '<div class="text-center p-3 text-muted small border bg-light rounded shadow-sm">لا توجد مصروفات مسجلة.</div>';
    }

    // المستندات والأرشيف
    const filesContainer = document.getElementById('ui-files-container');
    if (files.length > 0) {
        filesContainer.innerHTML = files.map(f => {
            const isImage = f.file_type && f.file_type.includes('image');
            const icon = isImage ? 'fa-image text-primary' : 'fa-file-pdf text-danger';
            return `
            <div class="col-6">
                <div class="card p-3 text-center border-0 shadow-sm h-100">
                    <i class="fas ${icon} fa-2x mb-2"></i>
                    <h6 class="small fw-bold text-truncate mb-2" title="${escapeHTML(f.file_name)}">${escapeHTML(f.file_name)}</h6>
                    <a href="${escapeHTML(f.drive_file_id)}" target="_blank" class="btn btn-sm btn-outline-dark fw-bold rounded-pill"><i class="fas fa-download"></i> تحميل</a>
                </div>
            </div>`;
        }).join('');
    } else {
        filesContainer.innerHTML = '<div class="col-12 text-center p-4 text-muted border bg-white rounded shadow-sm">لا توجد مستندات متاحة حالياً.</div>';
    }
}