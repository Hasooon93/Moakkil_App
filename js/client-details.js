// js/client-details.js - محرك الملف الشخصي للموكل (تحديث لتأمين الربط الذكي للقضايا)

let currentClientId = localStorage.getItem('current_client_id');
let clientObj = null;

window.onload = async () => {
    if (!currentClientId) {
        window.location.href = 'app.html';
        return;
    }
    await loadClientProfile();
};

async function loadClientProfile() {
    try {
        const [clientsReq, casesReq, filesReq] = await Promise.all([
            API.getClients(),
            fetchAPI(`/api/cases?client_id=${currentClientId}`), 
            fetchAPI(`/api/files?client_id=${currentClientId}`) 
        ]);

        const clients = Array.isArray(clientsReq) ? clientsReq : [];
        const cases = Array.isArray(casesReq) ? casesReq : [];
        const files = Array.isArray(filesReq) ? filesReq : [];

        clientObj = clients.find(c => c.id == currentClientId);
        
        if (!clientObj) {
            window.location.href = 'app.html';
            return;
        }

        renderClientHeader();
        renderClientCases(cases);
        renderClientFiles(files);

    } catch (error) {
        showAlert('حدث خطأ أثناء جلب بيانات الموكل', 'danger');
    }
}

function renderClientHeader() {
    document.getElementById('cd-name').innerText = clientObj.full_name || 'بدون اسم';
    document.getElementById('cd-type').innerText = clientObj.client_type || 'فرد';
    document.getElementById('cd-phone').innerText = clientObj.phone || '--';
    document.getElementById('cd-national').innerText = clientObj.national_id || '--';
    document.getElementById('cd-address').innerText = clientObj.address || 'لم يتم تحديد العنوان';
}

function renderClientCases(cases) {
    const list = document.getElementById('client-cases-list');
    if (cases.length === 0) {
        list.innerHTML = '<div class="text-center p-4 text-muted border rounded-3 bg-white">لا توجد قضايا مسجلة لهذا الموكل.</div>';
        return;
    }

    list.innerHTML = cases.map(c => `
        <div class="card-custom p-3 mb-2 shadow-sm border-start border-4 border-navy" onclick="goToCase('${c.id}')" style="cursor:pointer">
            <div class="d-flex justify-content-between">
                <b class="text-navy">${c.case_internal_id || 'بدون رقم'}</b>
                <span class="badge ${c.status === 'نشطة' ? 'bg-success' : 'bg-secondary'}">${c.status}</span>
            </div>
            <small class="text-muted"><i class="fas fa-balance-scale me-1"></i> المحكمة: ${c.current_court || '--'}</small>
        </div>
    `).join('');
}

function renderClientFiles(files) {
    const list = document.getElementById('client-files-list');
    if (files.length === 0) {
        list.innerHTML = '<div class="col-12 text-center p-4 text-muted border rounded-3 bg-white">لا توجد مستندات شخصية مرفوعة.</div>';
        return;
    }

    list.innerHTML = files.map(f => {
        let icon = 'fa-file-alt text-secondary';
        if(f.file_type && f.file_type.includes('image')) icon = 'fa-image text-primary';
        if(f.file_type && f.file_type.includes('pdf')) icon = 'fa-file-pdf text-danger';

        return `
        <div class="col-6">
            <div class="card-custom p-3 text-center border shadow-sm h-100">
                <span class="badge bg-light text-dark border mb-2 d-block text-truncate">${f.file_category || 'مستند'}</span>
                <i class="fas ${icon} fs-1 mb-2"></i>
                <h6 class="small fw-bold text-truncate" title="${f.file_name}">${f.file_name}</h6>
                <a href="${f.drive_file_id}" target="_blank" class="btn btn-sm btn-outline-primary w-100 fw-bold mt-1">عرض</a>
            </div>
        </div>
    `}).join('');
}

async function uploadPersonalFile(event) {
    event.preventDefault();
    const fileInput = document.getElementById('file_input');
    const titleInput = document.getElementById('file_title').value;
    const catInput = document.getElementById('file_cat').value;
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
                is_template: false
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
        btn.innerHTML = 'بدء الرفع';
    }
}

function goToCase(id) {
    localStorage.setItem('current_case_id', id);
    window.location.href = 'case-details.html';
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
    box.insertAdjacentHTML('beforeend', `<div id="${alertId}" class="alert-custom ${typeClass}"><span>${message}</span></div>`);
    setTimeout(() => { const el = document.getElementById(alertId); if(el) { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); } }, 3000);
}