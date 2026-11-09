/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026 | V5.6 Enterprise
 * الملف: js/register.js
 * الوصف: المحرك البرمجي لمركز القيادة والإدارة العليا (Super Admin Command Center)
 * التصميم: متوافق 100% مع معايير V5.6، الوضع الليلي الفائق، وإدارة الأساطيل القانونية
 * الخصائص الرئيسية:
 * 1. جدار حماية صارم (Security Firewall) يمنع أي دور بخلاف Super Admin من الوصول.
 * 2. إدارة دورة حياة الكيانات المتعددة (Multi-tenancy): التأسيس، التعديل الشامل، التجديد، الحظر الفوري.
 * 3. محلل ذكاء اصطناعي أمني وإداري (AI Fleet Analyzer) لرصد استهلاك الكوتا والاشتراكات.
 * 4. تكامل تشفيري متقدم للبصمة البيومترية (FIDO2 / WebAuthn V5.6) مع تحدي الخادم ومفتاح SPKI.
 * 5. محرك شبكي ذكي (SUPER_API) مع توجيه آلي لبصمة الجهاز (x-device-id) وتجديد الجلسات.
 * ============================================================================
 */

// ============================================================================
// [1] المتغيرات العامة ومحرك الشبكة (Globals & Super Admin Network Engine)
// ============================================================================
let globalFirms = []; // ذاكرة محلية سريعة لتخزين بيانات المكاتب وتفعيل البحث اللحظي فائق السرعة

/**
 * استخراج عدد المستخدمين الفعلي للكيان القانوني سواء أرجعه Supabase كـ [{count: N}] أو كمصفوفة سجلات
 */
function extractFirmUsersCount(firm) {
    if (!firm || !firm.mo_users || !Array.isArray(firm.mo_users)) return 0;
    if (firm.mo_users.length === 1 && typeof firm.mo_users[0]?.count === 'number') {
        return firm.mo_users[0].count;
    }
    return firm.mo_users.length;
}

/**
 * محرك الاتصال الخاص بالإدارة العليا (Super Admin API Engine)
 * يتكفل بتضمين التوكن الأمني، بصمة الجهاز، ومعالجة انتهاء الجلسات فورياً
 */
const SUPER_API = {
    fetch: async (endpoint, method = 'GET', body = null) => {
        const token = localStorage.getItem(window.CONFIG?.TOKEN_KEY || 'moakkil_token');
        const deviceId = localStorage.getItem('moakkil_device_id') || 'unknown-device';
        const baseUrl = window.API_BASE_URL || window.CONFIG?.API_URL || '';

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
                console.warn("⚠️ [SuperAdmin Security] انتهت صلاحية جلسة القيادة العليا. جاري تحويل المسار بأمان...");
                if (typeof AUTH !== 'undefined' && typeof AUTH.logout === 'function') {
                    await AUTH.logout();
                } else {
                    localStorage.removeItem(window.CONFIG?.TOKEN_KEY || 'moakkil_token');
                    window.location.replace('login.html');
                }
                throw new Error('انتهت صلاحية الجلسة الأمنية للإدارة العليا. يرجى تسجيل الدخول مجدداً.');
            }

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || data.message || 'خطأ في الاتصال بالسيرفر السحابي المركزي لمنصة موكّل.');
            }
            return data;
        } catch (err) {
            console.error(`🛡️ [SuperAdmin API Error] ${endpoint}:`, err);
            throw err;
        }
    }
};

// ============================================================================
// [2] جدار الحماية والتهيئة الأولية (Boot & Zero-Trust Security Firewall)
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    // 1. التحقق الأمني الصارم: طرد أي مستخدم لا يملك صلاحية الإدارة العليا (Super Admin)
    const user = typeof AUTH !== 'undefined' ? AUTH.checkSession() : null;

    if (!user || (user.role !== 'super_admin' && user.role !== 'superadmin')) {
        console.warn("⚠️ [Security Breach] محاولة غير مصرحة للوصول لمركز القيادة العليا. جاري إعادة التوجيه...");
        window.location.replace('app.html');
        return;
    }

    // 2. فحص البصمة: إخفاء زر تسجيل البصمة إذا كانت مفعلة مسبقاً على هذا الجهاز
    if (localStorage.getItem('moakkil_biometric_id')) {
        const bioBtn = document.getElementById('btnBioRegister');
        if (bioBtn) bioBtn.classList.add('d-none');
    }

    // 3. إقلاع واجهة مركز القيادة: جلب الإحصائيات الشاملة وأسطول الكيانات
    loadStats();
    loadFirms();
});

// ============================================================================
// [3] لوحة القيادة والمحلل الذكي (Executive Metrics & AI Fleet Analyzer)
// ============================================================================

/**
 * جلب وتحديث الإحصائيات الإجمالية (الكيانات، المستخدمين، القضايا)
 */
async function loadStats() {
    try {
        const data = await SUPER_API.fetch('/api/super/stats');
        // تشغيل عدادات الأرقام الانسيابية
        animateValue('stat-firms', 0, data.firms_count || 0, 1000);
        animateValue('stat-users', 0, data.users_count || 0, 1000);
        animateValue('stat-cases', 0, data.cases_count || 0, 1000);
    } catch (error) {
        console.error("❌ فشل تحميل الإحصائيات العامة للمنصة:", error);
    }
}

/**
 * 🧠 محرك التحليل الذكي للأسطول السحابي (AI Fleet Intelligence Analyzer)
 * يقوم بفحص الكيانات واستخراج تقرير أمني واقتصادي استباقي
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

            // رصد استهلاك الكوتا بنسبة 100% أو أكثر
            if (usersCount >= f.max_users && f.is_active) {
                highUsageFirms.push(f.firm_name);
            }
        }
    });

    // تحديث كرت الكيانات النشطة في الواجهة
    animateValue('stat-active-firms', 0, activeCount, 1000);

    // صياغة التقرير الإداري وبثه للمشرف العام
    const alertBox = document.getElementById('aiAnalysisText');
    const alertContainer = document.getElementById('aiAlertsContainer');
    const iconContainer = document.querySelector('.ai-icon-container');

    let analysisMsg = "";

    if (expiringSoonCount > 0) {
        analysisMsg = `<span style="color: #B3372F; font-weight: 700;">⚠️ <b>تنبيه استباقي:</b> تم رصد ${expiringSoonCount} كيان قانوني سينتهي اشتراكه خلال 14 يوماً. </span>`;
        if (alertContainer) alertContainer.style.borderRightColor = "#B3372F";
        if (iconContainer) iconContainer.style.background = "#B3372F";
    } else if (expiredCount > 0) {
        analysisMsg = `<span style="color: #8A6A12; font-weight: 700;">⏳ <b>حالة معلقة:</b> يوجد ${expiredCount} كيان منتهي الصلاحية بانتظار التجديد أو الحفظ الإداري. </span>`;
        if (alertContainer) alertContainer.style.borderRightColor = "#8A6A12";
        if (iconContainer) iconContainer.style.background = "#8A6A12";
    } else {
        analysisMsg = `<span style="color: #1F7A5C; font-weight: 700;">✅ <b>الأسطول مستقر تماماً:</b> جميع الكيانات القانونية مفعلة ولا توجد اشتراكات تشارف على الانتهاء حالياً. </span>`;
        if (alertContainer) alertContainer.style.borderRightColor = "#1F7A5C";
        if (iconContainer) iconContainer.style.background = "#1F7A5C";
    }

    if (highUsageFirms.length > 0) {
        analysisMsg += `<br><span class="d-block mt-2 text-muted" style="font-size: 0.88rem;">📈 <b style="color: var(--text-primary, #0B132B);">فرصة ترقية تجارية:</b> كيانات استهلكت كامل كوتا المحامين (100%): ${highUsageFirms.slice(0, 2).map(escapeHTML).join('، ')} ${highUsageFirms.length > 2 ? 'وغيرها' : ''}.</span>`;
    }

    if (alertBox) alertBox.innerHTML = analysisMsg;
}

// ============================================================================
// [4] جلب وعرض بيانات الأسطول (Data Fetching & Table Rendering - V5.6)
// ============================================================================

/**
 * جلب جميع المكاتب والكيانات من الخادم السحابي
 */
async function loadFirms() {
    const tbody = document.getElementById('firmsTableBody');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="5" class="text-center py-5">
                <i class="fas fa-spinner fa-spin fa-2x mb-3" style="color: var(--accent, #D4AF37);"></i>
                <br>
                <span class="fw-bold" style="color: var(--text-primary, #0B132B);">جاري مزامنة بيانات الأسطول مع السحابة المركزية...</span>
            </td>
        </tr>
    `;

    try {
        const firms = await SUPER_API.fetch('/api/super/firms');
        globalFirms = Array.isArray(firms) ? firms : [];

        // تصفير حقل البحث
        const searchInput = document.getElementById('searchFirmInput');
        if (searchInput) searchInput.value = '';

        // تشغيل محلل الذكاء الاصطناعي
        analyzeFirmsData(globalFirms);

        // بناء الجدول
        renderFirmsTable(globalFirms);
    } catch (error) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center fw-bold py-5" style="color: #B3372F;">
                    <i class="fas fa-wifi-slash fa-2x mb-2 d-block"></i>
                    تعذر الاتصال بالخادم المركزي. يرجى التحقق من الشبكة وإعادة المحاولة.
                </td>
            </tr>
        `;
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                icon: 'error',
                title: 'خطأ في الاتصال',
                text: 'فشل تحميل بيانات الكيانات القانونية من مركز القيادة.',
                confirmButtonColor: '#0B132B'
            });
        }
    }
}

/**
 * بناء جدول الكيانات القانونية بتصميم V5.6 المتكيف مع الوضع الداكن
 */
function renderFirmsTable(firmsArray) {
    const tbody = document.getElementById('firmsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!firmsArray || firmsArray.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center text-muted fw-bold py-5">
                    لا توجد كيانات قانونية تطابق معايير البحث الحالية
                </td>
            </tr>
        `;
        return;
    }

    firmsArray.forEach(firm => {
        const endDate = firm.subscription_end_date ? new Date(firm.subscription_end_date) : new Date();
        const isExpired = endDate < new Date();

        // شارة الحالة (V5.6 Badge)
        const statusBadge = (firm.is_active && !isExpired)
            ? `<span class="badge px-3 py-1 rounded-pill shadow-sm" style="background: rgba(31, 122, 92, 0.12); color: #1F7A5C; border: 1px solid rgba(31, 122, 92, 0.25);"><i class="fas fa-check-circle me-1"></i> يعمل</span>`
            : `<span class="badge px-3 py-1 rounded-pill shadow-sm" style="background: rgba(179, 55, 47, 0.12); color: #B3372F; border: 1px solid rgba(179, 55, 47, 0.25);"><i class="fas fa-exclamation-triangle me-1"></i> ${isExpired ? 'منتهي الصلاحية' : 'موقوف إدارياً'}</span>`;

        // تحليل كوتا الحسابات
        const usersCount = extractFirmUsersCount(firm);
        const quotaColorStyle = usersCount >= firm.max_users
            ? 'color: #B3372F; background: rgba(179, 55, 47, 0.12); padding: 3px 8px; border-radius: 6px; font-weight: 800;'
            : 'color: var(--accent, #D4AF37); font-weight: 700;';

        // صف الجدول متكيف بصرياً بدون خلفيات بيضاء صلبة
        tbody.innerHTML += `
            <tr class="fade-in align-middle transition-hover" style="border-bottom: 1px solid var(--border-color, rgba(226, 232, 240, 0.7));">
                <td class="fw-bold" style="white-space: normal; color: var(--text-primary, #0B132B);">
                    <div class="d-flex align-items-center">
                        <div class="icon-box rounded-circle d-flex align-items-center justify-content-center me-3" style="width: 40px; height: 40px; flex-shrink: 0; background: rgba(212, 175, 55, 0.12); color: var(--accent, #D4AF37);">
                            <i class="fas fa-building"></i>
                        </div>
                        <span>${escapeHTML(firm.firm_name)}</span>
                    </div>
                </td>
                <td dir="ltr" class="text-end fw-bold font-monospace ${isExpired ? 'text-danger' : 'text-muted'}">
                    ${endDate.toLocaleDateString('en-GB')}
                </td>
                <td class="font-monospace fs-6 text-center">
                    <span style="${quotaColorStyle}">${usersCount} / ${firm.max_users}</span>
                </td>
                <td class="text-center">${statusBadge}</td>
                <td class="text-end">
                    <button class="btn btn-sm shadow-sm rounded-circle me-1" style="width: 35px; height: 35px; background: var(--bg-card, #FFFFFF); border: 1px solid var(--border-color, #E2E8F0); color: var(--text-primary, #0B132B);" onclick="openEditFirmModal('${firm.id}')" title="التعديل الشامل">
                        <i class="fas fa-cog"></i>
                    </button>
                    <button class="btn btn-sm shadow-sm rounded-circle me-1" style="width: 35px; height: 35px; background: var(--bg-card, #FFFFFF); border: 1px solid rgba(31, 122, 92, 0.3); color: #1F7A5C;" onclick="openRenewModal('${firm.id}')" title="تجديد الاشتراك">
                        <i class="fas fa-calendar-plus"></i>
                    </button>
                    <button class="btn btn-sm shadow-sm rounded-circle" style="width: 35px; height: 35px; background: var(--bg-card, #FFFFFF); border: 1px solid ${firm.is_active ? 'rgba(179, 55, 47, 0.3)' : 'rgba(56, 189, 248, 0.3)'}; color: ${firm.is_active ? '#B3372F' : '#38BDF8'};" 
                        onclick="toggleFirmStatus('${firm.id}', ${!firm.is_active}, ${firm.max_users}, '${escapeHTML(firm.firm_name).replace(/'/g, "\\'")}')" title="${firm.is_active ? 'إيقاف الكيان' : 'تفعيل الكيان'}">
                        <i class="fas ${firm.is_active ? 'fa-ban' : 'fa-power-off'}"></i>
                    </button>
                </td>
            </tr>
        `;
    });
}

/**
 * محرك البحث والفرز الفوري
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
// [5] عمليات الإدارة العليا (Super Admin Provisioning & CRUD)
// ============================================================================

/**
 * 1. تأسيس كيان قانوني جديد وحساب مديره العام
 */
document.getElementById('addFirmForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnSubmitFirm');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> جاري تأسيس الكيان في الخوادم...';
    }

    const payload = {
        firm_name: document.getElementById('newFirmName')?.value?.trim() || '',
        subscription_months: document.getElementById('newFirmMonths')?.value || 12,
        max_users: document.getElementById('newFirmMaxUsers')?.value || 5,
        admin_name: document.getElementById('newAdminName')?.value?.trim() || '',
        admin_phone: document.getElementById('newAdminPhone')?.value?.trim() || '',
        telegram_id: document.getElementById('newAdminTelegram')?.value?.trim() || null
    };

    try {
        await SUPER_API.fetch('/api/super/register-firm', 'POST', payload);

        // إغلاق النافذة المنبثقة
        const modalElem = document.getElementById('addFirmModal');
        if (modalElem && typeof bootstrap !== 'undefined') {
            bootstrap.Modal.getInstance(modalElem)?.hide();
        }
        document.getElementById('addFirmForm')?.reset();

        if (typeof Swal !== 'undefined') {
            Swal.fire({
                icon: 'success',
                title: 'تم التأسيس بنجاح!',
                text: `تم تسجيل الكيان القانوني "${payload.firm_name}" وإنشاء حساب مديره العام بنجاح.`,
                confirmButtonColor: '#0B132B'
            });
        }

        // تحديث الواجهة والعدادات
        loadStats();
        loadFirms();
    } catch (error) {
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                icon: 'error',
                title: 'فشل التأسيس',
                text: error.message,
                confirmButtonColor: '#B3372F'
            });
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
});

/**
 * 2. فتح نافذة التعديل الشامل للكيان ومديره العام
 */
window.openEditFirmModal = function(firmId) {
    const firm = globalFirms.find(f => f.id === firmId);
    if (!firm) return;

    // تعبئة بيانات المكتب
    if (document.getElementById('editFirmId')) document.getElementById('editFirmId').value = firm.id;
    if (document.getElementById('editFirmName')) document.getElementById('editFirmName').value = firm.firm_name;
    if (document.getElementById('editFirmMaxUsers')) document.getElementById('editFirmMaxUsers').value = firm.max_users;

    // معالجة التاريخ بدقة لتجنب أخطاء المناطق الزمنية (Timezones)
    if (firm.subscription_end_date) {
        const dateObj = new Date(firm.subscription_end_date);
        const yyyy = dateObj.getFullYear();
        const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
        const dd = String(dateObj.getDate()).padStart(2, '0');
        if (document.getElementById('editFirmEndDate')) {
            document.getElementById('editFirmEndDate').value = `${yyyy}-${mm}-${dd}`;
        }
    } else {
        if (document.getElementById('editFirmEndDate')) {
            document.getElementById('editFirmEndDate').value = '';
        }
    }

    // استخراج بيانات المدير العام
    const adminUser = (firm.mo_users && Array.isArray(firm.mo_users)) ? firm.mo_users.find(u => u.role === 'admin') : null;

    if (document.getElementById('editAdminName')) document.getElementById('editAdminName').value = adminUser ? (adminUser.full_name || '') : '';
    if (document.getElementById('editAdminPhone')) document.getElementById('editAdminPhone').value = adminUser ? (adminUser.phone || '') : '';
    if (document.getElementById('editAdminTelegram')) document.getElementById('editAdminTelegram').value = adminUser ? (adminUser.telegram_id || '') : '';

    const modalElem = document.getElementById('editFirmModal');
    if (modalElem && typeof bootstrap !== 'undefined') {
        new bootstrap.Modal(modalElem).show();
    }
};

document.getElementById('editFirmForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnSubmitEditFirm');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> جاري حفظ التعديلات...';
    }

    const payload = {
        id: document.getElementById('editFirmId')?.value,
        firm_name: document.getElementById('editFirmName')?.value?.trim(),
        max_users: parseInt(document.getElementById('editFirmMaxUsers')?.value || '5'),
        subscription_end_date: new Date(document.getElementById('editFirmEndDate')?.value).toISOString(),
        admin_name: document.getElementById('editAdminName')?.value?.trim() || undefined,
        admin_phone: document.getElementById('editAdminPhone')?.value?.trim() || undefined,
        admin_telegram: document.getElementById('editAdminTelegram')?.value?.trim() || null
    };

    try {
        await SUPER_API.fetch('/api/super/firms', 'PATCH', payload);

        const modalElem = document.getElementById('editFirmModal');
        if (modalElem && typeof bootstrap !== 'undefined') {
            bootstrap.Modal.getInstance(modalElem)?.hide();
        }

        if (typeof Swal !== 'undefined') {
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: 'تم حفظ التعديلات الشاملة بنجاح',
                timer: 2000,
                showConfirmButton: false
            });
        }

        loadFirms();
    } catch (error) {
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                icon: 'error',
                title: 'خطأ في التعديل',
                text: error.message,
                confirmButtonColor: '#B3372F'
            });
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save me-2"></i> حفظ التعديلات الشاملة';
        }
    }
});

/**
 * 3. تجديد أو تمديد اشتراك كيان قانوني
 */
window.openRenewModal = function(firmId) {
    if (document.getElementById('renewFirmId')) document.getElementById('renewFirmId').value = firmId;
    if (document.getElementById('renewMonths')) document.getElementById('renewMonths').value = 12; // الافتراضي 12 شهراً
    const modalElem = document.getElementById('renewFirmModal');
    if (modalElem && typeof bootstrap !== 'undefined') {
        new bootstrap.Modal(modalElem).show();
    }
};

document.getElementById('renewFirmForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnSubmitRenew');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> جاري التمديد...';
    }

    const payload = {
        id: document.getElementById('renewFirmId')?.value,
        add_months: parseInt(document.getElementById('renewMonths')?.value || '12')
    };

    try {
        await SUPER_API.fetch('/api/super/renew-firm', 'POST', payload);

        const modalElem = document.getElementById('renewFirmModal');
        if (modalElem && typeof bootstrap !== 'undefined') {
            bootstrap.Modal.getInstance(modalElem)?.hide();
        }

        if (typeof Swal !== 'undefined') {
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: 'تم تمديد اشتراك وتفعيل الكيان بنجاح!',
                timer: 2500,
                showConfirmButton: false
            });
        }

        loadFirms();
    } catch (error) {
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                icon: 'error',
                title: 'خطأ في التمديد',
                text: error.message,
                confirmButtonColor: '#B3372F'
            });
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-check-circle me-2"></i> تأكيد التمديد';
        }
    }
});

/**
 * 4. إيقاف وحظر / تفعيل كيان قانوني فورياً
 */
window.toggleFirmStatus = async function(firmId, newStatus, maxUsers, firmName) {
    const actionName = newStatus ? 'تفعيل وإعادة إطلاق' : 'الإيقاف والحظر الفوري لـ';

    let confirmResult = false;
    if (typeof Swal !== 'undefined') {
        const confirm = await Swal.fire({
            title: `إجراء إداري حرج للقيادة العليا`,
            text: `هل أنت متأكد من ${actionName} كيان (${firmName})؟ في حال الحظر، سيتم إبطال جميع جلسات المحامين والموظفين فورياً ومنعهم من الدخول.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: newStatus ? '#1F7A5C' : '#B3372F',
            cancelButtonColor: '#8A6A12',
            confirmButtonText: `نعم، تأكيد ${newStatus ? 'التفعيل' : 'الإيقاف'}`,
            cancelButtonText: 'تراجع وإلغاء'
        });
        confirmResult = confirm.isConfirmed;
    } else {
        confirmResult = window.confirm(`هل أنت متأكد من ${actionName} (${firmName})؟`);
    }

    if (!confirmResult) return;

    try {
        await SUPER_API.fetch('/api/super/firms', 'PATCH', { id: firmId, is_active: newStatus, max_users: maxUsers });

        if (typeof Swal !== 'undefined') {
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: 'تم تحديث حالة الكيان بنجاح',
                timer: 2000,
                showConfirmButton: false
            });
        }
        loadFirms();
    } catch (error) {
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                icon: 'error',
                title: 'فشل الإجراء الإداري',
                text: error.message,
                confirmButtonColor: '#B3372F'
            });
        }
    }
};

// ============================================================================
// [6] الأدوات المساعدة وحماية XSS (Utilities & Sanitization)
// ============================================================================

/**
 * عداد الأرقام التفاعلي الانسيابي
 */
function animateValue(id, start, end, duration) {
    const obj = document.getElementById(id);
    if (!obj) return;
    if (start === end) {
        obj.innerHTML = end.toLocaleString('en-US');
        return;
    }
    const range = end - start;
    let current = start;
    const increment = end > start ? 1 : -1;
    const stepTime = Math.max(Math.abs(Math.floor(duration / range)), 15);

    const timer = setInterval(() => {
        current += increment;
        obj.innerHTML = current.toLocaleString('en-US');
        if (current === end) clearInterval(timer);
    }, stepTime);
}

/**
 * حماية واجهة الإدارة العليا من ثغرات XSS
 */
function escapeHTML(str) {
    if (!str) return '';
    return str.toString().replace(/[&<>'"]/g, tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[tag] || tag));
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
// [7] نظام البصمة البيومترية المشفرة للإدارة العليا (Super Admin WebAuthn V5.6)
// ============================================================================

window.registerBiometricDevice = async function() {
    if (!navigator.onLine) {
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                icon: 'warning',
                title: 'لا يوجد اتصال',
                text: 'يرجى الاتصال بالإنترنت لمزامنة وتفعيل البصمة التشفيرية مع السحابة.',
                confirmButtonColor: '#0B132B'
            });
        }
        return;
    }

    if (!window.PublicKeyCredential) {
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                icon: 'error',
                title: 'غير مدعوم',
                text: 'المتصفح أو الجهاز الحالي لا يدعم معيار البصمة البيومترية المتقدم (WebAuthn).',
                confirmButtonColor: '#0B132B'
            });
        }
        return;
    }

    try {
        const user = typeof AUTH !== 'undefined' ? AUTH.checkSession() : null;
        if (!user) {
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    icon: 'error',
                    title: 'جلسة غير صالحة',
                    text: 'يجب أن تكون جلسة الإدارة العليا نشطة لربط البصمة البيومترية.',
                    confirmButtonColor: '#0B132B'
                });
            }
            return;
        }

        if (typeof Swal !== 'undefined') {
            Swal.fire({
                title: 'تأكيد الحماية البيومترية...',
                text: 'جاري استدعاء تحدي التشفير... يرجى لمس مستشعر البصمة أو استخدام مفتاح الأمان',
                allowOutsideClick: false,
                didOpen: () => { Swal.showLoading(); }
            });
        }

        // 1. مسار الأولوية: استخدام محرك AUTH المركزي إذا كان يدعم التسجيل البيومتري
        if (typeof AUTH !== 'undefined' && typeof AUTH.registerBiometric === 'function') {
            const result = await AUTH.registerBiometric();
            const bioBtn = document.getElementById('btnBioRegister');
            if (bioBtn) bioBtn.classList.add('d-none');
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    icon: 'success',
                    title: 'تم الربط الأمني بنجاح',
                    text: result?.message || 'تم تشفير وتثبيت مفتاح البصمة للوصول الفوري مستقبلاً.',
                    confirmButtonColor: '#0B132B'
                });
            }
            return;
        }

        // 2. المسار المباشر المتقدم: طلب تحدي WebAuthn واستخراج مفتاح SPKI العام
        const chalData = await SUPER_API.fetch('/api/auth/webauthn-challenge', 'POST', {
            phone: user.phone || localStorage.getItem('moakkil_saved_phone')
        });

        if (!chalData || !chalData.challenge) {
            throw new Error('فشل الحصول على تحدي الأمان (WebAuthn Challenge) من الخادم.');
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

        if (!credential_id) throw new Error("تعذر استخراج معرف البصمة البيومترية.");

        let spkiBase64 = '';
        if (credential.response && typeof credential.response.getPublicKey === 'function') {
            const spkiBuffer = credential.response.getPublicKey();
            if (spkiBuffer) spkiBase64 = bufferToBase64Url(spkiBuffer);
        }
        if (!spkiBase64) {
            throw new Error("المتصفح الحالي لا يدعم استخراج المفتاح العام التشفيري (SPKI).");
        }

        const algorithm = (credential.response && typeof credential.response.getPublicKeyAlgorithm === 'function')
            ? credential.response.getPublicKeyAlgorithm()
            : -7;

        // إرسال المفتاح العام الموثق والتحدي إلى الخادم
        await SUPER_API.fetch('/api/auth/biometric-register', 'POST', {
            credential_id: credential_id,
            public_key_spki: spkiBase64,
            public_key: spkiBase64,
            algorithm: algorithm,
            challenge: chalData.challenge,
            device_name: navigator.userAgent.substring(0, 50)
        });

        // تخزين المعرف محلياً وتحديث الزر
        localStorage.setItem('moakkil_biometric_id', credential_id);
        if (user.phone) localStorage.setItem('moakkil_saved_phone', user.phone);

        const bioBtn = document.getElementById('btnBioRegister');
        if (bioBtn) bioBtn.classList.add('d-none');

        if (typeof Swal !== 'undefined') {
            Swal.fire({
                icon: 'success',
                title: 'تم الربط الأمني بنجاح',
                text: 'تم تشفير مفتاحك البيومتري وتفعيله للولوج السريع والمؤمن مستقبلاً.',
                confirmButtonColor: '#0B132B'
            });
        }
    } catch (err) {
        console.error("Super Admin Biometric Error:", err);
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                icon: 'error',
                title: 'تعذر تفعيل البصمة',
                text: err.message || 'تم إلغاء عملية البصمة أو منعها من قبل نظام التشغيل.',
                confirmButtonColor: '#B3372F'
            });
        }
    }
};
