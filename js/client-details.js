// js/client-details.js - محرك صفحة الموكل الشاملة (النسخة السحابية R2 & Offline Edition)
// التحديثات: دعم الرفع السحابي لـ R2، المزامنة الدفعية بدون اتصال، تحميل آمن ومشفر للمستندات.

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
    if (!currentClientId) { window.location.href = 'app.html'; return; }
    await loadClientData();
};

function applyFirmSettings() {
    const settings = JSON.parse(localStorage.getItem('firm_settings'));
    if (!settings) return;
    const root = document.documentElement;
    if (settings.primary_color) root.style.setProperty('--navy', settings.primary_color);
    if (settings.accent_color) root.style.setProperty('--accent', settings.accent_color);
}

function goBack() { window.location.href = 'app.html'; }

window.manualSync = async () => {
    await loadClientData();
    showAlert('تمت المزامنة بنجاح', 'success');
};

async function loadClientData() {
    try {
        const [clientsRes, casesRes, filesRes] = await Promise.all([
            API.getClients(),
            API.getCases(),
            API.getFiles() // بافتراض وجود دالة عامة لجلب الملفات
        ]);

        if (!clientsRes || clientsRes.length === 0) { window.location.href = 'app.html'; return; }
        
        clientObj = clientsRes.find(c => c.id === currentClientId);
        if (!clientObj) { window.location.href = 'app.html'; return; }

        clientCases = Array.isArray(casesRes) ? casesRes.filter(c => c.client_id === currentClientId) : [];
        clientFiles = Array.isArray(filesRes) ? filesRes.filter(f => f.client_id === currentClientId) : [];

        let totalAgreed = 0, totalPaid = 0;
        clientCases.forEach(c => {
            totalAgreed += Number(c.total_agreed_fees) || 0;
            totalPaid += Number(c.total_paid) || 0;
        });

        renderHeaderAndSummary(totalAgreed, totalPaid);
        renderClientInfo();
        renderCasesList();
        renderFilesList();

    } catch (error) { 
        console.error("Load Error:", error);
        showAlert('خطأ في جلب بيانات الموكل', 'warning'); 
    }
}

function renderHeaderAndSummary(totalAgreed, totalPaid) {
    document.getElementById('header-client-name').innerText = escapeHTML(clientObj.full_name);
    document.getElementById('det-full-name').innerText = escapeHTML(clientObj.full_name);
    document.getElementById('det-phone').innerText = escapeHTML(clientObj.phone || 'لا يوجد رقم');

    let badgesHtml = '';
    if (clientObj.client_type === 'شركة') badgesHtml += `<span class="badge bg-primary shadow-sm"><i class="fas fa-building"></i> شركة</span>`;
    if (clientObj.confidentiality_level === 'سري') badgesHtml += `<span class="badge bg-danger shadow-sm ms-1"><i class="fas fa-user-secret"></i> سري</span>`;
    document.getElementById('client-badges').innerHTML = badgesHtml;

    // حالة بوابة الموكل
    const portalBadge = document.getElementById('portal_status_badge');
    if (portalBadge) {
        if (clientObj.client_portal_active !== false) {
            portalBadge.className = 'badge bg-success text-white shadow-sm border-0 px-3 py-2';
            portalBadge.innerHTML = '<i class="fas fa-globe me-1"></i> البوابة الإلكترونية مفعلة';
        } else {
            portalBadge.className = 'badge bg-danger text-white shadow-sm border-0 px-3 py-2';
            portalBadge.innerHTML = '<i class="fas fa-lock me-1"></i> وصول البوابة معلق';
        }
    }

    // حساب وعرض آخر زيارة للبوابة
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
            lastSeenBadge.innerHTML = `<i class="fas fa-eye me-1"></i> آخر زيارة: ${lastSeenDate.toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}`;
            lastSeenBadge.className = 'badge bg-info text-white shadow-sm border-0 px-3 py-2';
        } else {
            lastSeenBadge.innerHTML = `<i class="fas fa-eye-slash me-1"></i> لم يزر البوابة بعد`;
            lastSeenBadge.className = 'badge bg-light text-muted border px-3 py-2 shadow-sm';
        }
    }

    document.getElementById('fin-total-agreed').innerText = totalAgreed.toLocaleString();
    document.getElementById('fin-total-paid').innerText = totalPaid.toLocaleString();
    document.getElementById('fin-remaining').innerText = (totalAgreed - totalPaid).toLocaleString();
}

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

function renderCasesList() {
    const list = document.getElementById('client-cases-list');
    document.getElementById('cases-count').innerText = clientCases.length;
    
    if (clientCases.length === 0) { 
        list.innerHTML = '<div class="text-center p-4 text-muted small bg-white rounded border shadow-sm">لا توجد قضايا مسجلة لهذا الموكل.</div>'; 
        return; 
    }
    
    list.innerHTML = clientCases.map(c => {
        let statusColor = c.status === 'نشطة' ? 'success' : (c.status === 'مكتملة' ? 'secondary' : 'warning');
        return `
        <div class="card-custom case-card p-3 mb-2 d-flex justify-content-between align-items-center bg-white border-start border-4 border-${statusColor}" onclick="goToCase('${c.id}')" style="cursor:pointer; border-radius:12px;">
            <div>
                <b class="text-navy d-block mb-1">${escapeHTML(c.case_internal_id || 'ملف بلا رقم')}</b>
                <small class="text-muted"><i class="fas fa-balance-scale"></i> ${escapeHTML(c.current_court || 'محكمة غير محددة')}</small>
            </div>
            <div class="text-end">
                <span class="badge bg-${statusColor} shadow-sm mb-1">${escapeHTML(c.status)}</span><br>
                <small class="text-danger fw-bold" style="font-size:0.7rem;">الخصم: ${escapeHTML(c.opponent_name || '--')}</small>
            </div>
        </div>`;
    }).join('');
}

// 🛡️ الأرشيف المحمي لملفات R2 ضمن صفحة الموكل
function renderFilesList() {
    const container = document.getElementById('client-files-list');
    if (clientFiles.length === 0) { 
        container.innerHTML = '<div class="col-12 text-center p-4 text-muted small border bg-white rounded shadow-sm">لا يوجد مستندات مؤرشفة.</div>'; 
        return; 
    }
    
    container.innerHTML = clientFiles.map(f => {
        const isImage = f.file_extension && ['jpg','jpeg','png'].includes(f.file_extension);
        const iconHtml = isImage ? `<i class="fas fa-image fs-2 text-success mb-2"></i>` : `<i class="fas fa-file-pdf fs-2 text-danger mb-2"></i>`;
        const expiryBadge = f.expiry_date ? `<small class="d-block mt-1 text-danger" style="font-size: 0.65rem;"><i class="fas fa-clock"></i> ينتهي: ${escapeHTML(f.expiry_date)}</small>` : '';
        
        // فحص نوع الرابط (مباشر أم عبر R2)
        const isR2 = f.file_url && !f.file_url.startsWith('http');
        const viewBtn = isR2 
            ? `<button class="btn btn-sm btn-outline-primary w-100 fw-bold rounded-pill shadow-sm" onclick="API.downloadR2File('${escapeHTML(f.file_url)}', '${escapeHTML(f.file_name)}')"><i class="fas fa-lock me-1"></i> تحميل آمن</button>`
            : `<a href="${escapeHTML(f.file_url || f.drive_file_id || '#')}" target="_blank" class="btn btn-sm btn-outline-primary w-100 fw-bold rounded-pill shadow-sm"><i class="fas fa-eye me-1"></i> عرض</a>`;

        return `
        <div class="col-6 mb-2">
            <div class="card-custom p-3 text-center border shadow-sm h-100 bg-white position-relative rounded-3">
                <button class="btn btn-sm text-danger position-absolute top-0 start-0 m-1" onclick="deleteClientFile('${f.id}')"><i class="fas fa-trash"></i></button>
                <span class="badge bg-light text-dark border mb-2 d-block text-truncate">${escapeHTML(f.file_category || 'مستند')}</span>
                ${iconHtml} 
                <h6 class="small fw-bold text-truncate mt-1 mb-0 text-navy" title="${escapeHTML(f.file_name)}">${escapeHTML(f.file_name)}</h6>
                ${expiryBadge}
                <div class="mt-3">
                    ${viewBtn}
                </div>
            </div>
        </div>`;
    }).join('');
}

function goToCase(caseId) {
    localStorage.setItem('current_case_id', caseId);
    window.location.href = 'case-details.html';
}

window.callClient = function() {
    if (clientObj && clientObj.phone) window.open(`tel:${clientObj.phone}`);
    else showAlert('لا يوجد رقم هاتف مسجل', 'warning');
};

window.whatsappClient = function() {
    if (clientObj && clientObj.phone) {
        let p = String(clientObj.phone);
        if (p.startsWith('0')) p = '962' + p.substring(1);
        window.open(`https://wa.me/${p}`, '_blank');
    } else {
        showAlert('لا يوجد رقم هاتف مسجل', 'warning');
    }
};

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

    openModal('editClientModal');
};

window.updateClient = async function(event) {
    event.preventDefault();
    const btn = document.getElementById('btn_save_client');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> جاري الحفظ...';

    const data = {
        full_name: document.getElementById('edit_full_name').value,
        phone: document.getElementById('edit_phone').value,
        national_id: document.getElementById('edit_national_id').value || null,
        mother_name: document.getElementById('edit_mother').value || null,
        date_of_birth: document.getElementById('edit_dob').value || null,
        place_of_birth: document.getElementById('edit_pob').value || null,
        nationality: document.getElementById('edit_nationality').value || null,
        marital_status: document.getElementById('edit_marital').value || null,
        profession: document.getElementById('edit_profession').value || null,
        email: document.getElementById('edit_email').value || null,
        address: document.getElementById('edit_address').value || null,
        client_type: document.getElementById('edit_client_type').value,
        confidentiality_level: document.getElementById('edit_confidentiality').value,
        client_portal_active: document.getElementById('edit_portal_active') ? document.getElementById('edit_portal_active').checked : true
    };

    const res = await API.updateClient(currentClientId, data);
    if (res && !res.error) {
        closeModal('editClientModal');
        showAlert(res.offline ? 'تم التحديث محلياً' : 'تم التحديث بنجاح', res.offline ? 'warning' : 'success');
        await loadClientData();
    } else {
        showAlert(res?.error || 'حدث خطأ أثناء التحديث', 'error');
    }
    btn.disabled = false; btn.innerHTML = '<i class="fas fa-save me-1"></i> حفظ التعديلات';
};

// 🚀 الرفع الآمن للمستندات عبر R2
window.saveClientFile = async function(event) {
    event.preventDefault();
    const fileInput = document.getElementById('file_input');
    const titleInput = document.getElementById('file_title_input').value;
    const catInput = document.getElementById('file_category_input').value;
    const expiryInput = document.getElementById('file_expiry_date').value;
    const btn = document.getElementById('btn_upload');
    
    if (!fileInput.files.length) return;
    if (!navigator.onLine) { showAlert('لا يمكن رفع الملفات السحابية بلا إنترنت.', 'warning'); return; }
    
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> أرشفة سحابية...';
    
    try {
        // الرفع المباشر إلى Cloudflare R2
        const r2Res = await API.uploadFileToR2(fileInput.files[0], currentClientId, 'General');
        
        if(r2Res && r2Res.r2_key) {
            const payload = { 
                client_id: currentClientId, 
                file_name: titleInput || fileInput.files[0].name, 
                file_type: fileInput.files[0].type, 
                file_extension: fileInput.files[0].name.split('.').pop().toLowerCase(),
                file_category: catInput, 
                file_url: r2Res.r2_key, // حفظ المفتاح المشفر
                drive_file_id: r2Res.r2_key, 
                is_template: false, 
                expiry_date: expiryInput || null 
            };
            const res = await API.addFileRecord(payload);
            if(res && !res.error) { 
                closeModal('fileModal'); 
                document.getElementById('fileForm').reset(); 
                showAlert('تم حفظ المستند بأمان', 'success'); 
                await loadClientData(); 
            } else {
                throw new Error(res?.error || 'خطأ في الحفظ');
            }
        }
    } catch (err) { 
        showAlert("فشل الرفع السحابي: " + err.message, 'error'); 
    } finally { 
        btn.disabled = false; btn.innerHTML = '<i class="fas fa-upload me-1"></i> حفظ في أرشيف الموكل'; 
    }
};

window.deleteClientFile = async function(id) {
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
};

window.deleteClient = async function() {
    if (clientCases.length > 0) {
        Swal.fire('غير مسموح', 'لا يمكن حذف موكل لديه قضايا مرتبطة في النظام. يرجى حذف قضاياه أولاً.', 'warning');
        return;
    }
    const confirm = await Swal.fire({ title: 'حذف الموكل؟', text: "هذا الإجراء نهائي ولا يمكن التراجع عنه!", icon: 'error', showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'نعم، احذف نهائياً', cancelButtonText: 'إلغاء' });
    if(!confirm.isConfirmed) return;
    try {
        const token = localStorage.getItem(CONFIG.TOKEN_KEY || 'moakkil_token');
        const baseUrl = window.API_BASE_URL || CONFIG.API_URL;
        const res = await fetch(`${baseUrl}/api/clients?id=eq.${currentClientId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if(res.ok || res.status === 204) {
            await Swal.fire('تم الحذف', 'تم حذف الموكل من السجلات.', 'success');
            window.location.href = 'app.html';
        } else {
            throw new Error('خطأ أثناء الحذف');
        }
    } catch(e) {
        Swal.fire('خطأ', e.message, 'error');
    }
};

function openModal(id) { const el = document.getElementById(id); if(el) { const m = new bootstrap.Modal(el); m.show(); } }
function closeModal(id) { const el = document.getElementById(id); if(el) { const m = bootstrap.Modal.getInstance(el); if(m) m.hide(); document.querySelectorAll('.modal-backdrop').forEach(b => b.remove()); document.body.classList.remove('modal-open'); document.body.style.overflow = ''; document.body.style.paddingRight = ''; } }
function showAlert(message, type = 'success') { if (typeof Swal !== 'undefined') { Swal.fire({ toast: true, position: 'top-end', icon: type === 'danger' ? 'error' : (type === 'info' ? 'info' : type), title: escapeHTML(message), showConfirmButton: false, timer: 3000, timerProgressBar: true }); } else { alert(message); } }