/**
 * js/staff.js
 * وحدة الإدارة الشاملة للموظفين والموارد البشرية (HR)
 * الدستور المطبق: تحصين الواجهات (Null-Safe)، رفع المستندات إلى R2، وتأمين الروابط.
 */

window.goBack = function() {
    window.history.back();
};

let allStaff = [];

document.addEventListener('DOMContentLoaded', () => {
    if (!window.API || !window.API.getToken()) {
        window.location.href = '/login.html';
        return;
    }
    loadStaff();
});

async function loadStaff() {
    const container = document.getElementById('staff-container');
    if(container) container.innerHTML = '<div class="col-12 text-center p-5 text-muted bg-white rounded border shadow-sm"><i class="fas fa-spinner fa-spin fa-2x mb-3"></i><br>جاري تحميل بيانات الفريق...</div>';
    
    try {
        allStaff = await window.API.getStaff();
        renderStaff(allStaff);
    } catch (error) {
        if(container) container.innerHTML = `<div class="col-12"><div class="alert alert-danger">${error.message}</div></div>`;
    }
}

function renderStaff(staffList) {
    const container = document.getElementById('staff-container');
    if(!container) return;

    if (!staffList || staffList.length === 0) {
        container.innerHTML = '<div class="col-12"><div class="alert alert-info text-center shadow-sm border-0">لا يوجد موظفين مسجلين حالياً.</div></div>';
        return;
    }

    container.innerHTML = staffList.map(s => {
        const secureAvatar = window.API.getSecureUrl(s.avatar_url);
        const avatarHtml = s.avatar_url && secureAvatar !== '/assets/img/placeholder.png' 
            ? `<img src="${secureAvatar}" class="staff-avatar shadow-sm" alt="Avatar">` 
            : `<div class="staff-avatar shadow-sm">${s.full_name.charAt(0)}</div>`;
        
        const roleAr = s.role === 'admin' ? 'مدير النظام' : (s.role === 'lawyer' ? 'محامي' : 'سكرتاريا');
        const badgeColor = s.role === 'admin' ? 'danger' : (s.role === 'lawyer' ? 'primary' : 'success');

        return `
            <div class="col-md-4 col-sm-6 mb-3">
                <div class="card bg-white staff-card h-100">
                    <div class="card-body text-center p-4">
                        ${avatarHtml}
                        <h5 class="fw-bold text-navy mt-3 mb-1 text-truncate">${s.full_name}</h5>
                        <span class="badge bg-${badgeColor} shadow-sm mb-3 px-3 py-1">${roleAr}</span>
                        <div class="d-flex justify-content-center gap-2">
                            <button class="btn btn-sm btn-outline-navy fw-bold w-100" onclick="viewStaffDetails('${s.id}')">التفاصيل</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function filterStaffList() {
    const query = document.getElementById('search_staff')?.value.toLowerCase() || '';
    const filtered = allStaff.filter(s => 
        s.full_name.toLowerCase().includes(query) || 
        (s.phone && s.phone.includes(query)) ||
        (s.specialization && s.specialization.toLowerCase().includes(query))
    );
    renderStaff(filtered);
}

function openStaffModal() {
    document.getElementById('staffForm')?.reset();
    if(document.getElementById('staff_id')) document.getElementById('staff_id').value = '';
    if(typeof bootstrap !== 'undefined') {
        new bootstrap.Modal(document.getElementById('staffModal')).show();
    }
}

async function viewStaffDetails(id) {
    const staff = allStaff.find(s => s.id === id);
    if (!staff) return;

    const safe = (val) => val ? val : '--';
    
    // حقن البيانات في الـ Modal بشكل آمن
    const setEl = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
    
    setEl('v_full_name', staff.full_name);
    setEl('v_phone', safe(staff.phone));
    setEl('v_national_id', safe(staff.national_id));
    setEl('v_gender', safe(staff.gender));
    setEl('v_dob', safe(staff.date_of_birth));
    setEl('v_address', safe(staff.address));
    setEl('v_em_name', safe(staff.emergency_contact_name));
    setEl('v_em_phone', safe(staff.emergency_contact_phone));
    setEl('v_em_relation', safe(staff.emergency_contact_relation));

    setEl('v_specialization', safe(staff.specialization));
    setEl('v_join_date', safe(staff.join_date));
    setEl('v_experience', safe(staff.years_of_experience));
    setEl('v_telegram_id', safe(staff.telegram_id));
    setEl('v_syndicate_num', safe(staff.syndicate_number));
    setEl('v_syndicate_expiry', safe(staff.syndicate_expiry_date));

    setEl('v_salary', safe(staff.basic_salary));
    setEl('v_allowance', safe(staff.transportation_allowance));
    setEl('v_commission', safe(staff.commission_rate));
    setEl('v_bank_name', safe(staff.bank_name));
    setEl('v_bank_iban', safe(staff.bank_iban));

    const roleAr = staff.role === 'admin' ? 'مدير النظام' : (staff.role === 'lawyer' ? 'محامي' : 'سكرتاريا');
    setEl('v_role_badge', roleAr);

    // الصور والأوسمة
    const avatarCont = document.getElementById('v_avatar_container');
    if (avatarCont) {
        const secureAvatar = window.API.getSecureUrl(staff.avatar_url);
        avatarCont.innerHTML = staff.avatar_url && secureAvatar !== '/assets/img/placeholder.png' 
            ? `<img src="${secureAvatar}" class="staff-avatar shadow-sm" style="width: 100px; height: 100px;">` 
            : `<div class="staff-avatar shadow-sm" style="width: 100px; height: 100px; font-size: 2.5rem;">${staff.full_name.charAt(0)}</div>`;
    }

    const statBadges = document.getElementById('v_status_badges');
    if (statBadges) {
        statBadges.innerHTML = `
            <span class="badge ${staff.is_active ? 'bg-success' : 'bg-danger'}">${staff.is_active ? 'نشط' : 'موقوف'}</span>
            <span class="badge ${staff.can_login ? 'bg-primary' : 'bg-secondary'}">${staff.can_login ? 'يملك دخول' : 'بدون دخول'}</span>
        `;
    }

    // الصلاحيات
    const permCont = document.getElementById('v_permissions');
    if (permCont) {
        const perms = staff.permissions || {};
        let permHtml = '';
        if(perms.can_delete) permHtml += '<span class="badge bg-danger shadow-sm"><i class="fas fa-trash"></i> حذف</span>';
        if(perms.can_manage_finance) permHtml += '<span class="badge bg-success shadow-sm"><i class="fas fa-wallet"></i> مالية</span>';
        if(perms.can_view_reports) permHtml += '<span class="badge bg-info text-dark shadow-sm"><i class="fas fa-chart-line"></i> تقارير</span>';
        permCont.innerHTML = permHtml || '<span class="text-muted small">صلاحيات افتراضية فقط</span>';
    }

    // المستندات
    const docsList = document.getElementById('v_documents_list');
    if (docsList) {
        let docs = [];
        try { docs = typeof staff.documents === 'string' ? JSON.parse(staff.documents) : (staff.documents || []); } catch(e){}
        if (docs.length === 0) {
            docsList.innerHTML = '<div class="text-center p-3 text-muted small border rounded bg-light">لا توجد وثائق مؤرشفة للموظف.</div>';
        } else {
            docsList.innerHTML = docs.map(doc => {
                const docUrl = window.API.getSecureUrl(doc.url);
                return `<div class="doc-item shadow-sm bg-white border-0 mb-2">
                    <span class="fw-bold text-navy"><i class="fas fa-file-alt text-danger me-2"></i> ${doc.name}</span>
                    <a href="${docUrl}" target="_blank" class="btn btn-sm btn-outline-primary fw-bold">عرض</a>
                </div>`;
            }).join('');
        }
    }

    const editBtn = document.getElementById('btn_open_edit');
    if(editBtn) {
        editBtn.onclick = () => {
            if(typeof bootstrap !== 'undefined') bootstrap.Modal.getInstance(document.getElementById('viewStaffModal')).hide();
            openEditStaff(id);
        };
    }

    if(typeof bootstrap !== 'undefined') new bootstrap.Modal(document.getElementById('viewStaffModal')).show();
}

function openEditStaff(id) {
    const staff = allStaff.find(s => s.id === id);
    if (!staff) return;

    const setVal = (id, val) => { const el = document.getElementById(id); if(el) el.value = val || ''; };
    
    setVal('staff_id', staff.id);
    setVal('s_full_name', staff.full_name);
    setVal('s_phone', staff.phone);
    setVal('s_national_id', staff.national_id);
    setVal('s_gender', staff.gender);
    setVal('s_dob', staff.date_of_birth);
    setVal('s_avatar', staff.avatar_url);
    setVal('s_telegram_id', staff.telegram_id);
    setVal('s_address', staff.address);
    setVal('s_role', staff.role);
    setVal('s_specialization', staff.specialization);
    setVal('s_join_date', staff.join_date);
    setVal('s_experience', staff.years_of_experience);
    setVal('s_syndicate_num', staff.syndicate_number);
    setVal('s_syndicate_expiry', staff.syndicate_expiry_date);
    setVal('s_salary', staff.basic_salary);
    setVal('s_allowance', staff.transportation_allowance);
    setVal('s_commission', staff.commission_rate);
    setVal('s_bank_name', staff.bank_name);
    setVal('s_bank_iban', staff.bank_iban);
    setVal('s_em_name', staff.emergency_contact_name);
    setVal('s_em_phone', staff.emergency_contact_phone);
    setVal('s_em_relation', staff.emergency_contact_relation);

    const perms = staff.permissions || {};
    if(document.getElementById('perm_delete')) document.getElementById('perm_delete').checked = !!perms.can_delete;
    if(document.getElementById('perm_finance')) document.getElementById('perm_finance').checked = !!perms.can_manage_finance;
    if(document.getElementById('perm_reports')) document.getElementById('perm_reports').checked = !!perms.can_view_reports;

    const docsArea = document.getElementById('documents-area');
    if(docsArea) docsArea.classList.remove('d-none');
    renderStaffDocsInEdit(staff.documents);

    if(typeof bootstrap !== 'undefined') new bootstrap.Modal(document.getElementById('staffModal')).show();
}

async function saveStaff(event) {
    event.preventDefault();
    const id = document.getElementById('staff_id')?.value;
    
    const getVal = (id) => document.getElementById(id) ? document.getElementById(id).value : null;
    
    const payload = {
        full_name: getVal('s_full_name'),
        phone: getVal('s_phone'),
        national_id: getVal('s_national_id'),
        gender: getVal('s_gender'),
        date_of_birth: getVal('s_dob') || null,
        avatar_url: getVal('s_avatar'),
        telegram_id: getVal('s_telegram_id'),
        address: getVal('s_address'),
        role: getVal('s_role'),
        specialization: getVal('s_specialization'),
        join_date: getVal('s_join_date') || null,
        years_of_experience: getVal('s_experience') ? parseInt(getVal('s_experience')) : 0,
        syndicate_number: getVal('s_syndicate_num'),
        syndicate_expiry_date: getVal('s_syndicate_expiry') || null,
        basic_salary: getVal('s_salary') ? parseFloat(getVal('s_salary')) : 0,
        transportation_allowance: getVal('s_allowance') ? parseFloat(getVal('s_allowance')) : 0,
        commission_rate: getVal('s_commission') ? parseFloat(getVal('s_commission')) : 0,
        bank_name: getVal('s_bank_name'),
        bank_iban: getVal('s_bank_iban'),
        emergency_contact_name: getVal('s_em_name'),
        emergency_contact_phone: getVal('s_em_phone'),
        emergency_contact_relation: getVal('s_em_relation'),
        permissions: {
            can_delete: document.getElementById('perm_delete')?.checked || false,
            can_manage_finance: document.getElementById('perm_finance')?.checked || false,
            can_view_reports: document.getElementById('perm_reports')?.checked || false
        }
    };

    const btn = document.getElementById('btn_save_staff');
    if(btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> جاري الحفظ...'; }

    try {
        if (id) {
            await window.API.patch(`/api/users?id=eq.${id}`, payload);
            alert('تم تعديل بيانات الموظف بنجاح.');
        } else {
            payload.is_active = true;
            payload.can_login = true;
            await window.API.post('/api/users', payload);
            alert('تم إضافة الموظف بنجاح.');
        }
        if(typeof bootstrap !== 'undefined') bootstrap.Modal.getInstance(document.getElementById('staffModal')).hide();
        loadStaff();
    } catch (error) {
        alert(`خطأ: ${error.message}`);
    } finally {
        if(btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save me-1"></i> حفظ بيانات الموظف'; }
    }
}

// الرفع السحابي لوثائق الموظفين (R2)
async function uploadStaffDoc() {
    const fileInput = document.getElementById('doc_file');
    const nameInput = document.getElementById('doc_name');
    const staffId = document.getElementById('staff_id')?.value;

    if (!staffId) return alert('يجب حفظ الموظف أولاً قبل إضافة الوثائق.');
    if (!fileInput || !fileInput.files[0]) return alert('يرجى اختيار ملف.');

    const file = fileInput.files[0];
    const docName = nameInput?.value || file.name;
    const btn = document.getElementById('btnUploadDoc');
    
    if(btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }

    try {
        const uploadResult = await window.API.uploadToCloudR2(file, `staff_docs/${staffId}`);
        const staff = allStaff.find(s => s.id === staffId);
        let docs = [];
        try { docs = typeof staff.documents === 'string' ? JSON.parse(staff.documents) : (staff.documents || []); } catch(e){}
        
        docs.push({ name: docName, url: uploadResult.file_path, date: new Date().toISOString() });
        await window.API.patch(`/api/users?id=eq.${staffId}`, { documents: docs });
        
        alert('تم حفظ الوثيقة.');
        if(nameInput) nameInput.value = '';
        if(fileInput) fileInput.value = '';
        
        staff.documents = docs; 
        renderStaffDocsInEdit(docs);
    } catch (err) {
        alert('فشل الرفع: ' + err.message);
    } finally {
        if(btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-upload"></i> رفع'; }
    }
}

function renderStaffDocsInEdit(docsData) {
    const list = document.getElementById('staff-docs-list');
    if(!list) return;
    let docs = [];
    try { docs = typeof docsData === 'string' ? JSON.parse(docsData) : (docsData || []); } catch(e){}

    if (docs.length === 0) {
        list.innerHTML = '<div class="text-center p-2 text-muted small">لا توجد وثائق.</div>';
        return;
    }

    list.innerHTML = docs.map((doc, idx) => {
        const docUrl = window.API.getSecureUrl(doc.url);
        return `
        <div class="doc-item shadow-sm bg-white border-0">
            <span class="small fw-bold text-navy"><i class="fas fa-file text-secondary me-1"></i> ${doc.name}</span>
            <a href="${docUrl}" target="_blank" class="btn btn-sm btn-light border fw-bold text-primary">عرض</a>
        </div>
    `}).join('');
}

function openAiIdModal() {
    if(typeof bootstrap !== 'undefined') new bootstrap.Modal(document.getElementById('aiIdModal')).show();
}

async function processIdAI() {
    const textEl = document.getElementById('ai_id_text');
    if(!textEl) return;
    const text = textEl.value;
    if (!text || text.length < 10) return alert('يرجى إدخال نص كافٍ.');

    const btn = document.getElementById('btn_process_id');
    if(btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التحليل...'; }

    try {
        const data = await window.API.extractLegalData(text);
        
        const setVal = (id, val) => { const el = document.getElementById(id); if(el && val) el.value = val; };
        
        if (data) {
            setVal('s_full_name', data.full_name || data.name || data["الاسم"] || data["الاسم الرباعي"]);
            setVal('s_national_id', data.national_id || data["الرقم الوطني"]);
            setVal('s_dob', data.date_of_birth || data.dob || data["تاريخ الولادة"]);
            
            if (data.syndicate_number || data["رقم النقابة"]) setVal('s_syndicate_num', data.syndicate_number || data["رقم النقابة"]);
            
            alert('تم استخراج البيانات بنجاح، يرجى مراجعتها.');
            if(typeof bootstrap !== 'undefined') bootstrap.Modal.getInstance(document.getElementById('aiIdModal')).hide();
        } else {
            throw new Error("لم يتم التعرف على بنية النص");
        }
    } catch (err) {
        alert('حدث خطأ في التحليل الذكي: ' + err.message);
    } finally {
        if(btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-magic me-1"></i> تحليل وملء الحقول'; }
    }
}