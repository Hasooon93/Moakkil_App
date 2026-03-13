// js/case-details.js - محرك التفاصيل المطور (يعالج الإسناد، القضايا المرتبطة، الفواتير، التفقيط، الـ QR)

let currentCaseId = localStorage.getItem('current_case_id');
let caseObj = null;
let realtimeSyncTimer = null;

window.onload = async () => {
    if (!currentCaseId) { window.location.href = 'app.html'; return; }
    await loadCaseFullDetails();
    startRealtimeSync();
};

function startRealtimeSync() {
    realtimeSyncTimer = setInterval(async () => {
        try {
            const [updates, installments, expenses] = await Promise.all([
                fetchAPI(`/api/updates?case_id=${currentCaseId}`),
                fetchAPI(`/api/installments?case_id=${currentCaseId}`),
                fetchAPI(`/api/expenses?case_id=${currentCaseId}`)
            ]);
            renderTimeline(updates || []);
            renderPayments(installments || []);
            renderExpenses(expenses || []);
            calculateFinances(installments || [], expenses || []);
        } catch(e) {}
    }, 5000);
}

function goBack() { window.location.href = 'app.html'; }

async function loadCaseFullDetails() {
    try {
        // جلبنا طاقم العمل (الموظفين) وجميع القضايا لكي نستخدمها في نافذة التعديل للإسناد والارتباط
        const [allCases, updates, installments, expenses, files, staff] = await Promise.all([
            API.getCases(), 
            fetchAPI(`/api/updates?case_id=${currentCaseId}`), 
            fetchAPI(`/api/installments?case_id=${currentCaseId}`),
            fetchAPI(`/api/expenses?case_id=${currentCaseId}`), 
            fetchAPI(`/api/files?case_id=${currentCaseId}`),
            API.getStaff()
        ]);
        
        window.firmStaff = staff || [];
        window.firmCases = allCases || [];
        
        caseObj = (allCases || []).find(c => c.id == currentCaseId);
        if (!caseObj) { window.location.href = 'app.html'; return; }

        renderHeaderAndSummary();
        renderTimeline(updates || []);
        renderPayments(installments || []);
        renderExpenses(expenses || []);
        renderFiles(files || []);
        calculateFinances(installments || [], expenses || []);
        
        document.getElementById('secret_notes_input').value = caseObj.secret_notes || '';
        
    } catch (error) { showAlert('حدث خطأ أثناء جلب التفاصيل', 'danger'); }
}

function renderHeaderAndSummary() {
    document.getElementById('case-title').innerText = `${caseObj.case_internal_id || 'ملف قضية'}`;
    document.getElementById('case-client-name').innerHTML = `<i class="fas fa-user-tie me-2 text-info"></i> ${caseObj.mo_clients?.full_name || "موكل غير محدد"}`;
    document.getElementById('det-court').innerText = caseObj.current_court || "--";
    document.getElementById('det-court-num').innerText = caseObj.court_case_number || "--";
    document.getElementById('det-judge').innerText = caseObj.current_judge || "--";
    document.getElementById('det-type').innerText = caseObj.case_type || "--";
    document.getElementById('det-opponent').innerText = caseObj.opponent_name || "--";
    
    document.getElementById('det-opp-lawyer').innerText = caseObj.opponent_lawyer || "غير محدد";
    document.getElementById('det-poa').innerText = caseObj.poa_details || "غير محدد";
    document.getElementById('det-success').innerText = caseObj.success_probability ? `${caseObj.success_probability}%` : "غير محدد";
    
    const deadlineEl = document.getElementById('det-deadline');
    if (caseObj.deadline_date) {
        deadlineEl.innerText = caseObj.deadline_date;
        const daysLeft = Math.ceil((new Date(caseObj.deadline_date) - new Date()) / (1000 * 60 * 60 * 24));
        if(daysLeft <= 7 && daysLeft > 0) deadlineEl.className = "text-danger fw-bold heartbeat-animation";
        else if (daysLeft < 0) deadlineEl.innerHTML = `<span class="text-dark"><i class="fas fa-times"></i> منتهي</span>`;
    } else {
        deadlineEl.innerText = "غير محدد";
    }

    document.getElementById('case-pin').innerHTML = `<i class="fas fa-key text-warning"></i> PIN: ${caseObj.access_pin || 'غير محدد'}`;
    const statusEl = document.getElementById('case-status');
    statusEl.innerText = caseObj.status || "نشطة";
    statusEl.className = `badge fs-6 ${caseObj.status === 'نشطة' ? 'bg-success' : 'bg-danger'}`;
}

async function saveSecretNotes() {
    const notes = document.getElementById('secret_notes_input').value;
    const res = await API.updateCase(currentCaseId, { secret_notes: notes });
    if (res) showAlert('تم حفظ الملاحظات السرية', 'success');
}

function renderTimeline(updates) {
    const container = document.getElementById('timeline-container');
    if (!updates || updates.length === 0) { container.innerHTML = '<div class="text-center p-4 text-muted small">لا يوجد وقائع.</div>'; return; }
    container.innerHTML = updates.map(u => `
        <div class="timeline-item mb-3">
            <div class="card-custom p-3 shadow-sm bg-white border-end border-4 border-navy">
                <small class="text-primary fw-bold">${new Date(u.created_at).toLocaleDateString('ar-EG')}</small>
                <h6 class="fw-bold text-navy mt-1">${u.update_title}</h6>
                <p class="mb-0 small">${u.update_details}</p>
                ${u.hearing_date ? `<small class="d-block mt-2 text-muted"><i class="fas fa-calendar-check text-success"></i> الجلسة: ${u.hearing_date}</small>` : ''}
            </div>
        </div>
    `).join('');
}

function renderPayments(installments) {
    const container = document.getElementById('payments-container');
    if (!installments || installments.length === 0) { container.innerHTML = '<div class="text-center p-3 text-muted small border bg-white">لا توجد دفعات.</div>'; return; }
    
    container.innerHTML = installments.map(i => {
        const printBtn = i.status === 'مدفوعة' ? `<button class="btn btn-sm btn-outline-success fw-bold ms-2" onclick="printInvoice('${i.amount}', '${i.due_date || i.created_at.split('T')[0]}', '${i.id}')" title="إصدار فاتورة"><i class="fas fa-print"></i> فاتورة</button>` : '';
        return `
        <div class="card-custom p-3 mb-2 d-flex justify-content-between align-items-center border-start border-4 ${i.status === 'مدفوعة' ? 'border-success' : 'border-warning'}">
            <div>
                <b class="fs-5 text-success">${Number(i.amount).toLocaleString()} د.أ</b>
                <small class="d-block text-muted">تاريخ: ${i.due_date || new Date(i.created_at).toLocaleDateString()}</small>
            </div>
            <div>
                <span class="badge ${i.status === 'مدفوعة' ? 'bg-success' : 'bg-warning text-dark'}">${i.status}</span>
                ${printBtn}
            </div>
        </div>
    `}).join('');
}

function renderExpenses(expenses) {
    const container = document.getElementById('expenses-container');
    if (!expenses || expenses.length === 0) { container.innerHTML = '<div class="text-center p-3 text-muted small border bg-white">لا توجد مصروفات.</div>'; return; }
    container.innerHTML = expenses.map(e => `
        <div class="card-custom p-3 mb-2 d-flex justify-content-between align-items-center border-start border-4 border-danger">
            <div>
                <b class="fs-5 text-danger">${Number(e.amount).toLocaleString()} د.أ</b>
                <small class="d-block text-muted">${e.description}</small>
            </div>
            <small class="text-muted"><i class="fas fa-calendar-alt"></i> ${e.expense_date}</small>
        </div>
    `).join('');
}

function renderFiles(files) {
    const container = document.getElementById('files-container');
    if (!files || files.length === 0) { container.innerHTML = '<div class="col-12 text-center p-4 text-muted small border bg-white">الأرشيف فارغ.</div>'; return; }
    container.innerHTML = files.map(f => {
        const isImage = f.file_type && f.file_type.includes('image');
        const iconHtml = (isImage && f.drive_file_id) ? `<i class="fas fa-image fs-1 text-primary mb-2"></i>` : `<i class="fas fa-file-pdf fs-1 text-danger mb-2"></i>`;
        return `
        <div class="col-6">
            <div class="card-custom p-3 text-center border shadow-sm h-100">
                <span class="badge bg-light text-dark border mb-2 d-block text-truncate">${f.file_category || 'مستند'}</span>
                ${iconHtml}
                <h6 class="small fw-bold text-truncate" title="${f.file_name}">${f.file_name}</h6>
                <div class="d-flex gap-1 mt-2">
                    <a href="${f.drive_file_id}" target="_blank" class="btn btn-sm btn-outline-primary w-100 fw-bold">عرض</a>
                </div>
            </div>
        </div>
    `}).join('');
}

function calculateFinances(installments, expenses) {
    const totalPaid = installments.filter(i => i.status === 'مدفوعة').reduce((sum, i) => sum + Number(i.amount), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const agreedFees = Number(caseObj.total_agreed_fees) || 0;
    const netProfit = totalPaid - totalExpenses;
    document.getElementById('sum-agreed').innerText = agreedFees.toLocaleString();
    document.getElementById('sum-paid').innerText = totalPaid.toLocaleString();
    document.getElementById('sum-expenses').innerText = totalExpenses.toLocaleString();
    document.getElementById('sum-net').innerText = netProfit.toLocaleString();
    document.getElementById('sum-net').className = netProfit >= 0 ? 'text-primary' : 'text-danger';
}

function tafqeet(number) {
    const units = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];
    const tens = ["", "عشرة", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
    const hundreds = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];
    const thousands = ["", "ألف", "ألفان", "آلاف"];

    if (number === 0) return "صفر";
    let words = "";

    const numStr = number.toString().padStart(6, '0');
    const hThous = parseInt(numStr[0]);
    const tThous = parseInt(numStr[1]);
    const uThous = parseInt(numStr[2]);
    const h = parseInt(numStr[3]);
    const t = parseInt(numStr[4]);
    const u = parseInt(numStr[5]);

    let thousandPart = "";
    if (hThous > 0) thousandPart += hundreds[hThous] + " و";
    if (tThous === 1 && uThous > 0) thousandPart += "أحد عشر ألفاً و"; 
    else if (tThous > 0) thousandPart += units[uThous] + " و" + tens[tThous] + " ألفاً و";
    else if (uThous > 2) thousandPart += units[uThous] + " آلاف و";
    else if (uThous === 2) thousandPart += thousands[2] + " و";
    else if (uThous === 1) thousandPart += thousands[1] + " و";

    let basicPart = "";
    if (h > 0) basicPart += hundreds[h] + " و";
    if (t === 1 && u > 0) basicPart += (u===1?"أحد":u===2?"اثنا":units[u]) + " عشر";
    else if (t > 0 && u > 0) basicPart += units[u] + " و" + tens[t];
    else if (t > 0) basicPart += tens[t];
    else if (u > 0) basicPart += units[u];

    words = thousandPart + basicPart;
    words = words.replace(/ و$/, "").trim();
    return words;
}

function printInvoice(amount, date, invoiceId) {
    document.getElementById('print-section').style.display = 'block';
    document.getElementById('qr-print-container').style.display = 'none';
    document.getElementById('invoice-print-container').style.display = 'block';

    document.getElementById('print-inv-date').innerText = date;
    document.getElementById('print-inv-case').innerText = caseObj.case_internal_id;
    document.getElementById('print-inv-client').innerText = caseObj.mo_clients?.full_name || "موكل";
    document.getElementById('print-inv-amount').innerText = amount;
    
    const textAmount = tafqeet(parseInt(amount));
    document.getElementById('print-inv-tafqeet').innerText = textAmount + " دينار أردني";

    window.print();
    setTimeout(() => { document.getElementById('print-section').style.display = 'none'; }, 1000);
}

function printQRCode() {
    if(!caseObj.public_token) {
        showAlert('لا يوجد رابط وصول عام لهذه القضية لتوليد الرمز.', 'danger');
        return;
    }
    
    document.getElementById('print-section').style.display = 'block';
    document.getElementById('invoice-print-container').style.display = 'none';
    document.getElementById('qr-print-container').style.display = 'block';
    
    document.getElementById('print-qr-casenum').innerText = `ملف رقم: ${caseObj.case_internal_id}`;

    const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
    const deepLink = `${baseUrl}client.html?token=${caseObj.public_token}`;

    const qrContainer = document.getElementById("qrcode");
    qrContainer.innerHTML = ""; 
    
    new QRCode(qrContainer, {
        text: deepLink,
        width: 200,
        height: 200,
        colorDark : "#0a192f",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
    });

    setTimeout(() => {
        window.print();
        document.getElementById('print-section').style.display = 'none';
    }, 500);
}

// تعبئة وتجهيز نافذة التعديل بحقول الإسناد والارتباط
function openEditModal() {
    document.getElementById('edit_internal_id').value = caseObj.case_internal_id || '';
    document.getElementById('edit_status').value = caseObj.status || 'نشطة';
    document.getElementById('edit_access_pin').value = caseObj.access_pin || '';
    document.getElementById('edit_court').value = caseObj.current_court || '';
    document.getElementById('edit_court_case_number').value = caseObj.court_case_number || '';
    document.getElementById('edit_case_year').value = caseObj.case_year || '';
    document.getElementById('edit_litigation_degree').value = caseObj.litigation_degree || '';
    document.getElementById('edit_judge').value = caseObj.current_judge || '';
    document.getElementById('edit_type').value = caseObj.case_type || '';
    document.getElementById('edit_opponent').value = caseObj.opponent_name || '';
    document.getElementById('edit_claim').value = caseObj.claim_amount || '';
    document.getElementById('edit_fees').value = caseObj.total_agreed_fees || '';
    
    document.getElementById('edit_opponent_lawyer').value = caseObj.opponent_lawyer || '';
    document.getElementById('edit_poa_details').value = caseObj.poa_details || '';
    document.getElementById('edit_deadline_date').value = caseObj.deadline_date || '';
    document.getElementById('edit_success_probability').value = caseObj.success_probability || '';
    
    // تعبئة قائمة المحامين للإسناد
    const lawyerSelect = document.getElementById('edit_assigned_lawyer');
    if(lawyerSelect && window.firmStaff) {
        lawyerSelect.innerHTML = '<option value="">بدون إسناد (لمكتب العمل)</option>' + 
            window.firmStaff.map(s => `<option value="${s.id}">${s.full_name}</option>`).join('');
        lawyerSelect.value = caseObj.assigned_lawyer_id || '';
    }
    
    // تعبئة قائمة القضايا للارتباط
    const parentSelect = document.getElementById('edit_parent_case_id');
    if(parentSelect && window.firmCases) {
        parentSelect.innerHTML = '<option value="">لا يوجد ارتباط</option>' + 
            window.firmCases.filter(c => c.id !== currentCaseId).map(c => `<option value="${c.id}">${c.case_internal_id} - ${c.opponent_name || ''}</option>`).join('');
        parentSelect.value = caseObj.parent_case_id || '';
    }

    openModal('editCaseModal');
}

async function updateCaseDetails(event) {
    event.preventDefault();
    const data = {
        case_internal_id: document.getElementById('edit_internal_id').value, 
        status: document.getElementById('edit_status').value,
        access_pin: document.getElementById('edit_access_pin').value, 
        current_court: document.getElementById('edit_court').value,
        court_case_number: document.getElementById('edit_court_case_number').value, 
        case_year: document.getElementById('edit_case_year').value ? Number(document.getElementById('edit_case_year').value) : null,
        litigation_degree: document.getElementById('edit_litigation_degree').value, 
        current_judge: document.getElementById('edit_judge').value,
        case_type: document.getElementById('edit_type').value, 
        opponent_name: document.getElementById('edit_opponent').value,
        claim_amount: document.getElementById('edit_claim').value ? Number(document.getElementById('edit_claim').value) : null,
        total_agreed_fees: document.getElementById('edit_fees').value ? Number(document.getElementById('edit_fees').value) : 0,
        
        opponent_lawyer: document.getElementById('edit_opponent_lawyer').value || null,
        poa_details: document.getElementById('edit_poa_details').value || null,
        deadline_date: document.getElementById('edit_deadline_date').value || null,
        success_probability: document.getElementById('edit_success_probability').value ? Number(document.getElementById('edit_success_probability').value) : null,
        
        // التقاط قيم الإسناد والارتباط
        assigned_lawyer_id: document.getElementById('edit_assigned_lawyer').value || null,
        parent_case_id: document.getElementById('edit_parent_case_id').value || null
    };
    if(await API.updateCase(currentCaseId, data)) { closeModal('editCaseModal'); showAlert('تم التحديث بنجاح', 'success'); await loadCaseFullDetails(); }
}

async function saveUpdate(event) {
    event.preventDefault();
    const data = {
        case_id: currentCaseId, update_title: document.getElementById('upd_title').value, update_details: document.getElementById('upd_details').value,
        hearing_date: document.getElementById('upd_hearing_date').value || null, next_hearing_date: document.getElementById('upd_next_hearing').value || null,
        is_visible_to_client: document.getElementById('upd_visible').checked
    };
    if(await API.addUpdate(data)) { closeModal('updateModal'); document.getElementById('updateForm').reset(); showAlert('تمت الإضافة', 'success'); await loadCaseFullDetails(); }
}

async function savePayment(event) {
    event.preventDefault();
    const data = { case_id: currentCaseId, amount: Number(document.getElementById('pay_amount').value), due_date: document.getElementById('pay_due_date').value, status: document.getElementById('pay_status').value };
    if(await API.addInstallment(data)) { closeModal('paymentModal'); document.getElementById('paymentForm').reset(); showAlert('تم تسجيل الدفعة', 'success'); await loadCaseFullDetails(); }
}

async function saveExpense(event) {
    event.preventDefault();
    const data = { case_id: currentCaseId, amount: Number(document.getElementById('exp_amount').value), description: document.getElementById('exp_desc').value, expense_date: document.getElementById('exp_date').value };
    if(await API.addExpense(data)) { closeModal('expenseModal'); document.getElementById('expenseForm').reset(); showAlert('تم تسجيل المصروف', 'success'); await loadCaseFullDetails(); }
}

async function saveFile(event) {
    event.preventDefault();
    const fileInput = document.getElementById('file_input');
    const titleInput = document.getElementById('file_title_input').value;
    const catInput = document.getElementById('file_category_input').value;
    const btn = document.getElementById('btn_upload');
    if (!fileInput.files.length) return;
    const file = fileInput.files[0];
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> جاري الأرشفة...';
    try {
        const driveRes = await API.uploadToDrive(file, caseObj.case_internal_id);
        if(driveRes && driveRes.url) {
            if(await API.addFileRecord({ case_id: currentCaseId, file_name: titleInput || file.name, file_type: file.type, file_category: catInput, drive_file_id: driveRes.url, is_template: false })) {
                closeModal('fileModal'); document.getElementById('fileForm').reset(); showAlert('تم الحفظ', 'success'); await loadCaseFullDetails();
            }
        }
    } catch (err) { showAlert("فشل: " + err.message, 'danger'); } finally { btn.disabled = false; btn.innerHTML = '<i class="fas fa-cloud-upload-alt me-1"></i> بدء الرفع'; }
}

function copyDeepLink() {
    if(!caseObj.public_token) { showAlert('لا يوجد رمز وصول آمن.', 'danger'); return; }
    const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
    const deepLink = `${baseUrl}client.html?token=${caseObj.public_token}`;
    const pin = caseObj.access_pin || 'غير محدد';
    const shareText = `مرحباً، يمكنك متابعة قضيتك عبر الرابط:\n${deepLink}\n\nرمز الدخول PIN الخاص بك هو: ${pin}`;
    if (navigator.share) navigator.share({ title: 'رابط القضية', text: shareText }).catch(err => console.log(err));
    else window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank');
}

function goToClientProfile() { if (caseObj && caseObj.client_id) { localStorage.setItem('current_client_id', caseObj.client_id); window.location.href = 'client-details.html'; } }
function openModal(id) { 
    const el = document.getElementById(id);
    if(el) { const m = new bootstrap.Modal(el); m.show(); }
}
function closeModal(id) { 
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
function showAlert(message, type = 'info') {
    const box = document.getElementById('alertBox'); if(!box) return;
    const alertId = 'alert-' + Date.now();
    let typeClass = type === 'success' ? 'alert-success-custom' : 'alert-danger-custom';
    box.insertAdjacentHTML('beforeend', `<div id="${alertId}" class="alert-custom ${typeClass}"><span>${message}</span></div>`);
    setTimeout(() => { const el = document.getElementById(alertId); if(el) { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); } }, 3000);
}