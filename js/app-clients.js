/**
 * الملف: js/app-clients.js
 * الوصف: إدارة قاعدة الموكلين، نظام الـ OCR الذكي، ودعم الهوية الرقمية (Avatars)، متوافق مع Compact UI.
 */
window.AppClients = {
    render: function() {
        const list = document.getElementById('clients-list'); if(!list) return;
        let searchVal = document.getElementById('search-clients')?.value.toLowerCase() || ''; 
        let sortVal = document.getElementById('sort-clients')?.value || 'newest';
        
        let filtered = window.AppCore.globalData.clients.filter(c => 
            c.full_name.toLowerCase().includes(searchVal) || 
            (c.national_id && c.national_id.includes(searchVal)) || 
            (c.phone && c.phone.includes(searchVal))
        );
        
        if (sortVal === 'alpha') filtered.sort((a, b) => a.full_name.localeCompare(b.full_name, 'ar')); 
        else filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        
        if (filtered.length === 0) return list.innerHTML = '<div class="col-12 text-center p-5 text-muted bg-white rounded-4 border fw-bold shadow-sm">لا يوجد موكلين مطابقين للبحث.</div>';
        
        list.innerHTML = filtered.map(c => {
            // 🔥 إضافة دعم صور تيليغرام المرفوعة على R2 (Avatars) بتصميم مدمج وملائم للـ Compact Card 🔥
            const avatarHtml = c.avatar_url 
                ? `<img src="${window.AppCore.escapeHTML(c.avatar_url)}" class="rounded-circle shadow-sm" style="width:45px; height:45px; object-fit:cover; border: 2px solid var(--success);">`
                : `<div class="text-white rounded-circle d-flex justify-content-center align-items-center shadow-sm" style="width:45px; height:45px; font-size:1.2rem; background: linear-gradient(135deg, var(--success), #4ade80);"><i class="fas fa-user-tie"></i></div>`;

            const hasTelegram = c.telegram_id ? `<i class="fab fa-telegram text-info ms-1" title="مربوط بتيليغرام"></i>` : '';
            
            // حساب عدد قضايا الموكل لعرضها في البطاقة
            const activeCasesCount = window.AppCore.globalData.cases.filter(caseObj => caseObj.client_id === c.id && caseObj.status === 'نشطة').length;
            const casesText = activeCasesCount > 0 ? `<b class="text-success">${activeCasesCount} نشطة</b>` : 'لا يوجد نشط';

            return `
            <div class="col-md-6 col-lg-4 fade-in">
                <div class="compact-card client-card transition-hover h-100" onclick="window.location.href='client-details.html?id=${c.id}'">
                    
                    <div class="card-header-flex align-items-center mb-2">
                        <div class="d-flex align-items-center gap-3 overflow-hidden">
                            ${avatarHtml}
                            <div class="overflow-hidden">
                                <h3 class="card-title text-truncate" title="${window.AppCore.escapeHTML(c.full_name)}">${window.AppCore.escapeHTML(c.full_name)} ${hasTelegram}</h3>
                                <p class="card-subtitle mt-1 text-truncate">ر. وطني: <span class="font-monospace text-dark">${window.AppCore.escapeHTML(c.national_id || 'غير مدرج')}</span></p>
                            </div>
                        </div>
                    </div>
                    
                    <div class="card-data-grid">
                        <div class="data-item">
                            <i class="fas fa-phone-alt text-success"></i> 
                            <span class="font-monospace" dir="ltr">${window.AppCore.escapeHTML(c.phone || '--')}</span>
                        </div>
                        <div class="data-item">
                            <i class="fas fa-gavel text-warning"></i> 
                            القضايا: ${casesText}
                        </div>
                        ${c.address ? `
                        <div class="data-item full-width text-truncate" title="${window.AppCore.escapeHTML(c.address)}">
                            <i class="fas fa-map-marker-alt text-danger"></i> 
                            ${window.AppCore.escapeHTML(c.address)}
                        </div>` : ''}
                    </div>

                </div>
            </div>`;
        }).join('');
    },

    processOCR: function(event) {
        const file = event.target.files[0]; if (!file) return; 
        
        window.AppCore.showToast('جاري تحليل الهوية عبر الذكاء الاصطناعي...', 'info');
        
        const reader = new FileReader();
        reader.onload = async (e) => {
            const base64 = e.target.result.split(',')[1]; 
            try {
                // إرسال الصورة للوركر السحابي ليتم تحليلها بنموذج Llama Vision
                const data = await API.readOCR(base64, true);
                if (data && !data.error) {
                    const nameInput = document.getElementById('client_full_name');
                    const idInput = document.getElementById('client_national_id');
                    
                    if(data.full_name && nameInput) {
                        nameInput.value = data.full_name;
                        nameInput.classList.add('border-success', 'text-success');
                        setTimeout(() => nameInput.classList.remove('border-success', 'text-success'), 3000);
                    }
                    if(data.national_id && idInput) {
                        idInput.value = data.national_id;
                        idInput.classList.add('border-success', 'text-success');
                        setTimeout(() => idInput.classList.remove('border-success', 'text-success'), 3000);
                    }
                    window.AppCore.showToast('تمت التعبئة الذكية بنجاح', 'success'); 
                } else {
                    window.AppCore.showToast('لم يتعرف الذكاء الاصطناعي على النص بوضوح', 'danger');
                }
            } catch (err) { 
                window.AppCore.showToast('خطأ في الاتصال بمحرك الـ OCR السحابي', 'danger'); 
            }
        };
        reader.readAsDataURL(file);
    },

    save: async function(e) {
        e.preventDefault();
        
        const data = { 
            full_name: document.getElementById('client_full_name').value, 
            phone: document.getElementById('client_phone').value, 
            national_id: document.getElementById('client_national_id').value, 
            mother_name: document.getElementById('client_mother').value,
            date_of_birth: document.getElementById('client_dob').value || null,
            place_of_birth: document.getElementById('client_pob').value,
            nationality: document.getElementById('client_nationality').value,
            marital_status: document.getElementById('client_marital').value,
            profession: document.getElementById('client_profession').value,
            address: document.getElementById('client_address').value, 
            email: document.getElementById('client_email').value,
            client_type: document.getElementById('client_type').value,
            confidentiality_level: document.getElementById('client_confidentiality').value,
            client_portal_active: document.getElementById('client_portal_active')?.checked ?? true, 
            created_by: window.AppCore.currentUser.id
        };

        const btn = document.getElementById('btn_save_client'); 
        btn.disabled = true; 
        btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> جاري حفظ السجل...';
        
        try {
            const res = await API.addClient(data);
            if (res && !res.error) { 
                window.AppCore.closeModal('clientModal'); 
                await window.AppCore.loadAllData(); 
                window.AppCore.showToast('تم تسجيل الموكل بنجاح واعتماده في النظام', 'success'); 
                e.target.reset(); 
            } 
            else { 
                window.AppCore.showToast(res?.error || 'حدث خطأ غير معروف', 'danger'); 
            }
        } catch(err) {
            window.AppCore.showToast('فشل الاتصال بالخادم. سيتم المزامنة لاحقاً.', 'warning');
        } finally { 
            btn.disabled = false; 
            btn.innerHTML = '<i class="fas fa-check-circle me-2"></i> حفظ واعتماد ملف الموكل'; 
        }
    }
};

// ============================================================================
// Global Bindings for HTML inline events (منع خطأ ReferenceError)
// ============================================================================
window.renderClientsList = () => window.AppClients.render();
window.filterClients = () => window.AppClients.render();
window.processIdImage = (event) => window.AppClients.processOCR(event);
window.saveClient = (event) => window.AppClients.save(event);