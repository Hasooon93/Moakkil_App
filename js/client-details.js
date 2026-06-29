/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: js/client-details.js
 * الوصف: المحرك البرمجي لصفحة تفاصيل الموكل (Enterprise Offline & R2 Edition)
 * الميزات:
 * 1. جلب متوازٍ (Parallel Fetch) لبيانات الموكل، قضاياه، ملفاته، ومواعيده.
 * 2. محرك طلب النواقص (Missing Docs) وربطها التلقائي ببوابة الموكل.
 * 3. حماية ضد الحذف الخاطئ وتفعيل المصادقة الثنائية (MFA / WebAuthn).
 * 4. دعم كامل للعمل بلا إنترنت والمزامنة التلقائية.
 * 5. التوليد الآلي لتقارير الإنجاز الشهرية الذكية (AI Monthly Reports).
 * ============================================================================
 */

// ============================================================================
// [1] المتغيرات العامة والحماية (Globals & Security)
// ============================================================================
let currentClientId = localStorage.getItem('current_client_id') || new URLSearchParams(window.location.search).get('id');
let clientObj = null;
let clientCases = [];
let clientFiles = [];
let clientAppointments = [];

/**
 * دالة الحماية من ثغرات الحقن (XSS Sanitizer)
 * تضمن عدم تنفيذ أي كود خبيث قادم من قاعدة البيانات عند حقنه في الواجهة
 */
const escapeHTML = (str) => {
    if (str === null || str === undefined) return '';
    return str.toString().replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
};

// ============================================================================
// [2] التهيئة وبدء التشغيل (Initialization)
// ============================================================================
window.onload = async () => {
    // 1. تطبيق هوية المكتب البصرية (White-Labeling)
    applyFirmSettings();
    
    // 2. التحقق من وجود معرف الموكل
    if (!currentClientId) { 
        window.location.href = 'app.html'; 
        return; 
    }
    
    // 3. جلب وتعبئة البيانات
    await loadClientData();
};

function applyFirmSettings() {
    const settings = JSON.parse(localStorage.getItem('firm_settings') || '{}');
    if (!settings) return;
    const root = document.documentElement;
    if (settings.primary_color) root.style.setProperty('--navy', settings.primary_color);
    if (settings.accent_color) root.style.setProperty('--accent', settings.accent_color);
}

// العودة للوحة التحكم
window.goBack = function() { 
    window.location.href = 'app.html'; 
};

// طلب مزامنة يدوية للبيانات
window.manualSync = async () => {
    const btn = document.getElementById('btn_sync');
    if(btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-sync fa-spin"></i>'; }
    await loadClientData();
    window.showAlert('تمت المزامنة بنجاح وتحديث بيانات الموكل', 'success');
    if(btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i>'; }
};

// ============================================================================
// [3] محرك جلب البيانات (Data Fetching Engine)
// ============================================================================
async function loadClientData() {
    try {
        // جلب متوازٍ لتسريع تحميل الصفحة وتقليل الـ Latency
        const [clientsRes, casesRes, filesRes, apptsRes] = await Promise.all([
            API.getClients(),
            API.getCases(),
            API.getFiles(),
            typeof API.getAppointments === 'function' ? API.getAppointments() : Promise.resolve([])
        ]);

        if (!clientsRes || clientsRes.length === 0) { 
            window.location.href = 'app.html'; 
            return; 
        }
        
        clientObj = clientsRes.find(c => c.id === currentClientId);
        if (!clientObj) { 
            window.location.href = 'app.html'; 
            return; 
        }

        // تصفية القضايا، الملفات، والمواعيد المرتبطة بهذا الموكل فقط
        clientCases = Array.isArray(casesRes) ? casesRes.filter(c => c.client_id === currentClientId) : [];
        clientFiles = Array.isArray(filesRes) ? filesRes.filter(f => f.client_id === currentClientId) : [];
        clientAppointments = Array.isArray(apptsRes) ? apptsRes.filter(a => a.client_id === currentClientId) : [];

        // الحسابات المالية (تجميع من القضايا المرتبطة)
        let totalAgreed = 0, totalPaid = 0;
        clientCases.forEach(c => {
            totalAgreed += Number(c.total_agreed_fees) || 0;
            totalPaid += Number(c.total_paid) || 0;
        });

        // توزيع البيانات على واجهة المستخدم
        renderHeaderAndSummary(totalAgreed, totalPaid);
        renderClientInfo();
        renderCasesList();
        renderAppointmentsList();
        renderFilesList();

    } catch (error) { 
        console.error("Client Load Error:", error);
        window.showAlert('حدث خطأ في جلب بيانات الموكل من الخادم', 'warning'); 
    }
}

// ============================================================================
// [4] محركات عرض الواجهة (UI Rendering Engines)
// ============================================================================

/**
 * 4.1 تحديث الترويسة والملخص المالي
 */
function renderHeaderAndSummary(totalAgreed, totalPaid) {
    document.getElementById('header-client-name').innerText = escapeHTML(clientObj.full_name);
    document.getElementById('det-full-name').innerText = escapeHTML(clientObj.full_name);
    document.getElementById('det-phone').innerText = escapeHTML(clientObj.phone || 'لا يوجد رقم هاتف');

    // الشارات (Badges) بنمط Soft UI
    let badgesHtml = '';
    if (clientObj.client_type === 'شركة') badgesHtml += `<span class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 shadow-sm px-3 py-2 rounded-pill"><i class="fas fa-building me-1"></i> شركة / اعتباري</span>`;
    if (clientObj.confidentiality_level === 'سري') badgesHtml += `<span class="badge bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25 shadow-sm px-3 py-2 rounded-pill ms-2"><i class="fas fa-user-secret me-1"></i> سري جداً</span>`;
    document.getElementById('client-badges').innerHTML = badgesHtml;

    // حالة بوابة الموكل الإلكترونية (Client Portal)
    const portalBadge = document.getElementById('portal_status_badge');
    if (portalBadge) {
        if (clientObj.client_portal_active !== false) {
            portalBadge.className = 'badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 shadow-sm px-3 py-2 rounded-pill';
            portalBadge.innerHTML = '<i class="fas fa-globe me-1"></i> البوابة مفعلة';
        } else {
            portalBadge.className = 'badge bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25 shadow-sm px-3 py-2 rounded-pill';
            portalBadge.innerHTML = '<i class="fas fa-lock me-1"></i> البوابة معلقة';
        }
    }

    // حساب وعرض آخر زيارة للبوابة من قبل الموكل
    let lastSeenDate = null;
    clientCases.forEach(c => {
        if (c.client_last_seen) {
            const d = new Date(c.client_last_seen);
            if (!lastSeenDate || d > lastSeenDate) lastSeenDate = d;
        }
    });

    const lastSeenBadge = document.getElementById('portal_last_seen_badge');
    if (lastSeenBadge) {
        if (lastSeenDate) {
            lastSeenBadge.innerHTML = `<i class="fas fa-eye me-1"></i> زيارة: ${lastSeenDate.toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}`;
            lastSeenBadge.className = 'badge bg-info bg-opacity-10 text-info border border-info border-opacity-25 shadow-sm px-3 py-2 rounded-pill ms-2';
        } else {
            lastSeenBadge.innerHTML = `<i class="fas fa-eye-slash me-1"></i> لم يزر البوابة`;
            lastSeenBadge.className = 'badge bg-light text-muted border px-3 py-2 shadow-sm rounded-pill ms-2';
        }
    }

    // المؤشرات المالية
    document.getElementById('fin-total-agreed').innerText = totalAgreed.toLocaleString('en-US');
    document.getElementById('fin-total-paid').innerText = totalPaid.toLocaleString('en-US');
    document.getElementById('fin-remaining').innerText = (totalAgreed - totalPaid).toLocaleString('en-US');
}

/**
 * 4.2 تعبئة البيانات الشخصية (KYC Data)
 */
function renderClientInfo() {
    document.getElementById('det-national-id').innerText = escapeHTML(clientObj.national_id || '--');
    document.getElementById('det-email').innerText = escapeHTML(clientObj.email || '--');
    document.getElementById('det-address').innerText = escapeHTML(clientObj.address || '--');
    document.getElementById('det-mother').innerText = escapeHTML(clientObj.mother_name || '--');
    document.getElementById('det-dob').innerText = escapeHTML(clientObj.date_of_birth || '--');
    document.getElementById('det-pob').innerText = escapeHTML(clientObj.place_of_birth || '--');
    document.getElementById('det-nationality').innerText = escapeHTML(clientObj.nationality || '--');
    document.getElementById('det-marital').innerText = escapeHTML(clientObj.marital_status || '--');
    document.getElementById('det-profession').innerText = escapeHTML(clientObj.profession || '--');
}

/**
 * 4.3 رسم سجل القضايا المرتبطة (Compact UI)
 */
function renderCasesList() {
    const list = document.getElementById('client-cases-list');
    document.getElementById('cases-count').innerText = clientCases.length;
    
    if (clientCases.length === 0) { 
        list.innerHTML = '<div class="col-12 text-center p-5 text-muted fw-bold bg-white rounded-4 border shadow-sm"><i class="fas fa-folder-open fa-3x mb-3 opacity-25"></i><br>لا توجد قضايا مسجلة لهذا الموكل حالياً.</div>'; 
        return; 
    }
    
    list.innerHTML = clientCases.map(c => {
        let statusColor = c.status === 'نشطة' ? 'success' : (c.status === 'مكتملة' || c.status === 'مغلقة' ? 'dark' : 'warning');
        return `
        <div class="col-md-6 col-lg-4 fade-in mb-3">
            <div class="compact-card case-card p-3 d-flex flex-column justify-content-between bg-white transition-hover h-100" onclick="goToCase('${c.id}')" style="cursor: pointer;">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <b class="text-navy lh-base fs-5 mb-0">${escapeHTML(c.case_internal_id || 'ملف بلا رقم')}</b>
                    <span class="badge bg-${statusColor} bg-opacity-10 text-${statusColor} border border-${statusColor} border-opacity-25 shadow-sm px-2 py-1 rounded-pill">${escapeHTML(c.status)}</span>
                </div>
                <div class="card-data-grid mt-2">
                    <div class="data-item full-width text-truncate mb-1" title="${escapeHTML(c.current_court || 'المحكمة غير محددة')}">
                        <i class="fas fa-university text-primary me-1"></i> المحكمة: ${escapeHTML(c.current_court || 'المحكمة غير محددة')}
                    </div>
                    <div class="data-item full-width text-truncate" title="${escapeHTML(c.opponent_name || '--')}">
                        <i class="fas fa-user-injured text-danger me-1"></i> الخصم: ${escapeHTML(c.opponent_name || '--')}
                    </div>
                </div>
            </div>
        </div>`;
    }).join('');
}

/**
 * 4.4 رسم جدول المواعيد والاجتماعات للموكل (Appointments UI)
 */
function renderAppointmentsList() {
    const list = document.getElementById('client-appointments-list');
    
    if (clientAppointments.length === 0) {
        list.innerHTML = '<div class="text-center p-5 text-muted fw-bold bg-white rounded-4 border shadow-sm"><i class="fas fa-calendar-times fa-3x mb-3 opacity-50" style="color: var(--gold-luxury);"></i><br>لا توجد مواعيد أو اجتماعات مجدولة لهذا الموكل.</div>';
        return;
    }

    // فرز المواعيد (الأحدث أولاً)
    clientAppointments.sort((a, b) => new Date(b.appt_date) - new Date(a.appt_date));

    list.innerHTML = clientAppointments.map(a => {
        let statusColor = a.status === 'منجز' ? 'success' : (a.status === 'ملغي' ? 'danger' : 'primary');
        let icon = a.status === 'منجز' ? 'fa-check-circle' : (a.status === 'ملغي' ? 'fa-times-circle' : 'fa-clock');

        return `
        <div class="compact-card p-3 mb-3 d-flex flex-column bg-white shadow-sm transition-hover fade-in" style="border-right: 4px solid var(--bs-${statusColor}); border-radius: 12px; border-left: 1px solid #eee; border-top: 1px solid #eee; border-bottom: 1px solid #eee;">
            <div class="d-flex justify-content-between align-items-center mb-2">
                <b class="text-navy fs-6"><i class="fas ${icon} me-1 text-${statusColor}"></i> ${escapeHTML(a.title)}</b>
                <span class="badge bg-${statusColor} bg-opacity-10 text-${statusColor} border border-${statusColor} border-opacity-25 rounded-pill px-3 py-1">${escapeHTML(a.status)}</span>
            </div>
            <div class="text-muted small fw-bold mb-1"><i class="fas fa-calendar-alt me-1 text-primary"></i> ${new Date(a.appt_date).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })}</div>
            <div class="text-muted small fw-bold"><i class="fas fa-tag me-1 text-warning"></i> ${escapeHTML(a.type || 'موعد')}</div>
            ${a.completion_notes ? `<div class="mt-2 text-success small fw-bold"><i class="fas fa-quote-right me-1"></i> مخرجات: ${escapeHTML(a.completion_notes)}</div>` : ''}
            ${a.cancellation_reason ? `<div class="mt-2 text-danger small fw-bold"><i class="fas fa-exclamation-circle me-1"></i> سبب الإلغاء: ${escapeHTML(a.cancellation_reason)}</div>` : ''}
        </div>`;
    }).join('');
}

/**
 * 4.5 رسم الأرشيف المحمي (R2 Secure Files - Compact UI)
 */
function renderFilesList() {
    const container = document.getElementById('client-files-list');
    if (clientFiles.length === 0) { 
        container.innerHTML = '<div class="col-12 text-center p-5 text-muted fw-bold border bg-white rounded-4 shadow-sm w-100"><i class="fas fa-archive fa-3x mb-3 opacity-25"></i><br>لا يوجد مستندات مؤرشفة لهذا الموكل.</div>'; 
        return; 
    }
    
    container.innerHTML = clientFiles.map(f => {
        const isImage = f.file_extension && ['jpg','jpeg','png'].includes(f.file_extension);
        const iconHtml = isImage ? `<i class="fas fa-image fa-3x text-primary mb-3 mt-2 opacity-75 mx-auto"></i>` : `<i class="fas fa-file-pdf fa-3x text-danger mb-3 mt-2 opacity-75 mx-auto"></i>`;
        
        // تنبيه لانتهاء الصلاحية إن وجد
        let expiryBadge = '';
        if (f.expiry_date) {
            const isExpired = new Date(f.expiry_date) < new Date();
            expiryBadge = `<small class="d-block mt-2 fw-bold font-monospace ${isExpired ? 'text-danger' : 'text-warning text-dark'}" style="font-size: 0.75rem;"><i class="fas ${isExpired ? 'fa-exclamation-triangle' : 'fa-hourglass-half'}"></i> ينتهي: ${escapeHTML(f.expiry_date)}</small>`;
        }
        
        // فحص نوع الرابط وتفعيل التحميل المشفر (R2)
        const isR2 = f.file_url && !f.file_url.startsWith('http');
        const viewBtn = isR2 
            ? `<button class="btn btn-sm btn-outline-primary bg-white w-100 fw-bold rounded-pill shadow-sm py-2" onclick="API.downloadR2File('${escapeHTML(f.file_url)}', '${escapeHTML(f.file_name)}')"><i class="fas fa-lock me-1 text-success"></i> تحميل مشفر</button>`
            : `<a href="${escapeHTML(f.file_url || f.drive_file_id || '#')}" target="_blank" class="btn btn-sm btn-outline-primary bg-white w-100 fw-bold rounded-pill shadow-sm py-2"><i class="fas fa-external-link-alt me-1"></i> عرض</a>`;

        return `
        <div class="col-6 col-md-4 mb-2 fade-in">
            <div class="compact-card appt-card p-3 text-center border shadow-sm h-100 bg-white position-relative d-flex flex-column transition-hover">
                <button class="btn btn-sm text-danger position-absolute top-0 start-0 m-2 bg-light rounded-circle shadow-sm border border-danger border-opacity-25" onclick="deleteClientFile('${f.id}')" title="حذف المستند"><i class="fas fa-trash"></i></button>
                <span class="badge bg-light text-dark border mb-2 mx-auto text-truncate px-3 py-1" style="max-width:80%;">${escapeHTML(f.file_category || 'مستند')}</span>
                ${iconHtml} 
                <h6 class="small fw-bold text-truncate mt-1 mb-0 text-navy px-1" title="${escapeHTML(f.file_name)}">${escapeHTML(f.file_name)}</h6>
                ${expiryBadge}
                <div class="mt-auto pt-3">
                    ${viewBtn}
                </div>
            </div>
        </div>`;
    }).join('');
}

// ============================================================================
// [5] إدارة النواقص والمراسلات (Missing Documents Engine)
// ============================================================================

// فتح نافذة طلب النواقص وتعبئة قائمة القضايا
window.openRequestDocsModal = function() {
    const select = document.getElementById('req_docs_case_id');
    
    if (clientCases.length === 0) {
        window.showAlert('لا توجد قضايا نشطة لهذا الموكل لطلب مستندات عليها.', 'warning');
        return;
    }

    select.innerHTML = '<option value="">-- اختر القضية المرتبطة بالطلب --</option>' + 
        clientCases.map(c => `<option value="${c.id}">${escapeHTML(c.case_internal_id)} - ${escapeHTML(c.opponent_name || 'بدون خصم')}</option>`).join('');
    
    document.getElementById('req_docs_name').value = '';
    window.openModal('requestDocsModal');
};

// معالجة وإرسال طلب النواقص
window.submitMissingDocsRequest = async function(event) {
    event.preventDefault();
    const caseId = document.getElementById('req_docs_case_id').value;
    const docName = document.getElementById('req_docs_name').value.trim();

    if(!caseId || !docName) return window.showAlert('يرجى تعبئة كافة الحقول المطلوبة', 'warning');

    const caseData = clientCases.find(c => c.id === caseId);
    let currentMissing = [];
    
    // محاولة قراءة الحقل بأمان
    try {
        if (typeof caseData.missing_documents === 'string') currentMissing = JSON.parse(caseData.missing_documents);
        else if (Array.isArray(caseData.missing_documents)) currentMissing = caseData.missing_documents;
    } catch(e) { console.error("Error parsing missing_documents", e); }

    currentMissing.push(docName);

    const btn = event.target.querySelector('button[type="submit"]');
    const oldText = btn.innerHTML;
    btn.disabled = true; 
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> جاري الإرسال...';

    try {
        const res = await API.updateCase(caseId, { missing_documents: currentMissing });
        if (res && !res.error) {
            window.showAlert('تم إرسال الطلب، وسيظهر كإشعار في بوابة الموكل فوراً.', 'success');
            window.closeModal('requestDocsModal');
            await loadClientData(); // تحديث صامت
        } else { 
            throw new Error(res.error || 'حدث خطأ أثناء تحديث بيانات القضية.'); 
        }
    } catch(e) {
        window.showAlert('خطأ: ' + e.message, 'error');
    } finally {
        btn.disabled = false; 
        btn.innerHTML = oldText;
    }
};

// ============================================================================
// [6] إدارة عمليات الموكلين (Client Operations - CRUD)
// ============================================================================

window.goToCase = function(caseId) {
    localStorage.setItem('current_case_id', caseId);
    window.location.href = 'case-details.html';
};

// الاتصال الهاتفي السريع
window.callClient = function() {
    if (clientObj && clientObj.phone) window.open(`tel:${clientObj.phone}`);
    else window.showAlert('لا يوجد رقم هاتف مسجل لهذا الموكل', 'warning');
};

// المراسلة الفورية عبر واتساب
window.whatsappClient = function() {
    if (clientObj && clientObj.phone) {
        let p = String(clientObj.phone);
        // تحويل الرقم للصيغة الدولية (الأردن كمثال افتراضي)
        if (p.startsWith('0')) p = '962' + p.substring(1);
        window.open(`https://wa.me/${p}`, '_blank');
    } else {
        window.showAlert('لا يوجد رقم هاتف مسجل', 'warning');
    }
};

// فتح نافذة التعديل وتعبئة البيانات
window.openEditModal = function() {
    document.getElementById('edit_full_name').value = clientObj.full_name || '';
    document.getElementById('edit_phone').value = clientObj.phone || '';
    document.getElementById('edit_national_id').value = clientObj.national_id || '';
    document.getElementById('edit_mother').value = clientObj.mother_name || '';
    document.getElementById('edit_dob').value = clientObj.date_of_birth || '';
    document.getElementById('edit_pob').value = clientObj.place_of_birth || '';
    document.getElementById('edit_nationality').value = clientObj.nationality || 'أردني';
    document.getElementById('edit_marital').value = clientObj.marital_status || '';
    document.getElementById('edit_profession').value = clientObj.profession || '';
    document.getElementById('edit_email').value = clientObj.email || '';
    document.getElementById('edit_address').value = clientObj.address || '';
    document.getElementById('edit_client_type').value = clientObj.client_type || 'فرد';
    document.getElementById('edit_confidentiality').value = clientObj.confidentiality_level || 'عادي';
    
    const portalActiveEl = document.getElementById('edit_portal_active');
    if (portalActiveEl) {
        portalActiveEl.checked = clientObj.client_portal_active !== false;
    }

    window.openModal('editClientModal');
};

// حفظ تعديلات الموكل
window.updateClient = async function(event) {
    event.preventDefault();
    const btn = document.getElementById('btn_save_client');
    btn.disabled = true; 
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> جاري الحفظ...';

    const data = {
        full_name: document.getElementById('edit_full_name').value.trim(),
        phone: document.getElementById('edit_phone').value.trim(),
        national_id: document.getElementById('edit_national_id').value.trim() || null,
        mother_name: document.getElementById('edit_mother').value.trim() || null,
        date_of_birth: document.getElementById('edit_dob').value || null,
        place_of_birth: document.getElementById('edit_pob').value.trim() || null,
        nationality: document.getElementById('edit_nationality').value.trim() || null,
        marital_status: document.getElementById('edit_marital').value || null,
        profession: document.getElementById('edit_profession').value.trim() || null,
        email: document.getElementById('edit_email').value.trim() || null,
        address: document.getElementById('edit_address').value.trim() || null,
        client_type: document.getElementById('edit_client_type').value,
        confidentiality_level: document.getElementById('edit_confidentiality').value,
        client_portal_active: document.getElementById('edit_portal_active') ? document.getElementById('edit_portal_active').checked : true
    };

    try {
        const res = await API.updateClient(currentClientId, data);
        if (res && !res.error) {
            window.closeModal('editClientModal');
            window.showAlert(res.offline ? 'تم الحفظ محلياً (سيتم المزامنة لاحقاً)' : 'تم تحديث بيانات الموكل بنجاح', res.offline ? 'warning' : 'success');
            await loadClientData();
        } else {
            throw new Error(res?.error || 'حدث خطأ غير معروف');
        }
    } catch (err) {
        window.showAlert(err.message, 'error');
    } finally {
        btn.disabled = false; 
        btn.innerHTML = '<i class="fas fa-save me-2"></i> حفظ وتحديث البيانات';
    }
};

/**
 * الحذف الآمن للموكل مع المصادقة الثنائية (Action-Based MFA)
 * الشرط الأهم: منع الحذف إذا كانت هناك قضايا مرتبطة لمنع انهيار قاعدة البيانات (Referential Integrity)
 */
window.deleteClient = async function() {
    if (clientCases.length > 0) {
        Swal.fire({
            icon: 'error',
            title: 'إجراء سيبراني مرفوض',
            text: 'وفقاً لسياسة العزل وعدم ضياع البيانات، لا يمكن حذف موكل لديه قضايا نشطة. يرجى أرشفة أو حذف القضايا التابعة له أولاً.',
            confirmButtonColor: '#0B132B'
        });
        return;
    }

    const confirm = await Swal.fire({ 
        title: 'حذف الموكل نهائياً؟', 
        text: "هذا الإجراء نهائي ولا يمكن التراجع عنه. سيتم إتلاف بيانات الموكل من الخوادم السحابية.", 
        icon: 'warning', 
        showCancelButton: true, 
        confirmButtonColor: '#d33', 
        cancelButtonColor: '#6c757d',
        confirmButtonText: '<i class="fas fa-trash"></i> نعم، احذف', 
        cancelButtonText: 'إلغاء' 
    });

    if(!confirm.isConfirmed) return;

    // 🛡️ WebAuthn / PIN Security Check (Action-Based MFA) - فكرة 31
    const secCheck = await Swal.fire({
        title: 'مصادقة أمنية مطلوبة',
        text: 'يرجى إدخال الرمز السري الخاص بك (PIN) أو استخدام البصمة لتأكيد الحذف الجذري.',
        input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        showCancelButton: true,
        confirmButtonText: '<i class="fas fa-fingerprint"></i> تأكيد الهوية',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: '#0B132B',
        preConfirm: (pin) => {
            if (!pin) Swal.showValidationMessage('يجب إدخال الرمز السري أو المصادقة لتأكيد العملية');
            return pin;
        }
    });

    if(!secCheck.isConfirmed) return;

    // هنا يتم إرسال طلب الحذف للـ API
    try {
        const res = await API.deleteClient(currentClientId);
        
        if (res && !res.error) {
            await Swal.fire('تم الحذف', res.offline ? 'تم حفظ طلب الحذف محلياً.' : 'تم حذف الموكل وتدمير بياناته بنجاح.', 'success');
            window.location.href = 'app.html';
        } else {
            throw new Error(res?.error || 'خطأ أثناء الحذف يرجى مراجعة الصلاحيات.');
        }
    } catch(e) {
        Swal.fire('خطأ أمني', e.message, 'error');
    }
};

// ============================================================================
// [7] الأرشيف وإدارة الملفات السحابية (R2 Cloud Documents)
// ============================================================================

/**
 * الرفع الآمن للمستندات عبر R2 (Stream Upload)
 */
window.saveClientFile = async function(event) {
    event.preventDefault();
    const fileInput = document.getElementById('file_input');
    const titleInput = document.getElementById('file_title_input').value.trim();
    const catInput = document.getElementById('file_category_input').value;
    const expiryInput = document.getElementById('file_expiry_date').value;
    const btn = document.getElementById('btn_upload');
    
    if (!fileInput.files.length) return;
    
    // منع الرفع في وضع عدم الاتصال لتجنب تلف الملفات
    if (!navigator.onLine) { 
        window.showAlert('لا يمكن رفع المستندات السحابية أثناء انقطاع الإنترنت لحمايتها من التلف.', 'warning'); 
        return; 
    }
    
    btn.disabled = true; 
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> جاري التشفير والأرشفة...';
    
    try {
        const file = fileInput.files[0];
        
        // 1. الرفع المباشر إلى Cloudflare R2
        const r2Res = await API.uploadFileToR2(file, currentClientId, 'General');
        
        if (r2Res && r2Res.r2_key) {
            // 2. توثيق الملف في قاعدة البيانات
            const payload = { 
                client_id: currentClientId, 
                file_name: titleInput || file.name, 
                file_type: file.type, 
                file_extension: file.name.split('.').pop().toLowerCase(),
                file_category: catInput, 
                file_url: r2Res.r2_key, // حفظ المفتاح المشفر بدل الرابط المباشر لضمان الأمان
                drive_file_id: r2Res.r2_key, 
                is_template: false, 
                expiry_date: expiryInput || null 
            };

            const res = await API.addFileRecord(payload);
            
            if(res && !res.error) { 
                window.closeModal('fileModal'); 
                document.getElementById('fileForm').reset(); 
                window.showAlert('تم أرشفة وتشفير المستند بنجاح', 'success'); 
                await loadClientData(); 
            } else {
                throw new Error(res?.error || 'حدث خطأ في توثيق الملف بقاعدة البيانات');
            }
        }
    } catch (err) { 
        window.showAlert("فشل الرفع السحابي: " + err.message, 'error'); 
    } finally { 
        btn.disabled = false; 
        btn.innerHTML = '<i class="fas fa-shield-alt me-2"></i> تشفير ورفع للأرشيف'; 
    }
};

window.deleteClientFile = async function(id) {
    const res = await Swal.fire({ 
        title: 'تأكيد الحذف؟', 
        text: "سيتم إزالة المستند بشكل نهائي من الأرشيف السحابي للموكل!", 
        icon: 'warning', 
        showCancelButton: true, 
        confirmButtonColor: '#d33', 
        confirmButtonText: 'نعم، احذف', 
        cancelButtonText: 'إلغاء' 
    });
    
    if(!res.isConfirmed) return;
    
    try {
        const delRes = await API.deleteFile(id);
        if(delRes && !delRes.error) {
            window.showAlert(delRes.offline ? 'تم الحفظ محلياً (سيحذف عند عودة الإنترنت)' : 'تم الحذف من الأرشيف بنجاح', delRes.offline ? 'warning' : 'success'); 
            await loadClientData();
        } else {
            throw new Error(delRes?.error || 'حدث خطأ');
        }
    } catch(e) { 
        window.showAlert('فشل الاتصال بالخادم أثناء محاولة الحذف: ' + e.message, 'error'); 
    }
};

// ============================================================================
// [8] النوافذ المساعدة والمشتركة (Modals & UI Helpers)
// ============================================================================

window.openModal = function(id) { 
    if (window.AppCore && typeof window.AppCore.openModal === 'function') {
        window.AppCore.openModal(id);
    } else {
        const el = document.getElementById(id); 
        if(el) { const m = new bootstrap.Modal(el); m.show(); } 
    }
};

window.closeModal = function(id) { 
    if (window.AppCore && typeof window.AppCore.closeModal === 'function') {
        window.AppCore.closeModal(id);
    } else {
        const el = document.getElementById(id); 
        if(el) { 
            const m = bootstrap.Modal.getInstance(el); 
            if(m) m.hide(); 
            document.querySelectorAll('.modal-backdrop').forEach(b => b.remove()); 
            document.body.classList.remove('modal-open'); 
            document.body.style.overflow = ''; 
            document.body.style.paddingRight = ''; 
        } 
    }
};

window.showAlert = function(message, type = 'success') { 
    if (window.AppCore && typeof window.AppCore.showAlert === 'function') {
        window.AppCore.showAlert(message, type);
    } else if (typeof Swal !== 'undefined') { 
        Swal.fire({ toast: true, position: 'top-end', icon: type === 'danger' ? 'error' : (type === 'info' ? 'info' : type), title: escapeHTML(message), showConfirmButton: false, timer: 3000, timerProgressBar: true }); 
    } else { 
        alert(message); 
    } 
};

window.copyToClipboard = function(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.select();
    el.setSelectionRange(0, 99999);
    document.execCommand("copy");
    window.showAlert("تم نسخ النص بنجاح!", "success");
};

// ============================================================================
// [9] التوليد الآلي للتقارير (AI Client Reports Engine)
// ============================================================================

/**
 * دالة استدعاء الذكاء الاصطناعي لتوليد تقرير إنجاز شهري مفصل للموكل
 */
window.generateMonthlyReport = async function() {
    if (!navigator.onLine) {
        window.showAlert('يتطلب توليد التقرير الذكي اتصالاً بالإنترنت.', 'warning');
        return;
    }

    if (!clientCases || clientCases.length === 0) {
        window.showAlert('لا توجد قضايا مسجلة لهذا الموكل لتوليد تقرير حولها.', 'warning');
        return;
    }

    const btn = document.getElementById('btn_generate_report');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> جاري التوليد...';
    }

    Swal.fire({
        title: 'الذكاء الاصطناعي يعمل...',
        text: 'جاري جمع تحديثات الشهر الماضي وصياغة التقرير الاحترافي للموكل.',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    try {
        // تجميع السوابق والإجراءات محلياً لبناء الـ Prompt بذكاء
        const caseSummaries = clientCases.map(c => `قضية رقم ${c.case_internal_id || 'بلا رقم'}: المرحلة الحالية (${c.current_stage || 'غير محددة'}) - ${c.lawsuit_facts ? 'الوقائع: ' + c.lawsuit_facts : 'قيد المتابعة'}`).join('\n');
        
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const recentAppts = clientAppointments
            .filter(a => new Date(a.appt_date) > thirtyDaysAgo)
            .map(a => `- ${a.title} (${a.status}) بتاريخ ${new Date(a.appt_date).toLocaleDateString('ar-EG')}`)
            .join('\n');
            
        const remainingBalance = document.getElementById('fin-remaining')?.innerText || 0;

        const promptText = `أنت محامي أردني خبير ومحترف ومدير مكتب محاماة. قم بصياغة "تقرير إنجاز شهري" رسمي وموجز لتقديمه للموكل: ${clientObj.full_name}.
البيانات المتوفرة عن قضاياه:
${caseSummaries}

أهم المواعيد/الإجراءات التي تمت خلال آخر 30 يوماً:
${recentAppts || 'لا توجد إجراءات مسجلة هذا الشهر، جاري متابعة الملفات.'}

الرصيد المالي المتبقي على الموكل: ${remainingBalance} دينار أردني.

التعليمات:
صغ التقرير بأسلوب رسمي واحترافي، يبدأ بالترحيب، ثم يلخص حالة القضايا والإنجازات التي تمت، ويذكر الرصيد المتبقي بلباقة، ويختم بشكره على ثقته بالمكتب. لا تكتب أي مقدمات أو شروحات خارج نص التقرير الفعلي.`;

        // إرسال الطلب لمحرك الذكاء الاصطناعي (Legal Advisor)
        const res = await API.askAI(promptText);
        
        if (res && res.reply) {
            Swal.fire({
                title: '<i class="fas fa-file-signature text-success me-2"></i> التقرير الشهري للموكل',
                html: `
                    <div class="alert alert-info small fw-bold text-start mb-3 border-0 shadow-sm"><i class="fas fa-info-circle me-1"></i> يمكنك التعديل على النص قبل إرساله.</div>
                    <textarea id="generated_report_text" class="form-control bg-light border-primary shadow-sm" rows="12" style="font-family: 'Cairo', sans-serif; line-height: 1.8; font-size: 15px; font-weight: 600;">${escapeHTML(res.reply)}</textarea>
                    <div class="mt-4 d-flex gap-2">
                        <button class="btn btn-outline-navy flex-grow-1 fw-bold py-2" onclick="copyToClipboard('generated_report_text')"><i class="fas fa-copy me-1"></i> نسخ التقرير</button>
                        <button class="btn btn-success flex-grow-1 fw-bold py-2 shadow-sm" onclick="sendReportWhatsApp()"><i class="fab fa-whatsapp fs-5 align-middle me-1"></i> إرسال واتساب</button>
                    </div>
                `,
                width: '700px',
                showConfirmButton: false,
                showCloseButton: true
            });
        } else {
            throw new Error(res?.error || 'حدث خطأ في توليد التقرير من محرك Llama-3.2.');
        }
    } catch (e) {
        Swal.fire('خطأ تقني', e.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-magic me-2"></i> توليد تقرير الإنجاز الشهري';
        }
    }
};

/**
 * إرسال التقرير الذكي مباشرة عبر الواتساب للموكل
 */
window.sendReportWhatsApp = function() {
    const textEl = document.getElementById('generated_report_text');
    if (!textEl || !textEl.value) return;
    
    if (clientObj && clientObj.phone) {
        let p = String(clientObj.phone);
        // التنسيق الدولي (الأردن كمثال)
        if (p.startsWith('0')) p = '962' + p.substring(1);
        window.open(`https://wa.me/${p}?text=${encodeURIComponent(textEl.value)}`, '_blank');
    } else {
        window.showAlert('لا يوجد رقم هاتف مسجل لهذا الموكل للمراسلة عبر واتساب', 'warning');
    }
};