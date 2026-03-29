// js/client-details.js - محرك الملف الشخصي للموكل (يشمل كشف الحساب الموحد ومراسلة الواتساب، محمي ضد XSS ويدعم التعديل)

let currentClientId = localStorage.getItem('current_client_id');
let clientObj = null;
let clientCases = [];
let clientInstallments = [];
let clientExpenses = [];

// دالة الحماية من ثغرات الحقن (XSS Sanitizer)
const escapeHTML = (str) => {
    if (str === null || str === undefined) return '';
    return str.toString().replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
};

window.onload = async () => {
    if (!currentClientId) {
        window.location.href = 'app.html';
        return;
    }
    await loadClientProfile();
};

function goBack() { 
    window.location.href = 'app.html'; 
}

async function loadClientProfile() {
    try {
        const [clientsReq, casesReq, filesReq] = await Promise.all([
            API.getClients(),
            API.getCases(), // جلب القضايا من المحرك لضمان تطبيق الصلاحيات
            API.getFiles()
        ]);

        const clients = Array.isArray(clientsReq) ? clientsReq : [];
        clientObj = clients.find(c => c.id == currentClientId);
        
        if (!clientObj) {
            window.location.href = 'app.html';
            return;
        }

        // تصفية القضايا والملفات لتطابق الموكل الحالي فقط
        const allCases = Array.isArray(casesReq) ? casesReq : [];
        clientCases = allCases.filter(c => c.client_id == currentClientId);
        
        const allFiles = Array.isArray(filesReq) ? filesReq : [];
        const files = allFiles.filter(f => f.client_id == currentClientId);

        renderClientHeader();
        renderClientCases(clientCases);
        renderClientFiles(files);

        // جلب جميع الدفعات والمصاريف الخاصة بقضايا هذا الموكل لغايات كشف الحساب الموحد
        if (clientCases.length > 0) {
            const caseIds = clientCases.map(c => c.id);
            const caseIdsQuery = caseIds.map(id => `"${id}"`).join(',');
            
            const [instReq, expReq] = await Promise.all([
                fetchAPI(`/api/installments?case_id=in.(${caseIdsQuery})`),
                fetchAPI(`/api/expenses?case_id=in.(${caseIdsQuery})`)
            ]);
            
            clientInstallments = Array.isArray(instReq) ? instReq : [];
            clientExpenses = Array.isArray(expReq) ? expReq : [];
        } else {
            clientInstallments = [];
            clientExpenses = [];
        }

    } catch (error) {
        showAlert('حدث خطأ أثناء جلب بيانات الموكل. تأكد من اتصالك بالإنترنت.', 'danger');
    }
}

function renderClientHeader() {
    document.getElementById('cd-name').innerText = escapeHTML(clientObj.full_name || 'بدون اسم');
    document.getElementById('cd-type').innerText = escapeHTML(clientObj.client_type || 'فرد');
    document.getElementById('cd-phone').innerText = escapeHTML(clientObj.phone || '--');
    document.getElementById('cd-national').innerText = escapeHTML(clientObj.national_id || '--');
    
    const addressEl = document.getElementById('cd-address');
    if (addressEl) {
        addressEl.innerText = escapeHTML(clientObj.address || '--');
    }
}

function sendWhatsApp() {
    if (!clientObj.phone) {
        showAlert('عذراً، لا يوجد رقم هاتف مسجل لهذا الموكل.', 'warning');
        return;
    }
    let phoneStr = String(clientObj.phone);
    if (phoneStr.startsWith('0')) phoneStr = '962' + phoneStr.substring(1);
    
    const text = `تحية طيبة السيد/ة ${clientObj.full_name}،\nمعكم إدارة مكتب المحاماة للاطمئنان ومتابعة ملفاتكم لدينا.\nنتمنى لكم يوماً سعيداً.`;
    window.open(`https://wa.me/${phoneStr}?text=${encodeURIComponent(text)}`, '_blank');
}

function renderClientCases(cases) {
    const list = document.getElementById('client-cases-list');
    if (cases.length === 0) {
        list.innerHTML = '<div class="text-center p-4 text-muted border rounded-3 bg-white shadow-sm">لا توجد قضايا مسجلة لهذا الموكل.</div>';
        return;
    }

    list.innerHTML = cases.map(c => {
        let deadlineWarning = '';
        if(c.deadline_date) {
            const daysLeft = Math.ceil((new Date(c.deadline_date) - new Date()) / (1000 * 60 * 60 * 24));
            if(daysLeft <= 7 && daysLeft >= 0) deadlineWarning = `<span class="badge bg-danger ms-2"><i class="fas fa-clock"></i> ${daysLeft} أيام</span>`;
        }

        return `
        <div class="card-custom p-3 mb-2 shadow-sm border-start border-4 border-navy bg-white" onclick="goToCase('${c.id}')" style="cursor:pointer">
            <div class="d-flex justify-content-between align-items-center mb-1">
                <b class="text-navy fs-6">${escapeHTML(c.case_internal_id || 'بدون رقم')} ${deadlineWarning}</b>
                <span class="badge ${c.status === 'نشطة' ? 'bg-success' : 'bg-secondary'}">${escapeHTML(c.status)}</span>
            </div>
            <div class="d-flex justify-content-between align-items-center mt-2">
                <small class="text-muted"><i class="fas fa-balance-scale me-1"></i> ${escapeHTML(c.current_court || 'محكمة غير محددة')}</small>
                <small class="text-danger fw-bold"><i class="fas fa-user-shield me-1"></i> الخصم: ${escapeHTML(c.opponent_name || '--')}</small>
            </div>
        </div>
    `}).join('');
}

function renderClientFiles(files) {
    const list = document.getElementById('client-files-list');
    if (files.length === 0) {
        list.innerHTML = '<div class="col-12 text-center p-4 text-muted border rounded-3 bg-white shadow-sm">لا توجد مستندات شخصية مرفوعة.</div>';
        return;
    }

    list.innerHTML = files.map(f => {
        let icon = 'fa-file-alt text-secondary';
        if(f.file_type && f.file_type.includes('image')) icon = 'fa-image text-primary';
        if(f.file_type && f.file_type.includes('pdf')) icon = 'fa-file-pdf text-danger';

        const expiryBadge = f.expiry_date ? `<small class="d-block mt-1 text-danger fw-bold" style="font-size: 0.65rem;"><i class="fas fa-clock"></i> ينتهي: ${escapeHTML(f.expiry_date)}</small>` : '';

        return `
        <div class="col-6">
            <div class="card-custom p-3 text-center border shadow-sm h-100 bg-white position-relative">
                <button class="btn btn-sm text-danger position-absolute top-0 start-0 m-1" onclick="deleteRecord('file', '${f.id}')"><i class="fas fa-trash"></i></button>
                <span class="badge bg-light text-dark border mb-2 d-block text-truncate">${escapeHTML(f.file_category || 'مستند')}</span>
                <i class="fas ${icon} fs-1 mb-2"></i>
                <h6 class="small fw-bold text-truncate mt-1 mb-0" title="${escapeHTML(f.file_name)}">${escapeHTML(f.file_name)}</h6>
                ${expiryBadge}
                <a href="${escapeHTML(f.drive_file_id)}" target="_blank" class="btn btn-sm btn-outline-primary w-100 fw-bold mt-2"><i class="fas fa-eye"></i> عرض</a>
            </div>
        </div>
    `}).join('');
}

async function deleteRecord(type, id) {
    if(!confirm('هل أنت متأكد من الحذف؟ لا يمكن التراجع عن هذا الإجراء.')) return;
    try {
        if (type === 'file') {
            await fetchAPI(`/api/files?id=eq.${id}`, 'DELETE');
        }
        showAlert('تم الحذف بنجاح', 'success');
        await loadClientProfile();
    } catch(e) {
        showAlert('حدث خطأ أثناء الحذف', 'danger');
    }
}

async function uploadPersonalFile(event) {
    event.preventDefault();
    const fileInput = document.getElementById('file_input');
    const titleInput = document.getElementById('file_title').value;
    const catInput = document.getElementById('file_cat').value;
    const expiryInput = document.getElementById('file_expiry').value;
    const btn = document.getElementById('btn_upload');

    if (!fileInput.files.length) return;
    
    const file = fileInput.files[0];
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> جاري الأرشفة...';

    try {
        const driveRes = await API.uploadToDrive(file, `Client_${clientObj.full_name}`);
        
        if(driveRes && driveRes.url) {
            const dbRes = await API.addFileRecord({
                client_id: currentClientId,
                file_name: titleInput || file.name,
                file_type: file.type,
                file_category: catInput,
                drive_file_id: driveRes.url,
                is_template: false,
                expiry_date: expiryInput || null
            });
            
            if(dbRes) {
                closeModal('uploadModal');
                document.getElementById('uploadForm').reset();
                showAlert('تم حفظ المستند في ملف الموكل بنجاح', 'success');
                await loadClientProfile(); 
            }
        }
    } catch (err) {
        showAlert("فشل الرفع: " + err.message, 'danger');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-upload me-1"></i> بدء الرفع السحابي';
    }
}

function generateStatement() {
    if (clientCases.length === 0) {
        showAlert('لا يوجد قضايا مالية لاستخراج كشف حساب.', 'warning');
        return;
    }

    const firmSettings = JSON.parse(localStorage.getItem('firm_settings')) || {};
    document.getElementById('print-firm-name').innerText = escapeHTML(firmSettings.firm_name || 'مكتب المحاماة');
    
    document.getElementById('print-client-name').innerText = escapeHTML(clientObj.full_name);
    document.getElementById('print-client-phone').innerText = escapeHTML(clientObj.phone || '--');
    document.getElementById('print-client-id').innerText = escapeHTML(clientObj.national_id || '--');
    document.getElementById('print-date').innerText = new Date().toLocaleDateString('ar-EG');

    const tbody = document.getElementById('statement-table-body');
    tbody.innerHTML = '';

    let grandAgreed = 0;
    let grandExpenses = 0;
    let grandPaid = 0;
    let grandRem = 0;

    clientCases.forEach(c => {
        const caseAgreed = Number(c.total_agreed_fees) || 0;
        
        // حساب المصاريف لهذه القضية فقط
        const caseExps = clientExpenses.filter(e => e.case_id === c.id);
        const caseTotalExp = caseExps.reduce((sum, e) => sum + Number(e.amount), 0);
        
        // حساب المدفوعات المسددة لهذه القضية فقط
        const caseInsts = clientInstallments.filter(i => i.case_id === c.id && i.status === 'مدفوعة');
        const caseTotalPaid = caseInsts.reduce((sum, i) => sum + Number(i.amount), 0);
        
        // الرصيد المتبقي للقضية = الأتعاب + المصاريف - المسدد
        const caseRem = (caseAgreed + caseTotalExp) - caseTotalPaid;

        grandAgreed += caseAgreed;
        grandExpenses += caseTotalExp;
        grandPaid += caseTotalPaid;
        grandRem += caseRem;

        tbody.innerHTML += `
            <tr>
                <td class="text-start fw-bold">${escapeHTML(c.case_internal_id || 'بدون رقم')} <br><small class="text-muted fw-normal">الخصم: ${escapeHTML(c.opponent_name || '--')}</small></td>
                <td class="text-primary">${caseAgreed.toLocaleString()}</td>
                <td class="text-danger">${caseTotalExp.toLocaleString()}</td>
                <td class="text-success">${caseTotalPaid.toLocaleString()}</td>
                <td class="fw-bold ${caseRem > 0 ? 'text-danger' : 'text-dark'}">${caseRem.toLocaleString()}</td>
            </tr>
        `;
    });

    document.getElementById('print-total-agreed').innerText = grandAgreed.toLocaleString();
    document.getElementById('print-total-expenses').innerText = grandExpenses.toLocaleString();
    document.getElementById('print-total-paid').innerText = grandPaid.toLocaleString();
    document.getElementById('print-total-rem').innerText = grandRem.toLocaleString() + ' د.أ';

    document.getElementById('print-section').style.display = 'block';
    window.print();
    setTimeout(() => { document.getElementById('print-section').style.display = 'none'; }, 1000);
}

function openEditClientModal() {
    if (!clientObj) return;
    document.getElementById('edit_client_full_name').value = clientObj.full_name || '';
    document.getElementById('edit_client_phone').value = clientObj.phone || '';
    document.getElementById('edit_client_national_id').value = clientObj.national_id || '';
    document.getElementById('edit_client_type').value = clientObj.client_type || 'فرد';
    
    if (document.getElementById('edit_client_address')) {
        document.getElementById('edit_client_address').value = clientObj.address || '';
    }
    
    openModal('editClientModal');
}

async function updateClientDetails(event) {
    event.preventDefault();
    const data = {
        full_name: document.getElementById('edit_client_full_name').value,
        phone: document.getElementById('edit_client_phone').value,
        national_id: document.getElementById('edit_client_national_id').value,
        client_type: document.getElementById('edit_client_type').value,
        address: document.getElementById('edit_client_address') ? document.getElementById('edit_client_address').value : ''
    };
    
    if(await API.updateClient(currentClientId, data)) {
        closeModal('editClientModal');
        showAlert('تم تحديث بيانات الموكل بنجاح', 'success');
        await loadClientProfile();
    }
}

function goToCase(id) {
    localStorage.setItem('current_case_id', id);
    window.location.href = 'case-details.html';
}

function openModal(id) { const el = document.getElementById(id); if(el) { const m = new bootstrap.Modal(el); m.show(); } }
function closeModal(id) { const el = document.getElementById(id); if(el) { const m = bootstrap.Modal.getInstance(el); if(m) m.hide(); document.querySelectorAll('.modal-backdrop').forEach(b => b.remove()); document.body.classList.remove('modal-open'); document.body.style.overflow = ''; document.body.style.paddingRight = ''; } }
function showAlert(message, type = 'info') { const box = document.getElementById('alertBox'); if(!box) return; const alertId = 'alert-' + Date.now(); let typeClass = type === 'success' ? 'alert-success-custom' : 'alert-danger-custom'; if(type === 'warning') typeClass = 'bg-warning text-dark border-warning'; box.insertAdjacentHTML('beforeend', `<div id="${alertId}" class="alert-custom ${typeClass}"><span>${escapeHTML(message)}</span></div>`); setTimeout(() => { const el = document.getElementById(alertId); if(el) { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); } }, 4000); }