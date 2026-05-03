/**
 * js/staff.js
 * وحدة إدارة الموارد البشرية (HR) وملفات الموظفين
 * الدستور المطبق: استغلال كافة الحقول، رفع المستندات إلى R2، وتأمين العرض (Zero Trust).
 */

document.addEventListener('DOMContentLoaded', () => {
    if (!API.getToken()) {
        window.location.href = '/login.html';
        return;
    }

    const elements = {
        staffContainer: document.getElementById('staff-cards-container'),
        loader: document.getElementById('staff-loader'),
        addStaffForm: document.getElementById('add-staff-form'),
        searchInput: document.getElementById('search-staff-input')
    };

    let allStaff = [];

    // ==========================================
    // 1. جلب بيانات الموظفين (Data Fetching)
    // ==========================================
    const loadStaff = async () => {
        try {
            if(elements.loader) elements.loader.style.display = 'block';
            if(elements.staffContainer) elements.staffContainer.style.display = 'none';

            // جلب الموظفين مع كافة البيانات الإضافية
            const users = await API.get('/api/users?order=created_at.desc');
            allStaff = users;
            renderStaff(users);

            if(elements.loader) elements.loader.style.display = 'none';
            if(elements.staffContainer) elements.staffContainer.style.display = 'flex';
        } catch (error) {
            console.error('[Staff Load Error]:', error);
            if(elements.loader) elements.loader.innerHTML = `<div class="alert alert-danger">${error.message}</div>`;
        }
    };

    // ==========================================
    // 2. عرض بطاقات الموظفين (UI Rendering)
    // ==========================================
    const renderStaff = (staffList) => {
        if (!elements.staffContainer) return;
        
        if (!staffList || staffList.length === 0) {
            elements.staffContainer.innerHTML = '<div class="col-12"><div class="alert alert-info text-center">لا يوجد موظفين مسجلين حالياً.</div></div>';
            return;
        }

        elements.staffContainer.innerHTML = staffList.map(staff => {
            // [التدخل الأمني]: تشفير رابط الصورة الشخصية
            const secureAvatar = API.getSecureUrl(staff.avatar_url);
            
            // حساب أيام انتهاء هوية النقابة للتنبيه
            let syndicateAlert = '';
            if (staff.syndicate_expiry_date) {
                const daysLeft = Math.ceil((new Date(staff.syndicate_expiry_date) - new Date()) / (1000 * 60 * 60 * 24));
                if (daysLeft <= 30 && daysLeft > 0) syndicateAlert = `<span class="badge bg-warning">النقابة تنتهي بعد ${daysLeft} يوم</span>`;
                else if (daysLeft <= 0) syndicateAlert = `<span class="badge bg-danger">هوية النقابة منتهية!</span>`;
            }

            return `
                <div class="col-md-6 col-lg-4 mb-4">
                    <div class="card staff-card h-100 shadow-sm ${!staff.is_active ? 'border-danger opacity-75' : ''}">
                        <div class="card-body text-center">
                            <img src="${secureAvatar}" alt="${staff.full_name}" class="rounded-circle mb-3" style="width: 100px; height: 100px; object-fit: cover; border: 3px solid var(--main-firm-color, #004d40);">
                            <h5 class="card-title mb-1">${staff.full_name}</h5>
                            <p class="text-muted mb-2">${staff.role === 'admin' ? 'مدير نظام' : (staff.specialization || 'محامي / موظف')}</p>
                            ${syndicateAlert}
                            
                            <hr>
                            
                            <div class="text-start mb-3" style="font-size: 0.9rem;">
                                <div><strong>📱 الهاتف:</strong> ${staff.phone || 'غير محدد'}</div>
                                <div><strong>🆔 الرقم الوطني:</strong> ${staff.national_id || 'غير محدد'}</div>
                                <div><strong>⚖️ رقم النقابة:</strong> ${staff.syndicate_number || 'غير محدد'}</div>
                                <div><strong>📅 تاريخ الانضمام:</strong> ${staff.join_date ? new Date(staff.join_date).toLocaleDateString('ar-EG') : 'غير محدد'}</div>
                                <div><strong>💼 سنوات الخبرة:</strong> ${staff.experience_years ? staff.experience_years + ' سنوات' : 'غير محدد'}</div>
                            </div>
                            
                            <div class="d-flex justify-content-center gap-2">
                                <button class="btn btn-sm ${staff.is_active ? 'btn-outline-danger' : 'btn-outline-success'} toggle-status-btn" data-id="${staff.id}" data-active="${staff.is_active}">
                                    ${staff.is_active ? 'إيقاف الحساب' : 'تفعيل الحساب'}
                                </button>
                                ${staff.staff_documents ? `<button class="btn btn-sm btn-info view-docs-btn" data-docs='${JSON.stringify(staff.staff_documents)}'>المستندات</button>` : ''}
                            </div>
                        </div>
                        <div class="card-footer bg-transparent text-center">
                            <small class="text-muted">حالة الدخول: ${staff.can_login ? '<span class="text-success">مصرح له</span>' : '<span class="text-danger">ممنوع</span>'}</small>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // تفعيل أزرار تغيير الحالة
        document.querySelectorAll('.toggle-status-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.dataset.id;
                const currentStatus = e.target.dataset.active === 'true';
                await toggleStaffStatus(id, !currentStatus);
            });
        });

        // تفعيل أزرار عرض المستندات
        document.querySelectorAll('.view-docs-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                try {
                    const docs = JSON.parse(e.target.dataset.docs);
                    viewStaffDocuments(docs);
                } catch(err) { console.error('Error parsing docs', err); }
            });
        });
    };

    // ==========================================
    // 3. إضافة موظف جديد مع الرفع السحابي (R2)
    // ==========================================
    if (elements.addStaffForm) {
        elements.addStaffForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const submitBtn = elements.addStaffForm.querySelector('button[type="submit"]');
            submitBtn.innerHTML = 'جاري الحفظ والرفع للسحابة... <span class="spinner-border spinner-border-sm"></span>';
            submitBtn.disabled = true;

            try {
                // تجميع البيانات الأساسية (Zero Data Loss)
                const payload = {
                    full_name: document.getElementById('staff-fullname').value,
                    phone: document.getElementById('staff-phone').value,
                    role: document.getElementById('staff-role').value,
                    national_id: document.getElementById('staff-national-id').value || null,
                    syndicate_number: document.getElementById('staff-syndicate-number').value || null,
                    syndicate_expiry_date: document.getElementById('staff-syndicate-expiry').value || null,
                    specialization: document.getElementById('staff-specialization').value || null,
                    experience_years: parseInt(document.getElementById('staff-experience').value) || 0,
                    join_date: document.getElementById('staff-join-date').value || new Date().toISOString().split('T')[0],
                    date_of_birth: document.getElementById('staff-dob').value || null,
                    can_login: document.getElementById('staff-can-login').checked,
                    is_active: true
                };

                // التعامل مع رفع الصورة الشخصية (Avatar) إلى R2
                const avatarFile = document.getElementById('staff-avatar').files[0];
                if (avatarFile) {
                    const avatarUpload = await API.uploadToCloudR2(avatarFile, 'staff/avatars');
                    payload.avatar_url = avatarUpload.file_path;
                }

                // التعامل مع رفع المستندات الثبوتية (HR Documents) إلى R2
                const docFiles = document.getElementById('staff-documents').files;
                if (docFiles.length > 0) {
                    let uploadedDocs = [];
                    for (let i = 0; i < docFiles.length; i++) {
                        const docUpload = await API.uploadToCloudR2(docFiles[i], 'staff/documents');
                        uploadedDocs.push({
                            file_name: docFiles[i].name,
                            url: docUpload.file_path,
                            uploaded_at: new Date().toISOString()
                        });
                    }
                    payload.staff_documents = uploadedDocs; // يتم حفظها كـ JSONB
                }

                // إرسال البيانات للباك إند (ملاحظة: الباك إند سيفحص كوتا المستخدمين max_users)
                await API.post('/api/users', payload);
                
                alert('تم إضافة الموظف بنجاح.');
                elements.addStaffForm.reset();
                const modal = bootstrap.Modal.getInstance(document.getElementById('addStaffModal'));
                if(modal) modal.hide();
                loadStaff();

            } catch (error) {
                console.error('[Add Staff Error]:', error);
                alert(`حدث خطأ: ${error.message}`);
            } finally {
                submitBtn.innerHTML = 'حفظ بيانات الموظف';
                submitBtn.disabled = false;
            }
        });
    }

    // ==========================================
    // 4. الدوال المساعدة للتحكم وعرض المستندات
    // ==========================================
    const toggleStaffStatus = async (id, newStatus) => {
        if (!confirm(`هل أنت متأكد من رغبتك في ${newStatus ? 'تفعيل' : 'إيقاف'} هذا الحساب؟`)) return;
        try {
            await API.put(`/api/users?id=eq.${id}`, { is_active: newStatus, can_login: newStatus });
            alert('تم تحديث حالة الموظف.');
            loadStaff();
        } catch (error) {
            alert(`خطأ: ${error.message}`);
        }
    };

    const viewStaffDocuments = (docs) => {
        if (!docs || docs.length === 0) return alert('لا توجد مستندات.');
        
        let docsHtml = '<div class="list-group">';
        docs.forEach(doc => {
            // تأمين روابط المستندات قبل عرضها
            const secureDocUrl = API.getSecureUrl(doc.url);
            docsHtml += `
                <a href="${secureDocUrl}" target="_blank" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center">
                    ${doc.file_name}
                    <span class="badge bg-primary rounded-pill">عرض</span>
                </a>
            `;
        });
        docsHtml += '</div>';

        // يمكن عرضها في Modal (يجب أن يكون لديك Modal مجهز في الـ HTML بـ id='docsModal')
        const modalBody = document.getElementById('docs-modal-body');
        if (modalBody) {
            modalBody.innerHTML = docsHtml;
            const docsModal = new bootstrap.Modal(document.getElementById('docsModal'));
            docsModal.show();
        } else {
            // حل بديل في حال عدم وجود الـ Modal في الواجهة
            const newWindow = window.open("", "_blank");
            newWindow.document.write(`<html dir="rtl"><head><title>مستندات الموظف</title></head><body style="font-family:sans-serif; padding:20px;"><h2>المستندات الثبوتية</h2>${docsHtml}</body></html>`);
        }
    };

    // ==========================================
    // 5. محرك البحث (البحث في الفرونت إند)
    // ==========================================
    if (elements.searchInput) {
        elements.searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            const filtered = allStaff.filter(staff => 
                (staff.full_name && staff.full_name.toLowerCase().includes(query)) ||
                (staff.phone && staff.phone.includes(query)) ||
                (staff.national_id && staff.national_id.includes(query))
            );
            renderStaff(filtered);
        });
    }

    // التشغيل الأولي
    loadStaff();
});