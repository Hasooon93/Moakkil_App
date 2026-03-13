// js/case-details.js - محرك تفاصيل القضية والتقارير والمستندات

let currentCaseId = localStorage.getItem('current_case_id');
let caseObj = null;
let clientObj = null;

window.onload = async () => {
    if (!currentCaseId) {
        window.location.href = 'app.html';
        return;
    }
    await loadCaseFullDetails();
};

/**
 * دالة للعودة إلى اللوحة الرئيسية
 */
function goBack() {
    window.location.href = 'app.html';
}

/**
 * جلب البيانات الشاملة للقضية
 */
async function loadCaseFullDetails() {
    console.log("🔄 جاري تحميل سجل القضية...");
    
    const [allCases, updates, installments, files] = await Promise.all([
        API.getCases(),
        API.getUpdates(currentCaseId),
        API.getInstallments(currentCaseId),
        API.getFiles(currentCaseId)
    ]);

    caseObj = (allCases || []).find(c => c.id == currentCaseId);

    if (!caseObj) {
        alert("عذراً، لم يتم العثور على بيانات هذه القضية.");
        window.location.href = 'app.html';
        return;
    }

    renderHeaderAndSummary();
    renderTimeline(updates || []);
    renderPayments(installments || []);
    renderFiles(files || []);
    calculateFinances(installments || []);
}

/**
 * عرض بيانات القضية في البطاقة العلوية
 */
function renderHeaderAndSummary() {
    document.getElementById('case-title').innerText = `${caseObj.case_internal_id}`;
    document.getElementById('case-client-name').innerHTML = `<i class="fas fa-user-tie me-2 text-info"></i> ${caseObj.mo_clients?.full_name || "اسم الموكل"}`;
    
    // التفاصيل الفرعية
    document.getElementById('det-court').innerText = caseObj.current_court || "--";
    document.getElementById('det-judge').innerText = caseObj.current_judge || "--";
    document.getElementById('det-type').innerText = caseObj.case_type || "--";
    document.getElementById('det-opponent').innerText = caseObj.opponent_name || "--";
    document.getElementById('det-claim').innerText = caseObj.claim_amount ? `${caseObj.claim_amount.toLocaleString()} د.أ` : "--";
    document.getElementById('case-pin').innerHTML = `<i class="fas fa-key text-warning"></i> PIN: ${caseObj.access_pin || 'غير محدد'}`;
    
    // الحالة
    const statusEl = document.getElementById('case-status');
    statusEl.innerText = caseObj.status || "نشطة";
    if(caseObj.status === 'نشطة') statusEl.className = 'badge bg-success fs-6';
    else if(caseObj.status === 'مغلقة') statusEl.className = 'badge bg-danger fs-6';
    else statusEl.className = 'badge bg-secondary fs-6';
}

/**
 * عرض الخط الزمني (الوقائع)
 */
function renderTimeline(updates) {
    const container = document.getElementById('timeline-container');
    if (!container) return;

    if (updates.length === 0) {
        container.innerHTML = '<div class="text-center p-4 text-muted small border rounded-3 bg-white">لا يوجد وقائع مسجلة بعد.</div>';
        return;
    }

    container.innerHTML = updates.map(u => {
        let visibilityBadge = u.is_visible_to_client ? '<span class="badge bg-soft-success text-success ms-2" style="font-size:10px;">مرئي للموكل</span>' : '<span class="badge bg-soft-danger text-danger ms-2" style="font-size:10px;">سري</span>';
        let datesInfo = '';
        if(u.hearing_date) datesInfo += `<small class="d-block text-muted mt-2"><i class="fas fa-gavel text-info"></i> الجلسة: ${u.hearing_date}</small>`;
        if(u.next_hearing_date) datesInfo += `<small class="d-block text-muted"><i class="fas fa-calendar-alt text-warning"></i> القادمة: ${u.next_hearing_date}</small>`;

        return `
        <div class="timeline-item mb-3">
            <div class="card-custom p-3 shadow-sm bg-white border-end border-4 border-navy">
                <div class="d-flex justify-content-between align-items-start">
                    <small class="text-primary fw-bold">${new Date(u.created_at).toLocaleDateString('ar-EG')}</small>
                    ${visibilityBadge}
                </div>
                <h6 class="fw-bold text-navy mt-1 mb-1">${u.update_title || 'تحديث'}</h6>
                <p class="mb-0 small text-dark" style="white-space: pre-wrap;">${u.update_details}</p>
                ${datesInfo}
            </div>
        </div>
    `}).join('');
}

/**
 * عرض الدفعات المالية
 */
function renderPayments(installments) {
    const container = document.getElementById('payments-container');
    if (!container) return;

    if (installments.length === 0) {
        container.innerHTML = '<div class="text-center p-4 text-muted small border rounded-3 bg-white">لا توجد دفعات مسجلة.</div>';
        return;
    }

    container.innerHTML = installments.map(i => `
        <div class="card-custom p-3 mb-2 d-flex justify-content-between align-items-center border-start border-4 ${i.status === 'مدفوعة' ? 'border-success' : 'border-warning'}">
            <div>
                <b class="${i.status === 'مدفوعة' ? 'text-success' : 'text-warning'} fs-5">${i.amount} د.أ</b>
                <span class="badge ${i.status === 'مدفوعة' ? 'bg-success' : 'bg-warning text-dark'} ms-2">${i.status}</span>
            </div>
            <div class="text-end">
                <small class="text-muted d-block fw-bold">الاستحقاق</small>
                <small class="text-dark">${i.due_date || new Date(i.created_at).toLocaleDateString()}</small>
            </div>
        </div>
    `).join('');
}

/**
 * عرض الملفات المؤرشفة
 */
function renderFiles(files) {
    const container = document.getElementById('files-container');
    if (!container) return;

    if (files.length === 0) {
        container.innerHTML = '<div class="col-12"><div class="text-center p-4 text-muted small border rounded-3 bg-white">لا توجد مستندات في الأرشيف.</div></div>';
        return;
    }

    container.innerHTML = files.map(f => `
        <div class="col-6">
            <div class="card-custom p-3 text-center border shadow-sm">
                <i class="fas fa-file-alt fs-1 text-secondary mb-2"></i>
                <h6 class="small fw-bold text-truncate mb-2" title="${f.file_name}">${f.file_name}</h6>
                <a href="${f.drive_file_id}" target="_blank" class="btn btn-sm btn-outline-primary w-100 fw-bold">عرض</a>
            </div>
        </div>
    `).join('');
}

/**
 * حساب المبالغ الكلية
 */
function calculateFinances(installments) {
    // نحسب فقط الدفعات "المدفوعة"
    const totalPaid = installments.filter(i => i.status === 'مدفوعة').reduce((sum, i) => sum + Number(i.amount), 0);
    const agreedFees = Number(caseObj.total_agreed_fees) || 0;

    document.getElementById('sum-agreed').innerText = agreedFees.toLocaleString();
    document.getElementById('sum-paid').innerText = totalPaid.toLocaleString();
    document.getElementById('sum-rem').innerText = (agreedFees - totalPaid).toLocaleString();
}

/**
 * ==========================================
 * دوال الحفظ والرفع (POST/PATCH)
 * ==========================================
 */

async function saveUpdate(event) {
    event.preventDefault();
    const data = {
        case_id: currentCaseId,
        update_title: document.getElementById('upd_title').value,
        update_details: document.getElementById('upd_details').value,
        hearing_date: document.getElementById('upd_hearing_date').value || null,
        next_hearing_date: document.getElementById('upd_next_hearing').value || null,
        is_visible_to_client: document.getElementById('upd_visible').checked
    };

    const res = await API.addUpdate(data);
    if (res) {
        closeModal('updateModal');
        document.getElementById('updateForm').reset();
        showAlert('تم تسجيل الواقعة بنجاح', 'success');
        await loadCaseFullDetails();
    }
}

async function savePayment(event) {
    event.preventDefault();
    const data = {
        case_id: currentCaseId,
        amount: Number(document.getElementById('pay_amount').value),
        due_date: document.getElementById('pay_due_date').value,
        status: document.getElementById('pay_status').value
    };

    const res = await API.addInstallment(data);
    if (res) {
        closeModal('paymentModal');
        document.getElementById('paymentForm').reset();
        showAlert('تم تسجيل الدفعة بنجاح', 'success');
        await loadCaseFullDetails();
    }
}

/**
 * دالة حفظ ورفع الملف لجوجل درايف وتسجيله بالقاعدة
 */
async function saveFile(event) {
    event.preventDefault();
    const fileInput = document.getElementById('file_input');
    const titleInput = document.getElementById('file_title_input').value;
    const btn = document.getElementById('btn_upload');
    
    if (!fileInput.files.length) return;
    const file = fileInput.files[0];

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> جاري الرفع والأرشفة...';

    try {
        // 1. رفع الملف لجوجل درايف واستلام الرابط
        const driveRes = await API.uploadToDrive(file, caseObj.case_internal_id);
        
        if(driveRes && driveRes.url) {
            // 2. حفظ سجل الملف في قاعدة البيانات لربطه بالقضية
            const dbRes = await API.addFileRecord({
                case_id: currentCaseId,
                file_name: titleInput || file.name,
                file_type: file.type,
                drive_file_id: driveRes.url // حفظ الرابط القادم من جوجل
            });
            
            // 3. التحقق من الحفظ بنجاح وتحديث الواجهة
            if(dbRes) {
                closeModal('fileModal');
                document.getElementById('fileForm').reset();
                showAlert('تم أرشفة الملف بنجاح', 'success');
                await loadCaseFullDetails(); // إعادة تحميل بيانات القضية ليظهر الملف فوراً في الأرشيف
            } else {
                throw new Error("تم الرفع لجوجل، لكن حدث خطأ أثناء الحفظ في قاعدة البيانات!");
            }
        }
    } catch (err) {
        alert("فشل العملية: " + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-cloud-upload-alt me-1"></i> بدء الرفع والأرشفة';
    }
}

/**
 * تجهيز نافذة التعديل وحفظ التعديلات
 */
function openEditModal() {
    document.getElementById('edit_internal_id').value = caseObj.case_internal_id || '';
    document.getElementById('edit_status').value = caseObj.status || 'نشطة';
    document.getElementById('edit_access_pin').value = caseObj.access_pin || '';
    document.getElementById('edit_court').value = caseObj.current_court || '';
    document.getElementById('edit_judge').value = caseObj.current_judge || '';
    document.getElementById('edit_type').value = caseObj.case_type || '';
    document.getElementById('edit_opponent').value = caseObj.opponent_name || '';
    document.getElementById('edit_claim').value = caseObj.claim_amount || '';
    document.getElementById('edit_fees').value = caseObj.total_agreed_fees || '';
    
    openModal('editCaseModal');
}

async function updateCaseDetails(event) {
    event.preventDefault();
    
    const updateData = {
        case_internal_id: document.getElementById('edit_internal_id').value,
        status: document.getElementById('edit_status').value,
        access_pin: document.getElementById('edit_access_pin').value,
        current_court: document.getElementById('edit_court').value,
        current_judge: document.getElementById('edit_judge').value,
        case_type: document.getElementById('edit_type').value,
        opponent_name: document.getElementById('edit_opponent').value,
        claim_amount: Number(document.getElementById('edit_claim').value) || null,
        total_agreed_fees: Number(document.getElementById('edit_fees').value) || 0
    };

    const res = await fetchAPI(`/api/cases?id=eq.${currentCaseId}`, 'PATCH', updateData);
    
    if (res) {
        closeModal('editCaseModal');
        showAlert('تم تحديث بيانات القضية بنجاح', 'success');
        await loadCaseFullDetails();
    }
}

/**
 * ==========================================
 * دوال مساعدة (رابط عميق، طباعة، تنبيهات)
 * ==========================================
 */

function copyDeepLink() {
    if (!caseObj || !caseObj.client_id) return;
    
    const baseUrl = window.location.origin + window.location.pathname.replace('case-details.html', '');
    const link = `${baseUrl}client.html?id=${caseObj.client_id}`;
    
    navigator.clipboard.writeText(link).then(() => {
        showAlert('تم نسخ رابط بوابة الموكل بنجاح!', 'success');
    }).catch(err => {
        alert("الرابط: " + link);
    });
}

function generatePDF() {
    window.print();
}

function openModal(id) { 
    new bootstrap.Modal(document.getElementById(id)).show(); 
}

function closeModal(id) {
    const el = document.getElementById(id);
    if(el) {
        const m = bootstrap.Modal.getInstance(el);
        if (m) m.hide();
    }
    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
}

function showAlert(message, type = 'info') {
    const box = document.getElementById('alertBox');
    if(!box) return;
    
    const alertId = 'alert-' + Date.now();
    let typeClass = type === 'success' ? 'alert-success-custom' : 'alert-danger-custom';
    
    const html = `
        <div id="${alertId}" class="alert-custom ${typeClass}">
            <i class="fas ${type === 'success' ? 'fa-check-circle text-success' : 'fa-info-circle text-info'}"></i>
            <span>${message}</span>
        </div>
    `;
    box.insertAdjacentHTML('beforeend', html);
    
    setTimeout(() => {
        const el = document.getElementById(alertId);
        if(el) {
            el.style.opacity = '0';
            setTimeout(() => el.remove(), 300);
        }
    }, 3000);
}