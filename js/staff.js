// js/staff.js - المحرك الشامل لإدارة الموارد البشرية والرواتب (HR & Payroll)
// التحديثات: دعم JSONB للرواتب والصلاحيات، إحصائيات حية، ونظام الحماية للمدراء فقط

let staffList = [];
let currentStaffId = null;

const escapeHTML = (str) => {
    if (str === null || str === undefined) return '';
    return str.toString().replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
};

window.onload = async () => {
    // 1. الحماية المطلقة: التحقق من أن المستخدم مدير
    const userStr = localStorage.getItem(CONFIG.USER_KEY || 'moakkil_user');
    if (!userStr) {
        window.location.href = 'login.html';
        return;
    }
    const currentUser = JSON.parse(userStr);
    if (currentUser.role !== 'admin' && currentUser.role !== 'super_admin' && currentUser.role !== 'superadmin') {
        Swal.fire({
            icon: 'error',
            title: 'مرفوض',
            text: 'صلاحية الوصول لصفحة الموارد البشرية مقتصرة على مدراء المكتب فقط.'
        }).then(() => {
            window.location.href = 'app.html';
        });
        return;
    }

    applyFirmSettings();
    await loadStaffData();
};

function applyFirmSettings() {
    const settings = JSON.parse(localStorage.getItem('firm_settings'));
    if (!settings) return;
    const root = document.documentElement;
    if (settings.primary_color) root.style.setProperty('--navy', settings.primary_color);
    if (settings.accent_color) root.style.setProperty('--accent', settings.accent_color);
}

// =================================================================
// 📥 جلب البيانات والإحصائيات
// =================================================================

async function loadStaffData() {
    const syncIcon = document.getElementById('sync-icon');
    if(syncIcon) syncIcon.classList.add('fa-spin');
    
    document.getElementById('loadingIndicator').style.display = 'block';
    document.getElementById('staffListContainer').style.display = 'none';

    try {
        const res = await API.getStaff();
        staffList = Array.isArray(res) ? res : [];
        
        updateDashboardStats();
        renderStaffList(staffList);

    } catch (error) {
        console.error("Staff load error:", error);
        Swal.fire('خطأ', 'حدث خطأ أثناء جلب بيانات الموظفين', 'error');
    } finally {
        if(syncIcon) syncIcon.classList.remove('fa-spin');
        document.getElementById('loadingIndicator').style.display = 'none';
        document.getElementById('staffListContainer').style.display = 'flex';
    }
}

function updateDashboardStats() {
    document.getElementById('stat_total_staff').innerText = staffList.length;
    
    const activeStaff = staffList.filter(s => s.is_active !== false && s.can_login === true).length;
    document.getElementById('stat_active_staff').innerText = activeStaff;

    let totalPayroll = 0;
    staffList.forEach(s => {
        if (s.salary_details && typeof s.salary_details === 'object') {
            const base = Number(s.salary_details.base_salary) || 0;
            const allowance = Number(s.salary_details.allowance) || 0;
            totalPayroll += (base + allowance);
        }
    });
    document.getElementById('stat_total_payroll').innerText = totalPayroll.toLocaleString();
}

function getRoleNameAr(role) {
    if (role === 'admin' || role === 'super_admin' || role === 'superadmin') return 'مدير (Admin)';
    if (role === 'lawyer') return 'محامي / مستشار';
    if (role === 'secretary') return 'سكرتاريا / إداري';
    return role || 'موظف';
}

// =================================================================
// 🎨 عرض بطاقات الموظفين (Render UI)
// =================================================================

function renderStaffList(listToRender) {
    const container = document.getElementById('staffListContainer');
    
    if (listToRender.length === 0) {
        container.innerHTML = '<div class="col-12 text-center text-muted p-5 bg-white rounded border border-dashed">لا يوجد موظفين لعرضهم.</div>';
        return;
    }

    container.innerHTML = listToRender.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map(staff => {
        const isActive = staff.can_login;
        const statusBadge = isActive 
            ? '<span class="badge bg-success rounded-pill shadow-sm px-2 py-1"><i class="fas fa-check-circle me-1"></i> حساب نشط</span>'
            : '<span class="badge bg-danger rounded-pill shadow-sm px-2 py-1"><i class="fas fa-ban me-1"></i> حساب موقوف</span>';
            
        const avatarLetter = (staff.full_name || 'م').charAt(0).toUpperCase();
        
        let salaryText = '--';
        if (staff.salary_details && typeof staff.salary_details === 'object') {
            salaryText = `${Number(staff.salary_details.base_salary || 0).toLocaleString()} د.أ`;
        }

        return `
        <div class="col-md-6 col-lg-4 col-12">
            <div class="card-custom staff-card p-3 h-100 bg-white position-relative">
                <div class="d-flex justify-content-between align-items-start mb-3">
                    <div class="d-flex align-items-center">
                        <div class="avatar-circle me-3 shadow-sm">${avatarLetter}</div>
                        <div>
                            <h6 class="fw-bold text-navy mb-1 text-truncate" style="max-width: 150px;" title="${escapeHTML(staff.full_name)}">${escapeHTML(staff.full_name)}</h6>
                            <small class="text-muted fw-bold d-block">${getRoleNameAr(staff.role)}</small>
                        </div>
                    </div>
                    <div>${statusBadge}</div>
                </div>
                
                <div class="bg-light p-2 rounded mb-3 small border">
                    <div class="d-flex justify-content-between mb-1">
                        <span class="text-muted"><i class="fas fa-phone-alt me-1"></i> الهاتف:</span>
                        <span class="fw-bold text-dark" dir="ltr">${escapeHTML(staff.phone)}</span>
                    </div>
                    <div class="d-flex justify-content-between mb-1">
                        <span class="text-muted"><i class="fas fa-briefcase me-1"></i> التخصص:</span>
                        <span class="fw-bold text-dark text-truncate" style="max-width:100px;">${escapeHTML(staff.specialization || '--')}</span>
                    </div>
                    <div class="d-flex justify-content-between text-danger">
                        <span class="text-danger"><i class="fas fa-money-bill-wave me-1"></i> الراتب الأساسي:</span>
                        <span class="fw-bold">${salaryText}</span>
                    </div>
                </div>
                
                <div class="d-flex gap-2">
                    <button class="btn btn-sm btn-outline-navy fw-bold w-100 shadow-sm" onclick="openStaffModal('${staff.id}')"><i class="fas fa-user-edit me-1"></i> تعديل الملف</button>
                </div>
            </div>
        </div>
        `;
    }).join('');
}

function filterStaffList() {
    const q = document.getElementById('search_staff').value.toLowerCase();
    if (!q) {
        renderStaffList(staffList);
        return;
    }
    const filtered = staffList.filter(s => 
        (s.full_name && s.full_name.toLowerCase().includes(q)) ||
        (s.specialization && s.specialization.toLowerCase().includes(q)) ||
        (s.phone && s.phone.includes(q))
    );
    renderStaffList(filtered);
}

// =================================================================
// 📝 إدارة نموذج الموظف (Modal & Form)
// =================================================================

function openStaffModal(id = null) {
    const form = document.getElementById('staffForm');
    form.reset();
    currentStaffId = id;

    // Reset Tabs to first one
    const firstTab = new bootstrap.Tab(document.querySelector('#staffTabs button[data-bs-target="#tab-basic"]'));
    firstTab.show();

    if (id) {
        // Edit Mode
        const staff = staffList.find(s => s.id === id);
        if (staff) {
            document.getElementById('staff_id').value = staff.id;
            
            // Basic
            document.getElementById('stf_full_name').value = staff.full_name || '';
            document.getElementById('stf_phone').value = staff.phone || '';
            document.getElementById('stf_national_id').value = staff.national_id || '';
            document.getElementById('stf_dob').value = staff.date_of_birth || '';
            document.getElementById('stf_gender').value = staff.gender || '';
            document.getElementById('stf_address').value = staff.address || '';
            
            if (staff.emergency_contact) {
                document.getElementById('stf_emg_name').value = staff.emergency_contact.name || '';
                document.getElementById('stf_emg_phone').value = staff.emergency_contact.phone || '';
            }

            // Job
            document.getElementById('stf_role').value = staff.role || 'lawyer';
            document.getElementById('stf_specialization').value = staff.specialization || '';
            document.getElementById('stf_join_date').value = staff.join_date || '';
            document.getElementById('stf_exp_years').value = staff.experience_years || '';
            document.getElementById('stf_syndicate_num').value = staff.syndicate_number || '';
            document.getElementById('stf_syndicate_exp').value = staff.syndicate_expiry_date || '';
            
            document.getElementById('stf_can_login').checked = staff.can_login !== false;

            if (staff.permissions) {
                document.getElementById('perm_delete').checked = staff.permissions.can_delete || false;
                document.getElementById('perm_finance').checked = staff.permissions.can_finance || false;
                document.getElementById('perm_reports').checked = staff.permissions.can_reports || false;
            }

            // Financial
            if (staff.salary_details) {
                document.getElementById('stf_base_salary').value = staff.salary_details.base_salary || '';
                document.getElementById('stf_allowance').value = staff.salary_details.allowance || '';
                document.getElementById('stf_commission').value = staff.salary_details.commission || '';
                document.getElementById('stf_bank_name').value = staff.salary_details.bank_name || '';
                document.getElementById('stf_bank_iban').value = staff.salary_details.bank_iban || '';
            }
        }
    } else {
        // Add Mode
        document.getElementById('staff_id').value = '';
        document.getElementById('stf_can_login').checked = true;
    }

    const modal = new bootstrap.Modal(document.getElementById('staffModal'));
    modal.show();
}

async function saveStaff(event) {
    event.preventDefault();
    const btn = document.getElementById('btn_save_staff');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> جاري الحفظ...';

    // هيكلة بيانات JSONB الخاصة بجدول mo_users
    const emergencyContact = {
        name: document.getElementById('stf_emg_name').value,
        phone: document.getElementById('stf_emg_phone').value
    };

    const permissions = {
        can_delete: document.getElementById('perm_delete').checked,
        can_finance: document.getElementById('perm_finance').checked,
        can_reports: document.getElementById('perm_reports').checked
    };

    const salaryDetails = {
        base_salary: Number(document.getElementById('stf_base_salary').value) || 0,
        allowance: Number(document.getElementById('stf_allowance').value) || 0,
        commission: Number(document.getElementById('stf_commission').value) || 0,
        bank_name: document.getElementById('stf_bank_name').value,
        bank_iban: document.getElementById('stf_bank_iban').value
    };

    const data = {
        full_name: document.getElementById('stf_full_name').value,
        phone: document.getElementById('stf_phone').value,
        national_id: document.getElementById('stf_national_id').value || null,
        date_of_birth: document.getElementById('stf_dob').value || null,
        gender: document.getElementById('stf_gender').value || null,
        address: document.getElementById('stf_address').value || null,
        emergency_contact: emergencyContact,
        
        role: document.getElementById('stf_role').value,
        specialization: document.getElementById('stf_specialization').value || null,
        join_date: document.getElementById('stf_join_date').value || null,
        experience_years: document.getElementById('stf_exp_years').value ? Number(document.getElementById('stf_exp_years').value) : null,
        syndicate_number: document.getElementById('stf_syndicate_num').value || null,
        syndicate_expiry_date: document.getElementById('stf_syndicate_exp').value || null,
        
        can_login: document.getElementById('stf_can_login').checked,
        permissions: permissions,
        salary_details: salaryDetails,
        
        is_active: true // افتراضي دائماً للموظف الموجود
    };

    try {
        let res;
        if (currentStaffId) {
            // Update
            res = await API.patch(`/api/users?id=eq.${currentStaffId}`, data);
        } else {
            // Create
            res = await API.post('/api/users', data);
        }

        if (res && !res.error) {
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: 'تم حفظ بيانات الموظف بنجاح',
                showConfirmButton: false,
                timer: 2000
            });
            const m = bootstrap.Modal.getInstance(document.getElementById('staffModal'));
            if(m) m.hide();
            await loadStaffData(); // تحديث القائمة والإحصائيات
        } else {
            throw new Error(res?.error || 'فشل في عملية الحفظ');
        }
    } catch (err) {
        Swal.fire('خطأ', err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save me-1"></i> حفظ بيانات الموظف';
    }
}