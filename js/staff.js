/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: js/staff.js
 * الوصف: محرك إدارة الموارد البشرية والموظفين (HR Engine - R2 & Offline Edition)
 * التصميم: متوافق 100% مع الهوية الناعمة والمدمجة (Soft & Compact UI)
 * ============================================================================
 * الكتل البرمجية:
 * [1] المتغيرات العامة والتهيئة (Globals & Initialization)
 * [2] دوال الحماية والمساعدة (Security & Helpers)
 * [3] جلب وعرض البيانات (Fetch & Render)
 * [4] عرض ملف الموظف (View Profile - Read Only)
 * [5] الإضافة، التعديل، والحفظ (Add, Edit, Save)
 * [6] الذكاء الاصطناعي للموارد البشرية (AI ID Extractor)
 * [7] إدارة الوثائق السحابية (R2 Cloud Documents)
 * ============================================================================
 */

// ============================================================================
// [1] المتغيرات العامة والتهيئة (Globals & Initialization)
// ============================================================================
let allStaff = [];
let currentEditingStaff = null;

window.onload = async () => {
    // 1. تطبيق هوية المكتب البصرية
    applyFirmSettings();
    
    // 2. التحقق من الجلسة
    const userStr = localStorage.getItem(CONFIG.USER_KEY || 'moakkil_user');
    if (!userStr) { 
        window.location.href = 'login.html'; 
        return; 
    }
    
    // 3. حماية المسار (Route Guard) - مدراء المكتب فقط
    const user = JSON.parse(userStr);
    if (user.role !== 'admin' && user.role !== 'مدير' && user.role !== 'super_admin') {
        Swal.fire({
            icon: 'error', 
            title: 'مرفوض أمنياً', 
            text: 'صلاحية الدخول لقسم الموارد البشرية مقتصرة على مدراء وشركاء المكتب فقط.',
            confirmButtonColor: 'var(--primary-dark)'
        }).then(() => window.location.href = 'app.html');
        return;
    }
    
    // 4. جلب بيانات الكوادر
    await loadStaff();
};

// ============================================================================
// [2] دوال الحماية والمساعدة (Security & Helpers)
// ============================================================================

// تعقيم النصوص لمنع ثغرات XSS
const escapeHTML = (str) => {
    if (str === null || str === undefined) return '';
    return str.toString().replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
};

// تطبيق الألوان المخزنة محلياً (White-labeling)
function applyFirmSettings() {
    const settings = JSON.parse(localStorage.getItem('firm_settings') || '{}');
    if (!settings) return;
    const root = document.documentElement;
    if (settings.primary_color) root.style.setProperty('--navy', settings.primary_color);
    if (settings.accent_color) root.style.setProperty('--accent', settings.accent_color);
}

// ترجمة المسميات الوظيفية
function getRoleNameAr(role) {
    if (role === 'admin' || role === 'super_admin' || role === 'superadmin') return 'مدير / شريك';
    if (role === 'lawyer') return 'محامي / مستشار';
    if (role === 'secretary') return 'سكرتاريا / إداري';
    return role || 'موظف';
}

// إغلاق النوافذ المنبثقة برمجياً بطريقة نظيفة
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

// تسجيل بصمة الجهاز الحالي
window.registerDeviceBiometric = async () => {
    if (!navigator.onLine) {
        Swal.fire({icon: 'warning', title: 'تنبيه', text: 'لا يمكن تفعيل البصمة أثناء انقطاع الإنترنت، يرجى الاتصال بالشبكة أولاً.', confirmButtonColor: 'var(--primary-dark)'});
        return;
    }
    try {
        Swal.fire({title: 'جاري إعداد البصمة...', text: 'يرجى تأكيد هويتك عبر مستشعر جهازك', allowOutsideClick: false, didOpen: () => Swal.showLoading()});
        const res = await AUTH.registerBiometric(); // تم التعديل لتستدعي דالة AUTH بدلا من API
        Swal.fire({icon: 'success', title: 'نجاح', text: res.message || 'تم تسجيل بصمة جهازك بنجاح', confirmButtonColor: 'var(--success-luxury)'});
    } catch (err) {
        Swal.fire({icon: 'error', title: 'خطأ', text: err.message || 'فشل إعداد البصمة', confirmButtonColor: 'var(--danger-luxury)'});
    }
};

// ============================================================================
// [3] جلب وعرض البيانات (Fetch & Render)
// ============================================================================

window.loadStaff = async function() {
    const container = document.getElementById('staff-container');
    container.innerHTML = `
        <div class="col-12 text-center p-5 text-navy fw-bold bg-white rounded-4 border-0 shadow-sm fade-in">
            <i class="fas fa-spinner fa-spin fa-3x mb-3" style="color: var(--accent);"></i>
            <br><span class="fs-5">جاري تحميل وتشفير بيانات الكوادر...</span>
        </div>`;
    
    try {
        const res = await API.getStaff();
        allStaff = Array.isArray(res) ? res : [];
        renderStaffCards();
    } catch (e) {
        container.innerHTML = `
            <div class="col-12 text-center p-5 text-danger fw-bold bg-danger bg-opacity-10 rounded-4 shadow-sm border border-danger border-opacity-25 fade-in">
                <i class="fas fa-wifi-slash fa-3x mb-3"></i><br>
                حدث خطأ في تحميل البيانات من الخادم السحابي.
            </div>`;
    }
};

function renderStaffCards() {
    const container = document.getElementById('staff-container');
    if (allStaff.length === 0) {
        container.innerHTML = `
            <div class="col-12 text-center p-5 text-muted bg-white rounded-4 border-0 shadow-sm fw-bold fade-in">
                <i class="fas fa-users-slash fa-4x mb-3 opacity-25" style="color: var(--navy);"></i>
                <br><span class="fs-5">لا يوجد موظفين مسجلين في النظام حالياً.</span>
            </div>`;
        return;
    }

    container.innerHTML = allStaff.map(staff => {
        const isActive = staff.is_active !== false;
        const canLogin = staff.can_login !== false;
        
        let statusBadge = isActive ? '<span class="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 shadow-sm px-3 py-1 rounded-pill"><i class="fas fa-check-circle me-1"></i> نشط</span>' : '<span class="badge bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25 shadow-sm px-3 py-1 rounded-pill"><i class="fas fa-ban me-1"></i> موقوف</span>';
        let loginBadge = canLogin ? '<span class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 shadow-sm px-3 py-1 rounded-pill"><i class="fas fa-key me-1"></i> وصول</span>' : '<span class="badge bg-secondary bg-opacity-10 text-dark border border-secondary border-opacity-25 shadow-sm px-3 py-1 rounded-pill"><i class="fas fa-lock me-1"></i> محظور</span>';
        let roleName = getRoleNameAr(staff.role);
        
        // 🛡️ معالجة الصور الصارمة (Anti-Distortion Engine)
        let avatarHtml = '';
        const avatarStyle = "width: 75px; height: 75px; object-fit: cover; border-radius: 50%; flex-shrink: 0;";
        const placeholderStyle = "width: 75px; height: 75px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 2rem; background: var(--navy); color: white;";
        
        if (staff.avatar_url) {
            if (staff.avatar_url.startsWith('http')) {
                avatarHtml = `<img src="${escapeHTML(staff.avatar_url)}" class="shadow-sm border border-3 border-white" style="${avatarStyle}" onerror="this.onerror=null; this.outerHTML='<div class=\\'shadow-sm border border-3 border-white\\' style=\\'${placeholderStyle}\\'>${escapeHTML(staff.full_name).charAt(0)}</div>';">`;
            } else {
                avatarHtml = `<img src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" data-r2-key="${escapeHTML(staff.avatar_url)}" class="shadow-sm border border-3 border-white" style="${avatarStyle}" onerror="this.onerror=null; this.outerHTML='<div class=\\'shadow-sm border border-3 border-white\\' style=\\'${placeholderStyle}\\'>${escapeHTML(staff.full_name).charAt(0)}</div>';">`;
            }
        } else {
            avatarHtml = `<div class="shadow-sm border border-3 border-white" style="${placeholderStyle}">${escapeHTML(staff.full_name).charAt(0)}</div>`;
        }

        let salaryText = '--';
        if (staff.salary_details && typeof staff.salary_details === 'object') {
            salaryText = `${Number(staff.salary_details.basic || staff.salary_details.base_salary || 0).toLocaleString()} د.أ`;
        }

        return `
        <div class="col-lg-4 col-md-6 col-sm-12 fade-in mb-3">
            <div class="compact-card p-4 text-center shadow-sm h-100 bg-white d-flex flex-column transition-hover ${!isActive ? 'opacity-75' : ''}" style="border: 2px solid transparent;" onmouseover="this.style.borderColor='var(--navy)'" onmouseout="this.style.borderColor='transparent'">
                <div class="position-relative pb-3 border-bottom mb-3 d-flex flex-column align-items-center">
                    ${avatarHtml}
                    <h5 class="fw-bold text-navy mt-3 mb-1 lh-base">${escapeHTML(staff.full_name)}</h5>
                    <p class="text-muted small mb-3 fw-bold">${escapeHTML(staff.specialization || roleName)}</p>
                    <div class="d-flex justify-content-center gap-2">${statusBadge} ${loginBadge}</div>
                </div>
                <div class="card-data-grid text-start w-100 mb-3" style="border-top: none; padding-top: 0;">
                    <div class="data-item full-width">
                        <i class="fas fa-phone-alt text-success"></i> <span class="font-monospace fw-bold" dir="ltr">${escapeHTML(staff.phone)}</span>
                    </div>
                    <div class="data-item full-width">
                        <i class="fas fa-money-bill-wave text-danger"></i> الراتب: <span class="text-dark fw-bold font-monospace">${salaryText}</span>
                    </div>
                </div>
                <div class="mt-auto d-flex flex-column gap-2">
                    <button class="btn btn-sm btn-outline-primary bg-white fw-bold w-100 shadow-sm rounded-pill py-2" onclick="viewStaffDetails('${staff.id}')">
                        <i class="fas fa-eye me-1"></i> عرض الملف بالكامل
                    </button>
                    <div class="d-flex gap-2 mt-1">
                        <button class="btn btn-sm btn-light border text-navy fw-bold w-50 shadow-sm rounded-pill py-2" onclick="openStaffModal('${staff.id}')"><i class="fas fa-edit"></i> تعديل</button>
                        <button class="btn btn-sm ${isActive ? 'btn-outline-danger' : 'btn-outline-success'} bg-white fw-bold w-50 shadow-sm rounded-pill py-2" onclick="toggleStaffStatus('${staff.id}', ${isActive})">
                            <i class="fas ${isActive ? 'fa-user-slash' : 'fa-user-check'}"></i> ${isActive ? 'إيقاف' : 'تفعيل'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
        `;
    }).join('');

    // تفعيل جلب الصور المحمية بعد رسم البطاقات بـ 100 ملي ثانية
    setTimeout(loadR2Images, 100);
}

// محرك جلب الصور المحمية من Cloudflare R2 وتحويلها إلى Blob لتعرض بأمان دون كشف الرابط
async function loadR2Images() {
    const imgs = document.querySelectorAll('img[data-r2-key]');
    const token = localStorage.getItem(CONFIG.TOKEN_KEY || 'moakkil_token');
    const baseUrl = window.API_BASE_URL || CONFIG.API_URL || '';
    
    for(let img of imgs) {
        const key = img.getAttribute('data-r2-key');
        if (!key) continue;
        
        try {
            const res = await fetch(`${baseUrl}/api/r2/download?key=${encodeURIComponent(key)}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const blob = await res.blob();
                img.src = URL.createObjectURL(blob);
                img.removeAttribute('data-r2-key');
            } else {
                img.outerHTML = `<div class='shadow-sm border border-3 border-white' style='width: ${img.style.width}; height: ${img.style.height}; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 2rem; background: var(--navy); color: white;'>?</div>`;
            }
        } catch(e) {
            img.outerHTML = `<div class='shadow-sm border border-3 border-white' style='width: ${img.style.width}; height: ${img.style.height}; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 2rem; background: var(--navy); color: white;'>?</div>`;
        }
    }
}

// فلترة القائمة (بحث)
window.filterStaffList = function() {
    const q = document.getElementById('search_staff').value.toLowerCase();
    if (!q) { renderStaffCards(); return; }
    
    const filtered = allStaff.filter(s => 
        (s.full_name && s.full_name.toLowerCase().includes(q)) ||
        (s.specialization && s.specialization.toLowerCase().includes(q)) ||
        (s.phone && s.phone.includes(q))
    );
    
    const container = document.getElementById('staff-container');
    if (filtered.length === 0) {
        container.innerHTML = '<div class="col-12 text-center p-5 text-muted bg-white rounded-4 border-0 shadow-sm fw-bold fade-in"><i class="fas fa-search-minus fa-3x mb-3 opacity-25"></i><br><span class="fs-5">لا توجد نتائج تطابق البحث.</span></div>';
        return;
    }
    
    const originalStaff = [...allStaff];
    allStaff = filtered;
    renderStaffCards();
    allStaff = originalStaff; // استعادة القائمة الأصلية للبحث القادم
};

// ============================================================================
// [4] عرض ملف الموظف (View Profile - Read Only)
// ============================================================================

window.viewStaffDetails = function(id) {
    const staff = allStaff.find(s => s.id === id);
    if (!staff) return;

    // 🛡️ حقن الصورة الصارمة لمنع التشوه
    const avatarEl = document.getElementById('v_avatar_container');
    const vAvatarStyle = "width: 100px; height: 100px; object-fit: cover; border-radius: 50%; flex-shrink: 0;";
    const vPlaceholderStyle = "width: 100px; height: 100px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 3rem; background: var(--navy); color: white;";

    if (staff.avatar_url) {
        if (staff.avatar_url.startsWith('http')) {
            avatarEl.innerHTML = `<img src="${escapeHTML(staff.avatar_url)}" class="shadow-sm border border-3 border-white" style="${vAvatarStyle}" onerror="this.onerror=null; this.outerHTML='<div class=\\'shadow-sm border border-3 border-white\\' style=\\'${vPlaceholderStyle}\\'>${escapeHTML(staff.full_name).charAt(0)}</div>';">`;
        } else {
            avatarEl.innerHTML = `<img src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" data-r2-key="${escapeHTML(staff.avatar_url)}" class="shadow-sm border border-3 border-white" style="${vAvatarStyle}" onerror="this.onerror=null; this.outerHTML='<div class=\\'shadow-sm border border-3 border-white\\' style=\\'${vPlaceholderStyle}\\'>${escapeHTML(staff.full_name).charAt(0)}</div>';">`;
        }
    } else {
        avatarEl.innerHTML = `<div class="shadow-sm border border-3 border-white" style="${vPlaceholderStyle}">${escapeHTML(staff.full_name).charAt(0)}</div>`;
    }

    // حقن العناوين والحالات
    document.getElementById('v_full_name').innerText = escapeHTML(staff.full_name);
    document.getElementById('v_role_badge').innerHTML = `<i class="fas fa-briefcase me-1"></i> ${getRoleNameAr(staff.role)}`;
    
    // شارات تفصيلية بنمط Soft UI
    let statusHtml = staff.is_active !== false 
        ? '<span class="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 px-3 py-2 rounded-pill shadow-sm"><i class="fas fa-check-circle me-1"></i> نشط</span>' 
        : '<span class="badge bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25 px-3 py-2 rounded-pill shadow-sm"><i class="fas fa-ban me-1"></i> موقوف</span>';
    
    statusHtml += staff.can_login !== false 
        ? '<span class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 px-3 py-2 rounded-pill shadow-sm ms-2"><i class="fas fa-key me-1"></i> صلاحية دخول</span>' 
        : '<span class="badge bg-secondary bg-opacity-10 text-dark border border-secondary border-opacity-25 px-3 py-2 rounded-pill shadow-sm ms-2"><i class="fas fa-lock me-1"></i> محظور</span>';
    
    document.getElementById('v_status_badges').innerHTML = statusHtml;

    // حقن تبويب: الشخصية والطوارئ
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

    // حقن تبويب: المهنية والنقابة والصلاحيات
    document.getElementById('v_specialization').innerText = escapeHTML(staff.specialization || '--');
    document.getElementById('v_join_date').innerText = escapeHTML(staff.join_date || '--');
    document.getElementById('v_experience').innerText = staff.experience_years ? staff.experience_years + ' سنوات' : '--';
    document.getElementById('v_telegram_id').innerText = escapeHTML(staff.telegram_id || 'غير مرتبط');
    document.getElementById('v_syndicate_num').innerText = escapeHTML(staff.syndicate_number || '--');
    document.getElementById('v_syndicate_expiry').innerText = escapeHTML(staff.syndicate_expiry_date || '--');

    const permContainer = document.getElementById('v_permissions');
    if (staff.permissions) {
        let p = staff.permissions;
        let pHtml = '';
        if(p.can_delete) pHtml += '<span class="badge bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25 shadow-sm px-3 py-2 rounded-pill mb-1"><i class="fas fa-trash me-1"></i> حذف الملفات</span> ';
        if(p.can_finance) pHtml += '<span class="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 shadow-sm px-3 py-2 rounded-pill mb-1"><i class="fas fa-wallet me-1"></i> الوصول للمالية</span> ';
        if(p.can_reports) pHtml += '<span class="badge bg-info bg-opacity-10 text-info border border-info border-opacity-25 shadow-sm px-3 py-2 rounded-pill mb-1"><i class="fas fa-chart-pie me-1"></i> استخراج التقارير</span> ';
        if(!pHtml) pHtml = '<span class="text-muted small fw-bold"><i class="fas fa-user me-1"></i> صلاحيات موظف افتراضية فقط</span>';
        permContainer.innerHTML = pHtml;
    } else {
        permContainer.innerHTML = '<span class="text-muted small fw-bold"><i class="fas fa-user me-1"></i> صلاحيات موظف افتراضية فقط</span>';
    }

    // حقن تبويب: المالية
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

    // حقن تبويب: الوثائق والأرشيف
    const docContainer = document.getElementById('v_documents_list');
    if (staff.staff_documents && Array.isArray(staff.staff_documents) && staff.staff_documents.length > 0) {
        docContainer.innerHTML = staff.staff_documents.map(doc => {
            const isR2 = doc.url && !doc.url.startsWith('http');
            const actionBtn = isR2 
                ? `<button type="button" class="btn btn-sm btn-outline-primary bg-white fw-bold rounded-pill px-4 py-2 shadow-sm" onclick="API.downloadR2File('${escapeHTML(doc.url)}', '${escapeHTML(doc.name)}')"><i class="fas fa-shield-alt me-1 text-success"></i> تحميل مشفر</button>`
                : `<a href="${escapeHTML(doc.url)}" target="_blank" class="btn btn-sm btn-outline-primary bg-white fw-bold rounded-pill px-4 py-2 shadow-sm"><i class="fas fa-external-link-alt me-1"></i> عرض الأصل</a>`;
                
            return `
            <div class="compact-card bg-white shadow-sm border-0 d-flex justify-content-between align-items-center mb-3 p-3 rounded-4 transition-hover" style="border: 2px solid transparent !important;" onmouseover="this.style.borderColor='var(--navy)'" onmouseout="this.style.borderColor='transparent'">
                <div class="d-flex align-items-center">
                    <i class="fas fa-file-pdf text-danger fa-2x me-3 opacity-75"></i>
                    <div>
                        <span class="fw-bold text-navy d-block" style="font-size: 1rem;">${escapeHTML(doc.name)}</span>
                        <small class="text-muted fw-bold font-monospace"><i class="fas fa-calendar-alt me-1"></i> ${new Date(doc.date).toLocaleDateString('ar-EG')}</small>
                    </div>
                </div>
                ${actionBtn}
            </div>`;
        }).join('');
    } else {
        docContainer.innerHTML = '<div class="text-center p-4 text-muted border border-dashed rounded-4 bg-light fw-bold"><i class="fas fa-folder-open fa-2x mb-2 opacity-50"></i><br>لا توجد وثائق مؤرشفة لهذا الموظف.</div>';
    }

    // تجهيز زر التحرير للانتقال للوضع الآخر
    const btnEdit = document.getElementById('btn_open_edit');
    if (btnEdit) {
        btnEdit.onclick = function() {
            closeModal('viewStaffModal');
            setTimeout(() => { openStaffModal(id); }, 400); // تأخير بسيط لضمان إغلاق النافذة الأولى بسلاسة
        };
    }

    // إعادة التبويب الأول كافتراضي
    const firstTab = new bootstrap.Tab(document.querySelector('#viewStaffTabs button[data-bs-target="#v-tab-personal"]'));
    firstTab.show();

    const modal = new bootstrap.Modal(document.getElementById('viewStaffModal'));
    modal.show();

    // جلب الصورة المعروضة في النافذة إذا كانت R2
    setTimeout(loadR2Images, 100);
};

// ============================================================================
// [5] الإضافة، التعديل، والحفظ (Add, Edit, Save)
// ============================================================================

window.openStaffModal = function(id = null) {
    document.getElementById('staffForm').reset();
    document.getElementById('staff_id').value = '';
    document.getElementById('documents-area').classList.add('d-none');
    document.getElementById('s_join_date').value = new Date().toISOString().split('T')[0];

    // تصفير المفاتيح الأمنية
    if(document.getElementById('s_is_active')) document.getElementById('s_is_active').checked = true;
    if(document.getElementById('s_can_login')) document.getElementById('s_can_login').checked = true;

    if (id) {
        const staff = allStaff.find(s => s.id === id);
        if (staff) {
            currentEditingStaff = staff;
            document.getElementById('staff_id').value = staff.id;
            
            // حقن البيانات في النموذج
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

            if(document.getElementById('s_is_active')) document.getElementById('s_is_active').checked = staff.is_active !== false;
            if(document.getElementById('s_can_login')) document.getElementById('s_can_login').checked = staff.can_login !== false;

            // الصلاحيات
            if (staff.permissions) {
                document.getElementById('perm_delete').checked = staff.permissions.can_delete || false;
                document.getElementById('perm_finance').checked = staff.permissions.can_finance || false;
                document.getElementById('perm_reports').checked = staff.permissions.can_reports || false;
            } else {
                document.getElementById('perm_delete').checked = false; document.getElementById('perm_finance').checked = false; document.getElementById('perm_reports').checked = false;
            }

            // المالية
            if (staff.salary_details) {
                document.getElementById('s_salary').value = staff.salary_details.basic || staff.salary_details.base_salary || '';
                document.getElementById('s_commission').value = staff.salary_details.commission || '';
                document.getElementById('s_allowance').value = staff.salary_details.allowance || '';
                document.getElementById('s_bank_name').value = staff.salary_details.bank_name || '';
                document.getElementById('s_bank_iban').value = staff.salary_details.bank_iban || '';
            }

            // الطوارئ
            if (staff.emergency_contact) {
                document.getElementById('s_em_name').value = staff.emergency_contact.name || '';
                document.getElementById('s_em_phone').value = staff.emergency_contact.phone || '';
                document.getElementById('s_em_relation').value = staff.emergency_contact.relation || '';
            }

            // إظهار قسم الوثائق إذا كنا في وضع التعديل
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
};

window.saveStaff = async function(event) {
    event.preventDefault();
    const btn = document.getElementById('btn_save_staff');
    btn.disabled = true; 
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> جاري المعالجة والحفظ...';

    const id = document.getElementById('staff_id').value;
    let finalAvatarUrl = document.getElementById('s_avatar').value.trim() || null;
    let staffName = document.getElementById('s_full_name').value.trim();

    // 🚀 كشط الصورة وحفظها سحابياً (R2 Cloudflare) إذا كانت رابطاً خارجياً
    if (navigator.onLine && finalAvatarUrl && finalAvatarUrl.startsWith('http') && !finalAvatarUrl.includes('googleusercontent.com') && !finalAvatarUrl.includes('drive.google.com')) {
        btn.innerHTML = '<i class="fas fa-cloud-upload-alt fa-fade me-2"></i> جاري تشفير الصورة سحابياً...';
        try {
            let imgRes;
            try {
                imgRes = await fetch(finalAvatarUrl);
            } catch(e) {
                // تجاوز قيود CORS عبر خدمة مساعدة مؤقتة
                imgRes = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(finalAvatarUrl)}`);
            }
            
            const blob = await imgRes.blob();
            const file = new File([blob], `avatar_${staffName.replace(/\s+/g, '_')}.jpg`, { type: blob.type || 'image/jpeg' });
            
            const uploadRes = await API.uploadFileToR2(file, "HR", "Avatars");
            if (uploadRes && uploadRes.r2_key) {
                finalAvatarUrl = uploadRes.r2_key; // استبدال الرابط بمفتاح R2
            }
        } catch (err) {
            console.warn("فشل في كشط الصورة إلى R2، سيتم حفظ الرابط الأصلي", err);
        }
    }
    
    // تجهيز كائن البيانات (Payload)
    const payloadData = {
        full_name: staffName,
        phone: document.getElementById('s_phone').value.trim(),
        telegram_id: document.getElementById('s_telegram_id').value || null,
        national_id: document.getElementById('s_national_id').value || null,
        gender: document.getElementById('s_gender').value || null,
        date_of_birth: document.getElementById('s_dob').value || null,
        avatar_url: finalAvatarUrl, 
        address: document.getElementById('s_address').value || null,
        role: document.getElementById('s_role').value,
        specialization: document.getElementById('s_specialization').value || null,
        join_date: document.getElementById('s_join_date').value || null,
        experience_years: parseInt(document.getElementById('s_experience').value) || 0,
        syndicate_number: document.getElementById('s_syndicate_num').value || null,
        syndicate_expiry_date: document.getElementById('s_syndicate_expiry').value || null,
        
        is_active: document.getElementById('s_is_active') ? document.getElementById('s_is_active').checked : true,
        can_login: document.getElementById('s_can_login') ? document.getElementById('s_can_login').checked : true,

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

    btn.innerHTML = '<i class="fas fa-save fa-spin me-2"></i> جاري مزامنة البيانات...';

    try {
        let res;
        if (id) {
            // تحديث موظف حالي
            res = await API.updateStaff(id, payloadData);
            if(res && !res.error) {
                Swal.fire({toast: true, position: 'top-end', icon: res.offline ? 'warning' : 'success', title: res.offline ? 'تم الحفظ محلياً (Offline Mode)' : 'تم تحديث بيانات الموظف بنجاح', showConfirmButton: false, timer: 2500});
            }
        } else {
            // موظف جديد
            res = await API.addStaff(payloadData);
            if(res && !res.error) {
                Swal.fire({toast: true, position: 'top-end', icon: res.offline ? 'warning' : 'success', title: res.offline ? 'تم الإضافة للطابور المحلي' : 'تم تعيين الموظف بنجاح', showConfirmButton: false, timer: 2500});
            }
        }
        
        if(res && res.error) throw new Error(res.error);
        
        closeModal('staffModal');
        await loadStaff();
    } catch (err) {
        Swal.fire('خطأ في الحفظ', err.message || 'تعذر حفظ بيانات الموظف. تأكد من اتصالك أو صحة البيانات.', 'error');
    } finally {
        btn.disabled = false; 
        btn.innerHTML = '<i class="fas fa-save me-2"></i> حفظ واعتماد الكادر';
    }
};

window.toggleStaffStatus = async function(id, currentActiveStatus) {
    const actionName = currentActiveStatus ? "إيقاف" : "تفعيل";
    const newStatus = !currentActiveStatus;

    const confirm = await Swal.fire({
        title: `هل أنت متأكد من ${actionName} الموظف؟`,
        text: currentActiveStatus ? "سيتم منعه من تسجيل الدخول للنظام نهائياً، مع الاحتفاظ ببياناته وسجلاته." : "سيتمكن من الدخول للنظام وممارسة مهامه مجدداً.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: currentActiveStatus ? '#EE5D50' : '#01B574',
        cancelButtonColor: '#A3AED0',
        confirmButtonText: `نعم، قم بالـ ${actionName}`,
        cancelButtonText: 'إلغاء الأمر'
    });

    if (!confirm.isConfirmed) return;

    try {
        const res = await API.updateStaff(id, { is_active: newStatus, can_login: newStatus });
        if(res && !res.error) {
            Swal.fire({toast: true, position: 'top-end', icon: res.offline ? 'warning' : 'success', title: res.offline ? 'تم حفظ الحالة محلياً' : `تم ${actionName} الموظف بنجاح`, showConfirmButton: false, timer: 2000});
            await loadStaff();
        } else {
            throw new Error(res?.error || 'حدث خطأ مجهول من السيرفر');
        }
    } catch (err) {
        Swal.fire('فشل التحديث', 'تعذر تغيير حالة الموظف: ' + err.message, 'error');
    }
};

// ============================================================================
// [6] الذكاء الاصطناعي للموارد البشرية (AI ID Extractor & Camera OCR)
// ============================================================================

window.openAiIdModal = function() {
    document.getElementById('ai_id_text').value = '';
    const m = new bootstrap.Modal(document.getElementById('aiIdModal'));
    m.show();
};

/**
 * التقاط صورة الهوية عبر الكاميرا/المعرض، ضغطها، وإرسالها للذكاء الاصطناعي (Vision AI)
 */
window.processIdImage = async function(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!navigator.onLine) {
        Swal.fire('تنبيه', 'محرك الذكاء الاصطناعي (Vision) يتطلب اتصالاً نشطاً بالإنترنت.', 'warning');
        return;
    }

    Swal.fire({
        title: 'جاري القراءة...', 
        text: 'يقوم الذكاء الاصطناعي (Llama 3.2 Vision) بقراءة الهوية واستخراج البيانات، يرجى الانتظار ثوانٍ.',
        allowOutsideClick: false, 
        didOpen: () => Swal.showLoading()
    });

    try {
        // ضغط الصورة (Compress Image) لتقليل حجمها قبل الإرسال (تخفيف الحمل على السيرفر وتسريع الرد)
        const compressedBase64 = await compressImageFile(file, 800); // 800px أقصى عرض
        
        // إرسال الصورة كـ Base64 لمحرك الرؤية في الباك إند
        const aiRes = await API.readOCR(compressedBase64);
        
        if (aiRes && !aiRes.error) {
            // تعبئة الحقول تلقائياً
            let data = typeof aiRes === 'string' ? JSON.parse(aiRes) : aiRes;
            if (data.full_name || data["الاسم"]) document.getElementById('s_full_name').value = data.full_name || data["الاسم"];
            if (data.national_id || data["الرقم الوطني"]) document.getElementById('s_national_id').value = data.national_id || data["الرقم الوطني"];
            
            Swal.fire({toast: true, position: 'top-end', icon: 'success', title: 'تمت قراءة الهوية وتعبئة البيانات بنجاح!', showConfirmButton: false, timer: 3000});
            // محاولة جلب الصورة الرمزية في حال تم التقاط وجه
        } else {
            throw new Error(aiRes?.error || "تعذرت قراءة الصورة.");
        }
    } catch(err) {
        Swal.fire('فشل القراءة', 'لم نتمكن من قراءة الهوية بدقة، يرجى التأكد من وضوح الصورة وتكرار المحاولة.', 'error');
        console.error(err);
    } finally {
        event.target.value = ''; // تصفير الحقل
    }
};

/**
 * دالة مساعدة لضغط الصور محلياً (Client-Side Compression)
 */
function compressImageFile(file, maxWidth) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = event => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const scaleSize = maxWidth / img.width;
                canvas.width = maxWidth;
                canvas.height = img.height * scaleSize;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                // إرجاع النتيجة كـ Base64 فقط بدون الـ Prefix
                const base64Str = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
                resolve(base64Str);
            };
            img.onerror = error => reject(error);
        };
        reader.onerror = error => reject(error);
    });
}

window.processIdAI = async function() {
    if (!navigator.onLine) {
        Swal.fire('تنبيه', 'محرك الذكاء الاصطناعي يتطلب اتصالاً نشطاً بالإنترنت.', 'warning');
        return;
    }

    const text = document.getElementById('ai_id_text').value.trim();
    if (!text) { Swal.fire('تنبيه', 'يرجى لصق النص المستخرج من الهوية أولاً', 'warning'); return; }

    const btn = document.getElementById('btn_process_id');
    btn.disabled = true; 
    btn.innerHTML = '<i class="fas fa-robot fa-spin me-2"></i> جاري التحليل واستخراج البيانات...';

    try {
        const aiRes = await API.extractDataAI(text, 'id_extractor');
        if (aiRes && aiRes.extracted_json) {
            const data = aiRes.extracted_json;
            // تعبئة الحقول تلقائياً
            if (data.full_name) document.getElementById('s_full_name').value = data.full_name;
            if (data.date_of_birth) document.getElementById('s_dob').value = data.date_of_birth;
            if (data.address) document.getElementById('s_address').value = data.address;
            if (data.syndicate_number) document.getElementById('s_syndicate_num').value = data.syndicate_number;
            
            Swal.fire({toast: true, position: 'top-end', icon: 'success', title: 'تمت التعبئة الذكية بنجاح', showConfirmButton: false, timer: 2500});
            closeModal('aiIdModal');
        } else {
            Swal.fire('صعوبة في الفهم', 'لم يتمكن المحرك الذكي من استخراج بيانات واضحة من النص المدخل. تأكد من صحة النص.', 'error');
        }
    } catch (err) {
        Swal.fire('فشل الاتصال', 'حدث خطأ أثناء التواصل مع خوادم الذكاء الاصطناعي (Cloudflare AI).', 'error');
    } finally {
        btn.disabled = false; 
        btn.innerHTML = '<i class="fas fa-magic me-2"></i> تحليل وملء الحقول';
    }
};

// ============================================================================
// [7] إدارة الوثائق السحابية (R2 Cloud Documents)
// ============================================================================

window.renderStaffDocs = function(docs) {
    const list = document.getElementById('staff-docs-list');
    if (!docs || docs.length === 0) {
        list.innerHTML = '<div class="text-muted small text-center p-4 border border-dashed rounded-4 bg-light fw-bold"><i class="fas fa-folder-open fa-2x mb-2 opacity-50"></i><br>لم يتم رفع أي وثائق (عقود، هويات) لهذا الموظف.</div>';
        return;
    }
    
    list.innerHTML = docs.map((doc, index) => {
        const isR2 = doc.url && !doc.url.startsWith('http');
        const viewBtn = isR2 
            ? `<button type="button" class="btn btn-sm btn-outline-primary bg-white fw-bold px-3 py-1 rounded-pill shadow-sm" onclick="API.downloadR2File('${escapeHTML(doc.url)}', '${escapeHTML(doc.name)}')"><i class="fas fa-shield-alt me-1 text-success"></i> تحميل آمن</button>`
            : `<a href="${escapeHTML(doc.url)}" target="_blank" class="btn btn-sm btn-outline-primary bg-white fw-bold px-3 py-1 rounded-pill shadow-sm"><i class="fas fa-external-link-alt me-1"></i> فتح الرابط</a>`;

        return `
        <div class="compact-card bg-white shadow-sm border-0 d-flex justify-content-between align-items-center mb-2 p-3 rounded-4 transition-hover" style="border: 2px solid transparent !important;" onmouseover="this.style.borderColor='var(--navy)'" onmouseout="this.style.borderColor='transparent'">
            <div class="d-flex align-items-center">
                <i class="fas fa-file-pdf text-danger fa-2x me-3 opacity-75"></i>
                <div>
                    <span class="fw-bold text-navy d-block" style="font-size: 0.95rem;">${escapeHTML(doc.name)}</span>
                    <small class="text-muted fw-bold font-monospace"><i class="fas fa-calendar-alt me-1"></i> ${new Date(doc.date).toLocaleDateString('ar-EG')}</small>
                </div>
            </div>
            <div class="d-flex gap-2">
                ${viewBtn}
                <button type="button" class="btn btn-sm btn-light text-danger border px-3 py-1 rounded-pill shadow-sm" onclick="deleteStaffDoc(${index})"><i class="fas fa-trash"></i></button>
            </div>
        </div>
        `;
    }).join('');
};

window.uploadStaffDoc = async function() {
    if (!navigator.onLine) {
        Swal.fire('تنبيه', 'رفع الوثائق إلى الأرشيف السحابي يتطلب اتصالاً نشطاً بالإنترنت.', 'warning');
        return;
    }

    const fileInput = document.getElementById('doc_file');
    const nameInput = document.getElementById('doc_name').value.trim();
    
    if (!fileInput.files.length) { 
        Swal.fire('تنبيه', 'يرجى اختيار ملف (هوية، عقد عمل، الخ) أولاً من جهازك.', 'warning'); 
        return; 
    }
    
    const btn = document.getElementById('btnUploadDoc');
    btn.disabled = true; 
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الرفع...';
    
    try {
        const file = fileInput.files[0];
        // 🚀 الرفع مباشرة وبشكل آمن إلى Cloudflare R2
        const r2Res = await API.uploadFileToR2(file, "HR", "Docs");
        
        if (r2Res && r2Res.r2_key) {
            let currentDocs = currentEditingStaff.staff_documents || [];
            currentDocs.push({
                name: nameInput || file.name,
                url: r2Res.r2_key, // نحفظ المفتاح المرجعي بدلاً من الرابط المباشر
                date: new Date().toISOString()
            });
            
            // تحديث السجل في قاعدة البيانات
            const res = await API.updateStaff(currentEditingStaff.id, { staff_documents: currentDocs });
            
            if(res && !res.error) {
                currentEditingStaff.staff_documents = currentDocs; 
                
                // تنظيف الحقول وإعادة الرسم
                document.getElementById('doc_file').value = '';
                document.getElementById('doc_name').value = '';
                renderStaffDocs(currentDocs);
                
                Swal.fire({toast: true, position: 'top-end', icon: 'success', title: 'تمت إضافة الوثيقة للأرشيف بنجاح', showConfirmButton: false, timer: 2500});
            } else {
                throw new Error(res?.error || 'خطأ في استجابة الخادم عند تحديث السجل');
            }
        }
    } catch (err) {
        Swal.fire('فشل الرفع', 'فشلت عملية الرفع السحابي: ' + err.message, 'error');
    } finally {
        btn.disabled = false; 
        btn.innerHTML = '<i class="fas fa-upload me-1"></i> رفع للأرشيف';
    }
};

window.deleteStaffDoc = async function(index) {
    const confirm = await Swal.fire({
        title: 'تأكيد الحذف؟', 
        text: 'هل أنت متأكد من حذف هذه الوثيقة من الأرشيف السحابي للموظف؟',
        icon: 'warning', 
        showCancelButton: true, 
        confirmButtonColor: '#d33',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'نعم، احذف', 
        cancelButtonText: 'إلغاء'
    });
    
    if (!confirm.isConfirmed) return;
    
    let currentDocs = currentEditingStaff.staff_documents || [];
    currentDocs.splice(index, 1);
    
    try {
        const res = await API.updateStaff(currentEditingStaff.id, { staff_documents: currentDocs });
        if(res && !res.error) {
            currentEditingStaff.staff_documents = currentDocs;
            renderStaffDocs(currentDocs);
            Swal.fire({toast: true, position: 'top-end', icon: res.offline ? 'warning' : 'success', title: res.offline ? 'تم الحذف من النسخة المحلية' : 'تم حذف الوثيقة بنجاح', showConfirmButton: false, timer: 2000});
        } else {
            throw new Error(res?.error || 'خطأ غير معروف');
        }
    } catch (err) {
        Swal.fire('خطأ', 'تعذر حذف الوثيقة من الخادم: ' + err.message, 'error');
    }
};