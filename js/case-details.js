// js/case-details.js - محرك التفاصيل والأرشفة المطور (يدعم المصروفات، المعاينة، والتعديل الشامل)

let currentCaseId = localStorage.getItem('current_case_id');
let caseObj = null;

window.onload = async () => {
    if (!currentCaseId) {
        window.location.href = 'app.html';
        return;
    }
    await loadCaseFullDetails();
};

function goBack() { window.location.href = 'app.html'; }

async function loadCaseFullDetails() {
    try {
        const [allCases, updates, installments, expenses, files] = await Promise.all([
            API.getCases(),
            fetchAPI(`/api/updates?case_id=eq.${currentCaseId}&order=created_at.desc`),
            fetchAPI(`/api/installments?case_id=eq.${currentCaseId}&order=created_at.desc`),
            fetchAPI(`/api/expenses?case_id=eq.${currentCaseId}&order=created_at.desc`), // مسار المصروفات الجديد
            fetchAPI(`/api/files?case_id=eq.${currentCaseId}&order=created_at.desc`)
        ]);

        caseObj = (allCases || []).find(c => c.id == currentCaseId);
        
        if (!caseObj) {
            window.location.href = 'app.html';
            return;
        }

        renderHeaderAndSummary();
        renderTimeline(updates || []);
        renderPayments(installments || []);
        renderExpenses(expenses || []);
        renderFiles(files || []);
        calculateFinances(installments || [], expenses || []);
        
    } catch (error) {
        showAlert('حدث خطأ أثناء جلب تفاصيل القضية', 'danger');
    }
}

function renderHeaderAndSummary() {
    document.getElementById('case-title').innerText = `${caseObj.case_internal_id || 'ملف قضية'}`;
    document.getElementById('case-client-name').innerHTML = `<i class="fas fa-user-tie me-2 text-info"></i> ${caseObj.mo_clients?.full_name || "موكل غير محدد"}`;
    
    document.getElementById('det-court').innerText = caseObj.current_court || "--";
    document.getElementById('det-court-num').innerText = caseObj.court_case_number || "--";
    document.getElementById('det-judge').innerText = caseObj.current_judge || "--";
    document.getElementById('det-degree').innerText = caseObj.litigation_degree || "--";
    document.getElementById('det-year').innerText = caseObj.case_year || "--";
    document.getElementById('det-type').innerText = caseObj.case_type || "--";
    document.getElementById('det-opponent').innerText = caseObj.opponent_name || "--";
    
    document.getElementById('det-claim').innerText = caseObj.claim_amount ? `${Number(caseObj.claim_amount).toLocaleString()} د.أ` : "--";
    document.getElementById('case-pin').innerHTML = `<i class="fas fa-key text-warning"></i> PIN: ${caseObj.access_pin || 'غير محدد'}`;
    
    const statusEl = document.getElementById('case-status');
    statusEl.innerText = caseObj.status || "نشطة";
    statusEl.className = `badge fs-6 ${caseObj.status === 'نشطة' ? 'bg-success' : 'bg-danger'}`;
}

function renderTimeline(updates) {
    const container = document.getElementById('timeline-container');
    if (!updates || updates.length === 0) {
        container.innerHTML = '<div class="text-center p-4 text-muted small">لا يوجد وقائع مسجلة.</div>';
        return;
    }
    container.innerHTML = updates.map(u => `
        <div class="timeline-item mb-3">
            <div class="card-custom p-3 shadow-sm bg-white border-end border-4 border-navy">
                <small class="text-primary fw-bold">${new Date(u.created_at).toLocaleDateString('ar-EG')}</small>
                <h6 class="fw-bold text-navy mt-1">${u.update_title}</h6>
                <p class="mb-0 small">${u.update_details}</p>
                ${u.hearing_date ? `<small class="d-block mt-2 text-muted"><i class="fas fa-calendar-check text-success"></i> تاريخ الجلسة: ${u.hearing_date}</small>` : ''}
            </div>
        </div>
    `).join('');
}

function renderPayments(installments) {
    const container = document.getElementById('payments-container');
    if (!installments || installments.length === 0) {
        container.innerHTML = '<div class="text-center p-3 text-muted small border rounded bg-white">لا توجد دفعات أتعاب مسجلة.</div>';
        return;
    }
    container.innerHTML = installments.map(i => `
        <div class="card-custom p-3 mb-2 d-flex justify-content-between align-items-center border-start border-4 ${i.status === 'مدفوعة' ? 'border-success' : 'border-warning'}">
            <div>
                <b class="fs-5 text-success">${Number(i.amount).toLocaleString()} د.أ</b>
                <small class="d-block text-muted">تاريخ: ${i.due_date || new Date(i.created_at).toLocaleDateString()}</small>
            </div>
            <span class="badge ${i.status === 'مدفوعة' ? 'bg-success' : 'bg-warning text-dark'}">${i.status}</span>
        </div>
    `).join('');
}

function renderExpenses(expenses) {
    const container = document.getElementById('expenses-container');
    if (!expenses || expenses.length === 0) {
        container.innerHTML = '<div class="text-center p-3 text-muted small border rounded bg-white">لا توجد مصروفات مسجلة.</div>';
        return;
    }
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
    if (!files || files.length === 0) {
        container.innerHTML = '<div class="col-12 text-center p-4 text-muted small border rounded bg-white">الأرشيف فارغ.</div>';
        return;
    }
    
    container.innerHTML = files.map(f => {
        const isImage = f.file_type && f.file_type.includes('image');
        let iconHtml = '';
        
        if(isImage && f.drive_file_id) {
            // استخراج معرف الصورة من رابط درايف لتشغيلها كمعاينة (يحتاج أن يكون الرابط قابلاً للعرض)
            iconHtml = `<i class="fas fa-image fs-1 text-primary mb-2"></i>`;
        } else {
            iconHtml = `<i class="fas fa-file-pdf fs-1 text-danger mb-2"></i>`;
        }

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
    
    // تلوين الصافي بناءً على القيمة
    document.getElementById('sum-net').className = netProfit >= 0 ? 'text-primary' : 'text-danger';
}

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
        total_agreed_fees: document.getElementById('edit_fees').value ? Number(document.getElementById('edit_fees').value) : 0
    };

    const res = await API.updateCase(currentCaseId, data);
    if(res) {
        closeModal('editCaseModal');
        showAlert('تم تحديث بيانات القضية بنجاح', 'success');
        await loadCaseFullDetails();
    }
}

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
    if(res) {
        closeModal('updateModal');
        document.getElementById('updateForm').reset();
        showAlert('تم إضافة الواقعة بنجاح', 'success');
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
    if(res) {
        closeModal('paymentModal');
        document.getElementById('paymentForm').reset();
        showAlert('تم تسجيل الدفعة بنجاح', 'success');
        await loadCaseFullDetails();
    }
}

async function saveExpense(event) {
    event.preventDefault();
    const data = {
        case_id: currentCaseId,
        amount: Number(document.getElementById('exp_amount').value),
        description: document.getElementById('exp_desc').value,
        expense_date: document.getElementById('exp_date').value
    };
    const res = await API.addExpense(data);
    if(res) {
        closeModal('expenseModal');
        document.getElementById('expenseForm').reset();
        showAlert('تم تسجيل المصروف بنجاح', 'success');
        await loadCaseFullDetails();
    }
}

async function saveFile(event) {
    event.preventDefault();
    const fileInput = document.getElementById('file_input');
    const titleInput = document.getElementById('file_title_input').value;
    const catInput = document.getElementById('file_category_input').value;
    const btn = document.getElementById('btn_upload');

    if (!fileInput.files.length) return;
    const file = fileInput.files[0];
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> جاري الأرشفة...';

    try {
        const driveRes = await API.uploadToDrive(file, caseObj.case_internal_id);
        if(driveRes && driveRes.url) {
            const dbRes = await API.addFileRecord({
                case_id: currentCaseId,
                file_name: titleInput || file.name,
                file_type: file.type,
                file_category: catInput,
                drive_file_id: driveRes.url,
                is_template: false
            });
            if(dbRes) {
                closeModal('fileModal');
                document.getElementById('fileForm').reset();
                showAlert('تم حفظ الملف في الأرشيف', 'success');
                await loadCaseFullDetails();
            }
        }
    } catch (err) {
        showAlert("فشل العملية: " + err.message, 'danger');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-cloud-upload-alt me-1"></i> بدء الرفع والأرشفة';
    }
}

function copyDeepLink() {
    if(!caseObj.public_token) {
        showAlert('لا يوجد رمز وصول آمن لهذه القضية بعد.', 'danger');
        return;
    }
    const baseUrl = window.location.origin + window.location.pathname.replace('case-details.html', '');
    const deepLink = `${baseUrl}client.html?token=${caseObj.public_token}`;
    
    navigator.clipboard.writeText(deepLink).then(() => {
        showAlert('تم نسخ الرابط السري للموكل بنجاح!', 'success');
    }).catch(() => {
        prompt("انسخ الرابط التالي وأرسله للموكل:", deepLink);
    });
}

function goToClientProfile() {
    if (caseObj && caseObj.client_id) {
        localStorage.setItem('current_client_id', caseObj.client_id);
        window.location.href = 'client-details.html';
    }
}

function openModal(id) { new bootstrap.Modal(document.getElementById(id)).show(); }
function closeModal(id) {
    const m = bootstrap.Modal.getInstance(document.getElementById(id));
    if (m) m.hide();
    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
}

function showAlert(message, type = 'info') {
    const box = document.getElementById('alertBox');
    if(!box) return;
    const alertId = 'alert-' + Date.now();
    let typeClass = type === 'success' ? 'alert-success-custom' : 'alert-danger-custom';
    box.insertAdjacentHTML('beforeend', `<div id="${alertId}" class="alert-custom ${typeClass}"><i class="fas ${type === 'success' ? 'fa-check-circle text-success' : 'fa-info-circle text-info'}"></i><span>${message}</span></div>`);
    setTimeout(() => { const el = document.getElementById(alertId); if(el) { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); } }, 3000);
}

// دالة مبدئية لتوليد تقرير (يمكن تطويرها لاحقاً لطباعة PDF حقيقي)
function generatePDF() {
    window.print();
}