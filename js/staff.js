// js/staff.js - محرك إدارة الموارد البشرية والموظفين (HR)
// التحديثات: إضافة دالة العرض المقروء فقط (View Profile) وفصلها عن دالة التعديل (Edit Profile).

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

window.registerDeviceBiometric = async () => {
    if (!navigator.onLine) {
        Swal.fire('تنبيه', 'لا يمكن تفعيل البصمة أثناء انقطاع الإنترنت، يرجى الاتصال بالشبكة أولاً.', 'warning');
        return;
    }
    try {
        Swal.fire({title: 'جاري إعداد البصمة...', text: 'يرجى تأكيد هويتك عبر جهازك', allowOutsideClick: false, didOpen: () => Swal.showLoading()});
        const res = await AUTH.registerBiometric();
        Swal.fire('نجاح', res.message || 'تم تسجيل البصمة بنجاح', 'success');
    } catch (err) {
        Swal.fire('خطأ', err.message || 'فشل إعداد البصمة', 'error');
    }
};

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

function getRoleNameAr(role) {
    if (role === 'admin' || role === 'super_admin' || role === 'superadmin') return 'مدير / شريك';
    if (role === 'lawyer') return 'محامي / مستشار';
    if (role === 'secretary') return 'سكرتاريا / إداري';
    return role || 'موظف';
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
        let loginBadge = canLogin ? '<span class="badge bg-soft-primary text-primary border border-primary px-2"><i class="fas fa-key"></i> وصول</span>' : '<span class="badge bg-light text-muted border px-2"><i class="fas fa-lock"></i> مسحوب</span>';
        
        let roleName = getRoleNameAr(staff.role);
        let avatarHtml = staff.avatar_url ? `<img src="${escapeHTML(staff.avatar_url)}" class="staff-avatar mt-3 shadow-sm">` : `<div class="staff-avatar mt-3 shadow-sm">${escapeHTML(staff.full_name).charAt(0)}</div>`;

        let salaryText = '--';
        if (staff.salary_details && typeof staff.salary_details === 'object') {
            salaryText = `${Number(staff.salary_details.basic || staff.salary_details.base_salary || 0).toLocaleString()} د.أ`;
        }

        return `
        <div class="col-lg-4 col-md-6 col-sm-12">
            <div class="card bg-white staff-card h-100 ${!isActive ? 'opacity-75' : ''}">
                <div class="position-relative text-center pb-3 border-bottom">
                    ${avatarHtml}
                    <h5 class="fw-bold text-navy mt-3 mb-0">${escapeHTML(staff.full_name)}</h5>
                    <p class="text-muted small mb-2">${escapeHTML(staff.specialization || roleName)}</p>
                    <div class="d-flex justify-content-center gap-2 mb-2">${statusBadge} ${loginBadge}</div>
                </div>
                <div class="card-body p-3 small text-muted">
                    <div class="mb-2"><i class="fas fa-phone text-success me-1"></i> <span dir="ltr">${escapeHTML(staff.phone)}</span></div>
                    <div class="mb-2"><i class="fas fa-money-bill-wave text-danger me-1"></i> <b>الراتب الأساسي:</b> ${salaryText}</div>
                    
                    <button class="btn btn-outline-info fw-bold w-100 mt-2 shadow-sm" onclick="viewStaffDetails('${staff.id}')">
                        <i class="fas fa-eye me-1"></i> عرض الملف بالكامل
                    </button>
                </div>
                <div class="card-footer bg-light border-0 p-2 d-flex gap-2">
                    <button class="btn btn-sm btn-primary fw-bold w-50 shadow-sm" onclick="openStaffModal('${staff.id}')"><i class="fas fa-edit"></i> تعديل</button>
                    <button class="btn btn-sm ${isActive ? 'btn-outline-danger' : 'btn-outline-success'} fw-bold w-50 shadow-sm" onclick="toggleStaffStatus('${staff.id}', ${isActive})">
                        <i class="fas ${isActive ? 'fa-user-slash' : 'fa-user-check'}"></i> ${isActive ? 'إيقاف' : 'تفعيل'}
                    </button>
                </div>
            </div>
        </div>
        `;
    }).join('');
}

// =================================================================
// 👁️ عرض بيانات الموظف (View Profile - Read Only)
// =================================================================

window.viewStaffDetails = function(id) {
    const staff = allStaff.find(s => s.id === id);
    if (!staff) return;

    // تهيئة الترويسة
    const avatarEl = document.getElementById('v_avatar_container');
    if (staff.avatar_url) {
        avatarEl.innerHTML = `<img src="${escapeHTML(staff.avatar_url)}" class="staff-avatar shadow-sm" style="width:90px; height:90px;">`;
    } else {
        avatarEl.innerHTML = `<div class="staff-avatar shadow-sm" style="width:90px; height:90px;">${escapeHTML(staff.full_name).charAt(0)}</div>`;
    }

    document.getElementById('v_full_name').innerText = escapeHTML(staff.full_name);
    document.getElementById('v_role_badge').innerHTML = `<i class="fas fa-briefcase me-1"></i> ${getRoleNameAr(staff.role)}`;
    
    let statusHtml = staff.is_active !== false ? '<span class="badge bg-success"><i class="fas fa-check"></i> نشط</span>' : '<span class="badge bg-danger"><i class="fas fa-ban"></i> موقوف</span>';
    statusHtml += staff.can_login !== false ? '<span class="badge bg-primary"><i class="fas fa-key"></i> صلاحية دخول</span>' : '<span class="badge bg-secondary"><i class="fas fa-lock"></i> محظور</span>';
    document.getElementById('v_status_badges').innerHTML = statusHtml;

    // 1. الشخصية
    document.getElementById('v_phone').innerText = escapeHTML(staff.phone || '--');
    document.getElementById('v_national_id').innerText = escapeHTML(staff.national_id || '--');
    document.getElementById('v_gender').innerText = escapeHTML(staff.gender || '--');
    document.getElementById('v_dob').innerText = escapeHTML(staff.date_of_birth || '--');
    document.getElementById('v_address').innerText = escapeHTML(staff.address || '--');
    
    if (staff.emergency_contact) {
        document.getElementById('v_em_name').innerText = escapeHTML(staff.emergency_contact.name || '--');
        document.getElementById('v_em_phone').innerText = escapeHTML(staff.emergency_contact.phone || '--');
        document.getElementById('v_em_relation').innerText = escapeHTML(staff.emergency_contact.relation || '--');
    } else {
        document.getElementById('v_em_name').innerText = '--'; document.getElementById('v_em_phone').innerText = '--'; document.getElementById('v_em_relation').innerText = '--';
    }

    // 2. المهنية
    document.getElementById('v_specialization').innerText = escapeHTML(staff.specialization || '--');
    document.getElementById('v_join_date').innerText = escapeHTML(staff.join_date || '--');
    document.getElementById('v_experience').innerText = staff.experience_years ? staff.experience_years + ' سنوات' : '--';
    document.getElementById('v_telegram_id').innerText = escapeHTML(staff.telegram_id || 'غير مرتبط');
    document.getElementById('v_syndicate_num').innerText = escapeHTML(staff.syndicate_number || '--');
    document.getElementById('v_syndicate_expiry').innerText = escapeHTML(staff.syndicate_expiry_date || '--');

    // الصلاحيات
    const permContainer = document.getElementById('v_permissions');
    if (staff.permissions) {
        let p = staff.permissions;
        let pHtml = '';
        if(p.can_delete) pHtml += '<span class="badge bg-danger shadow-sm"><i class="fas fa-trash"></i> حذف الملفات</span>';
        if(p.can_finance) pHtml += '<span class="badge bg-success shadow-sm"><i class="fas fa-wallet"></i> الوصول للمالية</span>';
        if(p.can_reports) pHtml += '<span class="badge bg-info text-dark shadow-sm"><i class="fas fa-chart-pie"></i> استخراج التقارير</span>';
        if(!pHtml) pHtml = '<span class="text-muted small">صلاحيات موظف افتراضية فقط</span>';
        permContainer.innerHTML = pHtml;
    } else {
        permContainer.innerHTML = '<span class="text-muted small">صلاحيات موظف افتراضية فقط</span>';
    }

    // 3. المالية
    if (staff.salary_details) {
        document.getElementById('v_salary').innerText = Number(staff.salary_details.basic || staff.salary_details.base_salary || 0).toLocaleString();
        document.getElementById('v_allowance').innerText = Number(staff.salary_details.allowance || 0).toLocaleString();
        document.getElementById('v_commission').innerText = staff.salary_details.commission || 0;
        document.getElementById('v_bank_name').innerText = escapeHTML(staff.salary_details.bank_name || '--');
        document.getElementById('v_bank_iban').innerText = escapeHTML(staff.salary_details.bank_iban || '--');
    } else {
        document.getElementById('v_salary').innerText = '0'; document.getElementById('v_allowance').innerText = '0'; document.getElementById('v_commission').innerText = '0';
        document.getElementById('v_bank_name').innerText = '--'; document.getElementById('v_bank_iban').innerText = '--';
    }

    // 4. الوثائق
    const docContainer = document.getElementById('v_documents_list');
    if (staff.staff_documents && Array.isArray(staff.staff_documents) && staff.staff_documents.length > 0) {
        docContainer.innerHTML = staff.staff_documents.map(doc => `
            <div class="doc-item bg-white shadow-sm border-0">
                <div class="d-flex align-items-center">
                    <i class="fas fa-file-alt text-primary fa-2x me-3"></i>
                    <div>
                        <span class="fw-bold text-dark d-block">${escapeHTML(doc.name)}</span>
                        <small class="text-muted">${new Date(doc.date).toLocaleDateString('ar-EG')}</small>
                    </div>
                </div>
                <a href="${escapeHTML(doc.url)}" target="_blank" class="btn btn-sm btn-outline-navy fw-bold rounded-pill px-3"><i class="fas fa-eye"></i> عرض الأصل</a>
            </div>
        `).join('');
    } else {
        docContainer.innerHTML = '<div class="text-center p-4 text-muted border border-dashed rounded bg-light">لا توجد وثائق مؤرشفة لهذا الموظف.</div>';
    }

    // تجهيز زر التعديل داخل نافذة العرض
    const btnEdit = document.getElementById('btn_open_edit');
    if (btnEdit) {
        btnEdit.onclick = function() {
            closeModal('viewStaffModal');
            setTimeout(() => { openStaffModal(id); }, 400); // تأخير بسيط لضمان إغلاق النافذة الأولى
        };
    }

    // إعادة التبويب الأول للنشاط
    const firstTab = new bootstrap.Tab(document.querySelector('#viewStaffTabs button[data-bs-target="#v-tab-personal"]'));
    firstTab.show();

    const modal = new bootstrap.Modal(document.getElementById('viewStaffModal'));
    modal.show();
};

// =================================================================
// 📝 إضافة وتعديل الموظفين (Edit Mode)
// =================================================================

function openStaffModal(id = null) {
    document.getElementById('staffForm').reset();
    document.getElementById('staff_id').value = '';
    document.getElementById('documents-area').classList.add('d-none');
    
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
            
            document.getElementById('s_national_id').value = staff.national_id || '';
            document.getElementById('s_gender').value = staff.gender || '';
            
            document.getElementById('s_role').value = staff.role || 'lawyer';
            document.getElementById('s_specialization').value = staff.specialization || '';
            document.getElementById('s_join_date').value = staff.join_date || '';
            document.getElementById('s_experience').value = staff.experience_years || 0;
            document.getElementById('s_syndicate_num').value = staff.syndicate_number || '';
            document.getElementById('s_syndicate_expiry').value = staff.syndicate_expiry_date || '';

            if (staff.permissions) {
                document.getElementById('perm_delete').checked = staff.permissions.can_delete || false;
                document.getElementById('perm_finance').checked = staff.permissions.can_finance || false;
                document.getElementById('perm_reports').checked = staff.permissions.can_reports || false;
            } else {
                document.getElementById('perm_delete').checked = false; document.getElementById('perm_finance').checked = false; document.getElementById('perm_reports').checked = false;
            }

            if (staff.salary_details) {
                document.getElementById('s_salary').value = staff.salary_details.basic || staff.salary_details.base_salary || '';
                document.getElementById('s_commission').value = staff.salary_details.commission || '';
                document.getElementById('s_allowance').value = staff.salary_details.allowance || '';
                document.getElementById('s_bank_name').value = staff.salary_details.bank_name || '';
                document.getElementById('s_bank_iban').value = staff.salary_details.bank_iban || '';
            }

            if (staff.emergency_contact) {
                document.getElementById('s_em_name').value = staff.emergency_contact.name || '';
                document.getElementById('s_em_phone').value = staff.emergency_contact.phone || '';
                document.getElementById('s_em_relation').value = staff.emergency_contact.relation || '';
            }

            document.getElementById('documents-area').classList.remove('d-none');
            renderStaffDocs(staff.staff_documents || []);
        }
    } else {
        currentEditingStaff = null;
    }
    
    const firstTab = new bootstrap.Tab(document.querySelector('#staffTabs button[data-bs-target="#tab-personal"]'));
    firstTab.show();

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
        national_id: document.getElementById('s_national_id').value || null,
        gender: document.getElementById('s_gender').value || null,
        date_of_birth: document.getElementById('s_dob').value || null,
        avatar_url: document.getElementById('s_avatar').value || null,
        address: document.getElementById('s_address').value || null,
        role: document.getElementById('s_role').value,
        specialization: document.getElementById('s_specialization').value || null,
        join_date: document.getElementById('s_join_date').value || null,
        experience_years: parseInt(document.getElementById('s_experience').value) || 0,
        syndicate_number: document.getElementById('s_syndicate_num').value || null,
        syndicate_expiry_date: document.getElementById('s_syndicate_expiry').value || null,
        
        permissions: {
            can_delete: document.getElementById('perm_delete').checked,
            can_finance: document.getElementById('perm_finance').checked,
            can_reports: document.getElementById('perm_reports').checked
        },
        
        salary_details: {
            basic: document.getElementById('s_salary').value || 0,
            commission: document.getElementById('s_commission').value || 0,
            allowance: document.getElementById('s_allowance').value || 0,
            bank_name: document.getElementById('s_bank_name').value || '',
            bank_iban: document.getElementById('s_bank_iban').value || ''
        },
        
        emergency_contact: {
            name: document.getElementById('s_em_name').value || '',
            phone: document.getElementById('s_em_phone').value || '',
            relation: document.getElementById('s_em_relation').value || ''
        }
    };

    try {
        let res;
        if (id) {
            res = await API.updateStaff(id, data);
            if(res && !res.error) {
                Swal.fire({toast: true, position: 'top-end', icon: res.offline ? 'warning' : 'success', title: res.offline ? 'تم الحفظ محلياً (Offline)' : 'تم التحديث بنجاح', showConfirmButton: false, timer: 2000});
            }
        } else {
            data.is_active = true;
            data.can_login = true;
            res = await API.addStaff(data);
            if(res && !res.error) {
                Swal.fire({toast: true, position: 'top-end', icon: res.offline ? 'warning' : 'success', title: res.offline ? 'تم الإضافة للطابور المحلي' : 'تمت إضافة الموظف بنجاح', showConfirmButton: false, timer: 2000});
            }
        }
        
        if(res && res.error) throw new Error(res.error);
        
        closeModal('staffModal');
        await loadStaff();
    } catch (err) {
        Swal.fire('خطأ', err.message || 'تعذر حفظ بيانات الموظف.', 'error');
    } finally {
        btn.disabled = false; btn.innerHTML = '<i class="fas fa-save me-1"></i> حفظ بيانات الموظف';
    }
}

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
        const res = await API.updateStaff(id, { is_active: newStatus, can_login: newStatus });
        if(res && !res.error) {
            Swal.fire({toast: true, position: 'top-end', icon: res.offline ? 'warning' : 'success', title: res.offline ? 'تم الحفظ محلياً' : `تم ${actionName} الموظف بنجاح`, showConfirmButton: false, timer: 2000});
            await loadStaff();
        } else {
            throw new Error(res?.error || 'حدث خطأ');
        }
    } catch (err) {
        Swal.fire('خطأ', 'تعذر تغيير حالة الموظف: ' + err.message, 'error');
    }
}

// ----------------- الذكاء الاصطناعي للهويات والوثائق -----------------
function openAiIdModal() {
    document.getElementById('ai_id_text').value = '';
    const m = new bootstrap.Modal(document.getElementById('aiIdModal'));
    m.show();
}

async function processIdAI() {
    if (!navigator.onLine) {
        Swal.fire('تنبيه', 'لا يمكن استخدام الذكاء الاصطناعي أثناء انقطاع الإنترنت.', 'warning');
        return;
    }

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
            closeModal('aiIdModal');
        } else {
            Swal.fire('خطأ', 'لم يتمكن الذكاء الاصطناعي من فهم النص.', 'error');
        }
    } catch (err) {
        Swal.fire('خطأ', 'فشل الاتصال بالمحرك الذكي', 'error');
    } finally {
        btn.disabled = false; btn.innerHTML = '<i class="fas fa-magic me-1"></i> تحليل وملء الحقول';
    }
}

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
    if (!navigator.onLine) {
        Swal.fire('تنبيه', 'لا يمكن رفع الملفات السحابية أثناء انقطاع الإنترنت.', 'warning');
        return;
    }

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
            
            const res = await API.updateStaff(currentEditingStaff.id, { staff_documents: currentDocs });
            if(res && !res.error) {
                currentEditingStaff.staff_documents = currentDocs; // تحديث محلي
                
                document.getElementById('doc_file').value = '';
                document.getElementById('doc_name').value = '';
                renderStaffDocs(currentDocs);
                Swal.fire({toast: true, position: 'top-end', icon: 'success', title: 'تمت الأرشفة', showConfirmButton: false, timer: 2000});
            } else {
                throw new Error(res?.error || 'خطأ في التحديث');
            }
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
        const res = await API.updateStaff(currentEditingStaff.id, { staff_documents: currentDocs });
        if(res && !res.error) {
            currentEditingStaff.staff_documents = currentDocs;
            renderStaffDocs(currentDocs);
            Swal.fire({toast: true, position: 'top-end', icon: res.offline ? 'warning' : 'success', title: res.offline ? 'تم الحذف محلياً' : 'تم الحذف بنجاح', showConfirmButton: false, timer: 2000});
        } else {
            throw new Error(res?.error || 'خطأ في الحذف');
        }
    } catch (err) {
        Swal.fire('خطأ', 'تعذر حذف الوثيقة: ' + err.message, 'error');
    }
}

function filterStaffList() {
    const q = document.getElementById('search_staff').value.toLowerCase();
    if (!q) {
        renderStaffCards();
        return;
    }
    const filtered = allStaff.filter(s => 
        (s.full_name && s.full_name.toLowerCase().includes(q)) ||
        (s.specialization && s.specialization.toLowerCase().includes(q)) ||
        (s.phone && s.phone.includes(q))
    );
    
    // فلترة وعرض الكروت
    const container = document.getElementById('staff-container');
    if (filtered.length === 0) {
        container.innerHTML = '<div class="col-12 text-center p-4 text-muted bg-white rounded border">لا توجد نتائج تطابق البحث.</div>';
        return;
    }

    container.innerHTML = filtered.map(staff => {
        const isActive = staff.is_active !== false;
        const canLogin = staff.can_login !== false;
        let statusBadge = isActive ? '<span class="badge bg-success shadow-sm px-2"><i class="fas fa-check-circle"></i> نشط</span>' : '<span class="badge bg-danger shadow-sm px-2"><i class="fas fa-ban"></i> موقوف</span>';
        let loginBadge = canLogin ? '<span class="badge bg-soft-primary text-primary border border-primary px-2"><i class="fas fa-key"></i> وصول</span>' : '<span class="badge bg-light text-muted border px-2"><i class="fas fa-lock"></i> مسحوب</span>';
        let roleName = getRoleNameAr(staff.role);
        let avatarHtml = staff.avatar_url ? `<img src="${escapeHTML(staff.avatar_url)}" class="staff-avatar mt-3 shadow-sm">` : `<div class="staff-avatar mt-3 shadow-sm">${escapeHTML(staff.full_name).charAt(0)}</div>`;
        let salaryText = '--';
        if (staff.salary_details && typeof staff.salary_details === 'object') {
            salaryText = `${Number(staff.salary_details.basic || staff.salary_details.base_salary || 0).toLocaleString()} د.أ`;
        }

        return `
        <div class="col-lg-4 col-md-6 col-sm-12">
            <div class="card bg-white staff-card h-100 ${!isActive ? 'opacity-75' : ''}">
                <div class="position-relative text-center pb-3 border-bottom">
                    ${avatarHtml}
                    <h5 class="fw-bold text-navy mt-3 mb-0">${escapeHTML(staff.full_name)}</h5>
                    <p class="text-muted small mb-2">${escapeHTML(staff.specialization || roleName)}</p>
                    <div class="d-flex justify-content-center gap-2 mb-2">${statusBadge} ${loginBadge}</div>
                </div>
                <div class="card-body p-3 small text-muted">
                    <div class="mb-2"><i class="fas fa-phone text-success me-1"></i> <span dir="ltr">${escapeHTML(staff.phone)}</span></div>
                    <div class="mb-2"><i class="fas fa-money-bill-wave text-danger me-1"></i> <b>الراتب الأساسي:</b> ${salaryText}</div>
                    <button class="btn btn-outline-info fw-bold w-100 mt-2 shadow-sm" onclick="viewStaffDetails('${staff.id}')"><i class="fas fa-eye me-1"></i> عرض الملف بالكامل</button>
                </div>
                <div class="card-footer bg-light border-0 p-2 d-flex gap-2">
                    <button class="btn btn-sm btn-primary fw-bold w-50 shadow-sm" onclick="openStaffModal('${staff.id}')"><i class="fas fa-edit"></i> تعديل</button>
                    <button class="btn btn-sm ${isActive ? 'btn-outline-danger' : 'btn-outline-success'} fw-bold w-50 shadow-sm" onclick="toggleStaffStatus('${staff.id}', ${isActive})"><i class="fas ${isActive ? 'fa-user-slash' : 'fa-user-check'}"></i> ${isActive ? 'إيقاف' : 'تفعيل'}</button>
                </div>
            </div>
        </div>
        `;
    }).join('');
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