// js/register.js
document.addEventListener('DOMContentLoaded', () => {
    // 1. التحقق من وجود كلمة المرور في الجلسة مسبقاً (Session Storage)
    let superPass = sessionStorage.getItem('superPassword');
    
    const loginView = document.getElementById('super-login-view');
    const dashboardView = document.getElementById('super-dashboard-view');
    const loginForm = document.getElementById('super-login-form');
    const loginAlert = document.getElementById('super-login-alert');
    
    // إذا كان مسجلاً الجلسة، اذهب للوحة فوراً، وإلا أظهر نموذج الدخول
    if (superPass) {
        showDashboard();
    }

    // 2. معالجة نموذج تسجيل الدخول للإدارة العليا
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const pwdInput = document.getElementById('superPassword').value;
        const btn = loginForm.querySelector('button');
        
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> جاري التحقق...';
        loginAlert.classList.add('d-none');

        try {
            // محاولة جلب الإحصائيات كاختبار للتحقق من صحة كلمة المرور
            const res = await fetch(`${API_BASE_URL}/api/super/stats`, {
                method: 'GET',
                headers: { 'x-super-password': pwdInput }
            });
            
            if (res.ok) {
                superPass = pwdInput;
                sessionStorage.setItem('superPassword', pwdInput);
                showDashboard();
            } else {
                loginAlert.textContent = "كلمة المرور غير صحيحة، الوصول مرفوض.";
                loginAlert.classList.remove('d-none');
            }
        } catch (error) {
            loginAlert.textContent = "خطأ في الاتصال بالخادم السحابي.";
            loginAlert.classList.remove('d-none');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-sign-in-alt me-2"></i> دخول للوحة التحكم';
        }
    });

    // 3. تسجيل الخروج
    document.getElementById('super-logout-btn').addEventListener('click', () => {
        sessionStorage.removeItem('superPassword');
        location.reload();
    });

    // 4. عرض اللوحة وجلب البيانات الأولية
    async function showDashboard() {
        loginView.classList.add('d-none');
        dashboardView.classList.remove('d-none');
        await loadDashboardData();
    }

    // الدالة الرئيسية لجلب البيانات من الـ API
    async function loadDashboardData() {
        try {
            // جلب الإحصائيات العامة
            const statsRes = await fetch(`${API_BASE_URL}/api/super/stats`, { 
                headers: { 'x-super-password': superPass } 
            });
            if (!statsRes.ok) throw new Error("فشل جلب الإحصائيات، قد تكون الجلسة منتهية");
            const stats = await statsRes.json();
            
            // تحديث البطاقات
            document.getElementById('stat-firms').textContent = stats.firms_count || 0;
            document.getElementById('stat-users').textContent = stats.users_count || 0;
            document.getElementById('stat-cases').textContent = stats.cases_count || 0;

            // جلب قائمة المكاتب
            const firmsRes = await fetch(`${API_BASE_URL}/api/super/firms`, { 
                headers: { 'x-super-password': superPass } 
            });
            if (!firmsRes.ok) throw new Error("فشل جلب بيانات المكاتب");
            const firms = await firmsRes.json();
            
            renderFirmsTable(firms);
        } catch (error) {
            Swal.fire('خطأ!', error.message, 'error');
            if(error.message.includes("403") || error.message.includes("منتهية")) {
                sessionStorage.removeItem('superPassword');
                location.reload();
            }
        }
    }

    // 5. رسم جدول عرض المكاتب المشتركة
    function renderFirmsTable(firms) {
        const tbody = document.getElementById('firms-table-body');
        tbody.innerHTML = '';
        
        if (!firms || firms.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-muted py-4">لا توجد مكاتب مسجلة حالياً في النظام.</td></tr>`;
            return;
        }

        firms.forEach(firm => {
            // استخراج عدد المستخدمين الحاليين من الاستعلام المرتبط (Count)
            const currentUsers = firm.mo_users ? firm.mo_users[0].count : 0;
            
            const statusBadge = firm.is_active 
                ? '<span class="badge bg-success shadow-sm px-3 py-2">نشط</span>' 
                : '<span class="badge bg-danger shadow-sm px-3 py-2">معطل (منتهي)</span>';
                
            const dateStr = new Date(firm.created_at).toLocaleDateString('ar-EG');
            
            // تحديد ألوان الكوتا (أحمر إذا وصل الحد، برتقالي إذا اقترب، أخضر للمتاح)
            let quotaColor = "text-success fw-bold";
            if (currentUsers >= firm.max_users) quotaColor = "text-danger fw-bold";
            else if (currentUsers >= firm.max_users - 1) quotaColor = "text-warning fw-bold";

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="fw-bold text-primary">${escapeHTML(firm.firm_name)}</td>
                <td>${statusBadge}</td>
                <td dir="ltr" class="${quotaColor}">${currentUsers} / ${firm.max_users}</td>
                <td class="text-muted">${dateStr}</td>
                <td>
                    <button class="btn btn-sm btn-outline-warning shadow-sm edit-firm-btn rounded-pill px-3 fw-bold" 
                        data-id="${firm.id}" 
                        data-max="${firm.max_users}" 
                        data-status="${firm.is_active}">
                        <i class="fas fa-cog"></i> الإعدادات
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // ربط أحداث النقر لأزرار التعديل لفتح المودال ببيانات المكتب المختار
        document.querySelectorAll('.edit-firm-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget;
                document.getElementById('editFirmId').value = target.getAttribute('data-id');
                document.getElementById('editFirmMaxUsers').value = target.getAttribute('data-max');
                document.getElementById('editFirmStatus').value = target.getAttribute('data-status');
                
                new bootstrap.Modal(document.getElementById('editFirmModal')).show();
            });
        });
    }

    // 6. إضافة وتفعيل مكتب جديد
    document.getElementById('btnSubmitAddFirm').addEventListener('click', async () => {
        const form = document.getElementById('addFirmForm');
        // التحقق من صحة الإدخالات الأساسية في HTML
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const data = {
            super_password: superPass, // نرسل كلمة المرور ضمن الـ Body لأنه POST
            firm_name: document.getElementById('newFirmName').value.trim(),
            max_users: document.getElementById('newFirmMaxUsers').value,
            admin_name: document.getElementById('newAdminName').value.trim(),
            admin_phone: document.getElementById('newAdminPhone').value.trim(),
            telegram_id: document.getElementById('newAdminTg').value.trim() || null
        };

        const btn = document.getElementById('btnSubmitAddFirm');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> يتم إنشاء المكتب والمدير...';

        try {
            const res = await fetch(`${API_BASE_URL}/api/super/register-firm`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await res.json();
            if (res.ok && result.success) {
                Swal.fire({
                    icon: 'success',
                    title: 'تم إنشاء المكتب بنجاح!',
                    text: 'أصبح المكتب فعالاً ويمكن لمدير المكتب تسجيل الدخول برقم هاتفه الآن.',
                    confirmButtonText: 'حسناً'
                });
                
                // إغلاق المودال وتنظيف الفورم وتحديث الجدول
                const modalEl = document.getElementById('addFirmModal');
                const modalInstance = bootstrap.Modal.getInstance(modalEl);
                if (modalInstance) modalInstance.hide();
                form.reset();
                loadDashboardData(); 
            } else {
                throw new Error(result.error || "حدث خطأ أثناء محاولة تسجيل المكتب.");
            }
        } catch (error) {
            Swal.fire('خطأ في التسجيل!', error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save me-1"></i> حفظ وإنشاء المكتب';
        }
    });

    // 7. حفظ التعديلات الخاصة بالمكتب (تغيير الكوتا، إيقاف/تفعيل الاشتراك)
    document.getElementById('btnSubmitEditFirm').addEventListener('click', async () => {
        const data = {
            id: document.getElementById('editFirmId').value,
            max_users: parseInt(document.getElementById('editFirmMaxUsers').value, 10),
            is_active: document.getElementById('editFirmStatus').value === "true"
        };

        const btn = document.getElementById('btnSubmitEditFirm');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> جاري التحديث...';

        try {
            const res = await fetch(`${API_BASE_URL}/api/super/firms`, {
                method: 'PATCH',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-super-password': superPass // الإرسال عبر الهيدر للـ PATCH
                },
                body: JSON.stringify(data)
            });

            if (res.ok) {
                Swal.fire({
                    icon: 'success', 
                    title: 'تم تحديث الإعدادات', 
                    timer: 1500, 
                    showConfirmButton: false
                });
                
                const modalEl = document.getElementById('editFirmModal');
                const modalInstance = bootstrap.Modal.getInstance(modalEl);
                if (modalInstance) modalInstance.hide();
                loadDashboardData(); // تحديث الجدول فوراً
            } else {
                const err = await res.json();
                throw new Error(err.error || "فشل النظام في تحديث البيانات.");
            }
        } catch (error) {
            Swal.fire('فشل التحديث!', error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-check me-1"></i> حفظ التغييرات';
        }
    });

    // أداة مساعدة (Utility) لمنع XSS (Cross-Site Scripting) عند عرض النصوص
    function escapeHTML(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.innerText = str;
        return div.innerHTML;
    }
});