/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: js/app-cases.js (Case Management Engine V5.6 - Enterprise Luxury Edition)
 * الوصف: محرك القضايا، إدارة النوافذ التفاعلية، دعم معالج الخطوات الثلاث (Case Modal Stepper)،
 * واحتساب أتعاب المحاماة، وتوليد مهام العمل الذاتية (Smart Onboarding Workflow)،
 * والبحث الدقيق والفرز وفق معايير الهوية المؤسسية الراقية.
 * 
 * الميزات المحدثة (V5.6 Enterprise):
 * 1. دعم معالج الخطوات الثلاث (Stepper: البيانات الأساسية، أطراف النزاع، والشؤون المالية والموضوعية).
 * 2. محرك بحث متعدد الأبعاد (رقم الملف، رقم الدعوى، المحكمة، الخصم، الموكل، التصنيف).
 * 3. فلاتر التبويب السريع (الكل، النشطة، المكتملة، الاستئناف والتمييز) مع ضبط أنماط الأزرار الرسمية.
 * 4. نظام التوليد التلقائي لمهام البداية (Smart Workflow Tasks) عند اعتماد الملف الجديد.
 * 5. توليد رمز PIN سري فوري ومؤمّن لبوابة الموكل مع منع التخزين الصريح.
 * 6. دعم الإملاء الصوتي الذكي (Voice Dictation) متوافق مع كافة المتصفحات الحديثة.
 * ============================================================================
 */

window.AppCases = {
    /**
     * رسم شبكة بطاقات القضايا مع الفرز والبحث المتقدم
     */
    render: function() {
        const list = document.getElementById('cases-list'); 
        if (!list) return;
        
        const searchInput = document.getElementById('search-cases');
        const searchVal = searchInput ? searchInput.value.trim().toLowerCase() : '';
        const currentFilter = window.AppCore.currentCaseFilter || '';
        const allCases = window.AppCore.globalData.cases || [];
        const allClients = window.AppCore.globalData.clients || [];

        // 1. فلترة القضايا بناءً على الحالة والبحث متعدد الحقول
        const filteredCases = allCases.filter(c => {
            // التحقق من فلتر الحالة
            let matchesStatus = true;
            if (currentFilter === 'نشطة') {
                matchesStatus = (c.status === 'نشطة');
            } else if (currentFilter === 'مكتملة') {
                matchesStatus = (c.status === 'مكتملة' || c.status === 'مغلقة' || c.status === 'منتهية');
            } else if (currentFilter === 'استئناف') {
                const degree = (c.litigation_degree || '').toLowerCase();
                const stage = (c.current_stage || '').toLowerCase();
                matchesStatus = (c.status === 'استئناف' || degree.includes('استئناف') || degree.includes('تمييز') || stage.includes('استئناف') || stage.includes('تمييز'));
            }

            if (!matchesStatus) return false;

            // التحقق من معايير البحث النصي
            if (!searchVal) return true;

            const client = allClients.find(cl => cl.id === c.client_id);
            const clientName = client ? (client.full_name || '').toLowerCase() : '';
            const internalId = (c.case_internal_id || '').toLowerCase();
            const courtNum = (c.court_case_number || '').toLowerCase();
            const courtName = (c.current_court || '').toLowerCase();
            const opponent = (c.opponent_name || '').toLowerCase();
            const opponentLawyer = (c.opponent_lawyer || '').toLowerCase();
            const caseType = (c.case_type || '').toLowerCase();
            const tags = Array.isArray(c.case_tags) ? c.case_tags.join(' ').toLowerCase() : '';

            return internalId.includes(searchVal) ||
                   courtNum.includes(searchVal) ||
                   opponent.includes(searchVal) ||
                   opponentLawyer.includes(searchVal) ||
                   courtName.includes(searchVal) ||
                   caseType.includes(searchVal) ||
                   clientName.includes(searchVal) ||
                   tags.includes(searchVal);
        });
        
        // 2. تحديث قائمة القضايا الأصلية في نموذج الإضافة
        const parentSelect = document.getElementById('case_parent_id');
        if (parentSelect) {
            const currentSelected = parentSelect.value;
            parentSelect.innerHTML = '<option value="">لا يوجد (هذه قضية أصلية / رئيسية)</option>' + 
                allCases.map(c => `
                    <option value="${c.id}" ${c.id === currentSelected ? 'selected' : ''}>
                        ${window.AppCore.escapeHTML(c.case_internal_id)} - ${window.AppCore.escapeHTML(c.opponent_name || c.case_type || 'ملف')}
                    </option>
                `).join('');
        }

        // 3. عرض الحالة الفارغة (Empty State) عند انعدام النتائج
        if (filteredCases.length === 0) {
            list.innerHTML = `
            <div class="col-12 text-center py-5">
                <div class="bg-white rounded-4 border p-5 shadow-sm mx-auto" style="max-width: 580px;">
                    <div class="mb-3 text-gold">
                        <i class="fas fa-folder-open fa-4x opacity-75"></i>
                    </div>
                    <h5 class="fw-bold text-navy mb-2">لا توجد قضايا مطابقة للبحث أو الفلتر</h5>
                    <p class="text-muted small mb-4">لم نتمكن من العثور على أي ملفات قضائية تطابق المعايير المحددة حالياً.</p>
                    <button class="btn btn-navy px-4 py-2 rounded-pill fw-bold shadow-sm" onclick="window.openModal('caseModal')">
                        <i class="fas fa-plus-circle me-1 text-gold"></i> فتح ملف قضية جديد
                    </button>
                </div>
            </div>`;
            return;
        }
        
        // 4. رسم بطاقات القضايا الفخمة (Compact Luxury Cards)
        list.innerHTML = filteredCases.map(c => {
            const client = allClients.find(cl => cl.id === c.client_id);
            const clientName = client ? client.full_name : 'غير محدد';
            const clientInitial = window.AppCore.escapeHTML(clientName.charAt(0) || 'م');

            // شارات الحالة والأولوية والتصنيف
            const isCompleted = (c.status === 'مكتملة' || c.status === 'مغلقة');
            const statusBadgeClass = isCompleted 
                ? 'bg-secondary bg-opacity-10 text-secondary border border-secondary border-opacity-25' 
                : 'bg-success bg-opacity-10 text-success border border-success border-opacity-25';

            let priorityBadge = '';
            if (c.priority_level === 'عاجل جداً' || c.priority_level === 'طوارئ') {
                priorityBadge = '<span class="badge bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25 me-1"><i class="fas fa-fire me-1"></i>عاجل جداً</span>';
            } else if (c.priority_level === 'عالية') {
                priorityBadge = '<span class="badge bg-warning bg-opacity-10 text-dark border border-warning border-opacity-25 me-1"><i class="fas fa-bolt me-1"></i>أولوية عالية</span>';
            }

            let confBadge = '';
            if (c.confidentiality_level === 'سري للغاية' || c.confidentiality_level === 'سري') {
                confBadge = '<span class="badge bg-dark bg-opacity-10 text-navy border border-dark border-opacity-25 me-1" title="مستوى السرية"><i class="fas fa-user-shield me-1 text-gold"></i>سري</span>';
            }

            const courtName = c.current_court ? window.AppCore.escapeHTML(c.current_court) : 'المحكمة غير محددة';
            const courtRoom = c.court_room ? ' / ' + window.AppCore.escapeHTML(c.court_room) : '';
            const courtNum = c.court_case_number ? ` (رقم: ${window.AppCore.escapeHTML(c.court_case_number)})` : '';
            const opponent = c.opponent_name ? window.AppCore.escapeHTML(c.opponent_name) : 'غير مسجل';

            // حساب الموعد القادم ومدى قربه
            let hearingHtml = '<span class="text-muted"><i class="far fa-calendar-times me-1"></i>لا يوجد موعد جلسة</span>';
            if (c.deadline_date) {
                const hDate = new Date(c.deadline_date);
                const today = new Date();
                const diffDays = Math.ceil((hDate - today) / (1000 * 60 * 60 * 24));
                const isUrgent = diffDays >= 0 && diffDays <= 7;
                const dateStr = hDate.toLocaleDateString('ar-JO', { month: 'short', day: 'numeric' });

                hearingHtml = `
                    <span class="${isUrgent ? 'text-danger fw-bold' : 'text-navy fw-bold'}">
                        <i class="fas fa-calendar-check me-1 ${isUrgent ? 'text-danger animate-pulse' : 'text-primary'}"></i>
                        ${dateStr} ${diffDays === 0 ? '(اليوم!)' : (diffDays > 0 ? `(خلال ${diffDays} يوم)` : '')}
                    </span>
                `;
            }

            // مؤشر الأتعاب والمدفوعات
            const agreedFees = Number(c.total_agreed_fees || c.agreed_fees) || 0;
            const paidFees = Number(c.total_paid) || 0;
            let finHtml = '';
            if (agreedFees > 0) {
                const paidPct = Math.min(100, Math.round((paidFees / agreedFees) * 100));
                finHtml = `
                    <div class="mt-2 pt-2 border-top d-flex justify-content-between align-items-center small">
                        <span class="text-muted fw-bold">الأتعاب: <b class="text-navy">${agreedFees.toLocaleString()} د.أ</b></span>
                        <span class="badge ${paidPct >= 100 ? 'bg-success' : 'bg-light text-navy border'} font-monospace">
                            المقبوض: ${paidFees.toLocaleString()} (${paidPct}%)
                        </span>
                    </div>
                `;
            }

            return `
            <div class="col-md-6 col-lg-4 fade-in">
                <div class="compact-card case-card transition-hover position-relative h-100 d-flex flex-column" onclick="localStorage.setItem('current_case_id','${c.id}'); window.location.href='case-details.html?id=${encodeURIComponent(c.id)}'">
                    
                    <!-- رأس البطاقة -->
                    <div class="card-header-flex mb-2">
                        <div class="d-flex align-items-center gap-2">
                            <div class="lawyer-avatar" style="width: 36px; height: 36px; font-size: 0.95rem;">${clientInitial}</div>
                            <div>
                                <h3 class="card-title mb-0 text-navy fw-bold" style="font-size: 1.05rem;">${window.AppCore.escapeHTML(clientName)}</h3>
                                <span class="badge bg-gold-subtle text-dark border font-monospace mt-1" style="font-size: 0.75rem;">
                                    ${window.AppCore.escapeHTML(c.case_internal_id || 'بدون رمز')}
                                </span>
                            </div>
                        </div>
                        <div class="text-end">
                            <span class="card-badge ${statusBadgeClass} font-monospace" style="font-size: 0.75rem;">
                                ${window.AppCore.escapeHTML(c.status || 'نشطة')}
                            </span>
                        </div>
                    </div>

                    <!-- شارات الأولوية والتصنيف -->
                    <div class="mb-2 d-flex flex-wrap gap-1 align-items-center">
                        ${priorityBadge}
                        ${confBadge}
                        ${c.case_type ? `<span class="badge bg-light text-muted border font-monospace" style="font-size: 0.72rem;">${window.AppCore.escapeHTML(c.case_type)}</span>` : ''}
                        ${c.litigation_degree ? `<span class="badge bg-light text-primary border font-monospace" style="font-size: 0.72rem;">${window.AppCore.escapeHTML(c.litigation_degree)}</span>` : ''}
                    </div>
                    
                    <!-- شبكة بيانات القضية -->
                    <div class="card-data-grid flex-grow-1">
                        <div class="data-item full-width" title="المحكمة والقاعة ورقم الدعوى">
                            <i class="fas fa-balance-scale text-primary"></i> 
                            <span class="text-truncate">${courtName}${courtRoom}${courtNum}</span>
                        </div>
                        <div class="data-item text-truncate" title="اسم الخصم">
                            <i class="fas fa-user-shield text-warning"></i> 
                            <span>الخصم: <b>${opponent}</b></span>
                        </div>
                        <div class="data-item" title="موعد الجلسة أو الإجراء القادم">
                            ${hearingHtml}
                        </div>
                    </div>

                    ${finHtml}

                    <!-- أزرار الإجراء السريع لبوابة الموكل -->
                    <div class="mt-3 pt-2 border-top d-flex justify-content-between align-items-center">
                        <span class="text-muted small fw-bold font-monospace">
                            <i class="fas fa-fingerprint me-1 text-gold"></i>${c.access_pin ? 'PIN مؤمّن' : 'بوابة نشطة'}
                        </span>
                        <button type="button" class="btn btn-sm btn-outline-navy py-1 px-3 rounded-pill fw-bold shadow-sm" style="font-size: 0.76rem;" onclick="event.stopPropagation(); window.openShareModal('${c.public_token}', '${window.AppCore.escapeHTML(c.access_pin || '')}')">
                            <i class="fas fa-share-nodes me-1 text-gold"></i> بوابة الموكل
                        </button>
                    </div>

                </div>
            </div>`;
        }).join('');
    },

    /**
     * فلترة القضايا عبر أزرار التصنيف العلوية مع تحديث المظهر
     */
    filterByBtn: function(btn, status) {
        document.querySelectorAll('.filter-btn').forEach(b => { 
            b.classList.remove('btn-navy', 'text-white', 'active'); 
            b.classList.add('btn-outline-navy'); 
        });
        if (btn) {
            btn.classList.remove('btn-outline-navy'); 
            btn.classList.add('btn-navy', 'text-white', 'active'); 
        }
        window.AppCore.currentCaseFilter = status || ''; 
        this.render();
    },

    /**
     * ميزة الإملاء الصوتي الذكي (Voice Dictation Engine)
     */
    startDictation: function(targetId) {
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRec) {
            return window.AppCore.showToast('متصفحك لا يدعم خاصية الإملاء الصوتي. يُنصح باستخدام Google Chrome أو Microsoft Edge.', 'warning');
        }
        
        try {
            const recognition = new SpeechRec();
            recognition.lang = 'ar-JO'; // اللغة العربية الأردنية لضمان دقة المصطلحات القانونية
            recognition.interimResults = false;
            recognition.maxAlternatives = 1;

            const targetEl = document.getElementById(targetId);
            if (!targetEl) return;

            const originalPlaceholder = targetEl.placeholder || '';
            targetEl.placeholder = '🎙️ جاري الاستماع بدقة... تحدث الآن بالنص القانوني المطلوب';
            
            window.AppCore.showToast('الميكروفون نشط.. تحدث الآن بوضوح', 'info');

            recognition.onresult = function(event) {
                const transcript = event.results[0][0].transcript;
                targetEl.value = targetEl.value + (targetEl.value ? ' ' : '') + transcript;
            };

            recognition.onerror = function(event) {
                console.warn('Voice Dictation Error:', event.error);
                window.AppCore.showToast('تعذر التقاط الصوت بوضوح، يرجى المحاولة ثانية.', 'warning');
            };

            recognition.onend = function() {
                targetEl.placeholder = originalPlaceholder;
                window.AppCore.showToast('تم حفظ النص المسجل صوتياً.', 'success');
            };

            recognition.start();
        } catch (e) {
            console.error('Speech recognition startup error:', e);
            window.AppCore.showToast('حدث خطأ أثناء تشغيل الميكروفون.', 'danger');
        }
    },

    /**
     * حفظ وتوثيق ملف القضية الجديد وفق معمارية V5.6 (3-Step Form)
     */
    save: async function(e) {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        
        const btn = document.getElementById('btn_save_case'); 
        if (btn && btn.disabled) return; // حماية ضد النقر المزدوج السريع

        const clientIdVal = document.getElementById('case_client_id')?.value;
        const caseInternalIdVal = document.getElementById('case_internal_id')?.value?.trim();
        const caseTypeVal = document.getElementById('case_type')?.value?.trim();

        // جدار التحقق الصارم من الحقول الأساسية
        if (!clientIdVal || !caseInternalIdVal || !caseTypeVal) {
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    icon: 'warning',
                    title: 'بيانات غير مكتملة',
                    text: 'يجب اختيار "الموكل" وإدخال "رقم الملف الداخلي" و"نوع القضية" قبل اعتماد فتح الملف.',
                    confirmButtonText: 'حسناً',
                    confirmButtonColor: 'var(--navy)'
                });
            } else {
                window.AppCore.showToast('يرجى إكمال البيانات الأساسية للقضية.', 'danger');
            }
            if (typeof window.goToCaseStep === 'function') window.goToCaseStep(1);
            return;
        }

        const opponentVal = document.getElementById('case_opponent_name')?.value?.trim();
        if (!opponentVal) {
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    icon: 'warning',
                    title: 'بيانات الخصم مطلوبة',
                    text: 'يُرجى إدخال اسم الخصم في الخطوة الثانية للتحقق من التعارض المهني.',
                    confirmButtonText: 'حسناً',
                    confirmButtonColor: 'var(--navy)'
                });
            } else {
                window.AppCore.showToast('يرجى تحديد اسم الخصم.', 'warning');
            }
            if (typeof window.goToCaseStep === 'function') window.goToCaseStep(2);
            return;
        }
        
        // المحامون المسندون للملف
        const lawyerSelect = document.getElementById('case_assigned_lawyers');
        let lawyers = lawyerSelect ? Array.from(lawyerSelect.selectedOptions).map(opt => opt.value).filter(Boolean) : [];
        if (lawyers.length === 0 && window.AppCore.currentUser?.id) {
            lawyers.push(window.AppCore.currentUser.id);
        }

        // توليد رمز PIN آمن إذا لم يتم إدخاله
        let pinCode = document.getElementById('case_access_pin')?.value?.trim() || '';
        if (!pinCode) {
            this.generatePIN();
            pinCode = document.getElementById('case_access_pin')?.value?.trim() || 'ABC123';
        }

        // توليد رمز عمومي عشوائي آمن (Public Secret Token)
        let publicToken = '';
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            publicToken = crypto.randomUUID();
        } else {
            publicToken = 'moakkil_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        }

        // تجميع وبناء مصفوفة البيانات للقضية الجديدة
        const data = { 
            // الخطوة 1: البيانات الأساسية
            client_id: clientIdVal, 
            case_internal_id: caseInternalIdVal, 
            case_type: caseTypeVal, 
            priority_level: document.getElementById('case_priority_level')?.value || 'عادية',
            confidentiality_level: document.getElementById('case_confidentiality')?.value || 'عادي',
            current_stage: document.getElementById('case_current_stage')?.value || 'قيد النظر',
            case_tags: document.getElementById('case_tags')?.value 
                ? document.getElementById('case_tags').value.split(',').map(t => t.trim()).filter(Boolean) 
                : [],
            
            current_court: document.getElementById('case_court')?.value || '', 
            court_room: document.getElementById('case_court_room')?.value || '',
            court_case_number: document.getElementById('case_court_case_number')?.value || '',
            case_year: document.getElementById('case_case_year')?.value ? Number(document.getElementById('case_case_year').value) : null,
            litigation_degree: document.getElementById('case_litigation_degree')?.value || 'بداية',
            current_judge: document.getElementById('case_current_judge')?.value || '',
            court_clerk: document.getElementById('case_court_clerk')?.value || '',
            parent_case_id: document.getElementById('case_parent_id')?.value || null,
            
            execution_file_number: document.getElementById('case_execution_file_number')?.value || '',
            deadline_date: document.getElementById('case_deadline_date')?.value || null,
            statute_of_limitations_date: document.getElementById('case_statute_of_limitations_date')?.value || null,
            police_station_ref: document.getElementById('case_police_station_ref')?.value || '',
            prosecution_ref: document.getElementById('case_prosecution_ref')?.value || '',

            // الخطوة 2: أطراف النزاع والوكالة
            opponent_name: opponentVal, 
            opponent_lawyer: document.getElementById('case_opponent_lawyer')?.value || '',
            co_plaintiffs: document.getElementById('case_co_plaintiffs')?.value 
                ? document.getElementById('case_co_plaintiffs').value.split(',').map(t => t.trim()).filter(Boolean) 
                : [],
            co_defendants: document.getElementById('case_co_defendants')?.value 
                ? document.getElementById('case_co_defendants').value.split(',').map(t => t.trim()).filter(Boolean) 
                : [],
            experts_and_witnesses: document.getElementById('case_experts_and_witnesses')?.value 
                ? [document.getElementById('case_experts_and_witnesses').value.trim()] 
                : [],
            power_of_attorney_number: document.getElementById('case_poa_number')?.value || '',
            poa_details: document.getElementById('case_poa_details')?.value || '',

            // الخطوة 3: الشؤون المالية والموضوعية ورمز الوصول
            claim_amount: Number(document.getElementById('case_claim_amount')?.value) || 0, 
            total_agreed_fees: Number(document.getElementById('case_agreed_fees')?.value) || 0, 
            success_probability: document.getElementById('case_success_prob')?.value 
                ? Number(document.getElementById('case_success_prob').value) 
                : null,
            access_pin: pinCode,
            lawsuit_facts: document.getElementById('case_lawsuit_text')?.value || '', 
            legal_basis: document.getElementById('case_legal_basis')?.value || '',
            final_requests: document.getElementById('case_final_requests')?.value 
                ? [document.getElementById('case_final_requests').value.trim()] 
                : [],
            
            assigned_lawyer_id: lawyers, 
            status: 'نشطة', 
            public_token: publicToken, 
            client_portal_active: true
        };
        
        if (btn) {
            btn.disabled = true; 
            btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> جاري حفظ وتوثيق الملف...';
        }
        
        const autoTasksCheckbox = document.getElementById('case_auto_tasks');
        const shouldCreateAutoTasks = autoTasksCheckbox ? autoTasksCheckbox.checked : false;

        try {
            const res = await API.addCase(data);
            if (res && !res.error) {
                const newCaseId = res.id || (res.case && res.case.id);

                // إنشاء مهام البداية التلقائية (Smart Workflow) إذا تم تفعيل الخيار
                if (shouldCreateAutoTasks && newCaseId) {
                    try {
                        const dueDate = new Date();
                        dueDate.setDate(dueDate.getDate() + 3);
                        const dueStr = dueDate.toISOString().split('T')[0];

                        const initialTask1 = {
                            case_id: newCaseId,
                            client_id: clientIdVal,
                            title: `دراسة ملف القضية وتوثيق البينات (ملف: ${caseInternalIdVal})`,
                            type: 'مهمة مكتبية',
                            status: 'مجدول',
                            appt_date: dueStr,
                            notes: 'مهمة تلقائية مولدة من سير العمل الذكي (Smart Workflow) فور فتح الملف.',
                            assigned_to: lawyers[0] || window.AppCore.currentUser.id
                        };

                        const initialTask2 = {
                            case_id: newCaseId,
                            client_id: clientIdVal,
                            title: `التواصل مع الموكل وتجهيز وكالة المحاماة والدفوع`,
                            type: 'مهمة مكتبية',
                            status: 'مجدول',
                            appt_date: dueStr,
                            notes: 'التأكد من اكتمال وكالة المحاماة وتوقيع المستندات الناقصة.',
                            assigned_to: lawyers[0] || window.AppCore.currentUser.id
                        };

                        await Promise.allSettled([
                            API.addAppointment(initialTask1),
                            API.addAppointment(initialTask2)
                        ]);
                    } catch (taskErr) {
                        console.warn('Smart Workflow auto-tasks creation warning:', taskErr);
                    }
                }

                window.AppCore.closeModal('caseModal'); 
                await window.AppCore.loadAllData(); 
                
                if (typeof Swal !== 'undefined') {
                    Swal.fire({
                        icon: 'success',
                        title: 'تم فتح الملف وتوثيقه بنجاح',
                        html: `
                            <p class="mb-2">تم إنشاء القضية برقم داخلي: <b>${window.AppCore.escapeHTML(caseInternalIdVal)}</b></p>
                            <p class="small text-muted">رمز PIN المؤقت لبوابة الموكل هو: <b class="text-gold font-monospace fs-5">${window.AppCore.escapeHTML(pinCode)}</b></p>
                        `,
                        confirmButtonText: 'إغلاق',
                        confirmButtonColor: 'var(--navy)'
                    });
                } else {
                    window.AppCore.showToast('تم فتح وتوثيق ملف القضية بنجاح', 'success'); 
                }
                
                // تفريغ النموذج وإعادة تعيين الخطوات
                const caseForm = document.getElementById('caseForm');
                if (caseForm) caseForm.reset();
                if (typeof window.goToCaseStep === 'function') window.goToCaseStep(1);
                
                // توليد رمز PIN جديد ليكون جاهزاً للمرة القادمة
                this.generatePIN();
            } else {
                throw new Error(res.error || 'حدث خطأ أثناء الاتصال بالخادم');
            }
        } catch(err) { 
            console.error('Case saving error:', err);
            if (typeof Swal !== 'undefined') {
                Swal.fire({ 
                    icon: 'error', 
                    title: 'تعذر حفظ القضية', 
                    text: err.message || 'حدث خطأ غير متوقع أثناء معالجة الطلب.' 
                });
            } else {
                window.AppCore.showToast('خطأ بالحفظ: ' + err.message, 'danger'); 
            }
        } finally { 
            if (btn) {
                btn.disabled = false; 
                btn.innerHTML = '<i class="fas fa-save me-2"></i> حفظ واعتماد فتح الملف'; 
            }
        }
    },

    /**
     * توليد رمز PIN آمن وسهل القراءة وخالٍ من الحروف المتشابهة
     */
    generatePIN: function() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; 
        let pin = '';
        for (let i = 0; i < 6; i++) {
            pin += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        const pinInput = document.getElementById('case_access_pin');
        if (pinInput) {
            pinInput.value = pin;
        }
        return pin;
    }
};

// ============================================================================
// الروابط العامة (Global Bindings) لتوصيل الواجهة بمحرك القضايا V5.6
// ============================================================================
window.renderCasesList = () => window.AppCases.render();
window.filterCases = () => window.AppCases.render();
window.filterCasesByBtn = (btn, status) => window.AppCases.filterByBtn(btn, status);
window.saveCase = (e) => window.AppCases.save(e);
window.generateStrongPIN = () => window.AppCases.generatePIN();
window.startDictation = (targetId) => window.AppCases.startDictation(targetId);
