// js/case-details.js - المحرك الذكي لغرفة عمليات القضية (Case Dashboard)
// التحديثات المكتملة: دعم التاغات، الملف التنفيذي، شريط التقدم المالي، والذكاء الاصطناعي للملفات.

let currentCaseId = localStorage.getItem('current_case_id');
let currentCase = null;
let currentClient = null;
let caseUpdates = [];
let caseInstallments = [];
let caseExpenses = [];
let caseFiles = [];
let staffList = [];

const escapeHTML = (str) => {
    if (str === null || str === undefined) return '';
    return str.toString().replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
};

window.onload = async () => {
    applyFirmSettings();
    if (!currentCaseId) {
        Swal.fire('خطأ', 'لم يتم تحديد قضية لعرضها', 'error').then(() => window.location.href = 'app.html');
        return;
    }
    await syncCaseData();
};

function applyFirmSettings() {
    const settings = JSON.parse(localStorage.getItem('firm_settings'));
    if (!settings) return;
    const root = document.documentElement;
    if (settings.primary_color) root.style.setProperty('--navy', settings.primary_color);
    if (settings.accent_color) root.style.setProperty('--accent', settings.accent_color);
}

// =================================================================
// 🔄 جلب البيانات من الخادم (السحب الشامل)
// =================================================================
async function syncCaseData() {
    const syncIcon = document.getElementById('sync-icon');
    if(syncIcon) syncIcon.classList.add('fa-spin');
    
    try {
        // سحب كافة البيانات المرتبطة بالقضية بالتوازي لسرعة الأداء
        const [casesRes, staffRes] = await Promise.all([
            API.get(`/api/cases?id=eq.${currentCaseId}`),
            API.getStaff()
        ]);
        
        if (!casesRes || casesRes.length === 0) throw new Error('الملف غير موجود أو محذوف');
        currentCase = casesRes[0];
        staffList = Array.isArray(staffRes) ? staffRes : [];

        // سحب الموكل والتفاصيل الفرعية
        const [clientRes, updatesRes, instRes, expRes, filesRes] = await Promise.all([
            API.get(`/api/clients?id=eq.${currentCase.client_id}`),
            API.get(`/api/updates?case_id=eq.${currentCaseId}&order=created_at.desc`),
            API.get(`/api/installments?case_id=eq.${currentCaseId}&order=created_at.desc`),
            API.get(`/api/expenses?case_id=eq.${currentCaseId}&order=created_at.desc`),
            API.get(`/api/files?case_id=eq.${currentCaseId}&order=created_at.desc`)
        ]);

        currentClient = clientRes && clientRes.length > 0 ? clientRes[0] : null;
        caseUpdates = Array.isArray(updatesRes) ? updatesRes : [];
        caseInstallments = Array.isArray(instRes) ? instRes : [];
        caseExpenses = Array.isArray(expRes) ? expRes : [];
        caseFiles = Array.isArray(filesRes) ? filesRes : [];

        renderAllTabs();

    } catch (error) {
        console.error(error);
        Swal.fire('خطأ', error.message || 'حدث خطأ أثناء جلب تفاصيل القضية', 'error');
    } finally {
        if(syncIcon) syncIcon.classList.remove('fa-spin');
    }
}

// =================================================================
// 🎨 رسم وتوزيع البيانات على الواجهة (Tabs)
// =================================================================
function renderAllTabs() {
    renderHeaderAndOverview();
    renderUpdatesTimeline();
    renderFinancials();
    renderFilesArchive();
}

function renderHeaderAndOverview() {
    // 1. ترويسة القضية العلوية
    document.getElementById('cd_internal_id').innerText = currentCase.case_internal_id || 'ملف بدون رقم';
    document.getElementById('cd_status').innerText = currentCase.status || 'نشطة';
    document.getElementById('cd_court').innerText = currentCase.current_court || 'غير محدد';
    document.getElementById('cd_client_name').innerText = currentClient ? currentClient.full_name : 'غير محدد';
    document.getElementById('cd_opponent_name').innerText = currentCase.opponent_name || 'غير محدد';

    if (currentCase.confidentiality_level === 'سري') {
        document.getElementById('cd_confidentiality').classList.remove('d-none');
    }

    // 2. التاغات (Tags)
    const tagsContainer = document.getElementById('cd_tags_container');
    if (currentCase.case_tags && Array.isArray(currentCase.case_tags) && currentCase.case_tags.length > 0) {
        tagsContainer.innerHTML = currentCase.case_tags.map(tag => `<span class="tag-badge"><i class="fas fa-tag text-accent me-1"></i> ${escapeHTML(tag)}</span>`).join('');
        tagsContainer.classList.remove('d-none');
    }

    // 3. الملخص والذكاء الاصطناعي
    if (currentCase.ai_cumulative_summary && currentCase.ai_cumulative_summary.trim() !== '') {
        document.getElementById('cd_ai_summary').innerText = currentCase.ai_cumulative_summary;
        document.getElementById('ai_cumulative_card').classList.remove('d-none');
    }

    // 4. التفاصيل الأساسية (ERP Info)
    document.getElementById('cd_type').innerText = currentCase.case_type || '--';
    document.getElementById('cd_degree').innerText = currentCase.litigation_degree || '--';
    document.getElementById('cd_court_num').innerText = currentCase.court_case_number || '--';
    document.getElementById('cd_execution_num').innerText = currentCase.execution_file_number || 'لا يوجد تسجيل تنفيذي';
    if(currentCase.execution_file_number) {
        document.getElementById('cd_execution_num').classList.remove('bg-soft-danger', 'text-danger');
        document.getElementById('cd_execution_num').classList.add('bg-soft-success', 'text-success');
    }
    
    document.getElementById('cd_judge').innerText = currentCase.current_judge || '--';
    document.getElementById('cd_opp_lawyer').innerText = currentCase.opponent_lawyer || '--';

    document.getElementById('cd_facts').innerText = currentCase.lawsuit_facts || 'لم يتم إدخال وقائع.';
    document.getElementById('cd_legal_basis').innerText = currentCase.legal_basis || 'لم يتم إدخال أسانيد.';
    
    const reqList = document.getElementById('cd_requests_list');
    if (currentCase.final_requests && Array.isArray(currentCase.final_requests) && currentCase.final_requests.length > 0) {
        reqList.innerHTML = currentCase.final_requests.map(req => `<li>${escapeHTML(req)}</li>`).join('');
    } else {
        reqList.innerHTML = '<li>لم يتم إدخال طلبات.</li>';
    }

    // 5. المحامين المسندين
    const lawyersDiv = document.getElementById('cd_assigned_lawyers');
    if (currentCase.assigned_lawyer_id && Array.isArray(currentCase.assigned_lawyer_id)) {
        lawyersDiv.innerHTML = currentCase.assigned_lawyer_id.map(id => {
            const staff = staffList.find(s => s.id === id);
            if (!staff) return '';
            return `<div class="bg-light border rounded px-3 py-2 d-flex align-items-center"><i class="fas fa-user-tie text-primary me-2 fs-5"></i><div><span class="d-block fw-bold small text-navy">${escapeHTML(staff.full_name)}</span><span class="d-block text-muted" style="font-size:0.65rem;">${escapeHTML(staff.phone)}</span></div></div>`;
        }).join('');
    } else {
        lawyersDiv.innerHTML = '<span class="text-muted small">لم يتم إسناد محامين بعد.</span>';
    }
}

function renderUpdatesTimeline() {
    const timeline = document.getElementById('cd_updates_timeline');
    if (caseUpdates.length === 0) {
        timeline.innerHTML = '<div class="text-center text-muted small p-4 bg-light rounded border border-dashed">لا توجد إجراءات أو جلسات مسجلة حتى الآن.</div>';
        return;
    }

    timeline.innerHTML = caseUpdates.map(upd => {
        let dateHtml = '';
        if (upd.hearing_date) dateHtml += `<span class="badge bg-light text-dark border me-2"><i class="fas fa-calendar-day text-primary"></i> الجلسة: ${new Date(upd.hearing_date).toLocaleDateString('ar-EG')}</span>`;
        if (upd.next_hearing_date) dateHtml += `<span class="badge bg-soft-danger text-danger border border-danger"><i class="fas fa-forward"></i> القادمة: ${new Date(upd.next_hearing_date).toLocaleDateString('ar-EG')}</span>`;
        
        let clientVisibility = upd.is_visible_to_client ? '<i class="fas fa-eye text-success ms-2" title="يظهر للموكل"></i>' : '<i class="fas fa-eye-slash text-danger ms-2" title="مخفي عن الموكل"></i>';
        
        const staffName = staffList.find(s => s.id === upd.added_by)?.full_name || 'موظف';

        return `
        <div class="timeline-item">
            <h6 class="fw-bold text-navy mb-1">${escapeHTML(upd.update_title)} ${clientVisibility}</h6>
            <div class="mb-2">${dateHtml}</div>
            <p class="small text-muted mb-2 bg-light p-2 rounded" style="white-space: pre-wrap;">${escapeHTML(upd.update_details || 'بدون تفاصيل')}</p>
            <small class="text-muted" style="font-size:0.7rem;"><i class="fas fa-pencil-alt me-1"></i> أُضيف بواسطة: ${escapeHTML(staffName)} - ${new Date(upd.created_at).toLocaleString('ar-EG')}</small>
        </div>
        `;
    }).join('');
}

function renderFinancials() {
    // 1. حساب الملخص المالي وشريط التقدم
    const totalAgreed = Number(currentCase.total_agreed_fees) || 0;
    const totalPaid = caseInstallments.reduce((sum, inst) => sum + (Number(inst.amount) || 0), 0);
    const totalRem = totalAgreed - totalPaid;
    
    document.getElementById('fin_total').innerText = totalAgreed.toLocaleString();
    document.getElementById('fin_paid').innerText = totalPaid.toLocaleString();
    document.getElementById('fin_rem').innerText = totalRem.toLocaleString();

    let progressPct = totalAgreed > 0 ? Math.round((totalPaid / totalAgreed) * 100) : 0;
    if (progressPct > 100) progressPct = 100;
    
    const progressBar = document.getElementById('fin_progress');
    progressBar.style.width = `${progressPct}%`;
    progressBar.innerText = `${progressPct}%`;
    progressBar.className = `progress-bar ${progressPct === 100 ? 'bg-success' : (progressPct > 50 ? 'bg-primary' : 'bg-warning')}`;

    // 2. قائمة الدفعات (Installments)
    const instList = document.getElementById('cd_installments_list');
    if (caseInstallments.length === 0) {
        instList.innerHTML = '<div class="text-center text-muted small p-3 bg-white rounded border">لا توجد دفعات مسجلة.</div>';
    } else {
        instList.innerHTML = caseInstallments.map(inst => `
            <div class="d-flex justify-content-between align-items-center p-3 bg-white border rounded shadow-sm mb-2 border-start border-4 border-success">
                <div>
                    <h6 class="fw-bold text-success mb-1">+ ${Number(inst.amount).toLocaleString()} <small>د.أ</small></h6>
                    <small class="text-muted"><i class="fas fa-calendar-check me-1"></i> ${new Date(inst.due_date || inst.created_at).toLocaleDateString('ar-EG')}</small>
                </div>
                <div class="text-end">
                    <span class="badge bg-light text-dark border mb-1">إيصال: ${escapeHTML(inst.invoice_number || 'بدون رقم')}</span><br>
                    <small class="text-muted" style="font-size:0.65rem;">بواسطة: ${escapeHTML(staffList.find(s => s.id === inst.added_by)?.full_name || 'موظف')}</small>
                </div>
            </div>
        `).join('');
    }

    // 3. قائمة المصاريف (Expenses)
    const expList = document.getElementById('cd_expenses_list');
    if (caseExpenses.length === 0) {
        expList.innerHTML = '<div class="text-center text-muted small p-3 bg-white rounded border">لا توجد مصاريف مسجلة.</div>';
    } else {
        expList.innerHTML = caseExpenses.map(exp => `
            <div class="d-flex justify-content-between align-items-center p-3 bg-white border rounded shadow-sm mb-2 border-start border-4 border-warning">
                <div>
                    <h6 class="fw-bold text-danger mb-1">- ${Number(exp.amount).toLocaleString()} <small>د.أ</small></h6>
                    <span class="d-block small fw-bold text-navy">${escapeHTML(exp.description)}</span>
                </div>
                <div class="text-end">
                    <small class="text-muted d-block"><i class="fas fa-calendar-alt me-1"></i> ${new Date(exp.expense_date || exp.created_at).toLocaleDateString('ar-EG')}</small>
                    <small class="text-muted" style="font-size:0.65rem;">بواسطة: ${escapeHTML(staffList.find(s => s.id === exp.added_by)?.full_name || 'موظف')}</small>
                </div>
            </div>
        `).join('');
    }
}

function renderFilesArchive() {
    const filesList = document.getElementById('cd_files_list');
    if (caseFiles.length === 0) {
        filesList.innerHTML = '<div class="col-12 text-center text-muted small p-4 bg-white rounded border">لا توجد مستندات مرفوعة في أرشيف هذه القضية.</div>';
        return;
    }

    filesList.innerHTML = caseFiles.map(file => {
        const fileExt = file.file_name.split('.').pop().toLowerCase();
        let iconClass = 'fa-file-alt text-secondary';
        if (['pdf'].includes(fileExt)) iconClass = 'fa-file-pdf text-danger';
        else if (['jpg', 'jpeg', 'png'].includes(fileExt)) iconClass = 'fa-file-image text-success';
        else if (['doc', 'docx'].includes(fileExt)) iconClass = 'fa-file-word text-primary';

        // زر الذكاء الاصطناعي يظهر إذا كان الملف محللاً أو يمكن تحليله
        const aiButton = file.is_analyzed || file.ai_summary 
            ? `<button class="btn btn-sm btn-outline-info px-2 py-0 ms-1 ai-glow" onclick="viewAiSummary('${file.id}')" title="عرض تحليل الذكاء الاصطناعي"><i class="fas fa-robot"></i></button>` 
            : `<button class="btn btn-sm btn-outline-secondary px-2 py-0 ms-1" onclick="viewAiSummary('${file.id}')" title="تحليل الملف بالذكاء الاصطناعي"><i class="fas fa-brain"></i></button>`;

        return `
        <div class="col-md-6 col-12 mb-2">
            <div class="bg-white p-2 rounded border shadow-sm file-card d-flex justify-content-between align-items-center">
                <div class="d-flex align-items-center overflow-hidden">
                    <i class="fas ${iconClass} fa-2x me-2"></i>
                    <div class="text-truncate">
                        <span class="d-block fw-bold small text-navy text-truncate" title="${escapeHTML(file.file_name)}">${escapeHTML(file.file_name)}</span>
                        <span class="badge bg-light text-muted border" style="font-size:0.65rem;">${escapeHTML(file.file_category || 'مستند')}</span>
                        <small class="text-muted ms-1" style="font-size:0.65rem;">${new Date(file.created_at).toLocaleDateString('ar-EG')}</small>
                    </div>
                </div>
                <div class="d-flex flex-nowrap ms-2">
                    <a href="${escapeHTML(file.file_url)}" target="_blank" class="btn btn-sm btn-primary px-2 py-0 shadow-sm" title="عرض/تحميل"><i class="fas fa-eye"></i></a>
                    ${aiButton}
                </div>
            </div>
        </div>
        `;
    }).join('');
}

// =================================================================
// 💾 دوال الإدخال والحفظ (POST)
// =================================================================

function getModalInstance(id) {
    const el = document.getElementById(id);
    return el ? bootstrap.Modal.getInstance(el) : null;
}

async function saveCaseUpdate(event) {
    event.preventDefault();
    const btn = document.getElementById('btn_save_update');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';

    const data = {
        case_id: currentCaseId,
        update_title: document.getElementById('upd_title').value,
        update_details: document.getElementById('upd_details').value,
        hearing_date: document.getElementById('upd_date').value || null,
        next_hearing_date: document.getElementById('upd_next_date').value || null,
        is_visible_to_client: document.getElementById('upd_visible').checked
    };

    try {
        const res = await API.post('/api/updates', data);
        if (res && !res.error) {
            Swal.fire({toast: true, position: 'top-end', icon: 'success', title: 'تم الحفظ', showConfirmButton: false, timer: 2000});
            event.target.reset();
            const m = getModalInstance('addUpdateModal'); if (m) m.hide();
            await syncCaseData();
        } else throw new Error(res?.error || 'خطأ في الحفظ');
    } catch (err) {
        Swal.fire('خطأ', err.message, 'error');
    } finally {
        btn.disabled = false; btn.innerHTML = '<i class="fas fa-save me-1"></i> حفظ الإجراء';
    }
}

async function saveInstallment(event) {
    event.preventDefault();
    const btn = document.getElementById('btn_save_inst');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> تأكيد...';

    const data = {
        case_id: currentCaseId,
        amount: Number(document.getElementById('inst_amount').value),
        due_date: document.getElementById('inst_date').value || new Date().toISOString().split('T')[0],
        invoice_number: document.getElementById('inst_invoice').value || null,
        status: 'مدفوعة'
    };

    try {
        const res = await API.post('/api/installments', data);
        if (res && !res.error) {
            Swal.fire({toast: true, position: 'top-end', icon: 'success', title: 'تم قبض الدفعة وتحديث الرصيد', showConfirmButton: false, timer: 2000});
            event.target.reset();
            const m = getModalInstance('addInstallmentModal'); if (m) m.hide();
            await syncCaseData();
        } else throw new Error(res?.error || 'خطأ في الحفظ');
    } catch (err) {
        Swal.fire('خطأ', err.message, 'error');
    } finally {
        btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> تأكيد القبض';
    }
}

async function saveExpense(event) {
    event.preventDefault();
    const btn = document.getElementById('btn_save_exp');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> تسجيل...';

    const data = {
        case_id: currentCaseId,
        amount: Number(document.getElementById('exp_amount').value),
        description: document.getElementById('exp_desc').value,
        expense_date: document.getElementById('exp_date').value || new Date().toISOString().split('T')[0]
    };

    try {
        const res = await API.post('/api/expenses', data);
        if (res && !res.error) {
            Swal.fire({toast: true, position: 'top-end', icon: 'success', title: 'تم تسجيل المصروف', showConfirmButton: false, timer: 2000});
            event.target.reset();
            const m = getModalInstance('addExpenseModal'); if (m) m.hide();
            await syncCaseData();
        } else throw new Error(res?.error || 'خطأ في الحفظ');
    } catch (err) {
        Swal.fire('خطأ', err.message, 'error');
    } finally {
        btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> تسجيل المصروف';
    }
}

// =================================================================
// 🧠 رفع الملفات والذكاء الاصطناعي (AI OCR & Chat)
// =================================================================
async function uploadCaseFile(event) {
    event.preventDefault();
    if (!navigator.onLine) {
        Swal.fire('تنبيه', 'رفع الملفات يتطلب اتصالاً بالإنترنت.', 'warning');
        return;
    }

    const fileInput = document.getElementById('file_input');
    if (!fileInput.files.length) return;
    const file = fileInput.files[0];
    
    const btn = document.getElementById('btn_upload_file');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> جاري الرفع والتحليل...';

    try {
        // 1. رفع الملف إلى Google Drive عبر الباك إند
        const clientNameSafe = currentClient ? currentClient.full_name.replace(/ /g, '_') : 'موكل';
        const folderName = `${clientNameSafe}_${currentCase.case_internal_id.replace(/\//g, '-')}`;
        
        const driveRes = await API.uploadToDrive(file, file.name, folderName);
        if (!driveRes || !driveRes.url) throw new Error('فشل الرفع السحابي');

        // 2. إرسال الصورة للذكاء الاصطناعي للقراءة (إن كانت صورة)
        let aiSummaryText = null;
        let isAnalyzed = false;
        
        if (file.type.startsWith('image/')) {
            try {
                const reader = new FileReader();
                const base64Promise = new Promise((resolve) => {
                    reader.onload = (e) => resolve(e.target.result.split(',')[1]);
                    reader.readAsDataURL(file);
                });
                const base64Data = await base64Promise;
                
                // طلب قراءة وتلخيص من الباك إند
                const aiRes = await API.post('/api/ai/ocr', { image_base_64: base64Data });
                if (aiRes && !aiRes.error) {
                    aiSummaryText = JSON.stringify(aiRes, null, 2); // حفظ النتيجة مؤقتاً
                    isAnalyzed = true;
                }
            } catch (aiErr) {
                console.warn('AI Extraction bypassed for this file:', aiErr);
            }
        }

        // 3. حفظ السجل في قاعدة البيانات
        const data = {
            case_id: currentCaseId,
            client_id: currentCase.client_id,
            file_name: document.getElementById('file_custom_name').value || file.name,
            file_category: document.getElementById('file_category').value,
            file_url: driveRes.url,
            drive_file_id: driveRes.id || null,
            file_extension: file.name.split('.').pop().toLowerCase(),
            ai_summary: aiSummaryText,
            is_analyzed: isAnalyzed
        };

        const dbRes = await API.post('/api/files', data);
        if (dbRes && !dbRes.error) {
            Swal.fire({toast: true, position: 'top-end', icon: 'success', title: 'تمت أرشفة المستند بنجاح', showConfirmButton: false, timer: 2000});
            event.target.reset();
            const m = getModalInstance('uploadFileModal'); if (m) m.hide();
            await syncCaseData();
        } else throw new Error(dbRes?.error || 'خطأ في قاعدة البيانات');

    } catch (err) {
        Swal.fire('خطأ', err.message, 'error');
    } finally {
        btn.disabled = false; btn.innerHTML = '<i class="fas fa-upload me-1"></i> رفع وتحليل المستند';
    }
}

async function viewAiSummary(fileId) {
    const file = caseFiles.find(f => f.id === fileId);
    if (!file) return;

    const titleEl = document.getElementById('ai_doc_title');
    const summaryEl = document.getElementById('ai_doc_summary');
    
    titleEl.innerHTML = `<i class="fas fa-file-alt me-2"></i> ${escapeHTML(file.file_name)}`;
    const m = new bootstrap.Modal(document.getElementById('aiDocModal'));
    m.show();

    if (file.is_analyzed && file.ai_summary) {
        // الملف محلل مسبقاً
        summaryEl.innerHTML = `<div class="alert alert-success border-0 shadow-sm small fw-bold"><i class="fas fa-check-circle me-1"></i> تم تحليل هذا المستند مسبقاً.</div><div dir="ltr" class="text-start"><code>${escapeHTML(file.ai_summary)}</code></div>`;
    } else {
        // محاولة التحليل الحي (إذا كان الرابط متاحاً أو نصاً)
        // في نظام موكّل 1.0، إذا لم يُحلل مسبقاً، نقوم بإرشاد المستخدم
        summaryEl.innerHTML = `
            <div class="text-center py-4">
                <i class="fas fa-info-circle fa-3x text-warning mb-3"></i>
                <h6 class="fw-bold">لم يتم استخراج النص من هذا المستند بعد.</h6>
                <p class="text-muted small">نظراً لكونه ملف PDF أو وورد محفوظ في Google Drive، يمكنك فتح الملف ونسخ محتواه إلى (المساعد الذكي - AI Chat) ليقوم بتلخيصه واستخراج الوقائع منه فوراً.</p>
                <a href="${escapeHTML(file.file_url)}" target="_blank" class="btn btn-primary fw-bold px-4 mt-2 shadow-sm"><i class="fas fa-external-link-alt me-1"></i> فتح المستند الآن</a>
            </div>
        `;
    }
}

// =================================================================
// 🔗 بوابة الموكل (مشاركة)
// =================================================================
function openShareModal() {
    if (!currentCase) return;
    const pathArray = window.location.pathname.split('/'); pathArray.pop(); 
    const shareLink = `${window.location.origin + pathArray.join('/')}/client.html?token=${currentCase.public_token}`;
    
    document.getElementById('share_pin_display').value = currentCase.access_pin || 'لا يوجد';
    
    const m = new bootstrap.Modal(document.getElementById('shareModal'));
    m.show();

    // حفظ الرابط في متغير عام للواتساب
    window.currentCaseShareLink = shareLink;
}

function sendCaseShareViaWhatsApp() {
    if (!currentCase || !window.currentCaseShareLink) return;
    const msg = `أهلاً بك،\nرابط متابعة تفاصيل قضيتك:\n${window.currentCaseShareLink}\n\nالرمز السري الخاص بك (PIN): ${currentCase.access_pin}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
}