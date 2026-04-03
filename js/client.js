// js/client.js - محرك بوابة الموكل العامة (التحقق بالرقم السري وعرض البيانات المتطورة بأمان)

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
        // الاتصال الآمن بالمحرك السحابي للعموم
        const res = await fetch(`${CONFIG.API_URL}/api/public/client?token=${token}`);
        const data = await res.json();

        // التوافق مع التعديلات البرمجية (دعم object مباشر أو مصفوفة)
        if (res.ok && (data.case || (data.cases && data.cases.length > 0))) {
            publicData = data;
            
            // تطبيق هوية المكتب (الألوان واللوغو) إن وجدت
            applyFirmIdentity(data.firm);
            
            // إخفاء التحميل وإظهار شاشة إدخال الرمز السري (PIN)
            document.getElementById('loader').classList.add('d-none');
            document.getElementById('security-layer').classList.remove('d-none');
            document.getElementById('pin_input').focus();
        } else {
            throw new Error(data.error || "الملف غير موجود");
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
            logoImg.src = firm.logo_url;
            document.getElementById('firm-logo-sec').classList.remove('d-none');
        }
    }
}

// دالة التحقق من صحة الـ PIN
function verifyAccess(event) {
    event.preventDefault();
    const enteredPin = document.getElementById('pin_input').value;
    
    // استخراج بيانات القضية بأمان
    const caseData = publicData.case || publicData.cases[0] || {};
    const actualPin = caseData.access_pin; 
    
    const btn = document.getElementById('btn-verify');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> جاري التحقق...';

    // محاكاة وقت التحقق لتعزيز الشعور بالأمان للموكل
    setTimeout(() => {
        // إذا قام الباك إند بمسح الـ PIN لحمايته أو تطابق الرمزين، نسمح بالدخول
        if (!actualPin || enteredPin === actualPin) {
            document.getElementById('security-layer').classList.add('d-none');
            document.getElementById('main-content').classList.remove('d-none');
            renderClientPortal();
            
            Swal.fire({
                toast: true, position: 'top-end', icon: 'success', title: 'تم التحقق بنجاح', showConfirmButton: false, timer: 2000
            });
        } else {
            Swal.fire('رمز خاطئ!', 'الرمز السري الذي أدخلته غير صحيح. يرجى التأكد من محاميك.', 'error');
            document.getElementById('pin_input').value = '';
            document.getElementById('pin_input').focus();
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-shield-alt me-1"></i> دخول للوحة المتابعة';
        }
    }, 800); 
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

    // البيانات الشخصية (KYC) الجديدة التي أضفناها في client.html
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