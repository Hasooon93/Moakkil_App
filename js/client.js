// js/client.js - المحرك الأمني وبوابة الموكل (Client Portal Engine)
// التحديثات: عزل البيانات، تسجيل الدخول بالـ PIN، دعم الحظر التلقائي، وتغيير الثيم حسب المكتب

const BASE_URL = window.API_BASE_URL || CONFIG.API_URL;
let currentToken = new URLSearchParams(window.location.search).get('token') || localStorage.getItem('moakkil_client_token');

const escapeHTML = (str) => {
    if (str === null || str === undefined) return '';
    return str.toString().replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
};

function showAlert(message, type = 'info') { 
    if (typeof Swal !== 'undefined') {
        Swal.fire({ toast: true, position: 'top-end', icon: type === 'danger' ? 'error' : (type === 'info' ? 'info' : type), title: escapeHTML(message), showConfirmButton: false, timer: 4000, timerProgressBar: true }); 
    } else { alert(message); }
}

window.onload = async () => {
    if (currentToken) {
        document.getElementById('loginView').classList.add('d-none');
        document.getElementById('portalView').classList.remove('d-none');
        await loadPortalData();
    } else {
        document.getElementById('loginView').classList.remove('d-none');
        document.getElementById('portalView').classList.add('d-none');
    }
};

// =================================================================
// 🔐 تسجيل الدخول الآمن (Login Logic)
// =================================================================
async function handleClientLogin(event) {
    event.preventDefault();
    const caseNumber = document.getElementById('login_case_number').value.trim();
    const accessPin = document.getElementById('login_access_pin').value.trim();

    if (!caseNumber || !accessPin) {
        showAlert('يرجى إدخال رقم الملف والرمز السري', 'warning');
        return;
    }

    showSpinner(true);

    try {
        const response = await fetch(`${BASE_URL}/api/public/client/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ case_number: caseNumber, access_pin: accessPin })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            localStorage.setItem('moakkil_client_token', data.token);
            // إعادة توجيه مع التوكن في الرابط لسهولة المشاركة
            window.location.href = `client.html?token=${data.token}`;
        } else {
            throw new Error(data.error || 'بيانات الدخول غير صحيحة');
        }
    } catch (error) {
        showSpinner(false);
        Swal.fire('فشل الدخول', error.message, 'error');
    }
}

function logoutClient() {
    localStorage.removeItem('moakkil_client_token');
    window.location.href = 'client.html';
}

// =================================================================
// 📥 جلب وعرض البيانات للموكل (Data Fetching & Rendering)
// =================================================================
async function loadPortalData() {
    showSpinner(true);

    try {
        const response = await fetch(`${BASE_URL}/api/public/client?token=${currentToken}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'لا يمكن الوصول للملف، قد يكون الرابط منتهي الصلاحية');
        }

        renderPortalUI(data);

    } catch (error) {
        showSpinner(false);
        Swal.fire({
            icon: 'error',
            title: 'خطأ في الوصول',
            text: error.message,
            confirmButtonText: 'العودة للدخول'
        }).then(() => {
            logoutClient();
        });
    }
}

function renderPortalUI(data) {
    const { client, case: caseData, updates, firm, files, installments, expenses } = data;

    // 1. تطبيق الهوية البصرية للمكتب (White-Labeling)
    if (firm) {
        const root = document.documentElement;
        if (firm.primary_color) root.style.setProperty('--main-firm-color', firm.primary_color);
        if (firm.accent_color) root.style.setProperty('--accent-firm-color', firm.accent_color);
        
        document.getElementById('firmNameDisplay').innerText = firm.firm_name || 'مكتب المحاماة';
        if (firm.logo_url) {
            document.getElementById('firmLogoContainer').innerHTML = `<img src="${escapeHTML(firm.logo_url)}" class="firm-logo" alt="شعار المكتب">`;
        }
        document.title = `بوابة الموكل | ${firm.firm_name || 'موكّل'}`;
    }

    // 2. التحقق من حالة حظر الموكل (Client Portal Active)
    if (client.client_portal_active === false) {
        document.getElementById('portalContent').classList.add('d-none');
        document.getElementById('suspendedWarning').classList.remove('d-none');
        showSpinner(false);
        return; // نتوقف هنا لمنع عرض أي بيانات
    }

    // 3. عرض البيانات الأساسية
    document.getElementById('clientNameDisplay').innerText = client.full_name || '--';
    document.getElementById('caseNumberDisplay').innerText = caseData.case_internal_id || '--';
    document.getElementById('opponentNameDisplay').innerText = caseData.opponent_name || '--';
    document.getElementById('courtNameDisplay').innerText = caseData.current_court || '--';
    document.getElementById('caseStatusDisplay').innerText = caseData.status || '--';
    document.getElementById('caseStageDisplay').innerText = caseData.current_stage || 'قيد المتابعة';

    // 4. عرض المالية
    const totalPaid = installments.reduce((sum, inst) => sum + (Number(inst.amount) || 0), 0);
    const totalAgreed = Number(caseData.total_agreed_fees) || 0;
    const totalRem = totalAgreed - totalPaid;
    
    document.getElementById('totalPaidDisplay').innerText = totalPaid.toLocaleString();
    document.getElementById('totalRemDisplay').innerText = totalRem.toLocaleString();

    renderReceiptsList(installments, firm);

    // 5. عرض الخط الزمني للإجراءات (المسموح بها فقط)
    renderUpdatesTimeline(updates);

    // 6. عرض المستندات والملفات (الأرشيف)
    renderFiles(files);

    // إخفاء التحميل
    showSpinner(false);
}

function renderUpdatesTimeline(updates) {
    const container = document.getElementById('updatesTimeline');
    if (!updates || updates.length === 0) {
        container.innerHTML = '<div class="text-center text-muted small py-4 bg-light rounded">لم يقم المحامي بنشر أي إجراءات عامة بعد.</div>';
        return;
    }

    container.innerHTML = updates.map(upd => {
        let dateHtml = '';
        if (upd.hearing_date) dateHtml += `<span class="badge bg-light text-dark border me-2"><i class="fas fa-calendar-day text-primary"></i> الجلسة: ${new Date(upd.hearing_date).toLocaleDateString('ar-EG')}</span>`;
        if (upd.next_hearing_date) dateHtml += `<span class="badge bg-soft-danger text-danger border border-danger"><i class="fas fa-forward"></i> القادمة: ${new Date(upd.next_hearing_date).toLocaleDateString('ar-EG')}</span>`;
        
        return `
        <div class="timeline-item shadow-sm">
            <h6 class="fw-bold mb-2" style="color: var(--main-firm-color);">${escapeHTML(upd.update_title)}</h6>
            <div class="mb-2">${dateHtml}</div>
            <p class="small text-muted mb-0" style="white-space: pre-wrap; line-height: 1.6;">${escapeHTML(upd.update_details || 'بدون تفاصيل')}</p>
        </div>
        `;
    }).join('');
}

function renderFiles(files) {
    const container = document.getElementById('filesContainer');
    if (!files || files.length === 0) {
        container.innerHTML = '<div class="col-12 text-center text-muted small py-4 bg-light rounded">لا توجد مستندات مرفوعة في ملفك.</div>';
        return;
    }

    container.innerHTML = files.map(file => {
        const fileExt = file.file_name.split('.').pop().toLowerCase();
        let iconClass = 'fa-file-alt text-secondary';
        if (['pdf'].includes(fileExt)) iconClass = 'fa-file-pdf text-danger';
        else if (['jpg', 'jpeg', 'png'].includes(fileExt)) iconClass = 'fa-file-image text-success';
        else if (['doc', 'docx'].includes(fileExt)) iconClass = 'fa-file-word text-primary';

        return `
        <div class="col-md-6 col-12 mb-2">
            <div class="bg-light p-3 rounded border shadow-sm d-flex justify-content-between align-items-center h-100">
                <div class="d-flex align-items-center overflow-hidden">
                    <i class="fas ${iconClass} fa-2x me-3 opacity-75"></i>
                    <div class="text-truncate">
                        <span class="d-block fw-bold small text-dark text-truncate" title="${escapeHTML(file.file_name)}">${escapeHTML(file.file_name)}</span>
                        <small class="text-muted" style="font-size:0.7rem;">${new Date(file.created_at).toLocaleDateString('ar-EG')} - ${escapeHTML(file.file_category || 'مستند')}</small>
                    </div>
                </div>
                <a href="${escapeHTML(file.file_url)}" target="_blank" class="btn btn-sm btn-outline-primary rounded-pill px-3 py-1 fw-bold ms-2 shadow-sm" style="color: var(--main-firm-color); border-color: var(--main-firm-color);">
                    <i class="fas fa-download"></i> تحميل
                </a>
            </div>
        </div>
        `;
    }).join('');
}

function renderReceiptsList(installments, firm) {
    const container = document.getElementById('receiptsListContainer');
    if (!installments || installments.length === 0) {
        container.innerHTML = '<div class="text-center text-muted small py-4">لا توجد إيصالات دفع مسجلة.</div>';
        return;
    }

    container.innerHTML = installments.map(inst => `
        <div class="card border-0 shadow-sm mb-3 position-relative overflow-hidden">
            <div class="position-absolute top-0 end-0 p-2 opacity-10">
                <i class="fas fa-stamp fa-4x text-success"></i>
            </div>
            <div class="card-body p-3">
                <div class="d-flex justify-content-between align-items-center border-bottom pb-2 mb-2">
                    <h6 class="fw-bold text-success mb-0">إيصال قبض دفعة</h6>
                    <span class="badge bg-light text-dark border">رقم: ${escapeHTML(inst.invoice_number || inst.id.substring(0,8))}</span>
                </div>
                <div class="row g-2">
                    <div class="col-6">
                        <small class="text-muted d-block">المبلغ المقبوض:</small>
                        <b class="fs-5 text-dark">${Number(inst.amount).toLocaleString()} <small>د.أ</small></b>
                    </div>
                    <div class="col-6 text-end">
                        <small class="text-muted d-block">التاريخ:</small>
                        <b class="small text-dark">${new Date(inst.due_date || inst.created_at).toLocaleDateString('ar-EG')}</b>
                    </div>
                </div>
                <div class="mt-3 pt-2 border-top text-center">
                    <small class="text-muted">مُصدر من: ${escapeHTML(firm?.firm_name || 'إدارة المكتب')}</small>
                </div>
            </div>
        </div>
    `).join('');
}

function showSpinner(show) {
    const spinner = document.getElementById('loadingSpinner');
    if (show) spinner.classList.remove('d-none');
    else spinner.classList.add('d-none');
}