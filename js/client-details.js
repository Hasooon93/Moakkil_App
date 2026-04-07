// js/client-details.js - محرك صفحة الموكل الشاملة (النسخة المتوافقة 100% مع api.js)
// التحديثات: دعم المزامنة (Offline Mode) للتعديلات والحذف، ومنع أخطاء الرفع السحابي أثناء انقطاع الإنترنت.

let currentClientId = localStorage.getItem('current_client_id') || new URLSearchParams(window.location.search).get('id');
let clientObj = null;
let clientCases = [];
let clientFiles = [];

// دالة الحماية من ثغرات الحقن
const escapeHTML = (str) => {
    if (str === null || str === undefined) return '';
    return str.toString().replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
};

window.onload = async () => {
    applyFirmSettings();
    if (!currentClientId) { window.location.href = 'app'; return; }
    await loadClientData();
};

function applyFirmSettings() {
    const settings = JSON.parse(localStorage.getItem('firm_settings'));
    if (!settings) return;
    const root = document.documentElement;
    if (settings.primary_color) root.style.setProperty('--navy', settings.primary_color);
    if (settings.accent_color) root.style.setProperty('--accent', settings.accent_color);
}

window.manualSync = async () => {
    await loadClientData();
    showAlert('تم التحديث بنجاح', 'success');
};

function goBack() { window.location.href = 'app'; }

// جلب البيانات بالاعتماد على الدوال المخصصة في api.js
async function loadClientData() {
    try {
        Swal.fire({ title: 'جاري تحميل بيانات الموكل...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        const [clientsRes, casesRes, filesRes] = await Promise.all([
            API.getClients(),
            API.getCases(),
            API.getFiles() // نجلب كافة الملفات ثم نفلترها برقم الموكل
        ]);

        const allClients = Array.isArray(clientsRes) ? clientsRes : [];
        clientObj = allClients.find(c => c.id == currentClientId);
        
        if (!clientObj) { 
            Swal.close();
            window.location.href = 'app'; 
            return; 
        }

        const allCases = Array.isArray(casesRes) ? casesRes : [];
        clientCases = allCases.filter(c => c.client_id == currentClientId);
        
        const allFiles = Array.isArray(filesRes) ? filesRes : [];
        // فلترة الملفات الخاصة بهذا الموكل تحديداً
        clientFiles = allFiles.filter(f => f.client_id == currentClientId);

        renderClientInfo();
        renderClientCases();
        renderClientFiles();
        calculateClientFinances();

        Swal.close();
    } catch (error) {
        console.error(error);
        Swal.close();
        showAlert('خطأ في جلب البيانات', 'error');
    }
}

// عرض بيانات الهوية الشاملة
function renderClientInfo() {
    document.getElementById('header-client-name').innerText = escapeHTML(clientObj.full_name);
    document.getElementById('det-full-name').innerText = escapeHTML(clientObj.full_name);
    document.getElementById('det-phone').innerText = escapeHTML(clientObj.phone || 'لا يوجد رقم');
    
    let badges = '';
    if (clientObj.client_type === 'شركة') badges += `<span class="badge bg-primary ms-1 shadow-sm"><i class="fas fa-building"></i> شركة</span>`;
    if (clientObj.confidentiality_level === 'سري') badges += `<span class="badge bg-dark ms-1 shadow-sm"><i class="fas fa-lock text-warning"></i> سري جداً</span>`;
    document.getElementById('client-badges').innerHTML = badges;

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

// عرض قضايا الموكل
function renderClientCases() {
    document.getElementById('cases-count').innerText = clientCases.length;
    const container = document.getElementById('client-cases-list');
    
    if (clientCases.length === 0) {
        container.innerHTML = '<div class="text-center p-4 text-muted small bg-white rounded border shadow-sm">لا توجد قضايا مسجلة لهذا الموكل.</div>';
        return;
    }

    container.innerHTML = clientCases.map(c => {
        let statusColor = c.status === 'نشطة' ? 'success' : (c.status === 'مكتملة' ? 'secondary' : 'warning');
        return `
        <div class="card-custom case-card p-3 mb-3 bg-white shadow-sm border-start border-4 border-${statusColor}" onclick="viewCase('${c.id}')" style="cursor:pointer; border-radius:12px;">
            <div class="d-flex justify-content-between align-items-start mb-2">
                <h6 class="fw-bold text-navy mb-0">${escapeHTML(c.case_internal_id || 'ملف بلا رقم')}</h6>
                <span class="badge bg-${statusColor}">${escapeHTML(c.status || 'نشطة')}</span>
            </div>
            <div class="small text-muted mb-2">
                <i class="fas fa-user-shield text-danger me-1"></i> الخصم: ${escapeHTML(c.opponent_name || '--')}
            </div>
            <div class="d-flex justify-content-between text-muted" style="font-size: 0.75rem;">
                <span><i class="fas fa-balance-scale"></i> ${escapeHTML(c.current_court || '--')}</span>
                <span class="text-navy fw-bold">الأتعاب: ${Number(c.total_agreed_fees || 0).toLocaleString()} د.أ</span>
            </div>
        </div>
        `;
    }).join('');
}

// عرض المستندات الشخصية للموكل
function renderClientFiles() {
    const container = document.getElementById('client-files-list');
    if (!clientFiles || clientFiles.length === 0) { 
        container.innerHTML = '<div class="col-12 text-center p-4 text-muted small border bg-white rounded shadow-sm">لا توجد مستندات شخصية للموكل.</div>'; 
        return; 
    }

    container.innerHTML = clientFiles.map(f => {
        const isImage = f.file_type && f.file_type.includes('image');
        const iconHtml = (isImage && f.drive_file_id) ? `<i class="fas fa-image fs-1 text-primary mb-2"></i>` : `<i class="fas fa-file-pdf fs-1 text-danger mb-2"></i>`;
        const expiryBadge = f.expiry_date ? `<small class="d-block mt-1 text-danger" style="font-size: 0.65rem;"><i class="fas fa-clock"></i> ينتهي: ${escapeHTML(f.expiry_date)}</small>` : '';
        
        return `
        <div class="col-6">
            <div class="card-custom p-3 text-center border shadow-sm h-100 bg-white position-relative">
                <button class="btn btn-sm text-danger position-absolute top-0 start-0 m-1" onclick="deleteClientFile('${f.id}')"><i class="fas fa-trash"></i></button>
                <span class="badge bg-light text-dark border mb-2 d-block text-truncate">${escapeHTML(f.file_category || 'مستند')}</span>
                ${iconHtml}
                <h6 class="small fw-bold text-truncate mt-1 mb-0" title="${escapeHTML(f.file_name)}">${escapeHTML(f.file_name)}</h6>
                ${expiryBadge}
                <div class="d-flex gap-1 mt-2">
                    <a href="${escapeHTML(f.drive_file_id || '#')}" target="_blank" class="btn btn-sm btn-outline-primary w-100 fw-bold">عرض</a>
                </div>
            </div>
        </div>
        `;
    }).join('');
}

// حساب الموقف المالي للموكل
function calculateClientFinances() {
    let totalAgreed = 0;
    let totalPaid = 0;
    
    clientCases.forEach(c => {
        totalAgreed += Number(c.total_agreed_fees) || 0;
        totalPaid += Number(c.total_paid) || 0; 
    });

    const remaining = totalAgreed - totalPaid;

    document.getElementById('fin-total-agreed').innerText = totalAgreed.toLocaleString();
    document.getElementById('fin-total-paid').innerText = totalPaid.toLocaleString();
    document.getElementById('fin-remaining').innerText = remaining.toLocaleString();
}

function viewCase(id) {
    localStorage.setItem('current_case_id', id);
    window.location.href = 'case-details.html';
}

function callClient() {
    if(clientObj && clientObj.phone) {
        window.location.href = `tel:${clientObj.phone}`;
    } else {
        showAlert('لا يوجد رقم هاتف للموكل', 'warning');
    }
}

function whatsappClient() {
    if(clientObj && clientObj.phone) {
        let phoneStr = String(clientObj.phone);
        if (phoneStr.startsWith('0')) phoneStr = '962' + phoneStr.substring(1);
        window.open(`https://wa.me/${phoneStr}`, '_blank');
    } else {
        showAlert('لا يوجد رقم هاتف للموكل', 'warning');
    }
}

// وظائف التعديل (باستخدام API.updateClient المخصص)
function openEditModal() {
    document.getElementById('edit_full_name').value = clientObj.full_name || '';
    document.getElementById('edit_phone').value = clientObj.phone || '';
    document.getElementById('edit_national_id').value = clientObj.national_id || '';
    document.getElementById('edit_email').value = clientObj.email || '';
    document.getElementById('edit_address').value = clientObj.address || '';
    document.getElementById('edit_client_type').value = clientObj.client_type || 'فرد';
    document.getElementById('edit_confidentiality').value = clientObj.confidentiality_level || 'عادي';
    
    document.getElementById('edit_mother').value = clientObj.mother_name || '';
    document.getElementById('edit_dob').value = clientObj.date_of_birth || '';
    document.getElementById('edit_pob').value = clientObj.place_of_birth || '';
    document.getElementById('edit_nationality').value = clientObj.nationality || '';
    document.getElementById('edit_marital').value = clientObj.marital_status || '';
    document.getElementById('edit_profession').value = clientObj.profession || '';

    openModal('editClientModal');
}

async function updateClient(e) {
    e.preventDefault();
    const btn = document.getElementById('btn_save_client');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> حفظ...';

    const data = {
        full_name: document.getElementById('edit_full_name').value,
        phone: document.getElementById('edit_phone').value,
        national_id: document.getElementById('edit_national_id').value,
        email: document.getElementById('edit_email').value,
        address: document.getElementById('edit_address').value,
        client_type: document.getElementById('edit_client_type').value,
        confidentiality_level: document.getElementById('edit_confidentiality').value,
        mother_name: document.getElementById('edit_mother').value,
        date_of_birth: document.getElementById('edit_dob').value || null,
        place_of_birth: document.getElementById('edit_pob').value,
        nationality: document.getElementById('edit_nationality').value,
        marital_status: document.getElementById('edit_marital').value,
        profession: document.getElementById('edit_profession').value
    };

    try {
        const res = await API.updateClient(currentClientId, data);
        if(res && !res.error) {
            closeModal('editClientModal');
            showAlert(res.offline ? 'أنت غير متصل. تم حفظ التعديلات محلياً' : 'تم تحديث بيانات الموكل بنجاح', res.offline ? 'warning' : 'success');
            await loadClientData();
        } else {
            showAlert(res?.error || 'حدث خطأ في التحديث', 'error');
        }
    } catch(err) {
        showAlert('فشل التحديث: ' + err.message, 'error');
    } finally {
        btn.disabled = false; btn.innerHTML = '<i class="fas fa-save me-1"></i> حفظ التعديلات';
    }
}

// دالة الحذف (باستخدام API.deleteClient)
async function deleteClient() {
    if (clientCases.length > 0) {
        showAlert('لا يمكن حذف الموكل لارتباطه بقضايا نشطة', 'error');
        return;
    }
    
    const confirm = await Swal.fire({ title: 'هل أنت متأكد؟', text: "سيتم حذف الموكل نهائياً!", icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', cancelButtonColor: '#3085d6', confirmButtonText: 'نعم، احذف', cancelButtonText: 'إلغاء' });
    
    if (confirm.isConfirmed) {
        try {
            const res = await API.deleteClient(currentClientId);
            if(res && !res.error) {
                showAlert(res.offline ? 'أنت غير متصل، تم أمر الحذف محلياً' : 'تم حذف الموكل بنجاح', res.offline ? 'warning' : 'success');
                setTimeout(() => { goBack(); }, 1500);
            } else {
                showAlert(res?.error || 'حدث خطأ في الحذف', 'error');
            }
        } catch(e) {
            showAlert('فشل الحذف، تأكد من الصلاحيات', 'error');
        }
    }
}

// وظائف رفع الملفات الخاصة بالموكل (باستخدام API.addFileRecord)
async function saveClientFile(event) {
    event.preventDefault();
    const fileInput = document.getElementById('file_input');
    const titleInput = document.getElementById('file_title_input').value;
    const catInput = document.getElementById('file_category_input').value;
    const expiryInput = document.getElementById('file_expiry_date').value;
    const btn = document.getElementById('btn_upload');
    
    if (!fileInput.files.length) return;
    const file = fileInput.files[0];
    
    if (!navigator.onLine) {
        showAlert('عذراً، لا يمكن رفع الملفات السحابية أثناء انقطاع الإنترنت.', 'warning');
        return;
    }
    
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> جاري الأرشفة...';
    try {
        const driveRes = await API.uploadToDrive(file, clientObj.full_name, "Client_Files_Folder");
        if(driveRes && driveRes.url) {
            const payload = { 
                client_id: currentClientId, 
                file_name: titleInput || file.name, 
                file_type: file.type, 
                file_category: catInput, 
                drive_file_id: driveRes.url, 
                is_template: false, 
                expiry_date: expiryInput || null 
            };
            
            const res = await API.addFileRecord(payload);
            if(res && !res.error) {
                closeModal('fileModal'); 
                document.getElementById('fileForm').reset(); 
                showAlert('تم الحفظ في ملف الموكل', 'success'); 
                await loadClientData(); 
            }
        }
    } catch (err) { 
        showAlert("فشل الرفع: " + err.message, 'error'); 
    } finally { 
        btn.disabled = false; btn.innerHTML = '<i class="fas fa-upload me-1"></i> حفظ في أرشيف الموكل'; 
    }
}

// دالة حذف الملف (باستخدام API.deleteFile)
async function deleteClientFile(id) {
    const res = await Swal.fire({ title: 'هل أنت متأكد؟', text: "سيتم إزالة المستند من أرشيف الموكل!", icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'نعم، احذف', cancelButtonText: 'إلغاء' });
    if(!res.isConfirmed) return;
    try {
        const delRes = await API.deleteFile(id);
        if(delRes && !delRes.error) {
            showAlert(delRes.offline ? 'تم الحذف محلياً بسبب انقطاع الإنترنت' : 'تم الحذف بنجاح', delRes.offline ? 'warning' : 'success'); 
            await loadClientData();
        } else {
            showAlert(delRes?.error || 'حدث خطأ', 'error');
        }
    } catch(e) { showAlert('حدث خطأ أثناء الحذف', 'error'); }
}

function openModal(id) { const el = document.getElementById(id); if(el) { const m = new bootstrap.Modal(el); m.show(); } }
function closeModal(id) { const el = document.getElementById(id); if(el) { const m = bootstrap.Modal.getInstance(el); m?.hide(); } }
function showAlert(m, t) { if(typeof Swal !== 'undefined') Swal.fire({ toast: true, position: 'top-end', icon: t === 'danger' ? 'error' : (t === 'warning' ? 'warning' : 'success'), title: escapeHTML(m), showConfirmButton: false, timer: 3000 }); }