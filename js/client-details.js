// js/client-details.js - محرك الملف الشخصي للموكل (تحديث 2026: KYC، استخراج الهوية الذكي، حماية الحذف، السرية العالية)

let currentClientId = localStorage.getItem('current_client_id');
let clientObj = null;
let clientCases = [];
let clientInstallments = [];
let clientExpenses = [];
let currentUser = null;

const escapeHTML = (str) => {
    if (str === null || str === undefined) return '';
    return str.toString().replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
};

window.onload = async () => {
    const userStr = localStorage.getItem(CONFIG.USER_KEY || 'moakkil_user');
    if (userStr) currentUser = JSON.parse(userStr);

    if (!currentClientId) { window.location.href = 'app.html'; return; }
    await loadClientProfile();
};

function goBack() { window.location.href = 'app.html'; }

async function loadClientProfile() {
    try {
        const [clientsReq, casesReq, filesReq, staffReq] = await Promise.all([
            API.getClients(),
            API.getCases(), 
            API.getFiles(),
            API.getStaff()
        ]);

        window.firmStaff = Array.isArray(staffReq) ? staffReq : [];
        const clients = Array.isArray(clientsReq) ? clientsReq : [];
        clientObj = clients.find(c => c.id == currentClientId);
        
        if (!clientObj) { 
            Swal.fire({icon: 'error', title: 'غير مصرح', text: 'هذا الموكل غير موجود أو لا تملك صلاحية الوصول إليه (سري).', confirmButtonText: 'عودة'}).then(() => window.location.href = 'app.html');
            return; 
        }

        const allCases = Array.isArray(casesReq) ? casesReq : [];
        clientCases = allCases.filter(c => c.client_id == currentClientId);
        
        const allFiles = Array.isArray(filesReq) ? filesReq : [];
        const files = allFiles.filter(f => f.client_id == currentClientId);

        renderClientHeader();
        renderClientCases(clientCases);
        renderClientFiles(files);

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
        showAlert('حدث خطأ أثناء جلب بيانات الموكل. تأكد من اتصالك بالإنترنت.', 'error');
    }
}

function renderClientHeader() {
    document.getElementById('cd-name').innerText = escapeHTML(clientObj.full_name || 'بدون اسم');
    
    // إضافة شارة السرية
    if (clientObj.confidentiality_level === 'سري') {
        document.getElementById('cd-name').innerHTML += ' <span class="badge bg-dark ms-2 fs-6 shadow-sm"><i class="fas fa-lock text-warning"></i> سري جداً</span>';
    }

    document.getElementById('cd-type').innerText = escapeHTML(clientObj.client_type || 'فرد');
    document.getElementById('cd-phone').innerText = escapeHTML(clientObj.phone || '--');
    document.getElementById('cd-national').innerText = escapeHTML(clientObj.national_id || '--');
    if (document.getElementById('cd-address')) document.getElementById('cd-address').innerText = escapeHTML(clientObj.address || '--');
    
    // الحقول الجديدة لبيانات الهوية (KYC)
    if(document.getElementById('cd-nationality')) document.getElementById('cd-nationality').innerText = escapeHTML(clientObj.nationality || '--');
    if(document.getElementById('cd-dob')) document.getElementById('cd-dob').innerText = escapeHTML(clientObj.date_of_birth || '--');
    if(document.getElementById('cd-pob')) document.getElementById('cd-pob').innerText = escapeHTML(clientObj.place_of_birth || '--');
    if(document.getElementById('cd-mother')) document.getElementById('cd-mother').innerText = escapeHTML(clientObj.mother_name || '--');
    if(document.getElementById('cd-profession')) document.getElementById('cd-profession').innerText = escapeHTML(clientObj.profession || '--');
    if(document.getElementById('cd-marital')) document.getElementById('cd-marital').innerText = escapeHTML(clientObj.marital_status || '--');
}

function sendWhatsApp() {
    if (!clientObj.phone) { showAlert('عذراً، لا يوجد رقم هاتف مسجل لهذا الموكل.', 'warning'); return; }
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

        let litigationText = escapeHTML(c.litigation_degree || 'غير محدد');

        let lawyersHtml = '';
        if (c.assigned_lawyer_id && Array.isArray(c.assigned_lawyer_id) && window.firmStaff) {
            lawyersHtml = c.assigned_lawyer_id.map(id => {
                const staff = window.firmStaff.find(s => s.id === id);
                return staff ? `<span class="badge bg-light text-primary border me-1"><i class="fas fa-user-tie"></i> ${escapeHTML(staff.full_name)}</span>` : '';
            }).join('');
        }

        const prob = c.success_probability || 0;
        let probColor = prob < 40 ? 'bg-danger' : prob < 75 ? 'bg-warning' : 'bg-success';
        const probBarHtml = `
            <div class="progress mt-2 shadow-sm" style="height: 4px; background-color: #e9ecef;">
                <div class="progress-bar ${probColor}" role="progressbar" style="width: ${prob}%" title="نسبة النجاح المتوقعة: ${prob}%"></div>
            </div>
        `;

        return `
        <div class="card-custom p-3 mb-3 shadow-sm border-start border-4 border-navy bg-white position-relative" onclick="goToCase('${c.id}')" style="cursor:pointer">
            <div class="d-flex justify-content-between align-items-center mb-1">
                <b class="text-navy fs-6">${escapeHTML(c.case_internal_id || 'بدون رقم')} ${deadlineWarning}</b>
                <span class="badge ${c.status === 'نشطة' ? 'bg-success' : 'bg-secondary'} shadow-sm">${escapeHTML(c.status)}</span>
            </div>
            <div class="d-flex justify-content-between align-items-center mt-2 mb-1">
                <small class="text-muted"><i class="fas fa-balance-scale me-1 text-secondary"></i> ${escapeHTML(c.current_court || 'محكمة غير محددة')} <span class="badge bg-light text-dark border ms-1">${litigationText}</span></small>
                <small class="text-danger fw-bold"><i class="fas fa-user-shield me-1"></i> ${escapeHTML(c.opponent_name || '--')}</small>
            </div>
            <div class="mt-1">
                ${lawyersHtml}
            </div>
            ${probBarHtml}
        </div>
    `}).join('');
}

function renderClientFiles(files) {
    const list = document.getElementById('client-files-list');
    if (files.length === 0) {
        list.innerHTML = '<div class="col-12 text-center p-4 text-muted border rounded-3 bg-white shadow-sm">لا توجد مستندات شخصية مرفوعة.</div>';
        return;
    }

    const canDelete = (currentUser && (currentUser.role === 'admin' || currentUser.role === 'lawyer'));

    list.innerHTML = files.map(f => {
        let icon = 'fa-file-alt text-secondary';
        if(f.file_type && f.file_type.includes('image')) icon = 'fa-image text-primary';
        if(f.file_type && f.file_type.includes('pdf')) icon = 'fa-file-pdf text-danger';

        const expiryBadge = f.expiry_date ? `<small class="d-block mt-1 text-danger fw-bold" style="font-size: 0.65rem;"><i class="fas fa-clock"></i> ينتهي: ${escapeHTML(f.expiry_date)}</small>` : '';
        const delBtn = canDelete ? `<button class="btn btn-sm btn-light text-danger shadow-sm position-absolute top-0 start-0 m-1 rounded-circle" onclick="deleteRecord('file', '${f.id}')" title="حذف المستند"><i class="fas fa-trash"></i></button>` : '';

        return `
        <div class="col-6">
            <div class="card-custom p-3 text-center border shadow-sm h-100 bg-white position-relative">
                ${delBtn}
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
    const confirmResult = await Swal.fire({ title: 'هل أنت متأكد؟', text: "لن تتمكن من التراجع عن الحذف!", icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'نعم، احذف', cancelButtonText: 'إلغاء' });
    if (!confirmResult.isConfirmed) return;
    try {
        if (type === 'file') await API.deleteFile(id);
        showAlert('تم الحذف بنجاح', 'success');
        await loadClientProfile();
    } catch(e) { showAlert('حدث خطأ أثناء الحذف', 'error'); }
}

async function deleteClientProfile() {
    // نظام الحماية الذكي: منع حذف موكل لديه قضايا (Frontend check - already protected in Backend)
    if (clientCases && clientCases.length > 0) {
        Swal.fire({
            icon: 'error',
            title: 'إجراء مرفوض',
            text: 'لا يمكن حذف الموكل لوجود قضايا (نشطة أو مغلقة) مرتبطة به في النظام. يرجى حذف القضايا أولاً للحفاظ على الأرشيف والسلامة المالية للمكتب.',
            confirmButtonText: 'حسناً فهمت'
        });
        return;
    }

    const confirmResult = await Swal.fire({
        title: 'هل أنت متأكد من حذف الموكل؟',
        text: "سيتم حذف ملف الموكل وكافة بياناته الشخصية نهائياً ولن تتمكن من استرجاعها!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: '<i class="fas fa-trash"></i> نعم، احذف نهائياً',
        cancelButtonText: 'إلغاء'
    });

    if (!confirmResult.isConfirmed) return;

    try {
        const res = await API.deleteClient(currentClientId);
        if(!res.error) {
            Swal.fire({ icon: 'success', title: 'تم الحذف', text: 'تم حذف الموكل بنجاح', timer: 2000, showConfirmButton: false }).then(() => {
                window.location.href = 'app.html';
            });
        } else {
            showAlert(res.error, 'error');
        }
    } catch(e) { showAlert('حدث خطأ أثناء الاتصال بالخادم للحذف', 'error'); }
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
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> جاري الأرشفة...';

    try {
        const driveRes = await API.uploadToDrive(file, `Client_${clientObj.full_name}`);
        if(driveRes && driveRes.url) {
            if(await API.addFileRecord({ client_id: currentClientId, file_name: titleInput || file.name, file_type: file.type, file_category: catInput, drive_file_id: driveRes.url, is_template: false, expiry_date: expiryInput || null })) {
                closeModal('uploadModal'); document.getElementById('uploadForm').reset(); showAlert('تم الحفظ بنجاح', 'success'); await loadClientProfile(); 
            }
        }
    } catch (err) { showAlert("فشل الرفع: " + err.message, 'error'); } 
    finally { btn.disabled = false; btn.innerHTML = '<i class="fas fa-upload me-1"></i> بدء الرفع السحابي'; }
}

function generateStatement() {
    if (clientCases.length === 0) { showAlert('لا يوجد قضايا مالية لاستخراج كشف حساب.', 'warning'); return; }

    const printBtn = document.getElementById('print-btn');
    if(printBtn) { printBtn.disabled = true; printBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التحضير...'; }

    const firmSettings = JSON.parse(localStorage.getItem('firm_settings')) || {};
    document.getElementById('print-firm-name').innerText = escapeHTML(firmSettings.firm_name || 'مكتب المحاماة');
    document.getElementById('print-client-name').innerText = escapeHTML(clientObj.full_name);
    document.getElementById('print-client-phone').innerText = escapeHTML(clientObj.phone || '--');
    document.getElementById('print-client-id').innerText = escapeHTML(clientObj.national_id || '--');
    document.getElementById('print-date').innerText = new Date().toLocaleDateString('ar-EG');

    const tbody = document.getElementById('statement-table-body');
    tbody.innerHTML = '';
    let grandAgreed = 0, grandExpenses = 0, grandPaid = 0, grandRem = 0;

    clientCases.forEach(c => {
        const caseAgreed = Number(c.total_agreed_fees) || 0;
        const caseExps = clientExpenses.filter(e => e.case_id === c.id);
        const caseTotalExp = caseExps.reduce((sum, e) => sum + Number(e.amount), 0);
        
        const caseInsts = clientInstallments.filter(i => i.case_id === c.id && i.status === 'مدفوعة');
        const caseTotalPaid = caseInsts.reduce((sum, i) => sum + Number(i.amount), 0);
        
        const caseRem = (caseAgreed + caseTotalExp) - caseTotalPaid;

        grandAgreed += caseAgreed; grandExpenses += caseTotalExp; grandPaid += caseTotalPaid; grandRem += caseRem;

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
    
    setTimeout(() => { 
        document.getElementById('print-section').style.display = 'none'; 
        if(printBtn) { printBtn.disabled = false; printBtn.innerHTML = '<i class="fas fa-print"></i> طباعة الكشف'; }
    }, 1000);
}

function openEditClientModal() {
    if (!clientObj) return;
    
    document.getElementById('edit_client_full_name').value = clientObj.full_name || '';
    document.getElementById('edit_client_phone').value = clientObj.phone || '';
    document.getElementById('edit_client_national_id').value = clientObj.national_id || '';
    document.getElementById('edit_client_type').value = clientObj.client_type || 'فرد';
    if (document.getElementById('edit_client_address')) document.getElementById('edit_client_address').value = clientObj.address || '';
    
    // الحقول الجديدة الخاصة بالهوية (KYC)
    document.getElementById('edit_client_mother').value = clientObj.mother_name || '';
    document.getElementById('edit_client_dob').value = clientObj.date_of_birth || '';
    document.getElementById('edit_client_pob').value = clientObj.place_of_birth || '';
    document.getElementById('edit_client_nationality').value = clientObj.nationality || 'أردني';
    document.getElementById('edit_client_marital').value = clientObj.marital_status || '';
    document.getElementById('edit_client_profession').value = clientObj.profession || '';
    document.getElementById('edit_client_confidentiality').value = clientObj.confidentiality_level || 'عادي';

    openModal('editClientModal');
}

async function updateClientDetails(event) {
    event.preventDefault();
    const data = {
        full_name: document.getElementById('edit_client_full_name').value,
        phone: document.getElementById('edit_client_phone').value,
        national_id: document.getElementById('edit_client_national_id').value,
        client_type: document.getElementById('edit_client_type').value,
        address: document.getElementById('edit_client_address') ? document.getElementById('edit_client_address').value : '',
        
        mother_name: document.getElementById('edit_client_mother').value || null,
        date_of_birth: document.getElementById('edit_client_dob').value || null,
        place_of_birth: document.getElementById('edit_client_pob').value || null,
        nationality: document.getElementById('edit_client_nationality').value || null,
        marital_status: document.getElementById('edit_client_marital').value || null,
        profession: document.getElementById('edit_client_profession').value || null,
        confidentiality_level: document.getElementById('edit_client_confidentiality').value || 'عادي'
    };
    if(await API.updateClient(currentClientId, data)) { closeModal('editClientModal'); showAlert('تم تحديث بيانات الموكل', 'success'); await loadClientProfile(); }
}

// ----------------- الذكاء الاصطناعي (AI ID Scanner) -----------------
function openAiIdModal() {
    document.getElementById('ai_id_text').value = '';
    openModal('aiIdModal');
}

async function processIdAI() {
    const text = document.getElementById('ai_id_text').value.trim();
    if (!text) { Swal.fire('تنبيه', 'يرجى لصق نص الهوية أولاً', 'warning'); return; }

    const btn = document.getElementById('btn_process_id');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> جاري التحليل الذكي...';

    try {
        const aiRes = await API.extractDataAI(text, 'id_extractor');
        if (aiRes && aiRes.extracted_json) {
            const data = aiRes.extracted_json;
            
            // تعبئة الحقول إذا وجدت البيانات
            if (data.full_name) document.getElementById('edit_client_full_name').value = data.full_name;
            if (data.national_id) document.getElementById('edit_client_national_id').value = data.national_id;
            if (data.date_of_birth) document.getElementById('edit_client_dob').value = data.date_of_birth;
            if (data.address) document.getElementById('edit_client_address').value = data.address;
            if (data.mother_name) document.getElementById('edit_client_mother').value = data.mother_name;
            if (data.place_of_birth) document.getElementById('edit_client_pob').value = data.place_of_birth;
            if (data.nationality) document.getElementById('edit_client_nationality').value = data.nationality;
            if (data.marital_status) document.getElementById('edit_client_marital').value = data.marital_status;
            if (data.profession) document.getElementById('edit_client_profession').value = data.profession;
            
            Swal.fire({toast: true, position: 'top-end', icon: 'success', title: 'تم التعبئة التلقائية', showConfirmButton: false, timer: 2000});
            closeModal('aiIdModal');
        } else {
            Swal.fire('خطأ', 'لم يتمكن الذكاء الاصطناعي من فهم النص، تأكد من وضوح النص المنسوخ.', 'error');
        }
    } catch (err) {
        Swal.fire('خطأ', 'فشل الاتصال بالمحرك الذكي. راجع اتصالك بالإنترنت.', 'error');
    } finally {
        btn.disabled = false; btn.innerHTML = '<i class="fas fa-magic me-1"></i> تحليل وملء الحقول';
    }
}

function goToCase(id) { localStorage.setItem('current_case_id', id); window.location.href = 'case-details.html'; }
function openModal(id) { const el = document.getElementById(id); if(el) { const m = new bootstrap.Modal(el); m.show(); } }
function closeModal(id) { const el = document.getElementById(id); if(el) { const m = bootstrap.Modal.getInstance(el); if(m) m.hide(); document.querySelectorAll('.modal-backdrop').forEach(b => b.remove()); document.body.classList.remove('modal-open'); document.body.style.overflow = ''; document.body.style.paddingRight = ''; } }
function showAlert(message, type = 'info') { if (typeof Swal !== 'undefined') Swal.fire({ toast: true, position: 'top-end', icon: type === 'danger' ? 'error' : (type === 'info' ? 'info' : type), title: escapeHTML(message), showConfirmButton: false, timer: 3000, timerProgressBar: true }); else alert(message); }