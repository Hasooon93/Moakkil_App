/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: js/app-clients.js (Client Management Engine V5.6 - Enterprise Luxury Edition)
 * الوصف: محرك إدارة الموكلين، التحقق من الهوية الرقمية (KYC)، المعالجة الذكية لبطاقات الهوية (OCR)،
 * وتتبع القضايا والذمم المالية المرتبطة، والربط المباشر مع بوابة الموكل.
 * 
 * الميزات المحدثة (V5.6 Enterprise):
 * 1. بطاقات موكلين فخمة وشاملة (Compact KYC Cards) مع صور الهوية والحالة القانونية.
 * 2. مؤشرات حية لعدد القضايا النشطة والمغلقة ومجمل الأتعاب والذمم المتبقية لكل موكل.
 * 3. نظام تعبئة ذكي عبر مسح الهوية الشخصية (AI OCR Powered by Llama Vision) مع تمييز الحقول.
 * 4. أزرار اتصال سريع مباشرة عبر الهاتف أو تطبيق WhatsApp بنقرة واحدة.
 * 5. جدار حماية صارم لمنع تكرار الإرسال وتأكيد صحة البيانات الأساسية (SweetAlert2).
 * 6. محرك بحث وترتيب متقدم (أبجدي، تاريخ الإضافة، أو الأكثر نشاطاً في القضايا).
 * ============================================================================
 */

window.AppClients = {
    /**
     * رسم شبكة بطاقات الموكلين مع الفرز والبحث المتقدم
     */
    render: function() {
        const list = document.getElementById('clients-list'); 
        if (!list) return;
        
        const searchInput = document.getElementById('search-clients');
        const searchVal = searchInput ? searchInput.value.trim().toLowerCase() : ''; 
        const sortSelect = document.getElementById('sort-clients');
        const sortVal = sortSelect ? sortSelect.value : 'newest';
        
        const allClients = window.AppCore.globalData.clients || [];
        const allCases = window.AppCore.globalData.cases || [];

        // 1. فلترة الموكلين بناءً على النص والبيانات
        let filtered = allClients.filter(c => {
            if (!searchVal) return true;
            const name = (c.full_name || '').toLowerCase();
            const natId = (c.national_id || '').toLowerCase();
            const phone = (c.phone || '').toLowerCase();
            const email = (c.email || '').toLowerCase();
            const address = (c.address || '').toLowerCase();
            const profession = (c.profession || '').toLowerCase();
            const clientType = (c.client_type || '').toLowerCase();

            return name.includes(searchVal) ||
                   natId.includes(searchVal) ||
                   phone.includes(searchVal) ||
                   email.includes(searchVal) ||
                   address.includes(searchVal) ||
                   profession.includes(searchVal) ||
                   clientType.includes(searchVal);
        });
        
        // 2. ترتيب الموكلين
        if (sortVal === 'alpha') {
            filtered.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'ar')); 
        } else if (sortVal === 'cases_count') {
            filtered.sort((a, b) => {
                const countA = allCases.filter(cs => cs.client_id === a.id && cs.status === 'نشطة').length;
                const countB = allCases.filter(cs => cs.client_id === b.id && cs.status === 'نشطة').length;
                return countB - countA;
            });
        } else {
            // الأحدث افتراضياً
            filtered.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        }
        
        // 3. عرض الحالة الفارغة عند عدم وجود نتائج
        if (filtered.length === 0) {
            list.innerHTML = `
            <div class="col-12 text-center py-5">
                <div class="bg-white rounded-4 border p-5 shadow-sm mx-auto" style="max-width: 580px;">
                    <div class="mb-3 text-gold">
                        <i class="fas fa-users-slash fa-4x opacity-75"></i>
                    </div>
                    <h5 class="fw-bold text-navy mb-2">لا يوجد موكلون مطابقون للبحث</h5>
                    <p class="text-muted small mb-4">لم يتم العثور على أي موكلين يتطابقون مع اسم البحث أو المعايير المختارة.</p>
                    <button class="btn btn-navy px-4 py-2 rounded-pill fw-bold shadow-sm" onclick="window.openModal('clientModal')">
                        <i class="fas fa-user-plus me-1 text-gold"></i> تسجيل موكل جديد (KYC)
                    </button>
                </div>
            </div>`;
            return;
        }
        
        // 4. رسم بطاقات الموكلين الفخمة (Compact KYC Cards)
        list.innerHTML = filtered.map(c => {
            const clientName = c.full_name || 'موكل غير مسمى';
            const clientInitial = window.AppCore.escapeHTML(clientName.charAt(0) || 'م');
            const isCompany = (c.client_type === 'شركة');

            // تجهيز الصورة الرمزية
            const avatarHtml = c.avatar_url 
                ? `<img src="${window.AppCore.escapeHTML(c.avatar_url)}" class="rounded-circle shadow-sm" style="width:46px; height:46px; object-fit:cover; border: 2px solid var(--accent);" onerror="this.onerror=null; this.outerHTML='<div class=\\'lawyer-avatar\\' style=\\'width:46px; height:46px; font-size:1.1rem;\\'>${clientInitial}</div>';">`
                : `<div class="lawyer-avatar" style="width:46px; height:46px; font-size:1.1rem;">${clientInitial}</div>`;

            // إحصائيات قضايا الموكل
            const clientCases = allCases.filter(cs => cs.client_id === c.id);
            const activeCases = clientCases.filter(cs => cs.status === 'نشطة').length;
            const completedCases = clientCases.filter(cs => cs.status === 'مكتملة' || cs.status === 'مغلقة').length;

            // الحسابات المالية الإجمالية للموكل
            let totalAgreed = 0;
            let totalPaid = 0;
            clientCases.forEach(cs => {
                totalAgreed += Number(cs.total_agreed_fees || cs.agreed_fees) || 0;
                totalPaid += Number(cs.total_paid) || 0;
            });
            const remaining = Math.max(0, totalAgreed - totalPaid);

            // روابط الاتصال السريع
            const cleanPhone = (c.phone || '').replace(/[^0-9+]/g, '');
            const waPhone = cleanPhone.startsWith('0') ? '962' + cleanPhone.substring(1) : cleanPhone;

            // شارات التصنيف
            const typeBadge = isCompany 
                ? '<span class="badge bg-light text-navy border font-monospace" style="font-size: 0.72rem;"><i class="fas fa-building me-1 text-primary"></i>شركة</span>'
                : '<span class="badge bg-light text-muted border font-monospace" style="font-size: 0.72rem;"><i class="fas fa-user me-1 text-success"></i>فرد</span>';

            const portalBadge = c.client_portal_active !== false
                ? '<span class="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25" style="font-size: 0.72rem;"><i class="fas fa-check-circle me-1"></i>بوابة مفعلة</span>'
                : '<span class="badge bg-secondary bg-opacity-10 text-secondary border border-secondary border-opacity-25" style="font-size: 0.72rem;"><i class="fas fa-ban me-1"></i>بوابة معطلة</span>';

            const confBadge = (c.confidentiality_level === 'سري' || c.confidentiality_level === 'سري جداً')
                ? '<span class="badge bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25" style="font-size: 0.72rem;"><i class="fas fa-lock me-1"></i>سري</span>'
                : '';

            return `
            <div class="col-md-6 col-lg-4 fade-in">
                <div class="compact-card client-card transition-hover position-relative h-100 d-flex flex-column" onclick="localStorage.setItem('current_client_id','${c.id}'); window.location.href='client-details.html?id=${encodeURIComponent(c.id)}'">
                    
                    <!-- رأس البطاقة -->
                    <div class="card-header-flex align-items-center mb-2">
                        <div class="d-flex align-items-center gap-3 overflow-hidden">
                            ${avatarHtml}
                            <div class="overflow-hidden">
                                <h3 class="card-title text-truncate mb-0 text-navy fw-bold" style="font-size: 1.05rem;" title="${window.AppCore.escapeHTML(clientName)}">
                                    ${window.AppCore.escapeHTML(clientName)}
                                </h3>
                                <p class="card-subtitle mt-1 text-truncate mb-0" style="font-size: 0.8rem;">
                                    الرقم الوطني: <b class="font-monospace text-dark">${window.AppCore.escapeHTML(c.national_id || 'غير مدرج')}</b>
                                </p>
                            </div>
                        </div>
                    </div>

                    <!-- شارات التصنيف والسرية -->
                    <div class="mb-2 d-flex flex-wrap gap-1 align-items-center">
                        ${typeBadge}
                        ${portalBadge}
                        ${confBadge}
                        ${c.profession ? `<span class="badge bg-light text-muted border font-monospace text-truncate" style="font-size: 0.72rem; max-width: 140px;">${window.AppCore.escapeHTML(c.profession)}</span>` : ''}
                    </div>
                    
                    <!-- شبكة بيانات الموكل -->
                    <div class="card-data-grid flex-grow-1">
                        <div class="data-item">
                            <i class="fas fa-phone-alt text-success"></i> 
                            <span class="font-monospace" dir="ltr">${window.AppCore.escapeHTML(c.phone || '--')}</span>
                        </div>
                        <div class="data-item" title="حالة القضايا">
                            <i class="fas fa-balance-scale text-primary"></i> 
                            <span>القضايا: <b class="text-navy">${activeCases}</b> نشطة ${completedCases > 0 ? `<small class="text-muted">(${completedCases} مغلقة)</small>` : ''}</span>
                        </div>
                        ${c.address ? `
                        <div class="data-item full-width text-truncate" title="${window.AppCore.escapeHTML(c.address)}">
                            <i class="fas fa-map-marker-alt text-danger"></i> 
                            <span>${window.AppCore.escapeHTML(c.address)}</span>
                        </div>` : ''}
                    </div>

                    <!-- مؤشر الذمة المالية للموكل -->
                    ${totalAgreed > 0 ? `
                    <div class="mt-2 pt-2 border-top d-flex justify-content-between align-items-center small">
                        <span class="text-muted fw-bold">الأتعاب: <b class="text-navy">${totalAgreed.toLocaleString()} د.أ</b></span>
                        <span class="badge ${remaining === 0 ? 'bg-success' : 'bg-warning bg-opacity-10 text-dark border border-warning'} font-monospace">
                            ${remaining === 0 ? 'خالص الذمة' : `المتبقي: ${remaining.toLocaleString()} د.أ`}
                        </span>
                    </div>` : ''}

                    <!-- أزرار الإجراء السريع (اتصال / واتساب / ملف الموكل) -->
                    <div class="mt-3 pt-2 border-top d-flex justify-content-between align-items-center">
                        <div class="d-flex gap-2">
                            ${cleanPhone ? `
                            <a href="tel:${cleanPhone}" class="btn btn-sm btn-light border text-success rounded-circle shadow-sm" style="width: 32px; height: 32px; padding: 0; display: inline-flex; align-items: center; justify-content: center;" onclick="event.stopPropagation();" title="اتصال هاتفي">
                                <i class="fas fa-phone"></i>
                            </a>
                            <a href="https://wa.me/${waPhone}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-light border text-success rounded-circle shadow-sm" style="width: 32px; height: 32px; padding: 0; display: inline-flex; align-items: center; justify-content: center;" onclick="event.stopPropagation();" title="محادثة واتساب">
                                <i class="fab fa-whatsapp fs-6"></i>
                            </a>` : ''}
                        </div>
                        <button type="button" class="btn btn-sm btn-outline-navy py-1 px-3 rounded-pill fw-bold shadow-sm" style="font-size: 0.76rem;" onclick="event.stopPropagation(); localStorage.setItem('current_client_id','${c.id}'); window.location.href='client-details.html?id=${encodeURIComponent(c.id)}'">
                            <i class="fas fa-folder-open me-1 text-gold"></i> ملف الموكل
                        </button>
                    </div>

                </div>
            </div>`;
        }).join('');
    },

    /**
     * معالجة وتحليل صورة الهوية الشخصية الذكية (OCR via Llama Vision)
     */
    processOCR: function(event) {
        const file = event.target.files ? event.target.files[0] : null; 
        if (!file) return; 
        
        window.AppCore.showToast('جاري تحليل الهوية عبر الذكاء الاصطناعي...', 'info');
        
        const reader = new FileReader();
        reader.onload = async (e) => {
            const resultStr = e.target.result || '';
            const base64 = resultStr.includes(',') ? resultStr.split(',')[1] : resultStr; 
            
            try {
                // إرسال الصورة للوركر السحابي ليتم تحليلها بنموذج الرؤية المتقدم
                const data = await API.readOCR(base64, true);
                
                if (data && !data.error) {
                    let filledCount = 0;
                    
                    const nameInput = document.getElementById('client_full_name');
                    const idInput = document.getElementById('client_national_id');
                    const motherInput = document.getElementById('client_mother');
                    const dobInput = document.getElementById('client_dob');
                    const pobInput = document.getElementById('client_pob');
                    const natInput = document.getElementById('client_nationality');
                    
                    if (data.full_name && nameInput) {
                        nameInput.value = data.full_name.trim();
                        nameInput.classList.add('border-success', 'bg-success', 'bg-opacity-10');
                        setTimeout(() => nameInput.classList.remove('border-success', 'bg-success', 'bg-opacity-10'), 3500);
                        filledCount++;
                    }
                    if (data.national_id && idInput) {
                        idInput.value = data.national_id.toString().trim();
                        idInput.classList.add('border-success', 'bg-success', 'bg-opacity-10');
                        setTimeout(() => idInput.classList.remove('border-success', 'bg-success', 'bg-opacity-10'), 3500);
                        filledCount++;
                    }
                    if (data.mother_name && motherInput) {
                        motherInput.value = data.mother_name.trim();
                        filledCount++;
                    }
                    if (data.date_of_birth && dobInput) {
                        dobInput.value = data.date_of_birth;
                        filledCount++;
                    }
                    if (data.place_of_birth && pobInput) {
                        pobInput.value = data.place_of_birth;
                        filledCount++;
                    }
                    if (data.nationality && natInput) {
                        natInput.value = data.nationality;
                    }
                    
                    if (filledCount > 0) {
                        if (typeof Swal !== 'undefined') {
                            Swal.fire({
                                icon: 'success',
                                title: 'تمت القراءة الذكية بنجاح',
                                html: `تم استخراج وتعبئة <b>${filledCount}</b> حقول تلقائياً من بطاقة الهوية الرسمية. يرجى مراجعتها وتأكيدها.`,
                                timer: 2800,
                                showConfirmButton: false
                            });
                        } else {
                            window.AppCore.showToast(`تم استخراج ${filledCount} حقول من الهوية بنجاح`, 'success'); 
                        }
                    } else {
                        window.AppCore.showToast('تمت معالجة الصورة ولكن لم يتم العثور على حقول واضحة.', 'warning');
                    }
                } else {
                    window.AppCore.showToast(data?.error || 'لم يتعرف الذكاء الاصطناعي على النص بوضوح', 'warning');
                }
            } catch (err) { 
                console.error('OCR Process Error:', err);
                window.AppCore.showToast('تعذر الاتصال بمحرك الـ OCR السحابي. يرجى التحقق من اتصال الإنترنت.', 'danger'); 
            } finally {
                // إعادة ضبط حقل اختيار الملف ليسمح باختيار نفس الصورة مجدداً عند الحاجة
                event.target.value = '';
            }
        };
        reader.readAsDataURL(file);
    },

    /**
     * حفظ وتوثيق بيانات الموكل الجديد (KYC)
     */
    save: async function(e) {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        
        const btn = document.getElementById('btn_save_client'); 
        if (btn && btn.disabled) return;

        const fullNameVal = document.getElementById('client_full_name')?.value?.trim();
        const phoneVal = document.getElementById('client_phone')?.value?.trim();

        // التحقق من الحقول الإلزامية
        if (!fullNameVal || !phoneVal) {
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    icon: 'warning',
                    title: 'حقول إلزامية مفقودة',
                    text: 'يجب إدخال "الاسم الكامل للموكل" و"رقم الهاتف الأساسي" قبل اعتماد التسجيل.',
                    confirmButtonText: 'حسناً',
                    confirmButtonColor: 'var(--navy)'
                });
            } else {
                window.AppCore.showToast('يرجى إدخال اسم الموكل ورقم الهاتف.', 'danger');
            }
            return;
        }

        const data = { 
            full_name: fullNameVal, 
            phone: phoneVal, 
            national_id: document.getElementById('client_national_id')?.value?.trim() || '', 
            mother_name: document.getElementById('client_mother')?.value?.trim() || '',
            date_of_birth: document.getElementById('client_dob')?.value || null,
            place_of_birth: document.getElementById('client_pob')?.value?.trim() || '',
            nationality: document.getElementById('client_nationality')?.value?.trim() || 'أردني',
            marital_status: document.getElementById('client_marital')?.value || '',
            profession: document.getElementById('client_profession')?.value?.trim() || '',
            address: document.getElementById('client_address')?.value?.trim() || '', 
            email: document.getElementById('client_email')?.value?.trim() || '',
            client_type: document.getElementById('client_type')?.value || 'فرد',
            confidentiality_level: document.getElementById('client_confidentiality')?.value || 'عادي',
            client_portal_active: document.getElementById('client_portal_active') ? document.getElementById('client_portal_active').checked : true, 
            created_by: window.AppCore.currentUser?.id
        };

        if (btn) {
            btn.disabled = true; 
            btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> جاري حفظ السجل واعتماده...';
        }
        
        try {
            const res = await API.addClient(data);
            if (res && !res.error) { 
                window.AppCore.closeModal('clientModal'); 
                await window.AppCore.loadAllData(); 
                
                if (typeof Swal !== 'undefined') {
                    Swal.fire({
                        icon: 'success',
                        title: 'تم تسجيل الموكل بنجاح',
                        text: `تم فتح وتوثيق ملف الموكل: ${fullNameVal}`,
                        timer: 2000,
                        showConfirmButton: false
                    });
                } else {
                    window.AppCore.showToast('تم تسجيل الموكل بنجاح واعتماده في النظام', 'success'); 
                }

                const clientForm = document.getElementById('clientForm');
                if (clientForm) clientForm.reset(); 
            } else { 
                throw new Error(res?.error || 'حدث خطأ أثناء حفظ بيانات الموكل');
            }
        } catch(err) {
            console.error('Client Save Error:', err);
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    icon: 'error',
                    title: 'تعذر حفظ السجل',
                    text: err.message || 'حدث خطأ أثناء معالجة الطلب.'
                });
            } else {
                window.AppCore.showToast('خطأ بالحفظ: ' + err.message, 'danger');
            }
        } finally { 
            if (btn) {
                btn.disabled = false; 
                btn.innerHTML = '<i class="fas fa-check-circle me-2"></i> حفظ واعتماد ملف الموكل'; 
            }
        }
    }
};

// ============================================================================
// الروابط العامة (Global Bindings) لتوصيل الواجهة بمحرك الموكلين V5.6
// ============================================================================
window.renderClientsList = () => window.AppClients.render();
window.filterClients = () => window.AppClients.render();
window.processIdImage = (event) => window.AppClients.processOCR(event);
window.saveClient = (event) => window.AppClients.save(event);
