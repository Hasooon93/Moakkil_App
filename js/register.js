// js/register.js - لوحة تحكم السوبر أدمن (V4.2 Enterprise)
// يدعم إدارة المكاتب، وتعديل الكوتا، والمصادقة بالـ JWT.

document.addEventListener('DOMContentLoaded', () => {
    // التحقق من الصلاحية عند تحميل الصفحة
    const userStr = localStorage.getItem(CONFIG.USER_KEY || 'moakkil_user');
    if (!userStr) {
        window.location.replace('login.html');
        return;
    }
    const user = JSON.parse(userStr);
    if (user.role !== 'super_admin') {
        Swal.fire({ icon: 'error', title: 'غير مصرح', text: 'هذه الصفحة مخصصة للإدارة العليا فقط' }).then(() => {
            window.location.replace('app.html');
        });
        return;
    }
    
    // تحميل البيانات إذا كان المستخدم سوبر أدمن
    loadFirms();
});

// دالة الاتصال المخصصة للإدارة العليا باستخدام التوكن (JWT)
async function superFetch(endpoint, method = 'GET', body = null) {
    const token = localStorage.getItem(CONFIG.TOKEN_KEY || 'moakkil_token');
    
    const options = {
        method,
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}` 
        }
    };
    if (body) options.body = JSON.stringify(body);

    try {
        const response = await fetch(`${CONFIG.API_URL}${endpoint}`, options);
        const data = await response.json();
        
        // طرد المستخدم إذا تلاعب بالتوكن
        if (response.status === 401 || response.status === 403) {
            Swal.fire({ icon: 'error', title: 'وصول مرفوض', text: 'انتهت الجلسة أو لا تملك صلاحية.' }).then(()=> {
                if(typeof logout === 'function') logout();
                else window.location.href = 'login.html';
            });
            return null;
        }
        if (!response.ok) throw new Error(data.error || 'خطأ في السيرفر');
        return data;
    } catch (error) {
        Swal.fire({ icon: 'error', title: 'خطأ', text: error.message });
        return null;
    }
}

// تحميل قائمة المكاتب
async function loadFirms() {
    const tbody = document.querySelector('#firmsTable tbody');
    if(!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4"><i class="fas fa-spinner fa-spin fa-2x text-primary"></i> جاري التحميل...</td></tr>';
    
    const firms = await superFetch('/api/super/firms');
    if (!firms) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">تعذر تحميل البيانات.</td></tr>';
        return;
    }

    if (firms.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">لا يوجد مكاتب مسجلة حتى الآن.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    firms.forEach(firm => {
        const endDate = new Date(firm.subscription_end_date);
        const isExpired = endDate < new Date();
        const usersCount = firm.mo_users && firm.mo_users.length > 0 ? firm.mo_users[0].count : 0;
        
        tbody.innerHTML += `
            <tr>
                <td>
                    <strong class="text-primary">${firm.firm_name}</strong><br>
                    <span class="badge ${firm.is_active ? 'bg-success' : 'bg-danger'}">${firm.is_active ? 'نشط' : 'موقوف'}</span>
                </td>
                <td>
                    <small class="${isExpired ? 'text-danger fw-bold' : 'text-success fw-bold'}">${endDate.toLocaleDateString('ar-EG')}</small>
                </td>
                <td>
                    <span class="badge bg-secondary mb-1">${usersCount} مستخدم من أصل ${firm.max_users}</span><br>
                    <button class="btn btn-sm btn-outline-primary mt-1" style="font-size: 0.75rem;" onclick="editQuota('${firm.id}', '${firm.firm_name}', ${firm.max_users})">
                        <i class="fas fa-edit"></i> تعديل الكوتا
                    </button>
                </td>
                <td>
                    <div class="d-flex flex-column gap-1">
                        <button class="btn btn-sm btn-primary" onclick="renewFirm('${firm.id}', '${firm.firm_name}')">
                            <i class="fas fa-calendar-plus"></i> تجديد
                        </button>
                        <button class="btn btn-sm ${firm.is_active ? 'btn-outline-danger' : 'btn-outline-success'}" onclick="toggleFirm('${firm.id}', ${!firm.is_active})">
                            <i class="fas ${firm.is_active ? 'fa-ban' : 'fa-check'}"></i> ${firm.is_active ? 'إيقاف' : 'تفعيل'}
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
}

// تسجيل مكتب جديد
const registerForm = document.getElementById('registerFirmForm');
if(registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const btn = e.submitter;
        const originalText = btn.innerHTML;
        btn.innerHTML = 'جاري الإنشاء... <i class="fas fa-spinner fa-spin"></i>';
        btn.disabled = true;

        const payload = {
            firm_name: document.getElementById('firmName').value,
            subscription_months: document.getElementById('subMonths').value,
            max_users: document.getElementById('maxUsers').value,
            admin_name: document.getElementById('adminName').value,
            admin_phone: document.getElementById('adminPhone').value,
            telegram_id: document.getElementById('adminTg').value
        };

        const result = await superFetch('/api/super/register-firm', 'POST', payload);
        
        btn.innerHTML = originalText;
        btn.disabled = false;

        if (result && result.success) {
            Swal.fire({ icon: 'success', title: 'تمت العملية', text: 'تم إنشاء المكتب والمدير بنجاح.' });
            registerForm.reset();
            loadFirms();
        }
    });
}

// تجديد اشتراك
window.renewFirm = async function(firmId, firmName) {
    const { value: months } = await Swal.fire({
        title: 'تجديد الاشتراك',
        text: `تجديد لمكتب: ${firmName}`,
        input: 'number',
        inputLabel: 'عدد الأشهر للتجديد',
        inputValue: 12,
        showCancelButton: true,
        confirmButtonColor: '#0f172a',
        confirmButtonText: '<i class="fas fa-check"></i> تجديد الآن',
        cancelButtonText: 'إلغاء'
    });

    if (months) {
        const result = await superFetch('/api/super/renew-firm', 'POST', { id: firmId, add_months: months });
        if (result && result.success) {
            Swal.fire({icon: 'success', title: 'نجاح', text: 'تم تجديد الاشتراك بنجاح.'});
            loadFirms();
        }
    }
};

// تعديل كوتا المستخدمين (الوظيفة الجديدة)
window.editQuota = async function(firmId, firmName, currentMax) {
    const { value: newMax } = await Swal.fire({
        title: 'تعديل كوتا المستخدمين',
        text: `المكتب: ${firmName}`,
        input: 'number',
        inputLabel: 'الحد الأقصى الجديد للمستخدمين',
        inputValue: currentMax,
        showCancelButton: true,
        confirmButtonColor: '#0f172a',
        confirmButtonText: '<i class="fas fa-save"></i> حفظ التعديل',
        cancelButtonText: 'إلغاء'
    });

    if (newMax && newMax != currentMax) {
        const result = await superFetch('/api/super/firms', 'PATCH', { id: firmId, max_users: parseInt(newMax) });
        if (result) {
            Swal.fire({icon: 'success', title: 'نجاح', text: 'تم تحديث الكوتا بنجاح.'});
            loadFirms();
        }
    }
};

// إيقاف أو تفعيل مكتب
window.toggleFirm = async function(firmId, newStatus) {
    const actionText = newStatus ? 'تفعيل' : 'إيقاف';
    const confirmResult = await Swal.fire({
        title: `تأكيد ال${actionText}`,
        text: `هل أنت متأكد أنك تريد ${actionText} هذا المكتب؟`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: newStatus ? '#198754' : '#dc3545',
        confirmButtonText: `نعم، ${actionText}`,
        cancelButtonText: 'إلغاء'
    });

    if (confirmResult.isConfirmed) {
        const result = await superFetch('/api/super/firms', 'PATCH', { id: firmId, is_active: newStatus });
        if (result) {
            Swal.fire({icon: 'success', title: 'نجاح', text: `تم ${actionText} المكتب بنجاح.`});
            loadFirms();
        }
    }
};