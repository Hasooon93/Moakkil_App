/**
 * js/case-details.js
 * وحدة الإدارة الشاملة لتفاصيل القضية (Case Dashboard)
 * الدستور المطبق: تحصين الواجهات (Null-Safe)، استغلال 100% من البيانات، الربط السحابي R2، والرقابة.
 */

// [إصلاح خطأ ReferenceError: goBack is not defined]
window.goBack = function() {
    window.history.back();
};

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
    // 1. المتغيرات ومؤشرات واجهة المستخدم (UI Elements) مع ربط آمن
    // ==========================================
    const elements = {
        // دعم لأسماء متعددة لتجنب خطأ Null
        loader: document.getElementById('case-loader') || document.getElementById('main-loader'),
        content: document.getElementById('case-content') || document.getElementById('main-content'),
        
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
        caseTags: document.getElementById('case-tags'), 
        
        // القوائم والجداول
        updatesList: document.getElementById('case-updates-list'),
        filesList: document.getElementById('case-files-list'),
        installmentsList: document.getElementById('case-installments-list'),
        expensesList: document.getElementById('case-expenses-list'),
        
        // النماذج (Forms) وأزرار التحكم
        addUpdateForm: document.getElementById('add-update-form'),
        uploadFileForm: document.getElementById('upload-file-form'),
        fileInput: document.getElementById('case-file-input'),
        addExpenseForm: document.getElementById('add-expense-form'),
        addInstallmentForm: document.getElementById('add-installment-form'),
        timeMachineBtn: document.getElementById('btn-time-machine')
    };

    let currentCaseData = null;

    // ==========================================
    // 2. المحرك الرئيسي لجلب البيانات (Data Fetching)
    // ==========================================
    const loadCaseDetails = async () => {
        try {
            // [إصلاح خطأ TypeError: Cannot read properties of null (reading 'style')]
            if (elements.content) elements.content.style.display = 'none';
            if (elements.loader) elements.loader.style.display = 'block';

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

            if (elements.loader) elements.loader.style.display = 'none';
            if (elements.content) elements.content.style.display = 'block';
        } catch (error) {
            console.error('[Case Details Error]:', error);
            // [إصلاح خطأ TypeError: Cannot set properties of null (setting 'innerHTML')]
            if (elements.loader) {
                elements.loader.innerHTML = `<div class="alert alert-danger">${error.message}</div>`;
            } else if (typeof showAlert !== 'undefined') {
                showAlert(`خطأ: ${error.message}`, 'danger');
            } else {
                alert(`خطأ: ${error.message}`);
            }
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

        // البيانات الأساسية (محصنة ضد الـ Null)
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

        // عرض الوسوم الذكية (Smart Tags)
        if(elements.caseTags) {
            let tags = [];
            try {
                tags = typeof data.case_tags === 'string' ? JSON.parse(data.case_tags) : data.case_tags;
            } catch(e) {}
            
            if (Array.isArray(tags) && tags.length > 0) {
                elements.caseTags.innerHTML = tags.map(t => `<span class="badge bg-primary me-1 shadow-sm">#${t}</span>`).join('');
            } else {
                elements.caseTags.innerHTML = '<span class="text-muted small">لا توجد وسوم تحليلية</span>';
            }
        }
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
            const secureUrl = API.getSecureUrl(f.file_url || f.attachment_url);
            const ext = (f.file_extension || '').toLowerCase();
            let icon = '📄';
            if (['pdf'].includes(ext)) icon = '📕';
            if (['jpg', 'png', 'jpeg'].includes(ext)) icon = '🖼️';

            return `
                <div class="col-md-4 mb-3">
                    <div class="card file-card h-100 border-0 shadow-sm">
                        <div class="card-body text-center">
                            <div class="display-4 mb-2">${icon}</div>
                            <h6 class="card-title text-truncate" title="${f.file_name}">${f.file_name}</h6>
                            <a href="${secureUrl}" target="_blank" class="btn btn-sm btn-outline-primary w-100 mt-2">عرض المستند</a>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    };

    const renderFinancials = (installments, expenses, caseData) => {
        const totalFees = parseFloat(caseData.total_agreed_fees) || 0;
        const totalPaid = installments.filter(i => i.status === 'مدفوعة').reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
        const totalExpenses = expenses.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);

        if(document.getElementById('fin-total-fees')) document.getElementById('fin-total-fees').textContent = `${totalFees} د.أ`;
        if(document.getElementById('fin-total-paid')) document.getElementById('fin-total-paid').textContent = `${totalPaid} د.أ`;
        if(document.getElementById('fin-total-expenses')) document.getElementById('fin-total-expenses').textContent = `${totalExpenses} د.أ`;
        if(document.getElementById('fin-remaining')) document.getElementById('fin-remaining').textContent = `${totalFees - totalPaid} د.أ`;

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

        if (elements.expensesList) {
            elements.expensesList.innerHTML = expenses.length ? expenses.map(exp => {
                const receiptLink = exp.receipt_url ? `<a href="${API.getSecureUrl(exp.receipt_url)}" target="_blank" class="text-decoration-none">📄 فاتورة</a>` : '-';
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
    // 4. آلة الزمن (سجل الرقابة - Time Machine)
    // ==========================================
    const viewTimeMachine = async () => {
        try {
            if (!elements.timeMachineBtn) return;
            const btnOriginalText = elements.timeMachineBtn.innerHTML;
            elements.timeMachineBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> جاري التحميل...';
            elements.timeMachineBtn.disabled = true;

            const history = await API.get(`/api/history?entity_type=eq.mo_cases&entity_id=eq.${caseId}&order=created_at.desc`);
            
            if (!history || history.length === 0) {
                alert('لا توجد سجلات تعديل لهذه القضية حتى الآن.');
                elements.timeMachineBtn.innerHTML = btnOriginalText;
                elements.timeMachineBtn.disabled = false;
                return;
            }

            let htmlContent = '<div class="timeline" dir="rtl">';
            history.forEach(log => {
                const actionColor = log.action_type === 'CREATE' ? 'success' : (log.action_type === 'UPDATE' ? 'warning' : 'danger');
                const actionText = log.action_type === 'CREATE' ? 'إنشاء' : (log.action_type === 'UPDATE' ? 'تعديل' : 'حذف');
                const date = new Date(log.created_at).toLocaleString('ar-EG');
                
                let diffHtml = '';
                if (log.action_type === 'UPDATE' && log.old_data && log.new_data) {
                    diffHtml += '<ul class="mt-2 text-muted" style="font-size: 0.85rem; list-style-type: square; padding-right: 20px;">';
                    for (let key in log.new_data) {
                        if (log.new_data[key] !== log.old_data[key] && key !== 'updated_at') {
                            diffHtml += `<li><strong>${key}:</strong> من [${log.old_data[key] || 'فارغ'}] إلى <span class="text-dark fw-bold">[${log.new_data[key] || 'فارغ'}]</span></li>`;
                        }
                    }
                    diffHtml += '</ul>';
                }

                htmlContent += `
                    <div class="timeline-item mb-3 p-3 border rounded border-start border-${actionColor} border-4 bg-light shadow-sm">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <span class="badge bg-${actionColor}">${actionText}</span>
                            <small class="text-secondary fw-bold">⏰ ${date}</small>
                        </div>
                        <strong class="d-block mb-1 text-dark">👤 قام المستخدم (المعرف: ${log.user_id}) بهذا الإجراء</strong>
                        ${diffHtml}
                    </div>
                `;
            });
            htmlContent += '</div>';

            const modalBody = document.getElementById('history-modal-body');
            if (modalBody) {
                modalBody.innerHTML = htmlContent;
                if (typeof bootstrap !== 'undefined') {
                    new bootstrap.Modal(document.getElementById('historyModal')).show();
                }
            } else {
                const win = window.open("", "آلة الزمن - سجل القضية", "width=650,height=750");
                win.document.write(`
                    <html dir="rtl">
                    <head>
                        <title>سجل التعديلات (Time Machine)</title>
                        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.rtl.min.css" rel="stylesheet">
                    </head>
                    <body class="p-4" style="background-color: #f8f9fa;">
                        <h4 class="mb-4 text-primary">🛡️ سجل الرقابة والأمان (Audit Trail)</h4>
                        <hr>
                        ${htmlContent}
                    </body>
                    </html>
                `);
            }
        } catch (err) {
            console.error('[Time Machine Error]:', err);
            alert('حدث خطأ أثناء تحميل سجل الرقابة.');
        } finally {
            if(elements.timeMachineBtn) {
                elements.timeMachineBtn.innerHTML = 'آلة الزمن (سجل التعديلات) ⏪';
                elements.timeMachineBtn.disabled = false;
            }
        }
    };

    if (elements.timeMachineBtn) {
        elements.timeMachineBtn.addEventListener('click', viewTimeMachine);
    }

    // ==========================================
    // 5. العمليات والإدخال (Forms Handling)
    // ==========================================
    if (elements.uploadFileForm) {
        elements.uploadFileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if(!elements.fileInput) return;
            const file = elements.fileInput.files[0];
            if (!file) return alert('يرجى اختيار ملف.');

            const btn = elements.uploadFileForm.querySelector('button[type="submit"]');
            if(btn) {
                btn.innerHTML = 'جاري الرفع للسحابة... <div class="spinner-border spinner-border-sm"></div>';
                btn.disabled = true;
            }

            try {
                const uploadResult = await API.uploadToCloudR2(file, `cases/${caseId}/attachments`);
                await API.post('/api/files', {
                    case_id: caseId,
                    client_id: currentCaseData.client_id,
                    file_name: file.name,
                    file_extension: file.name.split('.').pop(),
                    file_type: file.type,
                    file_category: document.getElementById('file-category-select')?.value || 'مرفقات عامة',
                    file_url: uploadResult.file_path, 
                    is_template: false
                });

                alert('تم رفع المستند بنجاح.');
                elements.uploadFileForm.reset();
                if (typeof bootstrap !== 'undefined') {
                    const modal = bootstrap.Modal.getInstance(document.getElementById('uploadFileModal'));
                    if(modal) modal.hide();
                }
                loadCaseDetails(); 
            } catch (error) {
                alert(`خطأ في الرفع: ${error.message}`);
            } finally {
                if(btn) {
                    btn.innerHTML = 'رفع المستند';
                    btn.disabled = false;
                }
            }
        });
    }

    if (elements.addUpdateForm) {
        elements.addUpdateForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                case_id: caseId,
                update_title: document.getElementById('update-title')?.value || '',
                update_details: document.getElementById('update-details')?.value || '',
                hearing_date: document.getElementById('hearing-date')?.value || null,
                next_hearing_date: document.getElementById('next-hearing-date')?.value || null,
                is_visible_to_client: document.getElementById('is-visible-client')?.checked || false
            };

            try {
                await API.post('/api/updates', payload);
                if (payload.next_hearing_date) {
                    await API.put(`/api/cases?id=eq.${caseId}`, { 
                        status: 'متداولة', 
                        current_stage: 'مرحلة الجلسات' 
                    });
                }
                alert('تم إضافة الإجراء وإرسال الإشعارات بنجاح.');
                elements.addUpdateForm.reset();
                if (typeof bootstrap !== 'undefined') {
                    const modal = bootstrap.Modal.getInstance(document.getElementById('addUpdateModal'));
                    if(modal) modal.hide();
                }
                loadCaseDetails();
            } catch (error) {
                alert(`خطأ: ${error.message}`);
            }
        });
    }

    if (elements.addExpenseForm) {
        elements.addExpenseForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                case_id: caseId,
                amount: parseFloat(document.getElementById('expense-amount')?.value || 0),
                description: document.getElementById('expense-description')?.value || '',
                expense_date: document.getElementById('expense-date')?.value || new Date().toISOString().split('T')[0]
            };

            const receiptInput = document.getElementById('expense-receipt');
            const receiptFile = receiptInput ? receiptInput.files[0] : null;
            
            try {
                if (receiptFile) {
                    const uploadRes = await API.uploadToCloudR2(receiptFile, `cases/${caseId}/financials`);
                    payload.receipt_url = uploadRes.file_path;
                }
                await API.post('/api/expenses', payload);
                alert('تم تسجيل المصروف بنجاح.');
                elements.addExpenseForm.reset();
                if (typeof bootstrap !== 'undefined') {
                    const modal = bootstrap.Modal.getInstance(document.getElementById('addExpenseModal'));
                    if(modal) modal.hide();
                }
                loadCaseDetails();
            } catch (error) {
                alert(`خطأ: ${error.message}`);
            }
        });
    }

    // التشغيل الأولي
    loadCaseDetails();
});