// js/register.js - المحرك البرمجي للوحة الإدارة العليا (Super Admin V3.0)
// الدستور المطبق: حماية المسارات، الاتصال المباشر مع API السوبر أدمن، إدارة الكوتا.

// 1. إنشاء محرك اتصال مخصص للإدارة العليا (لضمان إرسال توكن الإدارة)
const SUPER_API = {
    fetch: async (endpoint, method = 'GET', body = null) => {
        const token = localStorage.getItem(CONFIG?.TOKEN_KEY || 'moakkil_token');
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
        const options = { method, headers };
        if (body) options.body = JSON.stringify(body);

        try {
            const res = await fetch(`${CONFIG?.API_URL || ''}${endpoint}`, options);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'خطأ في الاتصال بالخادم السحابي');
            return data;
        } catch (err) {
            console.error(`[SuperAdmin API Error] ${endpoint}:`, err);
            throw err;
        }
    }
};

// 2. التهيئة عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    // التحقق الأمني القطعي (لمنع أي طرد خاطئ للسوبر أدمن)
    const user = AUTH.checkSession();
    if (!user || (user.role !== 'super_admin' && user.role !== 'superadmin')) {
        window.location.replace('app.html');
        return;
    }

    // تحميل البيانات بمجرد التأكد من الهوية
    loadStats();
    loadFirms();
});

// 3. دالة جلب الإحصائيات العلوية
async function loadStats() {
    try {
        const data = await SUPER_API.fetch('/api/super/stats');
        
        // تأثير حركي (Animation) لعداد الأرقام
        animateValue('stat-firms', 0, data.firms_count || 0, 1000);
        animateValue('stat-users', 0, data.users_count || 0, 1000);
        animateValue('stat-cases', 0, data.cases_count || 0, 1000);
    } catch (error) {
        console.error("فشل تحميل الإحصائيات:", error);
    }
}

// 4. دالة جلب المكاتب وعرضها في الجدول
async function loadFirms() {
    const tbody = document.getElementById('firmsTableBody');
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4"><i class="fas fa-spinner fa-spin text-primary fa-2x"></i><br>جاري تحميل المكاتب...</td></tr>`;
    
    try {
        const firms = await SUPER_API.fetch('/api/super/firms');
        tbody.innerHTML = '';

        if (!firms || firms.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted fw-bold py-4">لا توجد مكاتب مسجلة حتى الآن</td></tr>`;
            return;
        }

        firms.forEach(firm => {
            const endDate = new Date(firm.subscription_end_date);
            const isExpired = endDate < new Date();
            
            const statusBadge = (firm.is_active && !isExpired)
                ? `<span class="badge bg-success px-3 py-2 rounded-pill">نشط</span>`
                : `<span class="badge bg-danger px-3 py-2 rounded-pill">منتهي / موقوف</span>`;

            const usersCount = firm.mo_users && firm.mo_users[0] ? firm.mo_users[0].count : 0;

            tbody.innerHTML += `
                <tr>
                    <td class="fw-bold text-primary" style="font-size: 1.1rem;">
                        <i class="fas fa-balance-scale me-2 text-muted"></i> ${firm.firm_name}
                    </td>
                    <td dir="ltr" class="text-end fw-bold text-secondary">${endDate.toLocaleDateString('en-GB')}</td>
                    <td>
                        <span class="badge bg-secondary px-2 py-1 fs-6">${usersCount} / ${firm.max_users}</span>
                    </td>
                    <td>${statusBadge}</td>
                    <td>
                        <button class="btn btn-sm btn-success fw-bold me-1 shadow-sm" onclick="openRenewModal('${firm.id}')">
                            <i class="fas fa-calendar-plus"></i> تجديد
                        </button>
                        <button class="btn btn-sm ${firm.is_active ? 'btn-outline-danger' : 'btn-outline-primary'} fw-bold shadow-sm" 
                            onclick="toggleFirmStatus('${firm.id}', ${!firm.is_active}, ${firm.max_users}, '${firm.firm_name}')">
                            <i class="fas ${firm.is_active ? 'fa-ban' : 'fa-check-circle'}"></i> ${firm.is_active ? 'إيقاف' : 'تفعيل'}
                        </button>
                    </td>
                </tr>
            `;
        });
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger fw-bold py-4">حدث خطأ أثناء الاتصال بقاعدة البيانات</td></tr>`;
        Swal.fire({ icon: 'error', title: 'خطأ', text: 'فشل تحميل بيانات المكاتب، تأكد من الاتصال بالإنترنت.' });
    }
}

// 5. إضافة مكتب جديد (تسجيل)
document.getElementById('addFirmForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnSubmitFirm');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التسجيل...';

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
        
        // إغلاق المودال وتحديث البيانات
        bootstrap.Modal.getInstance(document.getElementById('addFirmModal')).hide();
        document.getElementById('addFirmForm').reset();
        
        Swal.fire({
            icon: 'success',
            title: 'تم التسجيل!',
            text: `تم تسجيل مكتب ${payload.firm_name} بنجاح.`,
            confirmButtonColor: '#0f172a'
        });

        loadStats();
        loadFirms();
    } catch (error) {
        Swal.fire({ icon: 'error', title: 'فشل التسجيل', text: error.message });
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'حفظ وتسجيل المكتب';
    }
});

// 6. فتح مودال التجديد وإرسال البيانات
function openRenewModal(firmId) {
    document.getElementById('renewFirmId').value = firmId;
    document.getElementById('renewMonths').value = 12; // القيمة الافتراضية
    new bootstrap.Modal(document.getElementById('renewFirmModal')).show();
}

document.getElementById('renewFirmForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnSubmitRenew');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التجديد...';

    const firmId = document.getElementById('renewFirmId').value;
    const months = document.getElementById('renewMonths').value;

    try {
        await SUPER_API.fetch('/api/super/renew-firm', 'POST', { id: firmId, add_months: months });
        
        bootstrap.Modal.getInstance(document.getElementById('renewFirmModal')).hide();
        
        Swal.fire({ icon: 'success', title: 'تم التجديد بنجاح!', timer: 2000, showConfirmButton: false });
        loadFirms();
    } catch (error) {
        Swal.fire({ icon: 'error', title: 'خطأ', text: error.message });
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'تأكيد التجديد الآن';
    }
});

// 7. تغيير حالة المكتب (إيقاف / تفعيل)
async function toggleFirmStatus(firmId, newStatus, maxUsers, firmName) {
    const actionName = newStatus ? 'تفعيل' : 'إيقاف';
    
    const confirm = await Swal.fire({
        title: `هل أنت متأكد؟`,
        text: `هل تريد حقاً ${actionName} مكتب (${firmName})؟`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: newStatus ? '#198754' : '#d33',
        cancelButtonColor: '#6c757d',
        confirmButtonText: `نعم، ${actionName}`,
        cancelButtonText: 'إلغاء'
    });

    if (!confirm.isConfirmed) return;

    try {
        await SUPER_API.fetch('/api/super/firms', 'PATCH', { 
            id: firmId, 
            is_active: newStatus,
            max_users: maxUsers // نرسله لكي لا يتأثر
        });
        
        Swal.fire({ icon: 'success', title: 'تم بنجاح', text: `تم ${actionName} المكتب.`, timer: 1500, showConfirmButton: false });
        loadFirms();
    } catch (error) {
        Swal.fire({ icon: 'error', title: 'خطأ', text: error.message });
    }
}

// دالة مساعدة لتأثير الأرقام المتحركة للإحصائيات
function animateValue(id, start, end, duration) {
    if (start === end) {
        document.getElementById(id).innerHTML = end;
        return;
    }
    let range = end - start;
    let current = start;
    let increment = end > start ? 1 : -1;
    let stepTime = Math.abs(Math.floor(duration / range));
    let obj = document.getElementById(id);
    let timer = setInterval(function() {
        current += increment;
        obj.innerHTML = current;
        if (current == end) {
            clearInterval(timer);
        }
    }, stepTime);
}