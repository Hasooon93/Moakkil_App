// js/register.js - لوحة التحكم المركزية (تتضمن إدارة الاشتراكات والتجديد)
document.addEventListener('DOMContentLoaded', () => {
    let superPass = sessionStorage.getItem('superPassword');
    
    const loginView = document.getElementById('super-login-view');
    const dashboardView = document.getElementById('super-dashboard-view');
    const loginForm = document.getElementById('super-login-form');
    const loginAlert = document.getElementById('super-login-alert');
    
    const BASE_URL = typeof CONFIG !== 'undefined' ? CONFIG.API_URL : '';

    if (superPass) {
        showDashboard();
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const pwdInput = document.getElementById('superPassword').value;
        const btn = loginForm.querySelector('button');
        
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> جاري التحقق...';
        loginAlert.classList.add('d-none');

        try {
            const res = await fetch(`${BASE_URL}/api/super/stats`, {
                method: 'GET',
                headers: { 'x-super-password': pwdInput }
            });
            
            if (res.ok) {
                superPass = pwdInput;
                sessionStorage.setItem('superPassword', pwdInput);
                showDashboard();
            } else if (res.status === 401 || res.status === 403) {
                loginAlert.textContent = "كلمة المرور غير صحيحة، الوصول مرفوض.";
                loginAlert.classList.remove('d-none');
            } else {
                loginAlert.textContent = "يوجد خطأ في الخادم أو المسار غير متاح.";
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

    document.getElementById('super-logout-btn').addEventListener('click', () => {
        sessionStorage.removeItem('superPassword');
        location.reload();
    });

    async function showDashboard() {
        loginView.classList.add('d-none');
        dashboardView.classList.remove('d-none');
        await loadDashboardData();
    }

    async function loadDashboardData() {
        try {
            const statsRes = await fetch(`${BASE_URL}/api/super/stats`, { 
                headers: { 'x-super-password': superPass } 
            });
            
            if (statsRes.status === 401 || statsRes.status === 403) throw new Error("unauthorized");
            if (!statsRes.ok) throw new Error("فشل جلب الإحصائيات من الخادم");
            
            const stats = await statsRes.json();
            
            document.getElementById('stat-firms').textContent = stats.firms_count || 0;
            document.getElementById('stat-users').textContent = stats.users_count || 0;
            document.getElementById('stat-cases').textContent = stats.cases_count || 0;

            const firmsRes = await fetch(`${BASE_URL}/api/super/firms`, { 
                headers: { 'x-super-password': superPass } 
            });
            
            if (firmsRes.status === 401 || firmsRes.status === 403) throw new Error("unauthorized");
            if (!firmsRes.ok) throw new Error("فشل جلب بيانات المكاتب");
            
            const firms = await firmsRes.json();
            renderFirmsTable(firms);
            
        } catch (error) {
            if (error.message === "unauthorized") {
                sessionStorage.removeItem('superPassword');
                superPass = null;
                dashboardView.classList.add('d-none');
                loginView.classList.remove('d-none');
                loginAlert.textContent = "انتهت الجلسة أو كلمة المرور غير صحيحة.";
                loginAlert.classList.remove('d-none');
            } else {
                Swal.fire('خطأ!', error.message, 'error');
            }
        }
    }

    function renderFirmsTable(firms) {
        const tbody = document.getElementById('firms-table-body');
        tbody.innerHTML = '';
        
        if (!firms || firms.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-muted py-4">لا توجد مكاتب مسجلة حالياً في النظام.</td></tr>`;
            return;
        }

        const now = new Date();

        firms.forEach(firm => {
            const currentUsers = firm.mo_users ? firm.mo_users[0].count : 0;
            const endDate = firm.subscription_end_date ? new Date(firm.subscription_end_date) : null;
            
            let isExpired = false;
            let statusBadge = '';
            let dateDisplay = '<span class="text-muted">غير محدد</span>';

            if (endDate) {
                dateDisplay = endDate.toLocaleDateString('ar-EG');
                const daysLeft = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
                
                if (daysLeft < 0) {
                    isExpired = true;
                    statusBadge = '<span class="badge bg-danger shadow-sm px-3 py-2">منتهي الاشتراك</span>';
                    dateDisplay = `<span class="text-danger fw-bold">${dateDisplay} (منذ ${Math.abs(daysLeft)} أيام)</span>`;
                } else if (daysLeft <= 5) {
                    statusBadge = '<span class="badge bg-warning text-dark shadow-sm px-3 py-2">ينتهي قريباً</span>';
                    dateDisplay = `<span class="text-warning fw-bold">${dateDisplay} (باقي ${daysLeft} يوم)</span>`;
                } else {
                    statusBadge = '<span class="badge bg-success shadow-sm px-3 py-2">فعال</span>';
                }
            }

            // الإيقاف اليدوي (Override) له الأولوية
            if (firm.is_active === false) {
                statusBadge = '<span class="badge bg-dark shadow-sm px-3 py-2">موقوف يدوياً</span>';
            }

            let quotaColor = "text-success fw-bold";
            if (currentUsers >= firm.max_users) quotaColor = "text-danger fw-bold";
            else if (currentUsers >= firm.max_users - 1) quotaColor = "text-warning fw-bold";

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="fw-bold text-primary">${escapeHTML(firm.firm_name)}</td>
                <td>${statusBadge}</td>
                <td>${dateDisplay}</td>
                <td dir="ltr" class="${quotaColor}">${currentUsers} / ${firm.max_users}</td>
                <td>
                    <button class="btn btn-sm btn-success shadow-sm renew-firm-btn rounded-pill px-3 fw-bold me-1" 
                        data-id="${firm.id}" data-name="${escapeHTML(firm.firm_name)}">
                        <i class="fas fa-sync-alt"></i> تجديد
                    </button>
                    <button class="btn btn-sm btn-outline-warning shadow-sm edit-firm-btn rounded-pill px-3 fw-bold" 
                        data-id="${firm.id}" data-max="${firm.max_users}" data-status="${firm.is_active}">
                        <i class="fas fa-cog"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // ربط أحداث الإعدادات
        document.querySelectorAll('.edit-firm-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget;
                document.getElementById('editFirmId').value = target.getAttribute('data-id');
                document.getElementById('editFirmMaxUsers').value = target.getAttribute('data-max');
                document.getElementById('editFirmStatus').value = target.getAttribute('data-status');
                new bootstrap.Modal(document.getElementById('editFirmModal')).show();
            });
        });

        // ربط أحداث التجديد
        document.querySelectorAll('.renew-firm-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget;
                document.getElementById('renewFirmIdInput').value = target.getAttribute('data-id');
                document.getElementById('renewFirmNameLabel').innerText = target.getAttribute('data-name');
                new bootstrap.Modal(document.getElementById('renewFirmModal')).show();
            });
        });
    }

    // إضافة مكتب جديد مع مدة الاشتراك
    document.getElementById('btnSubmitAddFirm').addEventListener('click', async () => {
        const form = document.getElementById('addFirmForm');
        if (!form.checkValidity()) { form.reportValidity(); return; }

        const data = {
            super_password: superPass,
            firm_name: document.getElementById('newFirmName').value.trim(),
            subscription_months: parseInt(document.getElementById('newFirmDuration').value),
            max_users: document.getElementById('newFirmMaxUsers').value,
            admin_name: document.getElementById('newAdminName').value.trim(),
            admin_phone: document.getElementById('newAdminPhone').value.trim(),
            telegram_id: document.getElementById('newAdminTg').value.trim() || null
        };

        const btn = document.getElementById('btnSubmitAddFirm');
        btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> إنشاء...';

        try {
            const res = await fetch(`${BASE_URL}/api/super/register-firm`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await res.json();
            if (res.ok && result.success) {
                Swal.fire({ icon: 'success', title: 'تم إنشاء المكتب بنجاح!', confirmButtonText: 'حسناً' });
                bootstrap.Modal.getInstance(document.getElementById('addFirmModal')).hide();
                form.reset();
                loadDashboardData(); 
            } else throw new Error(result.error || "حدث خطأ.");
        } catch (error) { Swal.fire('خطأ!', error.message, 'error'); } 
        finally { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save me-1"></i> حفظ وإنشاء المكتب'; }
    });

    // تجديد الاشتراك
    document.getElementById('btnSubmitRenewFirm').addEventListener('click', async () => {
        const data = {
            super_password: superPass,
            id: document.getElementById('renewFirmIdInput').value,
            add_months: parseInt(document.getElementById('renewDuration').value)
        };

        const btn = document.getElementById('btnSubmitRenewFirm');
        btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> جاري التجديد...';

        try {
            const res = await fetch(`${BASE_URL}/api/super/renew-firm`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await res.json();
            if (res.ok && result.success) {
                Swal.fire({ icon: 'success', title: 'تم التجديد بنجاح!', text: 'تم إرسال رسائل الشكر والإشعار للمكتب.', confirmButtonText: 'ممتاز' });
                bootstrap.Modal.getInstance(document.getElementById('renewFirmModal')).hide();
                loadDashboardData(); 
            } else throw new Error(result.error || "فشل النظام في تجديد الاشتراك.");
        } catch (error) { Swal.fire('خطأ!', error.message, 'error'); } 
        finally { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check-circle me-1"></i> تأكيد التجديد'; }
    });

    // حفظ تعديلات الكوتا (الإيقاف اليدوي)
    document.getElementById('btnSubmitEditFirm').addEventListener('click', async () => {
        const data = {
            id: document.getElementById('editFirmId').value,
            max_users: parseInt(document.getElementById('editFirmMaxUsers').value, 10),
            is_active: document.getElementById('editFirmStatus').value === "true"
        };
        const btn = document.getElementById('btnSubmitEditFirm');
        btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> جاري التحديث...';

        try {
            const res = await fetch(`${BASE_URL}/api/super/firms`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'x-super-password': superPass },
                body: JSON.stringify(data)
            });
            if (res.ok) {
                Swal.fire({ icon: 'success', title: 'تم التحديث', timer: 1500, showConfirmButton: false });
                bootstrap.Modal.getInstance(document.getElementById('editFirmModal')).hide();
                loadDashboardData(); 
            } else throw new Error("فشل التحديث.");
        } catch (error) { Swal.fire('خطأ!', error.message, 'error'); } 
        finally { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check me-1"></i> حفظ التغييرات'; }
    });

    function escapeHTML(str) { if (!str) return ''; const div = document.createElement('div'); div.innerText = str; return div.innerHTML; }
});