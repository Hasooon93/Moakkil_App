// moakkil-staff.js
// الدستور المطبق: نظام HR متكامل، استغلال JSONB، لا حذف جذري، تحصين الأمان.

document.addEventListener('DOMContentLoaded', () => {
    
    // تعريف عناصر الواجهة
    const staffGrid = document.getElementById('staffGrid');
    const modal = document.getElementById('staffModal');
    const form = document.getElementById('staffForm');
    const modalTitle = document.getElementById('modalTitle');
    
    let allStaff = [];

    // ==========================================
    // 1. جلب بيانات الموظفين وعرضها
    // ==========================================
    async function loadStaff() {
        try {
            // جلب كافة بيانات الموظفين (متضمنة الحقول المخفية JSONB)
            const response = await api.get('/api/users?select=*');
            allStaff = response || [];
            renderStaff(allStaff);
        } catch (error) {
            console.error("خطأ في جلب بيانات الموظفين:", error);
            staffGrid.innerHTML = `<div style="text-align:center; grid-column: 1/-1; color:red;">فشل تحميل النظام: ${error.message}</div>`;
        }
    }

    function renderStaff(staffList) {
        staffGrid.innerHTML = '';
        
        if (staffList.length === 0) {
            staffGrid.innerHTML = '<div style="text-align:center; grid-column: 1/-1; color: gray;">لا يوجد موظفين مسجلين حالياً.</div>';
            return;
        }

        staffList.forEach(user => {
            // تحديد أيقونة ولون المنصب
            let roleName = 'غير محدد'; let roleClass = ''; let roleIcon = 'fa-user';
            if (user.role === 'admin') { roleName = 'مدير نظام'; roleClass = 'role-admin'; roleIcon = 'fa-user-shield'; }
            else if (user.role === 'lawyer') { roleName = 'محامي'; roleClass = 'role-lawyer'; roleIcon = 'fa-gavel'; }
            else if (user.role === 'secretary') { roleName = 'سكرتاريا / إداري'; roleClass = 'role-secretary'; roleIcon = 'fa-user-edit'; }

            // حساب الراتب الإجمالي إن وجد (لقراءته من الـ JSONB)
            let totalSalary = 0;
            if (user.salary_details && typeof user.salary_details === 'object') {
                const basic = parseFloat(user.salary_details.basic) || 0;
                const allowance = parseFloat(user.salary_details.allowance) || 0;
                totalSalary = basic + allowance;
            }

            // تحديد حالة الدخول للنظام
            const statusBtnClass = user.can_login ? 'active' : '';
            const statusBtnText = user.can_login ? '<i class="fas fa-unlock"></i> مصرح بالدخول' : '<i class="fas fa-lock"></i> موقوف الدخول';
            const statusBtnStyle = user.can_login ? 'background:#d1e7dd; color:#198754;' : 'background:#f8d7da; color:#dc3545;';

            // بناء الكرت الوظيفي
            const card = document.createElement('div');
            card.className = `staff-card ${roleClass}`;
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div class="staff-avatar"><i class="fas ${roleIcon}"></i></div>
                    ${user.specialization ? `<span style="font-size:0.8rem; background:#eee; padding:3px 8px; border-radius:10px; color:#666;">${user.specialization}</span>` : ''}
                </div>
                
                <div class="staff-name">${user.full_name || 'بدون اسم'}</div>
                <div class="staff-role-badge">${roleName}</div>
                
                <div class="staff-info"><i class="fas fa-phone-alt"></i> ${user.phone || '--'}</div>
                <div class="staff-info"><i class="fab fa-telegram-plane"></i> ${user.telegram_id || 'غير مربوط'}</div>
                ${totalSalary > 0 ? `<div class="staff-info" style="color:#0f5132;"><i class="fas fa-wallet"></i> إجمالي الراتب: ${totalSalary.toFixed(2)} د.أ</div>` : ''}
                
                <div class="card-actions">
                    <button class="btn-action btn-edit" onclick="openStaffModal('${user.id}')" title="تعديل الملف المهني">
                        <i class="fas fa-pen"></i> تعديل
                    </button>
                    <button class="btn-action ${statusBtnClass}" style="${statusBtnStyle}" onclick="toggleAccess('${user.id}', ${!user.can_login})" title="إيقاف / تفعيل الحساب">
                        ${statusBtnText}
                    </button>
                </div>
            `;
            staffGrid.appendChild(card);
        });
    }

    // ==========================================
    // 2. التحكم بالنافذة المنبثقة (Modal) ومعالجة البيانات
    // ==========================================
    
    // فتح النافذة للإضافة أو التعديل
    window.openStaffModal = (userId = null) => {
        form.reset();
        document.getElementById('user_id').value = '';
        modalTitle.innerHTML = '<i class="fas fa-user-plus"></i> إضافة موظف جديد';
        
        // إذا كان تعديلاً، نقوم بتعبئة الحقول بذكاء
        if (userId) {
            const user = allStaff.find(u => u.id === userId);
            if (user) {
                modalTitle.innerHTML = `<i class="fas fa-user-edit"></i> تعديل ملف: ${user.full_name}`;
                document.getElementById('user_id').value = user.id;
                
                // الحقول الأساسية
                document.getElementById('full_name').value = user.full_name || '';
                document.getElementById('phone').value = user.phone || '';
                document.getElementById('role').value = user.role || 'lawyer';
                document.getElementById('telegram_id').value = user.telegram_id || '';
                document.getElementById('can_login').checked = user.can_login !== false;
                
                // الحقول المهنية
                document.getElementById('specialization').value = user.specialization || '';
                document.getElementById('experience_years').value = user.experience_years || '';
                document.getElementById('syndicate_number').value = user.syndicate_number || '';
                document.getElementById('join_date').value = user.join_date ? user.join_date.split('T')[0] : '';

                // فك تشفير JSONB (الرواتب)
                if (user.salary_details && typeof user.salary_details === 'object') {
                    document.getElementById('salary_basic').value = user.salary_details.basic || '';
                    document.getElementById('salary_allowance').value = user.salary_details.allowance || '';
                    document.getElementById('salary_commission').value = user.salary_details.commission || '';
                }

                // فك تشفير JSONB (الطوارئ)
                if (user.emergency_contact && typeof user.emergency_contact === 'object') {
                    document.getElementById('emergency_name').value = user.emergency_contact.name || '';
                    document.getElementById('emergency_phone').value = user.emergency_contact.phone || '';
                    document.getElementById('emergency_relation').value = user.emergency_contact.relation || '';
                }
            }
        }
        
        modal.classList.add('active');
    };

    window.closeStaffModal = () => {
        modal.classList.remove('active');
        form.reset();
    };

    // ==========================================
    // 3. الحفظ وإرسال الداتا للباك إند (POST / PATCH)
    // ==========================================
    window.saveStaff = async () => {
        // التحقق من الحقول الإجبارية
        const fullName = document.getElementById('full_name').value.trim();
        const phone = document.getElementById('phone').value.trim();
        
        if (!fullName || !phone) {
            alert('يرجى إدخال الاسم ورقم الهاتف كحد أدنى.');
            return;
        }

        // بناء كائن JSONB للراتب
        const salaryDetails = {
            basic: parseFloat(document.getElementById('salary_basic').value) || 0,
            allowance: parseFloat(document.getElementById('salary_allowance').value) || 0,
            commission: parseFloat(document.getElementById('salary_commission').value) || 0
        };

        // بناء كائن JSONB للطوارئ
        const emergencyContact = {
            name: document.getElementById('emergency_name').value.trim(),
            phone: document.getElementById('emergency_phone').value.trim(),
            relation: document.getElementById('emergency_relation').value.trim()
        };

        // تجميع كل البيانات
        const userData = {
            full_name: fullName,
            phone: phone,
            role: document.getElementById('role').value,
            telegram_id: document.getElementById('telegram_id').value.trim() || null,
            can_login: document.getElementById('can_login').checked,
            specialization: document.getElementById('specialization').value,
            experience_years: parseInt(document.getElementById('experience_years').value) || 0,
            syndicate_number: document.getElementById('syndicate_number').value.trim(),
            join_date: document.getElementById('join_date').value || null,
            salary_details: salaryDetails, // سيتم تخزينها كـ JSONB تلقائياً
            emergency_contact: emergencyContact // سيتم تخزينها كـ JSONB تلقائياً
        };

        const userId = document.getElementById('user_id').value;
        const btnSave = document.querySelector('.modal-footer button:first-child');
        const originalText = btnSave.innerHTML;
        btnSave.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...';
        btnSave.disabled = true;

        try {
            if (userId) {
                // تعديل (PATCH)
                await api.patch(`/api/users?id=eq.${userId}`, userData);
                alert('تم تحديث ملف الموظف بنجاح.');
            } else {
                // إضافة جديد (POST)
                userData.is_active = true; // تفعيل افتراضي
                await api.post('/api/users', userData);
                alert('تم تعيين الموظف بنجاح.');
            }
            
            closeStaffModal();
            loadStaff(); // إعادة تحميل الشبكة
        } catch (error) {
            alert("فشل الحفظ: " + error.message);
        } finally {
            btnSave.innerHTML = originalText;
            btnSave.disabled = false;
        }
    };

    // ==========================================
    // 4. إيقاف / تفعيل دخول الموظف (Security)
    // ==========================================
    window.toggleAccess = async (userId, newStatus) => {
        const actionText = newStatus ? "تفعيل" : "إيقاف";
        if (!confirm(`هل أنت متأكد من ${actionText} صلاحية الدخول لهذا الموظف؟`)) return;

        try {
            // نحدث حقل can_login فقط
            await api.patch(`/api/users?id=eq.${userId}`, { can_login: newStatus });
            loadStaff(); // إعادة تحميل الواجهة لتحديث الأزرار
        } catch (error) {
            alert(`فشل ${actionText} الحساب: ` + error.message);
        }
    };

    // التشغيل التلقائي عند فتح الصفحة
    loadStaff();
});