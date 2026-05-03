/**
 * js/case-details.js
 * وحدة الإدارة الشاملة لتفاصيل القضية (Case Dashboard)
 * الدستور المطبق: استغلال 100% من هيكلية البيانات، الربط السحابي R2، والنزاهة المالية.
 */

document.addEventListener('DOMContentLoaded', async () => {
    if (!API.getToken()) {
        window.location.href = '/login.html';
        return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const caseId = urlParams.get('id');

    if (!caseId) {
        alert('لم يتم تحديد القضية.');
        window.location.href = '/app.html#cases';
        return;
    }

    // ==========================================
    // 1. المتغيرات ومؤشرات واجهة المستخدم (UI Elements)
    // ==========================================
    const elements = {
        loader: document.getElementById('case-loader'),
        content: document.getElementById('case-content'),
        // البيانات الأساسية
        internalId: document.getElementById('case-internal-id'),
        clientName: document.getElementById('case-client-name'),
        opponentName: document.getElementById('case-opponent-name'),
        caseType: document.getElementById('case-type'),
        courtName: document.getElementById('case-court'),
        status: document.getElementById('case-status'),
        // الحقول الذهبية المستردة (Zero Data Loss)
        confidentialityLevel: document.getElementById('case-confidentiality'),
        physicalArchive: document.getElementById('case-physical-archive'),
        statuteOfLimitations: document.getElementById('case-limitations-date'),
        coPlaintiffs: document.getElementById('case-co-plaintiffs'),
        coDefendants: document.getElementById('case-co-defendants'),
        expertsWitnesses: document.getElementById('case-experts-witnesses'),
        aiSummary: document.getElementById('case-ai-summary'),
        // القوائم والجداول
        updatesList: document.getElementById('case-updates-list'),
        filesList: document.getElementById('case-files-list'),
        installmentsList: document.getElementById('case-installments-list'),
        expensesList: document.getElementById('case-expenses-list'),
        // النماذج (Forms)
        addUpdateForm: document.getElementById('add-update-form'),
        uploadFileForm: document.getElementById('upload-file-form'),
        fileInput: document.getElementById('case-file-input'),
        addExpenseForm: document.getElementById('add-expense-form'),
        addInstallmentForm: document.getElementById('add-installment-form')
    };

    let currentCaseData = null;

    // ==========================================
    // 2. المحرك الرئيسي لجلب البيانات (Data Fetching)
    // ==========================================
    const loadCaseDetails = async () => {
        try {
            elements.content.style.display = 'none';
            elements.loader.style.display = 'block';

            // جلب القضية مع بيانات الموكل
            const caseReq = await API.get(`/api/cases?id=eq.${caseId}&select=*,mo_clients(full_name,phone)`);
            if (!caseReq || caseReq.length === 0) throw new Error('القضية غير موجودة أو لا تملك صلاحية الوصول.');
            currentCaseData = caseReq[0];

            // جلب البيانات المرتبطة بالتوازي لسرعة الأداء
            const [updates, files, installments, expenses] = await Promise.all([
                API.get(`/api/updates?case_id=eq.${caseId}&order=created_at.desc`),
                API.get(`/api/files?case_id=eq.${caseId}&order=created_at.desc`),
                API.get(`/api/installments?case_id=eq.${caseId}&order=due_date.asc`),
                API.get(`/api/expenses?case_id=eq.${caseId}&order=expense_date.desc`)
            ]);

            renderCaseData(currentCaseData);
            renderUpdates(updates);
            renderFiles(files);
            renderFinancials(installments, expenses, currentCaseData);

            elements.loader.style.display = 'none';
            elements.content.style.display = 'block';
        } catch (error) {
            console.error('[Case Details Error]:', error);
            elements.loader.innerHTML = `<div class="alert alert-danger">${error.message}</div>`;
        }
    };

    // ==========================================
    // 3. عرض البيانات (UI Rendering)
    // ==========================================
    const renderCaseData = (data) => {
        const safe = (val) => val ? val : 'غير محدد';
        const parseJsonArray = (val) => {
            if (!val) return 'لا يوجد';
            if (Array.isArray(val)) return val.join('، ');
            try { const parsed = JSON.parse(val); return Array.isArray(parsed) ? parsed.join('، ') : val; } 
            catch { return val; }
        };

        // البيانات الأساسية
        if(elements.internalId) elements.internalId.textContent = safe(data.case_internal_id);
        if(elements.clientName) elements.clientName.textContent = safe(data.mo_clients?.full_name);
        if(elements.opponentName) elements.opponentName.textContent = safe(data.opponent_name);
        if(elements.caseType) elements.caseType.textContent = safe(data.case_type);
        if(elements.courtName) elements.courtName.textContent = safe(data.current_court);
        if(elements.status) elements.status.textContent = safe(data.status);

        // الحقول الذهبية العميقة
        if(elements.confidentialityLevel) elements.confidentialityLevel.textContent = safe(data.confidentiality_level);
        if(elements.physicalArchive) elements.physicalArchive.textContent = safe(data.physical_archive_location);
        if(elements.statuteOfLimitations) elements.statuteOfLimitations.textContent = safe(data.statute_of_limitations_date);
        
        // الخصوم والشهود (JSONB)
        if(elements.coPlaintiffs) elements.coPlaintiffs.textContent = parseJsonArray(data.co_plaintiffs);
        if(elements.coDefendants) elements.coDefendants.textContent = parseJsonArray(data.co_defendants);
        if(elements.expertsWitnesses) elements.expertsWitnesses.textContent = parseJsonArray(data.experts_and_witnesses);

        // ملخص الذكاء الاصطناعي
        if(elements.aiSummary) elements.aiSummary.textContent = safe(data.ai_cumulative_summary || data.ai_summary);
    };

    const renderUpdates = (updates) => {
        if (!elements.updatesList) return;
        if (!updates.length) {
            elements.updatesList.innerHTML = '<li class="list-group-item">لا توجد إجراءات مسجلة حتى الآن.</li>';
            return;
        }
        elements.updatesList.innerHTML = updates.map(upd => `
            <li class="list-group-item update-item">
                <div class="d-flex justify-content-between">
                    <strong>${upd.update_title}</strong>
                    <span class="badge ${upd.is_visible_to_client ? 'bg-success' : 'bg-secondary'}">
                        ${upd.is_visible_to_client ? 'مرئي للموكل' : 'داخلي'}
                    </span>
                </div>
                <p class="mb-1">${upd.update_details || ''}</p>
                <small class="text-muted">تاريخ الإجراء: ${new Date(upd.created_at).toLocaleDateString('ar-EG')} 
                ${upd.next_hearing_date ? `| الجلسة القادمة: ${upd.next_hearing_date}` : ''}</small>
            </li>
        `).join('');
    };

    const renderFiles = (files) => {
        if (!elements.filesList) return;
        if (!files.length) {
            elements.filesList.innerHTML = '<div class="alert alert-info">لا توجد مرفقات في هذه القضية.</div>';
            return;
        }
        elements.filesList.innerHTML = files.map(f => {
            // [التدخل الجراحي الأمني]: استخدام دالة التأمين لروابط R2
            const secureUrl = API.getSecureUrl(f.file_url || f.attachment_url);
            const ext = (f.file_extension || '').toLowerCase();
            let icon = '📄';
            if (['pdf'].includes(ext)) icon = '📕';
            if (['jpg', 'png', 'jpeg'].includes(ext)) icon = '🖼️';

            return `
                <div class="col-md-4 mb-3">
                    <div class="card file-card h-100">
                        <div class="card-body text-center">
                            <div class="display-4 mb-2">${icon}</div>
                            <h6 class="card-title text-truncate" title="${f.file_name}">${f.file_name}</h6>
                            <a href="${secureUrl}" target="_blank" class="btn btn-sm btn-primary w-100 mt-2">عرض المستند</a>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    };

    const renderFinancials = (installments, expenses, caseData) => {
        // حساب الملخص المالي للنزاهة المالية
        const totalFees = parseFloat(caseData.total_agreed_fees) || 0;
        const totalPaid = installments.filter(i => i.status === 'مدفوعة').reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
        const totalExpenses = expenses.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);

        // تحديث الملخص في الواجهة
        if(document.getElementById('fin-total-fees')) document.getElementById('fin-total-fees').textContent = `${totalFees} د.أ`;
        if(document.getElementById('fin-total-paid')) document.getElementById('fin-total-paid').textContent = `${totalPaid} د.أ`;
        if(document.getElementById('fin-total-expenses')) document.getElementById('fin-total-expenses').textContent = `${totalExpenses} د.أ`;
        if(document.getElementById('fin-remaining')) document.getElementById('fin-remaining').textContent = `${totalFees - totalPaid} د.أ`;

        // عرض الدفعات
        if (elements.installmentsList) {
            elements.installmentsList.innerHTML = installments.length ? installments.map(inst => `
                <tr>
                    <td>${inst.amount}</td>
                    <td>${inst.due_date}</td>
                    <td><span class="badge ${inst.status === 'مدفوعة' ? 'bg-success' : 'bg-warning'}">${inst.status}</span></td>
                    <td>${inst.invoice_number || '-'}</td>
                </tr>
            `).join('') : '<tr><td colspan="4" class="text-center">لا توجد دفعات</td></tr>';
        }

        // عرض المصاريف
        if (elements.expensesList) {
            elements.expensesList.innerHTML = expenses.length ? expenses.map(exp => {
                const receiptLink = exp.receipt_url ? `<a href="${API.getSecureUrl(exp.receipt_url)}" target="_blank">📄</a>` : '-';
                return `
                <tr>
                    <td>${exp.amount}</td>
                    <td>${exp.description}</td>
                    <td>${exp.expense_date}</td>
                    <td>${receiptLink}</td>
                </tr>
            `}).join('') : '<tr><td colspan="4" class="text-center">لا توجد مصاريف</td></tr>';
        }
    };

    // ==========================================
    // 4. العمليات والإدخال (Forms Handling)
    // ==========================================

    // أ. رفع الملفات السحابية (R2 Integration)
    if (elements.uploadFileForm) {
        elements.uploadFileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const file = elements.fileInput.files[0];
            if (!file) return alert('يرجى اختيار ملف.');

            const btn = elements.uploadFileForm.querySelector('button[type="submit"]');
            btn.innerHTML = 'جاري الرفع للسحابة... <div class="spinner-border spinner-border-sm"></div>';
            btn.disabled = true;

            try {
                // رفع الملف إلى مسار ديناميكي معزول خاص بالقضية
                const uploadResult = await API.uploadToCloudR2(file, `cases/${caseId}/attachments`);

                // حفظ بيانات الملف في قاعدة البيانات
                await API.post('/api/files', {
                    case_id: caseId,
                    client_id: currentCaseData.client_id,
                    file_name: file.name,
                    file_extension: file.name.split('.').pop(),
                    file_type: file.type,
                    file_category: document.getElementById('file-category-select')?.value || 'مرفقات عامة',
                    file_url: uploadResult.file_path, // حفظ مسار R2 فقط
                    is_template: false
                });

                alert('تم رفع المستند بنجاح.');
                elements.uploadFileForm.reset();
                const modal = bootstrap.Modal.getInstance(document.getElementById('uploadFileModal'));
                if(modal) modal.hide();
                loadCaseDetails(); // تحديث الواجهة
            } catch (error) {
                alert(`خطأ في الرفع: ${error.message}`);
            } finally {
                btn.innerHTML = 'رفع المستند';
                btn.disabled = false;
            }
        });
    }

    // ب. إضافة إجراء (Update)
    if (elements.addUpdateForm) {
        elements.addUpdateForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                case_id: caseId,
                update_title: document.getElementById('update-title').value,
                update_details: document.getElementById('update-details').value,
                hearing_date: document.getElementById('hearing-date').value || null,
                next_hearing_date: document.getElementById('next-hearing-date').value || null,
                is_visible_to_client: document.getElementById('is-visible-client').checked
            };

            try {
                await API.post('/api/updates', payload);
                
                // تحديث حالة ومرحلة القضية إذا تم إدخال تاريخ جلسة قادمة
                if (payload.next_hearing_date) {
                    await API.put(`/api/cases?id=eq.${caseId}`, { 
                        status: 'متداولة', 
                        current_stage: 'مرحلة الجلسات' 
                    });
                }

                alert('تم إضافة الإجراء وإرسال الإشعارات بنجاح.');
                elements.addUpdateForm.reset();
                const modal = bootstrap.Modal.getInstance(document.getElementById('addUpdateModal'));
                if(modal) modal.hide();
                loadCaseDetails();
            } catch (error) {
                alert(`خطأ: ${error.message}`);
            }
        });
    }

    // ج. إضافة مصروف مالي (Expense)
    if (elements.addExpenseForm) {
        elements.addExpenseForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                case_id: caseId,
                amount: parseFloat(document.getElementById('expense-amount').value),
                description: document.getElementById('expense-description').value,
                expense_date: document.getElementById('expense-date').value || new Date().toISOString().split('T')[0]
            };

            // التعامل مع رفع الفاتورة إن وجدت
            const receiptFile = document.getElementById('expense-receipt').files[0];
            try {
                if (receiptFile) {
                    const uploadRes = await API.uploadToCloudR2(receiptFile, `cases/${caseId}/financials`);
                    payload.receipt_url = uploadRes.file_path;
                }
                await API.post('/api/expenses', payload);
                alert('تم تسجيل المصروف بنجاح.');
                elements.addExpenseForm.reset();
                const modal = bootstrap.Modal.getInstance(document.getElementById('addExpenseModal'));
                if(modal) modal.hide();
                loadCaseDetails();
            } catch (error) {
                alert(`خطأ: ${error.message}`);
            }
        });
    }

    // التشغيل الأولي
    loadCaseDetails();
});