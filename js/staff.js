/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: js/staff.js
 * الإصدار: V5.6 Enterprise Edition (HR & Staff Management Engine)
 * ============================================================================
 * الكتل البرمجية الأساسية:
 * [1] المتغيرات العامة وحماية المسار (Globals & Route Guard)
 * [2] دوال الحماية والمساعدة (Security & Helpers)
 * [3] جلب وعرض بيانات الكوادر (Fetch & Render Staff)
 * [4] عرض الملف الموحد للموظف (View Staff Profile - Read Only)
 * [5] الإضافة والتعديل والحفظ (Add, Edit, Save & Status Toggle)
 * [6] الذكاء الاصطناعي لاستخراج بيانات الهوية (Vision OCR & AI ID Extractor)
 * [7] أرشيف وثائق الكادر السحابي المشفر (Cloudflare R2 Documents Vault)
 * ============================================================================
 */

// ============================================================================
// [1] المتغيرات العامة وحماية المسار (Globals & Route Guard)
// ============================================================================
let allStaff = [];
let currentEditingStaff = null;
const activeBlobUrls = new Set();

window.onload = async () => {
    // 1. تطبيق الهوية البصرية للمكتب
    applyFirmSettings();
    
    // 2. التحقق من وجود الجلسة
    const userStr = localStorage.getItem(CONFIG?.USER_KEY || 'moakkil_user');
    if (!userStr) { 
        window.location.href = 'login.html'; 
        return; 
    }
    
    // 3. حماية المسار الأمني (Route Guard) - قصر الوصول على المدراء فقط
    try {
        const user = JSON.parse(userStr);
        const role = String(user.role || '').toLowerCase();
        if (role !== 'admin' && role !== 'مدير' && role !== 'super_admin' && role !== 'superadmin') {
            if (typeof Swal !== 'undefined') {
                await Swal.fire({
                    icon: 'error', 
                    title: 'مرفوض أمنياً', 
                    text: 'صلاحية الدخول لإدارة الكوادر والموارد البشرية مقتصرة على مدراء وشركاء المكتب فقط.',
                    confirmButtonColor: 'var(--primary-dark)'
                });
            }
            window.location.href = 'app.html';
            return;
        }
    } catch (e) {
        window.location.href = 'login.html';
        return;
    }
    
    // 4. جلب وعرض بيانات الكوادر
    await loadStaff();
};

window.addEventListener('beforeunload', () => {
    // تنظيف روابط Blob المحفوظة في الذاكرة لمنع تسريب الذاكرة
    activeBlobUrls.forEach(url => URL.revokeObjectURL(url));
    activeBlobUrls.clear();
});

// ============================================================================
// [2] دوال الحماية والمساعدة (Security & Helpers)
// ============================================================================

/**
 * تعقيم النصوص المدخلة لمنع ثغرات XSS
 */
const escapeHTML = (str) => {
    if (str === null || str === undefined) return '';
    return str.toString().replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
};

/**
 * تطبيق هوية المكتب البصرية المحفوظة محلياً (White-labeling)
 */
function applyFirmSettings() {
    const settings = JSON.parse(localStorage.getItem('firm_settings') || '{}');
    if (!settings) return;
    const root = document.documentElement;
    const isDark = localStorage.getItem('moakkil_dark_mode') === 'true';
    if (settings.primary_color && !isDark) {
        root.style.setProperty('--primary-dark', settings.primary_color);
        root.style.setProperty('--navy', settings.primary_color);
    }
    if (settings.accent_color) {
        root.style.setProperty('--gold-luxury', settings.accent_color);
        root.style.setProperty('--gold', settings.accent_color);
    }
}

/**
 * ترجمة المسميات والأدوار الوظيفية للعربية الرسمية
 */
function getRoleNameAr(role) {
    const r = String(role || '').toLowerCase();
    if (r === 'admin' || r === 'super_admin' || r === 'superadmin' || r === 'مدير') return 'مدير / شريك مسؤول';
    if (r === 'lawyer' || r === 'محامي') return 'محامي مزاول / مستشار';
    if (r === 'trainee' || r === 'متدرب') return 'محامي متدرب';
    if (r === 'secretary' || r === 'سكرتير' || r === 'إداري') return 'سكرتاريا وإداري';
    return role || 'موظف';
}

/**
 * إغلاق النوافذ المنبثقة وتنظيف الطبقات الخلفية (Modal Cleanup)
 */
function closeModal(id) { 
    const el = document.getElementById(id); 
    if (el) { 
        const m = bootstrap.Modal.getInstance(el); 
        if (m) m.hide(); 
        document.querySelectorAll('.modal-backdrop').forEach(b => b.remove()); 
        document.body.classList.remove('modal-open'); 
        document.body.style.overflow = ''; 
        document.body.style.paddingRight = '';
    } 
}

/**
 * تسجيل البصمة البيومترية لجهاز المدير الحالي (WebAuthn)
 */
window.registerDeviceBiometric = async () => {
    if (!navigator.onLine) {
        Swal.fire({
            icon: 'warning', 
            title: 'تنبيه', 
            text: 'تسجيل البصمة يتطلب اتصالاً نشطاً بالإنترنت.', 
            confirmButtonColor: 'var(--primary-dark)'
        });
        return;
    }
    try {
        Swal.fire({
            title: 'جاري إعداد البصمة...', 
            text: 'يرجى تأكيد هويتك عبر مستشعر البصمة في جهازك', 
            allowOutsideClick: false, 
            didOpen: () => Swal.showLoading()
        });
        
        if (typeof AUTH !== 'undefined' && AUTH.registerBiometric) {
            const res = await AUTH.registerBiometric();
            Swal.fire({
                icon: 'success', 
                title: 'تم التفعيل بنجاح', 
                text: res.message || 'تم تسجيل بصمة جهازك بنجاح للوصول السريع مستقبلاً.', 
                confirmButtonColor: 'var(--success-luxury)'
            });
        } else {
            throw new Error('محرك المصادقة البيومترية غير متاح حالياً.');
        }
    } catch (err) {
        Swal.fire({
            icon: 'error', 
            title: 'تعذر التسجيل', 
            text: err.message || 'فشل إعداد البصمة على هذا الجهاز.', 
            confirmButtonColor: 'var(--danger-luxury)'
        });
    }
};

// ============================================================================
// [3] جلب وعرض بيانات الكوادر (Fetch & Render Staff)
// ============================================================================

window.loadStaff = async function() {
    const container = document.getElementById('staff-container');
    if (!container) return;

    container.innerHTML = `
        <div class="col-12 text-center p-5 text-dark fw-bold bg-white rounded-4 border-0 shadow-sm fade-in">
            <i class="fas fa-spinner fa-spin fa-3x mb-3" style="color: var(--gold-luxury);"></i>
            <br><span class="fs-5">جاري جلب وتأمين بيانات الكوادر...</span>
        </div>`;
    
    try {
        const res = await API.getStaff();
        allStaff = Array.isArray(res) ? res.filter(s => !s.is_deleted) : [];
        renderStaffCards();
    } catch (e) {
        container.innerHTML = `
            <div class="col-12 text-center p-5 text-danger fw-bold bg-danger bg-opacity-10 rounded-4 shadow-sm border border-danger border-opacity-25 fade-in">
                <i class="fas fa-wifi-slash fa-3x mb-3"></i><br>
                تعذر تحميل بيانات الكوادر من الخادم السحابي. يرجى التحقق من الاتصال.
            </div>`;
    }
};

function renderStaffCards() {
    const container = document.getElementById('staff-container');
    if (!container) return;

    if (allStaff.length === 0) {
        container.innerHTML = `
            <div class="col-12 text-center p-5 text-muted bg-white rounded-4 border-0 shadow-sm fw-bold fade-in">
                <i class="fas fa-users-slash fa-4x mb-3 opacity-25" style="color: var(--primary-dark);"></i>
                <br><span class="fs-5">لا يوجد كوادر مسجلين في النظام حتى الآن.</span>
            </div>`;
        return;
    }

    container.innerHTML = allStaff.map(staff => {
        const isActive = staff.is_active !== false;
        const canLogin = staff.can_login !== false;
        
        let statusBadge = isActive 
            ? '<span class="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 shadow-sm px-3 py-1 rounded-pill"><i class="fas fa-check-circle me-1"></i> نشط</span>' 
            : '<span class="badge bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25 shadow-sm px-3 py-1 rounded-pill"><i class="fas fa-ban me-1"></i> موقوف</span>';
            
        let loginBadge = canLogin 
            ? '<span class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 shadow-sm px-3 py-1 rounded-pill"><i class="fas fa-key me-1"></i> دخول متاح</span>' 
            : '<span class="badge bg-secondary bg-opacity-10 text-dark border border-secondary border-opacity-25 shadow-sm px-3 py-1 rounded-pill"><i class="fas fa-lock me-1"></i> محظور</span>';
            
        let roleName = getRoleNameAr(staff.role);
        
        // هندسة الصورة الرمزية الآمنة مع حماية الأبعاد
        let avatarHtml = '';
        const avatarStyle = "width: 78px; height: 78px; object-fit: cover; border-radius: 50%; flex-shrink: 0;";
        const placeholderStyle = "width: 78px; height: 78px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 2.1rem; background: var(--primary-dark); color: var(--gold-luxury); font-weight: 800;";
        
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
            const basic = Number(staff.salary_details.basic || staff.salary_details.base_salary || 0);
            if (basic > 0) salaryText = `${basic.toLocaleString('en-US')} د.أ`;
        }

        return `
        <div class="col-lg-4 col-md-6 col-sm-12 fade-in mb-3">
            <div class="compact-card p-4 text-center shadow-sm h-100 bg-white d-flex flex-column ${!isActive ? 'opacity-75' : ''}">
                <div class="position-relative pb-3 border-bottom mb-3 d-flex flex-column align-items-center">
                    ${avatarHtml}
                    <h5 class="fw-bold text-dark mt-3 mb-1 lh-base">${escapeHTML(staff.full_name)}</h5>
                    <p class="text-muted small mb-3 fw-bold">${escapeHTML(staff.specialization || roleName)}</p>
                    <div class="d-flex justify-content-center gap-2">${statusBadge} ${loginBadge}</div>
                </div>
                <div class="card-data-grid text-start w-100 mb-3">
                    <div class="data-item">
                        <i class="fas fa-phone-alt text-success"></i> <span class="font-monospace fw-bold text-dark" dir="ltr">${escapeHTML(staff.phone)}</span>
                    </div>
                    <div class="data-item">
                        <i class="fas fa-money-bill-wave text-danger"></i> الراتب: <span class="text-dark fw-bold font-monospace">${salaryText}</span>
                    </div>
                </div>
                <div class="mt-auto d-flex flex-column gap-2 pt-2">
                    <button class="btn btn-sm btn-outline-navy bg-white fw-bold w-100 shadow-sm rounded-pill py-2" onclick="viewStaffDetails('${staff.id}')">
                        <i class="fas fa-id-card me-1"></i> عرض الملف الكامل
                    </button>
                    <div class="d-flex gap-2">
                        <button class="btn btn-sm btn-light border text-dark fw-bold w-50 shadow-sm rounded-pill py-2" onclick="openStaffModal('${staff.id}')">
                            <i class="fas fa-edit me-1"></i> تعديل
                        </button>
                        <button class="btn btn-sm ${isActive ? 'btn-outline-danger' : 'btn-outline-success'} bg-white fw-bold w-50 shadow-sm rounded-pill py-2" onclick="toggleStaffStatus('${staff.id}', ${isActive})">
                            <i class="fas ${isActive ? 'fa-user-slash' : 'fa-user-check'} me-1"></i> ${isActive ? 'إيقاف' : 'تفعيل'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
        `;
    }).join('');

    // جلب صور R2 المحمية بعد عرض البطاقات
    setTimeout(loadR2Images, 100);
}

/**
 * جلب الصور المشفرة من أرشيف Cloudflare R2 وتحويلها إلى كائن محلي Blob
 */
async function loadR2Images() {
    const imgs = document.querySelectorAll('img[data-r2-key]');
    const token = localStorage.getItem(CONFIG?.TOKEN_KEY || 'moakkil_token');
    const baseUrl = window.API_BASE_URL || CONFIG?.API_URL || '';
    
    for (let img of imgs) {
        const key = img.getAttribute('data-r2-key');
        if (!key) continue;
        
        try {
            const res = await fetch(`${baseUrl}/api/r2/download?key=${encodeURIComponent(key)}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const blob = await res.blob();
                const blobUrl = URL.createObjectURL(blob);
                activeBlobUrls.add(blobUrl);
                img.src = blobUrl;
                img.removeAttribute('data-r2-key');
            } else {
                img.outerHTML = `<div class='shadow-sm border border-3 border-white' style='width: ${img.style.width}; height: ${img.style.height}; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 2rem; background: var(--primary-dark); color: var(--gold-luxury);'>?</div>`;
            }
        } catch (e) {
            img.outerHTML = `<div class='shadow-sm border border-3 border-white' style='width: ${img.style.width}; height: ${img.style.height}; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 2rem; background: var(--primary-dark); color: var(--gold-luxury);'>?</div>`;
        }
    }
}

/**
 * فلترة قائمة الكوادر في شريط البحث السريع
 */
window.filterStaffList = function() {
    const input = document.getElementById('search_staff');
    if (!input) return;
    const q = input.value.toLowerCase().trim();
    if (!q) { renderStaffCards(); return; }
    
    const filtered = allStaff.filter(s => 
        (s.full_name && s.full_name.toLowerCase().includes(q)) ||
        (s.specialization && s.specialization.toLowerCase().includes(q)) ||
        (s.phone && s.phone.includes(q)) ||
        (s.national_id && s.national_id.includes(q))
    );
    
    const container = document.getElementById('staff-container');
    if (!container) return;

    if (filtered.length === 0) {
        container.innerHTML = '<div class="col-12 text-center p-5 text-muted bg-white rounded-4 border-0 shadow-sm fw-bold fade-in"><i class="fas fa-search-minus fa-3x mb-3 opacity-25"></i><br><span class="fs-5">لا توجد نتائج تطابق استعلام البحث.</span></div>';
        return;
    }
    
    const originalStaff = [...allStaff];
    allStaff = filtered;
    renderStaffCards();
    allStaff = originalStaff;
};

// ============================================================================
// [4] عرض الملف الموحد للموظف (View Staff Profile - Read Only)
// ============================================================================

window.viewStaffDetails = function(id) {
    const staff = allStaff.find(s => s.id === id);
    if (!staff) return;

    // حقن الصورة
    const avatarEl = document.getElementById('v_avatar_container');
    const vAvatarStyle = "width: 100px; height: 100px; object-fit: cover; border-radius: 50%; flex-shrink: 0;";
    const vPlaceholderStyle = "width: 100px; height: 100px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 2.8rem; background: var(--primary-dark); color: var(--gold-luxury); font-weight: 800;";

    if (avatarEl) {
        if (staff.avatar_url) {
            if (staff.avatar_url.startsWith('http')) {
                avatarEl.innerHTML = `<img src="${escapeHTML(staff.avatar_url)}" class="shadow-sm border border-3 border-white" style="${vAvatarStyle}" onerror="this.onerror=null; this.outerHTML='<div class=\\'shadow-sm border border-3 border-white\\' style=\\'${vPlaceholderStyle}\\'>${escapeHTML(staff.full_name).charAt(0)}</div>';">`;
            } else {
                avatarEl.innerHTML = `<img src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" data-r2-key="${escapeHTML(staff.avatar_url)}" class="shadow-sm border border-3 border-white" style="${vAvatarStyle}" onerror="this.onerror=null; this.outerHTML='<div class=\\'shadow-sm border border-3 border-white\\' style=\\'${vPlaceholderStyle}\\'>${escapeHTML(staff.full_name).charAt(0)}</div>';">`;
            }
        } else {
            avatarEl.innerHTML = `<div class="shadow-sm border border-3 border-white" style="${vPlaceholderStyle}">${escapeHTML(staff.full_name).charAt(0)}</div>`;
        }
    }

    // الترويسة
    const fullNameEl = document.getElementById('v_full_name');
    if (fullNameEl) fullNameEl.innerText = staff.full_name || '--';
    
    const roleBadgeEl = document.getElementById('v_role_badge');
    if (roleBadgeEl) roleBadgeEl.innerHTML = `<i class="fas fa-briefcase me-1"></i> ${getRoleNameAr(staff.role)}`;
    
    // شارات الحالة
    const statusBadgesEl = document.getElementById('v_status_badges');
    if (statusBadgesEl) {
        let statusHtml = staff.is_active !== false 
            ? '<span class="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 px-3 py-2 rounded-pill shadow-sm"><i class="fas fa-check-circle me-1"></i> حساب نشط</span>' 
            : '<span class="badge bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25 px-3 py-2 rounded-pill shadow-sm"><i class="fas fa-ban me-1"></i> حساب موقوف</span>';
        
        statusHtml += staff.can_login !== false 
            ? '<span class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 px-3 py-2 rounded-pill shadow-sm ms-2"><i class="fas fa-key me-1"></i> تسجيل الدخول متاح</span>' 
            : '<span class="badge bg-secondary bg-opacity-10 text-dark border border-secondary border-opacity-25 px-3 py-2 rounded-pill shadow-sm ms-2"><i class="fas fa-lock me-1"></i> الدخول محظور</span>';
        
        statusBadgesEl.innerHTML = statusHtml;
    }

    // تبويب البيانات الشخصية والطوارئ
    const phoneEl = document.getElementById('v_phone');
    if (phoneEl) phoneEl.innerText = staff.phone || '--';
    
    const nationalIdEl = document.getElementById('v_national_id');
    if (nationalIdEl) nationalIdEl.innerText = staff.national_id || '--';
    
    const genderEl = document.getElementById('v_gender');
    if (genderEl) genderEl.innerText = staff.gender || '--';
    
    const dobEl = document.getElementById('v_dob');
    if (dobEl) dobEl.innerText = staff.date_of_birth || '--';
    
    const addressEl = document.getElementById('v_address');
    if (addressEl) addressEl.innerText = staff.address || '--';
    
    const emNameEl = document.getElementById('v_em_name');
    const emPhoneEl = document.getElementById('v_em_phone');
    const emRelationEl = document.getElementById('v_em_relation');
    if (staff.emergency_contact) {
        if (emNameEl) emNameEl.innerText = staff.emergency_contact.name || '--';
        if (emPhoneEl) emPhoneEl.innerText = staff.emergency_contact.phone || '--';
        if (emRelationEl) emRelationEl.innerText = staff.emergency_contact.relation || '--';
    } else {
        if (emNameEl) emNameEl.innerText = '--';
        if (emPhoneEl) emPhoneEl.innerText = '--';
        if (emRelationEl) emRelationEl.innerText = '--';
    }

    // تبويب المعلومات المهنية والصلاحيات
    const specEl = document.getElementById('v_specialization');
    if (specEl) specEl.innerText = staff.specialization || '--';
    
    const joinEl = document.getElementById('v_join_date');
    if (joinEl) joinEl.innerText = staff.join_date || '--';
    
    const expEl = document.getElementById('v_experience');
    if (expEl) expEl.innerText = staff.experience_years ? staff.experience_years + ' سنوات' : '--';
    
    const tgEl = document.getElementById('v_telegram_id');
    if (tgEl) tgEl.innerText = staff.telegram_id || 'غير مرتبط';
    
    const syndNumEl = document.getElementById('v_syndicate_num');
    if (syndNumEl) syndNumEl.innerText = staff.syndicate_number || '--';
    
    const syndExpEl = document.getElementById('v_syndicate_expiry');
    if (syndExpEl) syndExpEl.innerText = staff.syndicate_expiry_date || '--';

    const permContainer = document.getElementById('v_permissions');
    if (permContainer) {
        if (staff.permissions) {
            let p = staff.permissions;
            let pHtml = '';
            if (p.can_delete) pHtml += '<span class="badge bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25 shadow-sm px-3 py-2 rounded-pill mb-1"><i class="fas fa-trash me-1"></i> حذف الملفات</span> ';
            if (p.can_finance) pHtml += '<span class="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 shadow-sm px-3 py-2 rounded-pill mb-1"><i class="fas fa-wallet me-1"></i> الوصول للمالية</span> ';
            if (p.can_reports) pHtml += '<span class="badge bg-info bg-opacity-10 text-info border border-info border-opacity-25 shadow-sm px-3 py-2 rounded-pill mb-1"><i class="fas fa-chart-pie me-1"></i> التقارير الشاملة</span> ';
            if (!pHtml) pHtml = '<span class="text-muted small fw-bold"><i class="fas fa-user me-1"></i> صلاحيات موظف اعتيادية</span>';
            permContainer.innerHTML = pHtml;
        } else {
            permContainer.innerHTML = '<span class="text-muted small fw-bold"><i class="fas fa-user me-1"></i> صلاحيات موظف اعتيادية</span>';
        }
    }

    // تبويب المالية والبنك
    const salEl = document.getElementById('v_salary');
    const allowEl = document.getElementById('v_allowance');
    const commEl = document.getElementById('v_commission');
    const bankNameEl = document.getElementById('v_bank_name');
    const bankIbanEl = document.getElementById('v_bank_iban');
    if (staff.salary_details) {
        if (salEl) salEl.innerText = Number(staff.salary_details.basic || staff.salary_details.base_salary || 0).toLocaleString('en-US');
        if (allowEl) allowEl.innerText = Number(staff.salary_details.allowance || 0).toLocaleString('en-US');
        if (commEl) commEl.innerText = staff.salary_details.commission || 0;
        if (bankNameEl) bankNameEl.innerText = staff.salary_details.bank_name || '--';
        if (bankIbanEl) bankIbanEl.innerText = staff.salary_details.bank_iban || '--';
    } else {
        if (salEl) salEl.innerText = '0';
        if (allowEl) allowEl.innerText = '0';
        if (commEl) commEl.innerText = '0';
        if (bankNameEl) bankNameEl.innerText = '--';
        if (bankIbanEl) bankIbanEl.innerText = '--';
    }

    // تبويب الأرشيف والوثائق
    const docContainer = document.getElementById('v_documents_list');
    if (docContainer) {
        if (staff.staff_documents && Array.isArray(staff.staff_documents) && staff.staff_documents.length > 0) {
            docContainer.innerHTML = staff.staff_documents.map(doc => {
                const isR2 = doc.url && !doc.url.startsWith('http');
                const actionBtn = isR2 
                    ? `<button type="button" class="btn btn-sm btn-outline-primary bg-white fw-bold rounded-pill px-4 py-2 shadow-sm" onclick="API.downloadR2File('${escapeHTML(doc.url)}', '${escapeHTML(doc.name)}')"><i class="fas fa-shield-alt me-1 text-success"></i> تحميل مشفر</button>`
                    : `<a href="${escapeHTML(doc.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-outline-primary bg-white fw-bold rounded-pill px-4 py-2 shadow-sm"><i class="fas fa-external-link-alt me-1"></i> فتح الرابط</a>`;
                    
                return `
                <div class="compact-card bg-white shadow-sm d-flex justify-content-between align-items-center mb-3 p-3 rounded-4">
                    <div class="d-flex align-items-center">
                        <i class="fas fa-file-pdf text-danger fa-2x me-3 opacity-75"></i>
                        <div>
                            <span class="fw-bold text-dark d-block" style="font-size: 1rem;">${escapeHTML(doc.name)}</span>
                            <small class="text-muted fw-bold font-monospace"><i class="fas fa-calendar-alt me-1"></i> ${new Date(doc.date).toLocaleDateString('ar-EG')}</small>
                        </div>
                    </div>
                    ${actionBtn}
                </div>`;
            }).join('');
        } else {
            docContainer.innerHTML = '<div class="text-center p-4 text-muted border border-dashed rounded-4 bg-light fw-bold"><i class="fas fa-folder-open fa-2x mb-2 opacity-50"></i><br>لا توجد وثائق مؤرشفة لهذا الكادر.</div>';
        }
    }

    // زر الانتقال لوضع التعديل
    const btnEdit = document.getElementById('btn_open_edit');
    if (btnEdit) {
        btnEdit.onclick = function() {
            closeModal('viewStaffModal');
            setTimeout(() => { openStaffModal(id); }, 350);
        };
    }

    // التبويب الافتراضي
    const firstTabBtn = document.querySelector('#viewStaffTabs button[data-bs-target="#v-tab-personal"]');
    if (firstTabBtn) {
        const firstTab = new bootstrap.Tab(firstTabBtn);
        firstTab.show();
    }

    const modalEl = document.getElementById('viewStaffModal');
    if (modalEl) {
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
    }

    setTimeout(loadR2Images, 100);
};

// ============================================================================
// [5] الإضافة والتعديل والحفظ (Add, Edit, Save & Status Toggle)
// ============================================================================

window.openStaffModal = function(id = null) {
    const form = document.getElementById('staffForm');
    if (form) form.reset();
    
    const staffIdInput = document.getElementById('staff_id');
    if (staffIdInput) staffIdInput.value = '';
    
    document.getElementById('documents-area')?.classList.add('d-none');
    
    const joinInput = document.getElementById('s_join_date');
    if (joinInput) joinInput.value = new Date().toISOString().split('T')[0];

    const activeSwitch = document.getElementById('s_is_active');
    if (activeSwitch) activeSwitch.checked = true;
    
    const loginSwitch = document.getElementById('s_can_login');
    if (loginSwitch) loginSwitch.checked = true;

    if (id) {
        const staff = allStaff.find(s => s.id === id);
        if (staff) {
            currentEditingStaff = staff;
            if (staffIdInput) staffIdInput.value = staff.id;
            
            // حقن البيانات في الحقول
            if (document.getElementById('s_full_name')) document.getElementById('s_full_name').value = staff.full_name || '';
            if (document.getElementById('s_phone')) document.getElementById('s_phone').value = staff.phone || '';
            if (document.getElementById('s_telegram_id')) document.getElementById('s_telegram_id').value = staff.telegram_id || '';
            if (document.getElementById('s_dob')) document.getElementById('s_dob').value = staff.date_of_birth || '';
            if (document.getElementById('s_avatar')) document.getElementById('s_avatar').value = staff.avatar_url || '';
            if (document.getElementById('s_address')) document.getElementById('s_address').value = staff.address || '';
            if (document.getElementById('s_national_id')) document.getElementById('s_national_id').value = staff.national_id || '';
            if (document.getElementById('s_gender')) document.getElementById('s_gender').value = staff.gender || '';
            if (document.getElementById('s_role')) document.getElementById('s_role').value = staff.role || 'lawyer';
            if (document.getElementById('s_specialization')) document.getElementById('s_specialization').value = staff.specialization || '';
            if (document.getElementById('s_join_date')) document.getElementById('s_join_date').value = staff.join_date || '';
            if (document.getElementById('s_experience')) document.getElementById('s_experience').value = staff.experience_years || 0;
            if (document.getElementById('s_syndicate_num')) document.getElementById('s_syndicate_num').value = staff.syndicate_number || '';
            if (document.getElementById('s_syndicate_expiry')) document.getElementById('s_syndicate_expiry').value = staff.syndicate_expiry_date || '';

            if (activeSwitch) activeSwitch.checked = staff.is_active !== false;
            if (loginSwitch) loginSwitch.checked = staff.can_login !== false;

            // الصلاحيات
            if (staff.permissions) {
                if (document.getElementById('perm_delete')) document.getElementById('perm_delete').checked = staff.permissions.can_delete || false;
                if (document.getElementById('perm_finance')) document.getElementById('perm_finance').checked = staff.permissions.can_finance || false;
                if (document.getElementById('perm_reports')) document.getElementById('perm_reports').checked = staff.permissions.can_reports || false;
            } else {
                if (document.getElementById('perm_delete')) document.getElementById('perm_delete').checked = false;
                if (document.getElementById('perm_finance')) document.getElementById('perm_finance').checked = false;
                if (document.getElementById('perm_reports')) document.getElementById('perm_reports').checked = false;
            }

            // المالية
            if (staff.salary_details) {
                if (document.getElementById('s_salary')) document.getElementById('s_salary').value = staff.salary_details.basic || staff.salary_details.base_salary || '';
                if (document.getElementById('s_commission')) document.getElementById('s_commission').value = staff.salary_details.commission || '';
                if (document.getElementById('s_allowance')) document.getElementById('s_allowance').value = staff.salary_details.allowance || '';
                if (document.getElementById('s_bank_name')) document.getElementById('s_bank_name').value = staff.salary_details.bank_name || '';
                if (document.getElementById('s_bank_iban')) document.getElementById('s_bank_iban').value = staff.salary_details.bank_iban || '';
            }

            // الطوارئ
            if (staff.emergency_contact) {
                if (document.getElementById('s_em_name')) document.getElementById('s_em_name').value = staff.emergency_contact.name || '';
                if (document.getElementById('s_em_phone')) document.getElementById('s_em_phone').value = staff.emergency_contact.phone || '';
                if (document.getElementById('s_em_relation')) document.getElementById('s_em_relation').value = staff.emergency_contact.relation || '';
            }

            document.getElementById('documents-area')?.classList.remove('d-none');
            renderStaffDocs(staff.staff_documents || []);
        }
    } else {
        currentEditingStaff = null;
    }
    
    const firstTabBtn = document.querySelector('#staffTabs button[data-bs-target="#tab-personal"]');
    if (firstTabBtn) {
        const firstTab = new bootstrap.Tab(firstTabBtn);
        firstTab.show();
    }

    const modalEl = document.getElementById('staffModal');
    if (modalEl) {
        const m = new bootstrap.Modal(modalEl);
        m.show();
    }
};

window.saveStaff = async function(event) {
    if (event) event.preventDefault();
    const btn = document.getElementById('btn_save_staff');
    if (btn) {
        btn.disabled = true; 
        btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> جاري حفظ وتأمين البيانات...';
    }

    const id = document.getElementById('staff_id')?.value;
    let finalAvatarUrl = document.getElementById('s_avatar')?.value.trim() || null;
    let staffName = document.getElementById('s_full_name')?.value.trim();

    // تشفير أو رفع الصورة الرمزية إن تم توفيرها كرابط
    if (navigator.onLine && finalAvatarUrl && finalAvatarUrl.startsWith('http') && !finalAvatarUrl.includes('googleusercontent.com') && !finalAvatarUrl.includes('drive.google.com')) {
        try {
            const imgRes = await fetch(finalAvatarUrl, { mode: 'cors' }).catch(() => null);
            if (imgRes && imgRes.ok) {
                const blob = await imgRes.blob();
                const file = new File([blob], `avatar_${staffName.replace(/\s+/g, '_')}.jpg`, { type: blob.type || 'image/jpeg' });
                const uploadRes = await API.uploadFileToR2(file, "HR", "Avatars");
                if (uploadRes && uploadRes.r2_key) {
                    finalAvatarUrl = uploadRes.r2_key;
                }
            }
        } catch (err) {
            console.warn("حفظ الرابط الأصلي للصورة لتعذر الرفع المباشر", err);
        }
    }
    
    // إعداد كائن البيانات المحدث
    const payloadData = {
        full_name: staffName,
        phone: document.getElementById('s_phone')?.value.trim(),
        telegram_id: document.getElementById('s_telegram_id')?.value ? Number(document.getElementById('s_telegram_id').value) : null,
        national_id: document.getElementById('s_national_id')?.value.trim() || null,
        gender: document.getElementById('s_gender')?.value || null,
        date_of_birth: document.getElementById('s_dob')?.value || null,
        avatar_url: finalAvatarUrl, 
        address: document.getElementById('s_address')?.value.trim() || null,
        role: document.getElementById('s_role')?.value || 'lawyer',
        specialization: document.getElementById('s_specialization')?.value.trim() || null,
        join_date: document.getElementById('s_join_date')?.value || null,
        experience_years: parseInt(document.getElementById('s_experience')?.value) || 0,
        syndicate_number: document.getElementById('s_syndicate_num')?.value.trim() || null,
        syndicate_expiry_date: document.getElementById('s_syndicate_expiry')?.value || null,
        
        is_active: document.getElementById('s_is_active') ? document.getElementById('s_is_active').checked : true,
        can_login: document.getElementById('s_can_login') ? document.getElementById('s_can_login').checked : true,

        permissions: {
            can_delete: document.getElementById('perm_delete')?.checked || false,
            can_finance: document.getElementById('perm_finance')?.checked || false,
            can_reports: document.getElementById('perm_reports')?.checked || false
        },
        
        salary_details: {
            basic: Number(document.getElementById('s_salary')?.value) || 0,
            commission: Number(document.getElementById('s_commission')?.value) || 0,
            allowance: Number(document.getElementById('s_allowance')?.value) || 0,
            bank_name: document.getElementById('s_bank_name')?.value.trim() || '',
            bank_iban: document.getElementById('s_bank_iban')?.value.trim() || ''
        },
        
        emergency_contact: {
            name: document.getElementById('s_em_name')?.value.trim() || '',
            phone: document.getElementById('s_em_phone')?.value.trim() || '',
            relation: document.getElementById('s_em_relation')?.value.trim() || ''
        }
    };

    try {
        let res;
        if (id) {
            res = await API.updateStaff(id, payloadData);
            if (res && !res.error) {
                Swal.fire({
                    toast: true, 
                    position: 'top-end', 
                    icon: res.offline ? 'warning' : 'success', 
                    title: res.offline ? 'تم الحفظ محلياً (طابور المزامنة)' : 'تم تحديث بيانات الكادر بنجاح', 
                    showConfirmButton: false, 
                    timer: 2500
                });
            }
        } else {
            res = await API.addStaff(payloadData);
            if (res && !res.error) {
                Swal.fire({
                    toast: true, 
                    position: 'top-end', 
                    icon: res.offline ? 'warning' : 'success', 
                    title: res.offline ? 'تم الحفظ محلياً في الطابور' : 'تم تعيين الكادر بنجاح', 
                    showConfirmButton: false, 
                    timer: 2500
                });
            }
        }
        
        if (res && res.error) throw new Error(res.error);
        
        closeModal('staffModal');
        await loadStaff();
    } catch (err) {
        Swal.fire('خطأ في الحفظ', err.message || 'تعذر حفظ بيانات الكادر. تأكد من صحة الحقول والاتصال.', 'error');
    } finally {
        if (btn) {
            btn.disabled = false; 
            btn.innerHTML = '<i class="fas fa-save me-2"></i> حفظ واعتماد بيانات الكادر';
        }
    }
};

/**
 * تفعيل أو إيقاف حساب الموظف فورياً مع إبطال جلسات KV في الخادم
 */
window.toggleStaffStatus = async function(id, currentActiveStatus) {
    const actionName = currentActiveStatus ? "إيقاف" : "تفعيل";
    const newStatus = !currentActiveStatus;

    const confirm = await Swal.fire({
        title: `هل أنت متأكد من ${actionName} الموظف؟`,
        text: currentActiveStatus ? "سيتم منعه من الدخول للنظام فوراً وإبطال جلساته النشطة، مع الاحتفاظ بملفاته وسجلاته التاريخية." : "سيتم تفعيل حسابه وإعادة صلاحية الدخول لممارسة مهامه.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: currentActiveStatus ? 'var(--danger-luxury)' : 'var(--success-luxury)',
        cancelButtonColor: '#6c757d',
        confirmButtonText: `نعم، قم بـ ${actionName} الحساب`,
        cancelButtonText: 'إلغاء'
    });

    if (!confirm.isConfirmed) return;

    try {
        const res = await API.updateStaff(id, { is_active: newStatus, can_login: newStatus });
        if (res && !res.error) {
            Swal.fire({
                toast: true, 
                position: 'top-end', 
                icon: res.offline ? 'warning' : 'success', 
                title: res.offline ? 'تم حفظ الحالة محلياً' : `تم ${actionName} حساب الموظف بنجاح`, 
                showConfirmButton: false, 
                timer: 2000
            });
            await loadStaff();
        } else {
            throw new Error(res?.error || 'حدث خطأ في الخادم أثناء التحديث');
        }
    } catch (err) {
        Swal.fire('فشل التحديث', 'تعذر تغيير حالة الحساب: ' + err.message, 'error');
    }
};

// ============================================================================
// [6] الذكاء الاصطناعي لاستخراج بيانات الهوية (Vision OCR & AI ID Extractor)
// ============================================================================

window.openAiIdModal = function() {
    const txt = document.getElementById('ai_id_text');
    if (txt) txt.value = '';
    const modalEl = document.getElementById('aiIdModal');
    if (modalEl) {
        const m = new bootstrap.Modal(modalEl);
        m.show();
    }
};

/**
 * التقاط صورة الهوية عبر الكاميرا وضغطها وإرسالها لمحرك Vision AI
 */
window.processIdImage = async function(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!navigator.onLine) {
        Swal.fire('تنبيه', 'محرك الذكاء الاصطناعي البصري (Vision) يتطلب اتصالاً نشطاً بالإنترنت.', 'warning');
        return;
    }

    Swal.fire({
        title: 'جاري مسح الهوية...', 
        text: 'يقوم الذكاء الاصطناعي بقراءة وتدقيق بيانات الهوية، يرجى الانتظار ثوانٍ.',
        allowOutsideClick: false, 
        didOpen: () => Swal.showLoading()
    });

    try {
        const compressedBase64 = await compressImageFile(file, 800);
        const aiRes = await API.readOCR(compressedBase64);
        
        if (aiRes && !aiRes.error) {
            let data = typeof aiRes === 'string' ? JSON.parse(aiRes) : aiRes;
            
            const nameVal = data.full_name || data["الاسم"] || data["الاسم الرباعي"];
            const idVal = data.national_id || data["الرقم الوطني"] || data["رقم الهوية"];
            const dobVal = data.date_of_birth || data["تاريخ الميلاد"];
            const addressVal = data.address || data["مكان الولادة"] || data["العنوان"];
            const genderVal = data.gender || data["الجنس"];

            if (nameVal && document.getElementById('s_full_name')) document.getElementById('s_full_name').value = nameVal;
            if (idVal && document.getElementById('s_national_id')) document.getElementById('s_national_id').value = idVal;
            if (dobVal && document.getElementById('s_dob')) document.getElementById('s_dob').value = dobVal;
            if (addressVal && document.getElementById('s_address')) document.getElementById('s_address').value = addressVal;
            if (genderVal && document.getElementById('s_gender')) document.getElementById('s_gender').value = genderVal;
            
            Swal.fire({
                toast: true, 
                position: 'top-end', 
                icon: 'success', 
                title: 'تمت قراءة الهوية وتعبئة الحقول بنجاح!', 
                showConfirmButton: false, 
                timer: 3000
            });
        } else {
            throw new Error(aiRes?.error || "تعذرت قراءة نص الهوية بوضوح.");
        }
    } catch (err) {
        Swal.fire('فشل القراءة الذكية', 'لم يتمكن المحرك من استخراج بيانات الهوية بدقة، يرجى التأكد من وضوح الصورة وتكرار المسح.', 'error');
    } finally {
        event.target.value = '';
    }
};

/**
 * ضغط الصورة محلياً على المتصفح لتسريع الرفع لـ Cloudflare Workers
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
                const scaleSize = Math.min(1, maxWidth / img.width);
                canvas.width = img.width * scaleSize;
                canvas.height = img.height * scaleSize;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                const base64Str = canvas.toDataURL('image/jpeg', 0.82).split(',')[1];
                resolve(base64Str);
            };
            img.onerror = error => reject(error);
        };
        reader.onerror = error => reject(error);
    });
}

/**
 * معالجة النص المنسوخ من OCR بواسطة الذكاء الاصطناعي
 */
window.processIdAI = async function() {
    if (!navigator.onLine) {
        Swal.fire('تنبيه', 'محرك الذكاء الاصطناعي يتطلب اتصالاً نشطاً بالإنترنت.', 'warning');
        return;
    }

    const text = document.getElementById('ai_id_text')?.value.trim();
    if (!text) { 
        Swal.fire('تنبيه', 'يرجى لصق النص المستخرج من الهوية أولاً.', 'warning'); 
        return; 
    }

    const btn = document.getElementById('btn_process_id');
    if (btn) {
        btn.disabled = true; 
        btn.innerHTML = '<i class="fas fa-robot fa-spin me-2"></i> جاري استخراج البيانات...';
    }

    try {
        const aiRes = await API.extractDataAI(text, 'id_extractor');
        if (aiRes && aiRes.extracted_json) {
            const data = aiRes.extracted_json;
            if (data.full_name && document.getElementById('s_full_name')) document.getElementById('s_full_name').value = data.full_name;
            if (data.national_id && document.getElementById('s_national_id')) document.getElementById('s_national_id').value = data.national_id;
            if (data.date_of_birth && document.getElementById('s_dob')) document.getElementById('s_dob').value = data.date_of_birth;
            if (data.address && document.getElementById('s_address')) document.getElementById('s_address').value = data.address;
            if (data.syndicate_number && document.getElementById('s_syndicate_num')) document.getElementById('s_syndicate_num').value = data.syndicate_number;
            
            Swal.fire({
                toast: true, 
                position: 'top-end', 
                icon: 'success', 
                title: 'تمت التعبئة الذكية بنجاح', 
                showConfirmButton: false, 
                timer: 2500
            });
            closeModal('aiIdModal');
        } else {
            Swal.fire('صعوبة في التحليل', 'لم يتمكن المحرك الذكي من استخراج بيانات واضحة من النص المدخل. يرجى مراجعة النص.', 'error');
        }
    } catch (err) {
        Swal.fire('فشل الاتصال', 'حدث خطأ أثناء الاتصال بمحرك الذكاء الاصطناعي.', 'error');
    } finally {
        if (btn) {
            btn.disabled = false; 
            btn.innerHTML = '<i class="fas fa-magic me-2"></i> تحليل وملء الحقول الذكية';
        }
    }
};

// ============================================================================
// [7] أرشيف وثائق الكادر السحابي المشفر (Cloudflare R2 Documents Vault)
// ============================================================================

window.renderStaffDocs = function(docs) {
    const list = document.getElementById('staff-docs-list');
    if (!list) return;

    if (!docs || docs.length === 0) {
        list.innerHTML = '<div class="text-muted small text-center p-4 border border-dashed rounded-4 bg-light fw-bold"><i class="fas fa-folder-open fa-2x mb-2 opacity-50"></i><br>لم يتم توثيق أي وثائق في الأرشيف السحابي لهذا الكادر بعد.</div>';
        return;
    }
    
    list.innerHTML = docs.map((doc, index) => {
        const isR2 = doc.url && !doc.url.startsWith('http');
        const viewBtn = isR2 
            ? `<button type="button" class="btn btn-sm btn-outline-primary bg-white fw-bold px-3 py-1 rounded-pill shadow-sm" onclick="API.downloadR2File('${escapeHTML(doc.url)}', '${escapeHTML(doc.name)}')"><i class="fas fa-shield-alt me-1 text-success"></i> تحميل مشفر</button>`
            : `<a href="${escapeHTML(doc.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-outline-primary bg-white fw-bold px-3 py-1 rounded-pill shadow-sm"><i class="fas fa-external-link-alt me-1"></i> فتح الرابط</a>`;

        return `
        <div class="compact-card bg-white shadow-sm d-flex justify-content-between align-items-center mb-2 p-3 rounded-4">
            <div class="d-flex align-items-center">
                <i class="fas fa-file-pdf text-danger fa-2x me-3 opacity-75"></i>
                <div>
                    <span class="fw-bold text-dark d-block" style="font-size: 0.95rem;">${escapeHTML(doc.name)}</span>
                    <small class="text-muted fw-bold font-monospace"><i class="fas fa-calendar-alt me-1"></i> ${new Date(doc.date).toLocaleDateString('ar-EG')}</small>
                </div>
            </div>
            <div class="d-flex gap-2">
                ${viewBtn}
                <button type="button" class="btn btn-sm btn-light text-danger border px-3 py-1 rounded-pill shadow-sm" onclick="deleteStaffDoc(${index})" title="حذف الوثيقة">
                    <i class="fas fa-trash"></i>
                </button>
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
    const nameInput = document.getElementById('doc_name');
    
    if (!fileInput || !fileInput.files.length) { 
        Swal.fire('تنبيه', 'يرجى اختيار ملف الوثيقة من جهازك أولاً.', 'warning'); 
        return; 
    }

    const docName = (nameInput?.value.trim()) || fileInput.files[0].name;
    const btn = document.getElementById('btnUploadDoc');
    if (btn) {
        btn.disabled = true; 
        btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> جاري الرفع...';
    }
    
    try {
        const file = fileInput.files[0];
        const r2Res = await API.uploadFileToR2(file, "HR", "Docs");
        
        if (r2Res && r2Res.r2_key) {
            let currentDocs = currentEditingStaff.staff_documents || [];
            currentDocs.push({
                name: docName,
                url: r2Res.r2_key,
                date: new Date().toISOString()
            });
            
            const res = await API.updateStaff(currentEditingStaff.id, { staff_documents: currentDocs });
            
            if (res && !res.error) {
                currentEditingStaff.staff_documents = currentDocs; 
                fileInput.value = '';
                if (nameInput) nameInput.value = '';
                renderStaffDocs(currentDocs);
                
                Swal.fire({
                    toast: true, 
                    position: 'top-end', 
                    icon: 'success', 
                    title: 'تمت إضافة الوثيقة إلى الأرشيف السحابي بنجاح', 
                    showConfirmButton: false, 
                    timer: 2500
                });
            } else {
                throw new Error(res?.error || 'خطأ في استجابة الخادم عند تحديث السجل');
            }
        }
    } catch (err) {
        Swal.fire('فشل الرفع السحابي', err.message || 'تعذر رفع الوثيقة.', 'error');
    } finally {
        if (btn) {
            btn.disabled = false; 
            btn.innerHTML = '<i class="fas fa-upload me-1"></i> رفع للأرشيف';
        }
    }
};

window.deleteStaffDoc = async function(index) {
    const confirm = await Swal.fire({
        title: 'تأكيد الحذف؟', 
        text: 'هل أنت متأكد من حذف هذه الوثيقة من الأرشيف السحابي للموظف؟',
        icon: 'warning', 
        showCancelButton: true, 
        confirmButtonColor: 'var(--danger-luxury)', 
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'نعم، احذف', 
        cancelButtonText: 'إلغاء'
    });
    
    if (!confirm.isConfirmed) return;
    
    let currentDocs = currentEditingStaff.staff_documents || [];
    currentDocs.splice(index, 1);
    
    try {
        const res = await API.updateStaff(currentEditingStaff.id, { staff_documents: currentDocs });
        if (res && !res.error) {
            currentEditingStaff.staff_documents = currentDocs;
            renderStaffDocs(currentDocs);
            Swal.fire({
                toast: true, 
                position: 'top-end', 
                icon: res.offline ? 'warning' : 'success', 
                title: res.offline ? 'تم الحذف محلياً' : 'تم حذف الوثيقة بنجاح', 
                showConfirmButton: false, 
                timer: 2000
            });
        } else {
            throw new Error(res?.error || 'تعذر تحديث السجل');
        }
    } catch (err) {
        Swal.fire('خطأ', 'تعذر حذف الوثيقة: ' + err.message, 'error');
    }
};
