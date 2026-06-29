/**
 * الملف: js/app-cases.js
 * الوصف: محرك القضايا وإدارة النوافذ الذكية، متوافق 100% مع الهيكلية المعمارية الجديدة (Compact UI).
 */
window.AppCases = {
    render: function() {
        const list = document.getElementById('cases-list'); 
        if(!list) return;
        
        const searchVal = document.getElementById('search-cases')?.value.toLowerCase() || '';
        
        // 1. فلترة القضايا للرسم بناءً على حالة البحث والفلتر النشط
        const filteredCases = window.AppCore.globalData.cases.filter(c => {
            const matchesStatus = window.AppCore.currentCaseFilter === '' || c.status === window.AppCore.currentCaseFilter;
            const matchesSearch = (c.case_internal_id && c.case_internal_id.toLowerCase().includes(searchVal)) || 
                                  (c.opponent_name && c.opponent_name.toLowerCase().includes(searchVal));
            return matchesStatus && matchesSearch;
        });
        
        // 2. تحديث قائمة القضايا الرئيسية (Parent Cases) في نموذج الإضافة لربط القضايا ببعضها
        const parentSelect = document.getElementById('case_parent_id');
        if (parentSelect) {
            parentSelect.innerHTML = '<option value="">لا يوجد (هذه قضية أصلية)</option>' + 
                window.AppCore.globalData.cases.map(c => `<option value="${c.id}">${window.AppCore.escapeHTML(c.case_internal_id)} - ${window.AppCore.escapeHTML(c.opponent_name)}</option>`).join('');
        }

        if (filteredCases.length === 0) {
            return list.innerHTML = '<div class="col-12 text-center p-5 text-muted bg-white rounded-4 border fw-bold shadow-sm">لا توجد قضايا مطابقة للبحث أو الفلتر.</div>';
        }
        
        // 3. رسم بطاقات القضايا (تم تحديث الهيكلة هنا لتصبح Compact وغزيرة المعلومات وتفاعلية)
        list.innerHTML = filteredCases.map(c => {
            // تحديد ألوان الحالة
            const statusColor = c.status === 'نشطة' ? 'success' : (c.status === 'مكتملة' ? 'dark' : 'warning');
            const clientName = window.AppCore.globalData.clients.find(cl => cl.id === c.client_id)?.full_name || 'غير محدد';
            
            // تجهيز البيانات الفرعية لشبكة المعلومات (Data Grid)
            const courtName = c.current_court ? window.AppCore.escapeHTML(c.current_court) : 'المحكمة غير محددة';
            const courtRoom = c.court_room ? ' - ' + window.AppCore.escapeHTML(c.court_room) : '';
            const nextHearing = c.deadline_date ? new Date(c.deadline_date).toLocaleDateString('ar-JO') : 'لا يوجد موعد مجدول';
            const opponent = c.opponent_name ? window.AppCore.escapeHTML(c.opponent_name) : 'غير محدد';
            
            return `
            <div class="col-md-6 col-lg-4 fade-in">
                <div class="compact-card case-card" onclick="window.location.href='case-details.html?id=${c.id}'">
                    
                    <div class="card-header-flex">
                        <div>
                            <h3 class="card-title">${window.AppCore.escapeHTML(clientName)}</h3>
                            <p class="card-subtitle mt-1 text-primary font-monospace">${window.AppCore.escapeHTML(c.case_internal_id)}</p>
                        </div>
                        <span class="card-badge bg-${statusColor} bg-opacity-10 text-${statusColor} border border-${statusColor} border-opacity-25">${window.AppCore.escapeHTML(c.status)}</span>
                    </div>
                    
                    <div class="card-data-grid">
                        <div class="data-item full-width" title="المحكمة والغرفة">
                            <i class="fas fa-university text-primary"></i> 
                            <span class="text-truncate">${courtName}${courtRoom}</span>
                        </div>
                        <div class="data-item" title="تاريخ الجلسة القادمة أو الموعد النهائي">
                            <i class="fas fa-calendar-alt text-danger"></i> 
                            ${nextHearing}
                        </div>
                        <div class="data-item text-truncate" title="اسم الخصم">
                            <i class="fas fa-user-tie text-info"></i> 
                            الخصم: ${opponent}
                        </div>
                    </div>

                    <div class="mt-3 pt-2 border-top text-end">
                        <button class="btn btn-sm btn-light border text-navy py-1 px-3 rounded-pill fw-bold shadow-sm" style="font-size: 0.75rem;" onclick="event.stopPropagation(); window.openShareModal('${c.public_token}', '${window.AppCore.escapeHTML(c.access_pin)}')">
                            <i class="fas fa-share-nodes me-1 text-accent"></i> بوابة الموكل
                        </button>
                    </div>

                </div>
            </div>`;
        }).join('');
    },

    filterByBtn: function(btn, status) {
        document.querySelectorAll('.filter-btn').forEach(b => { 
            b.classList.remove('btn-primary-custom', 'text-white'); 
            b.classList.add('btn-outline-secondary', 'bg-white', 'text-muted'); 
        });
        btn.classList.remove('btn-outline-secondary', 'bg-white', 'text-muted'); 
        btn.classList.add('btn-primary-custom', 'text-white'); 
        window.AppCore.currentCaseFilter = status; 
        this.render();
    },

    // 🔥 ميزة الإملاء الصوتي الذكي (Voice Dictation)
    startDictation: function(targetId) {
        if (!('webkitSpeechRecognition' in window)) {
            return window.AppCore.showToast('متصفحك لا يدعم الإملاء الصوتي. يرجى استخدام Google Chrome.', 'danger');
        }
        
        const recognition = new webkitSpeechRecognition();
        recognition.lang = 'ar-JO'; // اللغة العربية الأردنية لضمان دقة المصطلحات القانونية
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        const targetEl = document.getElementById(targetId);
        const originalPlaceholder = targetEl.placeholder;
        targetEl.placeholder = 'جاري الاستماع... تحدث الآن';
        
        window.AppCore.showToast('النظام يستمع إليك الآن...', 'info');

        recognition.onresult = function(event) {
            const transcript = event.results[0][0].transcript;
            targetEl.value = targetEl.value + (targetEl.value ? ' ' : '') + transcript;
        };

        recognition.onerror = function(event) {
            window.AppCore.showToast('لم نتمكن من سماعك بوضوح.', 'warning');
        };

        recognition.onend = function() {
            targetEl.placeholder = originalPlaceholder;
            window.AppCore.showToast('تم إيقاف التسجيل الصوتي.', 'success');
        };

        recognition.start();
    },

    save: async function(e) {
        e.preventDefault();
        
        const lawyerSelect = document.getElementById('case_assigned_lawyers');
        const lawyers = lawyerSelect ? Array.from(lawyerSelect.selectedOptions).map(opt => opt.value) : [];
        if(lawyers.length === 0) lawyers.push(window.AppCore.currentUser.id);

        // تجميع وبناء مصفوفة البيانات للقضية الجديدة
        const data = { 
            client_id: document.getElementById('case_client_id').value, 
            case_internal_id: document.getElementById('case_internal_id').value, 
            access_pin: document.getElementById('case_access_pin').value, 
            case_type: document.getElementById('case_type').value, 
            priority_level: document.getElementById('case_priority_level').value,
            confidentiality_level: document.getElementById('case_confidentiality').value,
            current_stage: document.getElementById('case_current_stage').value,
            case_tags: document.getElementById('case_tags').value ? document.getElementById('case_tags').value.split(',') : [],
            
            current_court: document.getElementById('case_court').value, 
            court_room: document.getElementById('case_court_room').value,
            court_case_number: document.getElementById('case_court_case_number').value,
            case_year: document.getElementById('case_case_year').value ? Number(document.getElementById('case_case_year').value) : null,
            litigation_degree: document.getElementById('case_litigation_degree').value,
            current_judge: document.getElementById('case_current_judge').value,
            court_clerk: document.getElementById('case_court_clerk').value,
            parent_case_id: document.getElementById('case_parent_id').value || null,
            
            execution_file_number: document.getElementById('case_execution_file_number').value,
            deadline_date: document.getElementById('case_deadline_date').value || null,
            statute_of_limitations_date: document.getElementById('case_statute_of_limitations_date').value || null,
            police_station_ref: document.getElementById('case_police_station_ref').value,
            prosecution_ref: document.getElementById('case_prosecution_ref').value,

            opponent_name: document.getElementById('case_opponent_name').value, 
            opponent_lawyer: document.getElementById('case_opponent_lawyer').value,
            co_plaintiffs: document.getElementById('case_co_plaintiffs').value ? document.getElementById('case_co_plaintiffs').value.split(',') : [],
            co_defendants: document.getElementById('case_co_defendants').value ? document.getElementById('case_co_defendants').value.split(',') : [],
            experts_and_witnesses: document.getElementById('case_experts_and_witnesses').value ? [document.getElementById('case_experts_and_witnesses').value] : [],
            power_of_attorney_number: document.getElementById('case_poa_number').value,
            poa_details: document.getElementById('case_poa_details').value,

            lawsuit_facts: document.getElementById('case_lawsuit_text').value, 
            legal_basis: document.getElementById('case_legal_basis').value,
            final_requests: document.getElementById('case_final_requests').value ? [document.getElementById('case_final_requests').value] : [],
            
            claim_amount: Number(document.getElementById('case_claim_amount').value), 
            total_agreed_fees: Number(document.getElementById('case_agreed_fees').value), 
            success_probability: document.getElementById('case_success_prob')?.value ? Number(document.getElementById('case_success_prob').value) : null,
            
            assigned_lawyer_id: lawyers, 
            status: 'نشطة', 
            public_token: crypto.randomUUID(), 
            created_by: window.AppCore.currentUser.id
        };
        
        const btn = document.getElementById('btn_save_case'); 
        btn.disabled = true; 
        btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> جاري الحفظ...';
        
        try {
            const res = await API.addCase(data);
            if (res && !res.error) { 
                window.AppCore.closeModal('caseModal'); 
                await window.AppCore.loadAllData(); 
                window.AppCore.showToast('تم فتح الملف وتوثيقه بنجاح', 'success'); 
                e.target.reset(); 
                
                // تفريغ الرمز السري ليتم توليد واحد جديد تلقائياً المرة القادمة
                if(document.getElementById('case_access_pin')) document.getElementById('case_access_pin').value = '';
            } 
            else {
                throw new Error(res.error || 'حدث خطأ أثناء الاتصال بالخادم');
            }
        } catch(err) { 
            window.AppCore.showToast('خطأ بالحفظ: ' + err.message, 'danger'); 
        } finally { 
            btn.disabled = false; 
            btn.innerHTML = '<i class="fas fa-save me-2"></i> حفظ واعتماد فتح الملف'; 
        }
    },

    generatePIN: function() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; 
        let pin = '';
        for (let i = 0; i < 6; i++) {
            pin += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        if(document.getElementById('case_access_pin')) {
            document.getElementById('case_access_pin').value = pin;
        }
    }
};

// ============================================================================
// الروابط العامة (Global Bindings) لتوصيل الواجهة بمحرك القضايا
// ============================================================================
window.renderCasesList = () => window.AppCases.render();
window.filterCases = () => window.AppCases.render();
window.filterCasesByBtn = (btn, status) => window.AppCases.filterByBtn(btn, status);
window.saveCase = (e) => window.AppCases.save(e);
window.generateStrongPIN = () => window.AppCases.generatePIN();
window.startDictation = (targetId) => window.AppCases.startDictation(targetId);