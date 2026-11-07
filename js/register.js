/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: js/register.js
 * الوصف: المحرك البرمجي لمركز القيادة والإدارة العليا (Super Admin Engine V6.2 True Zero-Trust)
 * التصميم: متوافق 100% مع الهوية الناعمة والمدمجة (Soft & Compact UI)
 * التحديثات (V6.2):
 * 1. ربط WebAuthn للإدارة العليا بتحدي الخادم (/api/auth/webauthn-challenge) واستخراج المفتاح العام SPKI الحقيقي.
 * 2. محرك شبكة مستقل (SUPER_API) مزود بـ x-device-id ومعالج 401 التلقائي.
 * 3. جدار حماية (Firewall) يمنع أي دور وظيفي غير الـ Super Admin من الدخول.
 * 4. محرك تحليل ذكي (AI Analyzer) لمراقبة استهلاك الكوتا وانتهاء الاشتراكات.
 * 5. إدارة دورة حياة المكاتب (تأسيس، تعديل شامل، تجديد، حظر/تفعيل).
 * ============================================================================
 */

// ============================================================================
// [1] المتغيرات العامة ومحرك الشبكة (Globals & Network Engine)
// ============================================================================
let globalFirms = []; // لتخزين بيانات المكاتب محلياً وتسريع البحث اللحظي الفوري

/**
 * استخراج عدد المستخدمين الفعلي للمكتب سواء أرجعه Supabase كـ [{count: N}] أو كمصفوفة سجلات
 */
function extractFirmUsersCount(firm) {
    if (!firm || !firm.mo_users || !Array.isArray(firm.mo_users)) return 0;
    if (firm.mo_users.length === 1 && typeof firm.mo_users[0]?.count === 'number') {
        return firm.mo_users[0].count;
    }
    return firm.mo_users.length;
}

/**
 * محرك الاتصال الخاص بالإدارة العليا (Super Admin API Wrapper)
 * يقوم تلقائياً بدمج التوكن وبصمة الجهاز والمسار الأساسي
 */
const SUPER_API = {
    fetch: async (endpoint, method = 'GET', body = null) => {
        const token = localStorage.getItem(CONFIG?.TOKEN_KEY || 'moakkil_token');
        const deviceId = localStorage.getItem('moakkil_device_id') || 'unknown-device';
        const baseUrl = window.API_BASE_URL || CONFIG?.API_URL || '';

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'x-device-id': deviceId
        };
        
        const options = { method, headers };
        if (body) options.body = JSON.stringify(body);

        try {
            const res = await fetch(`${baseUrl}${endpoint}`, options);

            if (res.status === 401) {
                console.warn("⚠️ [SuperAdmin Security] انتهت صلاحية جلسة الإدارة العليا. جاري تسجيل الخروج...");
                if (typeof AUTH !== 'undefined' && typeof AUTH.logout === 'function') {
                    await AUTH.logout();
                } else {
                    localStorage.removeItem(CONFIG?.TOKEN_KEY || 'moakkil_token');
                    window.location.replace('login.html');
                }
                throw new Error('انتهت صلاحية الجلسة الأمنية. يرجى تسجيل الدخول مجدداً.');
            }

            const data = await res.json();
            
            if (!res.ok) throw new Error(data.error || data.message || 'خطأ في الاتصال بالخادم السحابي لـ Moakkil');
            return data;
        } catch (err) {
            console.error(`🛡️ [SuperAdmin API Error] ${endpoint}:`, err);
            throw err;
        }
    }
};

// ============================================================================
// [2] جدار الحماية والتهيئة الأولية (Boot & Security Firewall)
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    // 1. التحقق الأمني الصارم: طرد أي مستخدم لا يملك صلاحية الإدارة العليا
    const user = typeof AUTH !== 'undefined' ? AUTH.checkSession() : null;
    
    if (!user || (user.role !== 'super_admin' && user.role !== 'superadmin')) {
        console.warn("⚠️ [Security Breach] محاولة وصول غير مصرحة لمركز القيادة. جاري الطرد...");
        window.location.replace('app.html');
        return;
    }

    // 2. فحص البصمة: إخفاء زر تسجيل البصمة إذا تم تسجيلها مسبقاً على هذا الجهاز
    if (localStorage.getItem('moakkil_biometric_id')) {
        const bioBtn = document.getElementById('btnBioRegister');
        if (bioBtn) bioBtn.classList.add('d-none');
    }

    // 3. إقلاع النظام: جلب الإحصائيات والمكاتب
    loadStats();
    loadFirms();
});

// ============================================================================
// [3] لوحة القيادة والمحلل الذكي (Dashboards & AI Analyzer)
// ============================================================================

/**
 * جلب وتحديث الإحصائيات العلوية (المكاتب، الكوادر، القضايا)
 */
async function loadStats() {
    try {
        const data = await SUPER_API.fetch('/api/super/stats');
        // استخدام أنيميشن العدادات لرفع القيمة من 0 إلى الرقم الحقيقي
        animateValue('stat-firms', 0, data.firms_count || 0, 1000);
        animateValue('stat-users', 0, data.users_count || 0, 1000);
        animateValue('stat-cases', 0, data.cases_count || 0, 1000);
    } catch (error) {
        console.error("❌ فشل تحميل الإحصائيات العامة:", error);
    }
}

/**
 * 🧠 محرك تحليل البيانات الذكي (AI Data Analyzer)
 * يقوم بفحص مصفوفة المكاتب واستخراج تنبيهات أمنية وإدارية استباقية
 */
function analyzeFirmsData(firms) {
    const now = new Date();
    let activeCount = 0;
    let expiringSoonCount = 0;
    let expiredCount = 0;
    let highUsageFirms = [];

    firms.forEach(f => {
        if (f.subscription_end_date) {
            const endDate = new Date(f.subscription_end_date);
            const daysLeft = (endDate - now) / (1000 * 60 * 60 * 24);
            
            const usersCount = extractFirmUsersCount(f);
            
            if (f.is_active && endDate >= now) activeCount++;
            if (f.is_active && daysLeft > 0 && daysLeft <= 14) expiringSoonCount++;
            if (endDate < now) expiredCount++;
            
            // تحليل الكوتا: مكاتب استهلكت 100% أو أكثر من حساباتها المسموحة
            if (usersCount >= f.max_users && f.is_active) {
                highUsageFirms.push(f.firm_name);
            }
        }
    });

    // تحديث كرت المكاتب النشطة في الواجهة
    animateValue('stat-active-firms', 0, activeCount, 1000);

    // صياغة تقرير الذكاء الاصطناعي وبثه في واجهة الـ UI
    const alertBox = document.getElementById('aiAnalysisText');
    const alertContainer = document.getElementById('aiAlertsContainer');
    const iconContainer = document.querySelector('.ai-icon-container');
    
    let analysisMsg = "";
    
    if (expiringSoonCount > 0) {
        analysisMsg = `<span class="text-danger">⚠️ <b>تنبيه استباقي:</b> رصدنا ${expiringSoonCount} كيانات سينتهي اشتراكها قريباً (خلال 14 يوم). </span>`;
        if (alertContainer) alertContainer.style.borderRightColor = "#EE5D50"; 
        if (iconContainer) iconContainer.style.background = "#EE5D50";
    } else if (expiredCount > 0) {
        analysisMsg = `<span class="text-warning text-dark">⏳ <b>حالة معلقة:</b> يوجد ${expiredCount} مكاتب منتهية الصلاحية معلقة في النظام وتتطلب اتخاذ إجراء. </span>`;
    } else {
        analysisMsg = `<span class="text-success">✅ <b>حالة مستقرة:</b> لا توجد اشتراكات منتهية أو على وشك الانتهاء قريباً. </span>`;
        if (alertContainer) alertContainer.style.borderRightColor = "#01B574";
        if (iconContainer) iconContainer.style.background = "#01B574";
    }

    if (highUsageFirms.length > 0) {
        analysisMsg += `<br><span class="d-block mt-2">📈 <b style="color: var(--navy);">ملاحظة:</b> مكاتب استهلكت كامل كوتا الموظفين (استهدفها لترقية الباقة): ${highUsageFirms.slice(0, 2).map(escapeHTML).join('، ')} ${highUsageFirms.length > 2 ? 'وغيرها' : ''}.</span>`;
    }

    if (alertBox) alertBox.innerHTML = analysisMsg;
}

// ============================================================================
// [4] جلب وعرض الجداول (Data Fetching & Rendering - Soft UI)
// ============================================================================

/**
 * جلب جميع المكاتب من الخادم السحابي
 */
async function loadFirms() {
    const tbody = document.getElementById('firmsTableBody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-5 bg-white"><i class="fas fa-spinner fa-spin text-accent fa-2x mb-3"></i><br><span class="text-navy fw-bold">جاري المزامنة مع الخوادم المركزية...</span></td></tr>`;
    
    try {
        const firms = await SUPER_API.fetch('/api/super/firms');
        globalFirms = Array.isArray(firms) ? firms : []; 
        
        // تصفير حقل البحث
        const searchInput = document.getElementById('searchFirmInput');
        if (searchInput) searchInput.value = '';
        
        // تشغيل محرك التحليل الذكي للبيانات
        analyzeFirmsData(globalFirms);
        
        // رسم الجدول
        renderFirmsTable(globalFirms);
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger fw-bold py-5 bg-danger bg-opacity-10"><i class="fas fa-wifi-slash fa-2x mb-2 d-block"></i> فشل الاتصال بالخادم. يرجى التحقق من الشبكة وإعادة المحاولة.</td></tr>`;
        Swal.fire({ icon: 'error', title: 'خطأ اتصال', text: 'فشل تحميل بيانات الكيانات القانونية.' });
    }
}

/**
 * رسم جدول الكيانات القانونية (Firms Table - Compact & Clean UI)
 */
function renderFirmsTable(firmsArray) {
    const tbody = document.getElementById('firmsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!firmsArray || firmsArray.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted fw-bold py-5 bg-white">لا توجد سجلات مكاتب تطابق بحثك حالياً</td></tr>`;
        return;
    }

    firmsArray.forEach(firm => {
        const endDate = firm.subscription_end_date ? new Date(firm.subscription_end_date) : new Date();
        const isExpired = endDate < new Date();
        
        // شارة الحالة (Soft Badge)
        const statusBadge = (firm.is_active && !isExpired)
            ? `<span class="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 px-3 py-1 rounded-pill shadow-sm"><i class="fas fa-check-circle me-1"></i> يعمل</span>`
            : `<span class="badge bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25 px-3 py-1 rounded-pill shadow-sm"><i class="fas fa-exclamation-triangle me-1"></i> ${isExpired ? 'منتهية الصلاحية' : 'موقوف إدارياً'}</span>`;

        // تحليل كوتا الموظفين
        const usersCount = extractFirmUsersCount(firm);
        const quotaColor = usersCount >= firm.max_users ? 'text-danger fw-bolder bg-danger bg-opacity-10 px-2 py-1 rounded' : 'text-primary';

        // أزرار التحكم الدائرية الصغيرة (Compact Action Buttons)
        tbody.innerHTML += `
            <tr class="fade-in align-middle bg-white transition-hover">
                <td class="fw-bold text-navy" style="white-space: normal;">
                    <div class="d-flex align-items-center">
                        <div class="icon-box bg-light text-accent rounded-circle d-flex align-items-center justify-content-center me-3" style="width: 40px; height: 40px; flex-shrink: 0;">
                            <i class="fas fa-building"></i>
                        </div>
                        <span>${escapeHTML(firm.firm_name)}</span>
                    </div>
                </td>
                <td dir="ltr" class="text-end fw-bold font-monospace ${isExpired ? 'text-danger' : 'text-muted'}">
                    ${endDate.toLocaleDateString('en-GB')}
                </td>
                <td class="fw-bold ${quotaColor} font-monospace fs-6 text-center">
                    ${usersCount} / ${firm.max_users}
                </td>
                <td class="text-center">${statusBadge}</td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-secondary bg-white border-0 shadow-sm rounded-circle me-1" style="width: 35px; height: 35px;" onclick="openEditFirmModal('${firm.id}')" title="التعديل الشامل">
                        <i class="fas fa-cog text-navy"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-success bg-white border-0 shadow-sm rounded-circle me-1" style="width: 35px; height: 35px;" onclick="openRenewModal('${firm.id}')" title="تجديد الاشتراك">
                        <i class="fas fa-calendar-plus text-success"></i>
                    </button>
                    <button class="btn btn-sm ${firm.is_active ? 'btn-outline-danger' : 'btn-outline-info'} bg-white border-0 shadow-sm rounded-circle" style="width: 35px; height: 35px;" 
                        onclick="toggleFirmStatus('${firm.id}', ${!firm.is_active}, ${firm.max_users}, '${escapeHTML(firm.firm_name).replace(/'/g, "\\'")}')" title="${firm.is_active ? 'إيقاف المكتب' : 'تفعيل المكتب'}">
                        <i class="fas ${firm.is_active ? 'fa-ban text-danger' : 'fa-power-off text-info'}"></i>
                    </button>
                </td>
            </tr>
        `;
    });
}

/**
 * محرك البحث الفوري في الجدول
 */
window.filterFirms = function() {
    const searchInput = document.getElementById('searchFirmInput');
    if (!searchInput) return;
    const searchTerm = searchInput.value.toLowerCase().trim();
    if (searchTerm === '') { 
        renderFirmsTable(globalFirms); 
        return; 
    }

    const filtered = globalFirms.filter(firm => {
        const nameMatch = (firm.firm_name || '').toLowerCase().includes(searchTerm);
        const statusMatch = firm.is_active ? 'يعمل'.includes(searchTerm) : ('موقوف'.includes(searchTerm) || 'منتهي'.includes(searchTerm));
        return nameMatch || statusMatch;
    });
    
    renderFirmsTable(filtered);
};

// ============================================================================
// [5] عمليات الإدارة العليا (CRUD Operations)
// ============================================================================

/**
 * 1. تأسيس كيان جديد (Create Firm)
 */
document.getElementById('addFirmForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnSubmitFirm');
    const originalText = btn.innerHTML;
    btn.disabled = true; 
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> جاري تأسيس الكيان في الخوادم...';

    const payload = {
        firm_name: document.getElementById('newFirmName').value.trim(),
        subscription_months: document.getElementById('newFirmMonths').value,
        max_users: document.getElementById('newFirmMaxUsers').value,
        admin_name: document.getElementById('newAdminName').value.trim(),
        admin_phone: document.getElementById('newAdminPhone').value.trim(),
        telegram_id: document.getElementById('newAdminTelegram').value.trim() || null
    };

    try {
        await SUPER_API.fetch('/api/super/register-firm', 'POST', payload);
        
        // إغلاق النافذة بنجاح
        bootstrap.Modal.getInstance(document.getElementById('addFirmModal'))?.hide();
        document.getElementById('addFirmForm').reset();
        
        Swal.fire({ icon: 'success', title: 'تم التأسيس بنجاح!', text: `تم تسجيل الكيان القانوني "${payload.firm_name}" وتم إنشاء حساب مديره العام.`, confirmButtonColor: '#0a192f' });
        
        // تحديث الواجهة
        loadStats(); 
        loadFirms();
    } catch (error) {
        Swal.fire({ icon: 'error', title: 'فشل التأسيس', text: error.message, confirmButtonColor: '#EE5D50' });
    } finally {
        btn.disabled = false; 
        btn.innerHTML = originalText;
    }
});

/**
 * 2. التعديل الشامل لبيانات المكتب والمدير (Edit Firm & Admin)
 */
window.openEditFirmModal = function(firmId) {
    const firm = globalFirms.find(f => f.id === firmId);
    if (!firm) return;

    // تعبئة البيانات الأساسية للمكتب
    document.getElementById('editFirmId').value = firm.id;
    document.getElementById('editFirmName').value = firm.firm_name;
    document.getElementById('editFirmMaxUsers').value = firm.max_users;

    // معالجة التاريخ بدقة لتجنب أخطاء المناطق الزمنية (Timezones)
    if (firm.subscription_end_date) {
        const dateObj = new Date(firm.subscription_end_date);
        const yyyy = dateObj.getFullYear();
        const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
        const dd = String(dateObj.getDate()).padStart(2, '0');
        document.getElementById('editFirmEndDate').value = `${yyyy}-${mm}-${dd}`;
    } else { 
        document.getElementById('editFirmEndDate').value = ''; 
    }

    // استخراج بيانات المدير العام من المصفوفة إن وجدت
    const adminUser = (firm.mo_users && Array.isArray(firm.mo_users)) ? firm.mo_users.find(u => u.role === 'admin') : null;
    
    if (document.getElementById('editAdminName')) document.getElementById('editAdminName').value = adminUser ? (adminUser.full_name || '') : '';
    if (document.getElementById('editAdminPhone')) document.getElementById('editAdminPhone').value = adminUser ? (adminUser.phone || '') : '';
    if (document.getElementById('editAdminTelegram')) document.getElementById('editAdminTelegram').value = adminUser ? (adminUser.telegram_id || '') : '';

    new bootstrap.Modal(document.getElementById('editFirmModal')).show();
};

document.getElementById('editFirmForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnSubmitEditFirm');
    btn.disabled = true; 
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> جاري حفظ التعديلات...';

    // تجهيز حزمة البيانات (Payload) التي تشمل المكتب والمدير معاً
    const payload = {
        id: document.getElementById('editFirmId').value,
        firm_name: document.getElementById('editFirmName').value.trim(),
        max_users: parseInt(document.getElementById('editFirmMaxUsers').value),
        subscription_end_date: new Date(document.getElementById('editFirmEndDate').value).toISOString(),
        admin_name: document.getElementById('editAdminName')?.value?.trim() || undefined,
        admin_phone: document.getElementById('editAdminPhone')?.value?.trim() || undefined,
        admin_telegram: document.getElementById('editAdminTelegram')?.value?.trim() || null
    };

    try {
        await SUPER_API.fetch('/api/super/firms', 'PATCH', payload);
        
        bootstrap.Modal.getInstance(document.getElementById('editFirmModal'))?.hide();
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'تم حفظ التعديلات الشاملة بنجاح', timer: 2000, showConfirmButton: false });
        
        loadFirms(); 
    } catch (error) { 
        Swal.fire({ icon: 'error', title: 'خطأ في التعديل', text: error.message });
    } finally { 
        btn.disabled = false; 
        btn.innerHTML = '<i class="fas fa-save me-2"></i> حفظ التعديلات الشاملة'; 
    }
});

/**
 * 3. تجديد أو تمديد اشتراك مكتب (Renew Firm)
 */
window.openRenewModal = function(firmId) {
    document.getElementById('renewFirmId').value = firmId;
    document.getElementById('renewMonths').value = 12; // القيمة الافتراضية سنة
    new bootstrap.Modal(document.getElementById('renewFirmModal')).show();
};

document.getElementById('renewFirmForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnSubmitRenew');
    btn.disabled = true; 
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';

    const payload = { 
        id: document.getElementById('renewFirmId').value, 
        add_months: parseInt(document.getElementById('renewMonths').value) 
    };

    try {
        await SUPER_API.fetch('/api/super/renew-firm', 'POST', payload);
        
        bootstrap.Modal.getInstance(document.getElementById('renewFirmModal'))?.hide();
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'تم تمديد الاشتراك وتفعيل المكتب بنجاح!', timer: 2500, showConfirmButton: false });
        
        loadFirms();
    } catch (error) { 
        Swal.fire({ icon: 'error', title: 'خطأ', text: error.message });
    } finally { 
        btn.disabled = false; 
        btn.innerHTML = '<i class="fas fa-check-circle me-2"></i> تأكيد التمديد'; 
    }
});

/**
 * 4. إيقاف / تفعيل مكتب (Toggle Firm Status)
 */
window.toggleFirmStatus = async function(firmId, newStatus, maxUsers, firmName) {
    const actionName = newStatus ? 'تفعيل وإعادة إطلاق' : 'الإيقاف والحظر الإداري لـ';
    
    const confirm = await Swal.fire({
        title: `إجراء حرج للإدارة العليا`, 
        text: `هل أنت متأكد من ${actionName} كيان (${firmName})؟ في حال الإيقاف سيتم طرد جلسات الموظفين فوراً ولن يتمكن أي موظف تابع لهم من دخول النظام.`,
        icon: 'warning', 
        showCancelButton: true,
        confirmButtonColor: newStatus ? '#01B574' : '#EE5D50', 
        cancelButtonColor: '#A3AED0',
        confirmButtonText: `نعم، تأكيد ${newStatus ? 'التفعيل' : 'الإيقاف'}`, 
        cancelButtonText: 'تراجع وإلغاء'
    });

    if (!confirm.isConfirmed) return;

    try {
        await SUPER_API.fetch('/api/super/firms', 'PATCH', { id: firmId, is_active: newStatus, max_users: maxUsers });
        
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'تم تنفيذ الإجراء بنجاح', timer: 2000, showConfirmButton: false });
        loadFirms();
    } catch (error) { 
        Swal.fire({ icon: 'error', title: 'فشل الإجراء', text: error.message }); 
    }
};

// ============================================================================
// [6] الدوال المساعدة والأمان (Utilities & Sanitization)
// ============================================================================

/**
 * عداد الأرقام التفاعلي للإحصائيات
 */
function animateValue(id, start, end, duration) {
    let obj = document.getElementById(id);
    if (!obj) return;
    if (start === end) { obj.innerHTML = end; return; }
    let range = end - start, current = start, increment = end > start ? 1 : -1;
    let stepTime = Math.max(Math.abs(Math.floor(duration / range)), 15);
    
    let timer = setInterval(function() {
        current += increment; 
        obj.innerHTML = current.toLocaleString('en-US'); // إضافة فواصل الآلاف
        if (current === end) clearInterval(timer);
    }, stepTime);
}

/**
 * حماية واجهة الإدارة العليا من ثغرات XSS
 */
function escapeHTML(str) {
    if (!str) return '';
    return str.toString().replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
}

/**
 * تحويل ArrayBuffer إلى Base64URL
 */
function bufferToBase64Url(buffer) {
    if (!buffer) return '';
    const bytes = new Uint8Array(buffer);
    let str = '';
    for (let charCode of bytes) str += String.fromCharCode(charCode);
    return window.btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * تحويل Base64URL إلى ArrayBuffer
 */
function base64UrlToBuffer(base64Url) {
    let b64 = String(base64Url || '').replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4 !== 0) b64 += "=";
    const str = window.atob(b64);
    const bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
    return bytes.buffer;
}

// ============================================================================
// [7] نظام البصمة الحيوية التشفيري للإدارة العليا (Super Admin WebAuthn V6.2)
// ============================================================================

window.registerBiometricDevice = async function() {
    if (!navigator.onLine) {
        Swal.fire({ icon: 'warning', title: 'لا يوجد اتصال', text: 'يرجى الاتصال بالإنترنت لتفعيل البصمة المشفرة مع الخادم.' });
        return;
    }

    if (!window.PublicKeyCredential) {
        Swal.fire({ icon: 'error', title: 'غير مدعوم', text: 'الجهاز أو المتصفح الحالي لا يدعم تقنية البصمة البيومترية (WebAuthn).' });
        return;
    }

    try {
        const user = typeof AUTH !== 'undefined' ? AUTH.checkSession() : null;
        if (!user) {
            Swal.fire({ icon: 'error', title: 'مرفوض أمنياً', text: 'يجب أن تكون الجلسة نشطة لربط البصمة.' });
            return;
        }

        Swal.fire({
            title: 'نظام الحماية المتقدم...',
            text: 'جاري طلب تحدي التشفير من الخادم... استخدم بصمتك أو رمز قفل الشاشة للتأكيد',
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading(); }
        });

        // 1. إذا كانت دالة AUTH.registerBiometric الموحدة متاحة، نستخدمها مباشرة لأنها تطبق العقد الجديد بالكامل
        if (typeof AUTH !== 'undefined' && typeof AUTH.registerBiometric === 'function') {
            const result = await AUTH.registerBiometric();
            const bioBtn = document.getElementById('btnBioRegister');
            if (bioBtn) bioBtn.classList.add('d-none');
            Swal.fire({
                icon: 'success',
                title: 'تم الربط الأمني بنجاح',
                text: result.message || 'تم تشفير مفتاحك العام وتفعيل بصمتك للوصول السريع مستقبلاً.',
                confirmButtonColor: '#0a192f'
            });
            return;
        }

        // 2. مسار احتياطي مباشر يطبق نفس عقد WebAuthn (Server Challenge + SPKI Public Key)
        const chalData = await SUPER_API.fetch('/api/auth/webauthn-challenge', 'POST', {
            phone: user.phone || localStorage.getItem('moakkil_saved_phone')
        });

        if (!chalData || !chalData.challenge) {
            throw new Error('فشل الحصول على تحدي الأمان (Challenge) من الخادم.');
        }

        const publicKeyCredentialCreationOptions = {
            challenge: base64UrlToBuffer(chalData.challenge),
            rp: { name: "نظام موكّل للإدارة العليا", id: window.location.hostname },
            user: {
                id: new TextEncoder().encode(String(user.id || user.uid || 'super_admin')),
                name: user.phone || "super_admin_phone",
                displayName: "القيادة العليا (Super Admin)"
            },
            pubKeyCredParams: [
                { alg: -7, type: "public-key" },   // ES256
                { alg: -257, type: "public-key" }  // RS256
            ],
            authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
            timeout: 60000, 
            attestation: "none"
        };

        const credential = await navigator.credentials.create({ publicKey: publicKeyCredentialCreationOptions });
        const credential_id = credential.id;
        
        if (!credential_id) throw new Error("فشل توليد مفتاح التشفير للبصمة.");

        let spkiBase64 = '';
        if (credential.response && typeof credential.response.getPublicKey === 'function') {
            const spkiBuffer = credential.response.getPublicKey();
            if (spkiBuffer) spkiBase64 = bufferToBase64Url(spkiBuffer);
        }
        if (!spkiBase64) {
            throw new Error("متصفحك لا يدعم استخراج المفتاح العام التشفيري (getPublicKey).");
        }

        const algorithm = (credential.response && typeof credential.response.getPublicKeyAlgorithm === 'function')
            ? credential.response.getPublicKeyAlgorithm()
            : -7;

        // إرسال المفتاح العام الحقيقي والتحدي للباك إند
        await SUPER_API.fetch('/api/auth/biometric-register', 'POST', {
            credential_id: credential_id,
            public_key_spki: spkiBase64,
            public_key: spkiBase64,
            algorithm: algorithm,
            challenge: chalData.challenge,
            device_name: navigator.userAgent.substring(0, 50)
        });

        // حفظ معرف البصمة ورقم الهاتف محلياً
        localStorage.setItem('moakkil_biometric_id', credential_id);
        if (user.phone) localStorage.setItem('moakkil_saved_phone', user.phone);
        
        // إخفاء الزر بعد التفعيل الناجح
        const bioBtn = document.getElementById('btnBioRegister');
        if (bioBtn) bioBtn.classList.add('d-none');

        Swal.fire({
            icon: 'success',
            title: 'تم الربط الأمني',
            text: 'تم تشفير مفتاحك العام وتفعيل بصمتك بنجاح للوصول السريع مستقبلاً.',
            confirmButtonColor: '#0a192f'
        });

    } catch (err) {
        console.error("Super Admin Biometric Error:", err);
        Swal.fire({
            icon: 'error',
            title: 'فشل التفعيل',
            text: err.message || 'تم إلغاء العملية أو أن متصفحك يمنعها حالياً.'
        });
    }
};