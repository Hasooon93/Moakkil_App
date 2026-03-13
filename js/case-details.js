// js/case-details.js - محرك التفاصيل والأرشفة المطور

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
    const [allCases, updates, installments, files] = await Promise.all([
        API.getCases(),
        API.getUpdates(currentCaseId),
        API.getInstallments(currentCaseId),
        API.getFiles(currentCaseId)
    ]);

    caseObj = (allCases || []).find(c => c.id == currentCaseId);
    if (!caseObj) {
        window.location.href = 'app.html';
        return;
    }

    renderHeaderAndSummary();
    renderTimeline(updates || []);
    renderPayments(installments || []);
    renderFiles(files || []);
    calculateFinances(installments || []);
}

function renderHeaderAndSummary() {
    document.getElementById('case-title').innerText = `${caseObj.case_internal_id}`;
    document.getElementById('case-client-name').innerHTML = `<i class="fas fa-user-tie me-2 text-info"></i> ${caseObj.mo_clients?.full_name || "اسم الموكل"}`;
    document.getElementById('det-court').innerText = caseObj.current_court || "--";
    document.getElementById('det-judge').innerText = caseObj.current_judge || "--";
    document.getElementById('det-type').innerText = caseObj.case_type || "--";
    document.getElementById('det-opponent').innerText = caseObj.opponent_name || "--";
    document.getElementById('det-claim').innerText = caseObj.claim_amount ? `${caseObj.claim_amount.toLocaleString()} د.أ` : "--";
    document.getElementById('case-pin').innerHTML = `<i class="fas fa-key text-warning"></i> PIN: ${caseObj.access_pin || 'غير محدد'}`;
    
    const statusEl = document.getElementById('case-status');
    statusEl.innerText = caseObj.status || "نشطة";
    statusEl.className = `badge fs-6 ${caseObj.status === 'نشطة' ? 'bg-success' : 'bg-danger'}`;
}

function renderTimeline(updates) {
    const container = document.getElementById('timeline-container');
    if (updates.length === 0) {
        container.innerHTML = '<div class="text-center p-4 text-muted small">لا يوجد وقائع مسجلة.</div>';
        return;
    }
    container.innerHTML = updates.map(u => `
        <div class="timeline-item mb-3">
            <div class="card-custom p-3 shadow-sm bg-white border-end border-4 border-navy">
                <small class="text-primary fw-bold">${new Date(u.created_at).toLocaleDateString('ar-EG')}</small>
                <h6 class="fw-bold text-navy mt-1">${u.update_title}</h6>
                <p class="mb-0 small">${u.update_details}</p>
            </div>
        </div>
    `).join('');
}

function renderPayments(installments) {
    const container = document.getElementById('payments-container');
    if (installments.length === 0) {
        container.innerHTML = '<div class="text-center p-4 text-muted small">لا توجد دفعات.</div>';
        return;
    }
    container.innerHTML = installments.map(i => `
        <div class="card-custom p-3 mb-2 d-flex justify-content-between align-items-center border-start border-4 ${i.status === 'مدفوعة' ? 'border-success' : 'border-warning'}">
            <b class="fs-5">${i.amount} د.أ</b>
            <span class="badge ${i.status === 'مدفوعة' ? 'bg-success' : 'bg-warning text-dark'}">${i.status}</span>
        </div>
    `).join('');
}

function renderFiles(files) {
    const container = document.getElementById('files-container');
    if (!files || files.length === 0) {
        container.innerHTML = '<div class="col-12 text-center p-4 text-muted small">الأرشيف فارغ.</div>';
        return;
    }
    container.innerHTML = files.map(f => `
        <div class="col-6">
            <div class="card-custom p-3 text-center border shadow-sm">
                <i class="fas fa-file-pdf fs-1 text-danger mb-2"></i>
                <h6 class="small fw-bold text-truncate">${f.file_name}</h6>
                <a href="${f.drive_file_id}" target="_blank" class="btn btn-sm btn-outline-primary w-100 fw-bold mt-2">عرض</a>
            </div>
        </div>
    `).join('');
}

function calculateFinances(installments) {
    const totalPaid = installments.filter(i => i.status === 'مدفوعة').reduce((sum, i) => sum + Number(i.amount), 0);
    const agreedFees = Number(caseObj.total_agreed_fees) || 0;
    document.getElementById('sum-agreed').innerText = agreedFees.toLocaleString();
    document.getElementById('sum-paid').innerText = totalPaid.toLocaleString();
    document.getElementById('sum-rem').innerText = (agreedFees - totalPaid).toLocaleString();
}

// دالة الرفع والحفظ النهائية
async function saveFile(event) {
    event.preventDefault();
    const fileInput = document.getElementById('file_input');
    const titleInput = document.getElementById('file_title_input').value;
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
                drive_file_id: driveRes.url
            });
            
            if(dbRes) {
                closeModal('fileModal');
                document.getElementById('fileForm').reset();
                showAlert('تم حفظ الملف في الأرشيف', 'success');
                await loadCaseFullDetails();
            }
        }
    } catch (err) {
        alert("فشل العملية: " + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'بدء الرفع والأرشفة';
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
    box.insertAdjacentHTML('beforeend', `<div id="${alertId}" class="alert-custom ${type === 'success' ? 'alert-success-custom' : 'alert-danger-custom'}"><span>${message}</span></div>`);
    setTimeout(() => { document.getElementById(alertId)?.remove(); }, 3000);
}