// js/staff.js - محرك إدارة الموارد البشرية والموظفين (HR)

let allStaff = [];
let currentEditingStaff = null;

const escapeHTML = (str) => {
    if (str === null || str === undefined) return '';
    return str.toString().replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
};

window.onload = async () => {
    applyFirmSettings();
    
    // التحقق من الصلاحيات (للمدير فقط)
    const userStr = localStorage.getItem(CONFIG.USER_KEY);
    if (!userStr) { window.location.href = 'login.html'; return; }
    const user = JSON.parse(userStr);
    if (user.role !== 'admin' && user.role !== 'مدير') {
        Swal.fire({icon: 'error', title: 'مرفوض', text: 'صلاحية الدخول للموارد البشرية مقتصرة على مدراء المكتب.'})
            .then(() => window.location.href = 'app.html');
        return;
    }
    
    await loadStaff();
};

function applyFirmSettings() {
    const settings = JSON.parse(localStorage.getItem('firm_settings'));
    if (!settings) return;
    const root = document.documentElement;
    if (settings.primary_color) root.style.setProperty('--navy', settings.primary_color);
    if (settings.accent_color) root.style.setProperty('--accent', settings.accent_color);
}

async function loadStaff() {
    const container = document.getElementById('staff-container');
    container.innerHTML = '<div class="col-12 text-center p-5 text-muted bg-white rounded border"><i class="fas fa-spinner fa-spin fa-2x mb-3"></i><br>جاري تحميل البيانات...</div>';
    
    try {
        const res = await API.getStaff();
        allStaff = Array.isArray(res) ? res : [];
        renderStaffCards();
    } catch (e) {
        container.innerHTML = '<div class="col-12 alert alert-danger text-center border-0 shadow-sm">حدث خطأ في تحميل البيانات.</div>';
    }
}

function renderStaffCards() {
    const container = document.getElementById('staff-container');
    if (allStaff.length === 0) {
        container.innerHTML = '<div class="col-12 text-center p-4 text-muted bg-white rounded border">لا يوجد موظفين مسجلين في النظام.</div>';
        return;
    }

    container.innerHTML = allStaff.map(staff => {
        const isActive = staff.is_active !== false;
        const canLogin = staff.can_login !== false;
        
        let statusBadge = isActive ? '<span class="badge bg-success shadow-sm px-2"><i class="fas fa-check-circle"></i> نشط</span>' : '<span class="badge bg-danger shadow-sm px-2"><i class="fas fa-ban"></i> موقوف</span>';
        let loginBadge = canLogin ? '<span class="badge bg-soft-primary text-primary border border-primary px-2"><i class="fas fa-key"></i> يملك وصول</span>' : '<span class="badge bg-light text-muted border px-2"><i class="fas fa-lock"></i> وصول مسحوب</span>';
        
        let roleName = staff.role === 'admin' ? 'مدير/شريك' : (staff.role === 'secretary' ? 'سكرتير' : 'محامي');
        let avatarHtml = staff.avatar_url ? `<img src="${escapeHTML(staff.avatar_url)}" class="staff-avatar mt-3">` : `<div class="staff-avatar mt-3">${escapeHTML(staff.full_name).charAt(0)}</div>`;

        return `
        <div class="col-lg-4 col-md-6">
            <div class="card bg-white staff-card h-100 ${!isActive ? 'opacity-75' : ''}">
                <div class="position-relative text-center pb-3 border-bottom">
                    ${avatarHtml}
                    <h5 class="fw-bold text-navy mt-3 mb-0">${escapeHTML(staff.full_name)}</h5>
                    <p class="text-muted small mb-2">${escapeHTML(staff.specialization || roleName)}</p>
                    <div class="d-flex justify-content-center gap-2 mb-2">${statusBadge} ${loginBadge}</div>
                </div>
                <div class="card-body p-3 small text-muted">
                    <div class="mb-1"><i class="fas fa-phone text-success"></i> ${escapeHTML(staff.phone)}</div>
                    <div class="mb-1"><i class="fab fa-telegram text-primary"></i> ${escapeHTML(staff.telegram_id || 'غير مربوط')}</div>
                    <div class="mb-1"><i class="fas fa-calendar-alt text-warning"></i> انضم: ${escapeHTML(staff.join_date || 'غير محدد')}</div>
                </div>
                <div class="card-footer bg-light border-0 p-2 d-flex gap-2">
                    <button class="btn btn-sm btn-primary fw-bold w-50 shadow-sm" onclick="openStaffModal('${staff.id}')"><i class="fas fa-edit"></i> تعديل الملف</button>
                    <button class="btn btn-sm ${isActive ? 'btn-outline-danger' : 'btn-outline-success'} fw-bold w-50 shadow-sm" onclick="toggleStaffStatus('${staff.id}', ${isActive})">
                        <i class="fas ${isActive ? 'fa-user-slash' : 'fa-user-check'}"></i> ${isActive ? 'إيقاف' : 'تفعيل'}
                    </button>
                </div>
            </div>
        </div>
        `;
    }).join('');
}

function openStaffModal(id = null) {
    document.getElementById('staffForm').reset();
    document.getElementById('staff_id').value = '';
    document.getElementById('documents-area').classList.add('d-none');
    
    // تعيين الافتراضيات
    document.getElementById('s_join_date').value = new Date().toISOString().split('T')[0];

    if (id) {
        const staff = allStaff.find(s => s.id === id);
        if (staff) {
            currentEditingStaff = staff;
            document.getElementById('staff_id').value = staff.id;
            document.getElementById('s_full_name').value = staff.full_name || '';
            document.getElementById('s_phone').value = staff.phone || '';
            document.getElementById('s_telegram_id').value = staff.telegram_id || '';
            document.getElementById('s_dob').value = staff.date_of_birth || '';
            document.getElementById('s_avatar').value = staff.avatar_url || '';
            document.getElementById('s_address').value = staff.address || '';
            
            document.getElementById('s_role').value = staff.role || 'lawyer';
            document.getElementById('s_specialization').value = staff.specialization || '';
            document.getElementById('s_join_date').value = staff.join_date || '';
            document.getElementById('s_experience').value = staff.experience_years || 0;
            document.getElementById('s_syndicate_num').value = staff.syndicate_number || '';
            document.getElementById('s_syndicate_expiry').value = staff.syndicate_expiry_date || '';

            if (staff.salary_details) {
                document.getElementById('s_salary').value = staff.salary_details.basic || '';
                document.getElementById('s_commission').value = staff.salary_details.commission || '';
            }

            if (staff.emergency_contact) {
                document.getElementById('s_em_name').value = staff.emergency_contact.name || '';
                document.getElementById('s_em_phone').value = staff.emergency_contact.phone || '';
                document.getElementById('s_em_relation').value = staff.emergency_contact.relation || '';
            }

            // إظهار قسم الوثائق وعرضها
            document.getElementById('documents-area').classList.remove('d-none');
            renderStaffDocs(staff.staff_documents || []);
        }
    } else {
        currentEditingStaff = null;
    }
    
    const m = new bootstrap.Modal(document.getElementById('staffModal'));
    m.show();
}

async function saveStaff(event) {
    event.preventDefault();
    const btn = document.getElementById('btn_save_staff');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> جاري الحفظ...';

    const id = document.getElementById('staff_id').value;
    const data = {
        full_name: document.getElementById('s_full_name').value.trim(),
        phone: document.getElementById('s_phone').value.trim(),
        telegram_id: document.getElementById('s_telegram_id').value || null,
        date_of_birth: document.getElementById('s_dob').value || null,
        avatar_url: document.getElementById('s_avatar').value || null,
        address: document.getElementById('s_address').value || null,
        role: document.getElementById('s_role').value,
        specialization: document.getElementById('s_specialization').value || null,
        join_date: document.getElementById('s_join_date').value || null,
        experience_years: parseInt(document.getElementById('s_experience').value) || 0,
        syndicate_number: document.getElementById('s_syndicate_num').value || null,
        syndicate_expiry_date: document.getElementById('s_syndicate_expiry').value || null,
        salary_details: {
            basic: document.getElementById('s_salary').value || 0,
            commission: document.getElementById('s_commission').value || 0
        },
        emergency_contact: {
            name: document.getElementById('s_em_name').value || '',
            phone: document.getElementById('s_em_phone').value || '',
            relation: document.getElementById('s_em_relation').value || ''
        }
    };

    try {
        if (id) {
            await API.updateStaff(id, data);
            Swal.fire({toast: true, position: 'top-end', icon: 'success', title: 'تم التحديث بنجاح', showConfirmButton: false, timer: 2000});
        } else {
            data.is_active = true;
            data.can_login = true;
            await API.addStaff(data);
            Swal.fire({toast: true, position: 'top-end', icon: 'success', title: 'تمت إضافة الموظف بنجاح', showConfirmButton: false, timer: 2000});
        }
        
        const m = bootstrap.Modal.getInstance(document.getElementById('staffModal'));
        if (m) m.hide();
        await loadStaff();
    } catch (err) {
        Swal.fire('خطأ', err.message || 'تعذر حفظ بيانات الموظف. قد يكون الحد الأقصى للموظفين قد اكتمل.', 'error');
    } finally {
        btn.disabled = false; btn.innerHTML = '<i class="fas fa-save me-1"></i> حفظ بيانات الموظف';
    }
}

// إيقاف الموظف (Soft Delete)
async function toggleStaffStatus(id, currentActiveStatus) {
    const actionName = currentActiveStatus ? "إيقاف" : "تفعيل";
    const newStatus = !currentActiveStatus;

    const confirm = await Swal.fire({
        title: `هل تريد ${actionName} هذا الموظف؟`,
        text: currentActiveStatus ? "سيتم منعه من تسجيل الدخول للنظام نهائياً، مع الاحتفاظ ببياناته وقضاياه." : "سيتمكن من الدخول للنظام مجدداً.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: currentActiveStatus ? '#d33' : '#10b981',
        confirmButtonText: `نعم، ${actionName}`,
        cancelButtonText: 'إلغاء'
    });

    if (!confirm.isConfirmed) return;

    try {
        await API.updateStaff(id, { is_active: newStatus, can_login: newStatus });
        Swal.fire({toast: true, position: 'top-end', icon: 'success', title: `تم ${actionName} الموظف بنجاح`, showConfirmButton: false, timer: 2000});
        await loadStaff();
    } catch (err) {
        Swal.fire('خطأ', 'تعذر تغيير حالة الموظف', 'error');
    }
}

// ----------------- الذكاء الاصطناعي للهويات -----------------
function openAiIdModal() {
    document.getElementById('ai_id_text').value = '';
    const m = new bootstrap.Modal(document.getElementById('aiIdModal'));
    m.show();
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
            if (data.full_name) document.getElementById('s_full_name').value = data.full_name;
            if (data.date_of_birth) document.getElementById('s_dob').value = data.date_of_birth;
            if (data.address) document.getElementById('s_address').value = data.address;
            if (data.syndicate_number) document.getElementById('s_syndicate_num').value = data.syndicate_number;
            
            Swal.fire({toast: true, position: 'top-end', icon: 'success', title: 'تم التعبئة التلقائية', showConfirmButton: false, timer: 2000});
            const m = bootstrap.Modal.getInstance(document.getElementById('aiIdModal'));
            if (m) m.hide();
        } else {
            Swal.fire('خطأ', 'لم يتمكن الذكاء الاصطناعي من فهم النص.', 'error');
        }
    } catch (err) {
        Swal.fire('خطأ', 'فشل الاتصال بالمحرك الذكي', 'error');
    } finally {
        btn.disabled = false; btn.innerHTML = '<i class="fas fa-magic me-1"></i> تحليل وملء الحقول';
    }
}

// ----------------- أرشيف الوثائق -----------------
function renderStaffDocs(docs) {
    const list = document.getElementById('staff-docs-list');
    if (!docs || docs.length === 0) {
        list.innerHTML = '<div class="text-muted small text-center p-3 border rounded bg-light">لا توجد وثائق مؤرشفة لهذا الموظف.</div>';
        return;
    }
    
    list.innerHTML = docs.map((doc, index) => `
        <div class="doc-item">
            <div>
                <i class="fas fa-file-alt text-navy me-2 fs-5"></i>
                <span class="fw-bold text-dark small">${escapeHTML(doc.name)}</span>
                <small class="d-block text-muted" style="font-size:0.7rem;">${new Date(doc.date).toLocaleDateString('ar-EG')}</small>
            </div>
            <div>
                <a href="${escapeHTML(doc.url)}" target="_blank" class="btn btn-sm btn-outline-primary px-2 py-0"><i class="fas fa-eye"></i></a>
                <button type="button" class="btn btn-sm btn-outline-danger px-2 py-0 ms-1" onclick="deleteStaffDoc(${index})"><i class="fas fa-trash"></i></button>
            </div>
        </div>
    `).join('');
}

async function uploadStaffDoc() {
    const fileInput = document.getElementById('doc_file');
    const nameInput = document.getElementById('doc_name').value.trim();
    
    if (!fileInput.files.length) { Swal.fire('تنبيه', 'يرجى اختيار ملف أولاً', 'warning'); return; }
    
    const btn = document.getElementById('btnUploadDoc');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    
    try {
        const file = fileInput.files[0];
        const driveRes = await API.uploadToDrive(file, "موظف-" + currentEditingStaff.full_name, "HR-Docs");
        
        if (driveRes && driveRes.url) {
            let currentDocs = currentEditingStaff.staff_documents || [];
            currentDocs.push({
                name: nameInput || file.name,
                url: driveRes.url,
                date: new Date().toISOString()
            });
            
            await API.updateStaff(currentEditingStaff.id, { staff_documents: currentDocs });
            currentEditingStaff.staff_documents = currentDocs; // تحديث محلي
            
            document.getElementById('doc_file').value = '';
            document.getElementById('doc_name').value = '';
            renderStaffDocs(currentDocs);
            Swal.fire({toast: true, position: 'top-end', icon: 'success', title: 'تمت الأرشفة', showConfirmButton: false, timer: 2000});
        }
    } catch (err) {
        Swal.fire('خطأ', 'فشل الرفع السحابي: ' + err.message, 'error');
    } finally {
        btn.disabled = false; btn.innerHTML = '<i class="fas fa-upload"></i> رفع';
    }
}

async function deleteStaffDoc(index) {
    const confirm = await Swal.fire({title: 'حذف الوثيقة؟', icon: 'warning', showCancelButton: true, confirmButtonText: 'نعم', cancelButtonText: 'إلغاء'});
    if (!confirm.isConfirmed) return;
    
    let currentDocs = currentEditingStaff.staff_documents || [];
    currentDocs.splice(index, 1);
    
    try {
        await API.updateStaff(currentEditingStaff.id, { staff_documents: currentDocs });
        currentEditingStaff.staff_documents = currentDocs;
        renderStaffDocs(currentDocs);
        Swal.fire({toast: true, position: 'top-end', icon: 'success', title: 'تم الحذف', showConfirmButton: false, timer: 2000});
    } catch (err) {
        Swal.fire('خطأ', 'تعذر حذف الوثيقة', 'error');
    }
}