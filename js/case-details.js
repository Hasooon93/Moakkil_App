/**
 * js/case-details.js
 * وحدة الإدارة الشاملة لتفاصيل القضية (Case Dashboard)
 * الدستور المطبق: التحصين الشامل (Null-Safe)، الطباعة السحرية للفواتير، آلة الزمن، والربط السحابي R2.
 */

// تأمين دالة الرجوع
window.goBack = function() {
    window.history.back();
};

// ==========================================
// خوارزمية التفقيط (تحويل الأرقام إلى نصوص عربية للفواتير)
// ==========================================
const tafqeet = (num) => {
    if (!num || isNaN(num) || num === 0) return "صفر";
    const strNum = String(num).split('.')[0]; 
    if (strNum.length > 9) return num; // رقم ضخم جداً

    const units = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];
    const tens = ["", "عشرة", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
    const teens = ["عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
    const hundreds = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];

    const convertTens = (n) => {
        if (n < 10) return units[n];
        if (n >= 10 && n < 20) return teens[n - 10];
        const u = n % 10;
        const t = Math.floor(n / 10);
        return (u > 0 ? units[u] + " و " : "") + tens[t];
    };

    const convertHundreds = (n) => {
        const h = Math.floor(n / 100);
        const rem = n % 100;
        if (h === 0) return convertTens(rem);
        return hundreds[h] + (rem > 0 ? " و " + convertTens(rem) : "");
    };

    const convertThousands = (n) => {
        const th = Math.floor(n / 1000);
        const rem = n % 1000;
        if (th === 0) return convertHundreds(rem);
        let thStr = "";
        if (th === 1) thStr = "ألف";
        else if (th === 2) thStr = "ألفان";
        else if (th >= 3 && th <= 10) thStr = convertTens(th) + " آلاف";
        else thStr = convertHundreds(th) + " ألف";
        return thStr + (rem > 0 ? " و " + convertHundreds(rem) : "");
    };

    const convertMillions = (n) => {
        const m = Math.floor(n / 1000000);
        const rem = n % 1000000;
        if (m === 0) return convertThousands(rem);
        let mStr = "";
        if (m === 1) mStr = "مليون";
        else if (m === 2) mStr = "مليونان";
        else if (m >= 3 && m <= 10) mStr = convertTens(m) + " ملايين";
        else mStr = convertHundreds(m) + " مليون";
        return mStr + (rem > 0 ? " و " + convertThousands(rem) : "");
    };

    return convertMillions(parseInt(strNum, 10));
};

// متغيرات عامة لحفظ الداتا لاستخدامها في الطباعة
window.currentInstallments = [];
window.currentCaseData = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!window.API || !window.API.getToken()) {
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
    // 1. المتغيرات ومؤشرات واجهة المستخدم (Null-Safe DOM)
    // ==========================================
    const elements = {
        loader: document.getElementById('case-loader') || document.getElementById('main-loader'),
        content: document.getElementById('case-content') || document.getElementById('main-content'),
        
        internalId: document.getElementById('case-internal-id'),
        clientName: document.getElementById('case-client-name'),
        opponentName: document.getElementById('case-opponent-name'),
        caseType: document.getElementById('case-type'),
        courtName: document.getElementById('case-court'),
        status: document.getElementById('case-status'),
        
        confidentialityLevel: document.getElementById('case-confidentiality'),
        physicalArchive: document.getElementById('case-physical-archive'),
        statuteOfLimitations: document.getElementById('case-limitations-date'),
        coPlaintiffs: document.getElementById('case-co-plaintiffs'),
        coDefendants: document.getElementById('case-co-defendants'),
        expertsWitnesses: document.getElementById('case-experts-witnesses'),
        aiSummary: document.getElementById('case-ai-summary'),
        caseTags: document.getElementById('case-tags'), 
        
        updatesList: document.getElementById('case-updates-list') || document.getElementById('timeline-container'),
        filesList: document.getElementById('case-files-list'),
        installmentsList: document.getElementById('case-installments-list'),
        expensesList: document.getElementById('case-expenses-list'),
        
        addUpdateForm: document.getElementById('add-update-form'),
        uploadFileForm: document.getElementById('upload-file-form'),
        fileInput: document.getElementById('case-file-input'),
        addExpenseForm: document.getElementById('add-expense-form'),
        addInstallmentForm: document.getElementById('add-installment-form'),
        timeMachineBtn: document.getElementById('btn-time-machine')
    };

    // ==========================================
    // 2. المحرك الرئيسي لجلب البيانات
    // ==========================================
    const loadCaseDetails = async () => {
        try {
            if (elements.content) elements.content.style.display = 'none';
            if (elements.loader) elements.loader.style.display = 'block';

            const caseReq = await window.API.get(`/api/cases?id=eq.${caseId}&select=*,mo_clients(full_name,phone)`);
            if (!caseReq || caseReq.length === 0) throw new Error('القضية غير موجودة أو لا تملك صلاحية الوصول.');
            window.currentCaseData = caseReq[0];

            const [updates, files, installments, expenses] = await Promise.all([
                window.API.get(`/api/updates?case_id=eq.${caseId}&order=created_at.desc`),
                window.API.get(`/api/files?case_id=eq.${caseId}&order=created_at.desc`),
                window.API.get(`/api/installments?case_id=eq.${caseId}&order=due_date.asc`),
                window.API.get(`/api/expenses?case_id=eq.${caseId}&order=expense_date.desc`)
            ]);

            window.currentInstallments = installments || [];

            renderCaseData(window.currentCaseData);
            renderUpdates(updates);
            renderFiles(files);
            renderFinancials(installments, expenses, window.currentCaseData);

            if (elements.loader) elements.loader.style.display = 'none';
            if (elements.content) elements.content.style.display = 'block';
        } catch (error) {
            console.error('[Case Details Error]:', error);
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

        if(elements.internalId) elements.internalId.textContent = safe(data.case_internal_id);
        if(elements.clientName) elements.clientName.textContent = safe(data.mo_clients?.full_name);
        if(elements.opponentName) elements.opponentName.textContent = safe(data.opponent_name);
        if(elements.caseType) elements.caseType.textContent = safe(data.case_type);
        if(elements.courtName) elements.courtName.textContent = safe(data.current_court);
        if(elements.status) elements.status.textContent = safe(data.status);

        if(elements.confidentialityLevel) elements.confidentialityLevel.textContent = safe(data.confidentiality_level);
        if(elements.physicalArchive) elements.physicalArchive.textContent = safe(data.physical_archive_location);
        if(elements.statuteOfLimitations) elements.statuteOfLimitations.textContent = safe(data.statute_of_limitations_date);
        
        if(elements.coPlaintiffs) elements.coPlaintiffs.textContent = parseJsonArray(data.co_plaintiffs);
        if(elements.coDefendants) elements.coDefendants.textContent = parseJsonArray(data.co_defendants);
        if(elements.expertsWitnesses) elements.expertsWitnesses.textContent = parseJsonArray(data.experts_and_witnesses);

        if(elements.aiSummary) elements.aiSummary.textContent = safe(data.ai_cumulative_summary || data.ai_summary);

        if(elements.caseTags) {
            let tags = [];
            try { tags = typeof data.case_tags === 'string' ? JSON.parse(data.case_tags) : data.case_tags; } catch(e) {}
            if (Array.isArray(tags) && tags.length > 0) {
                elements.caseTags.innerHTML = tags.map(t => `<span class="badge bg-primary me-1 shadow-sm">#${t}</span>`).join('');
            } else {
                elements.caseTags.innerHTML = '<span class="text-muted small">لا توجد وسوم تحليلية</span>';
            }
        }
    };

    const renderUpdates = (updates) => {
        if (!elements.updatesList) return;
        if (!updates || !updates.length) {
            elements.updatesList.innerHTML = '<div class="text-center p-3 text-muted small border bg-white rounded shadow-sm">لا توجد إجراءات مسجلة حتى الآن.</div>';
            return;
        }
        elements.updatesList.innerHTML = updates.map(upd => `
            <div class="timeline-item">
                <div class="d-flex justify-content-between">
                    <strong class="text-navy">${upd.update_title}</strong>
                    <span class="badge ${upd.is_visible_to_client ? 'bg-success' : 'bg-secondary'}">
                        ${upd.is_visible_to_client ? 'مرئي للموكل' : 'داخلي'}
                    </span>
                </div>
                <p class="mb-1 mt-2 text-muted small">${upd.update_details || ''}</p>
                <div class="mt-2 text-muted small border-top pt-2">
                    <i class="fas fa-calendar-alt"></i> تاريخ الإجراء: <b dir="ltr">${new Date(upd.created_at).toLocaleDateString('en-GB')}</b> 
                    ${upd.next_hearing_date ? `| <span class="text-danger"><i class="fas fa-gavel"></i> الجلسة القادمة: <b dir="ltr">${upd.next_hearing_date}</b></span>` : ''}
                </div>
            </div>
        `).join('');
    };

    const renderFiles = (files) => {
        if (!elements.filesList) return;
        if (!files || !files.length) {
            elements.filesList.innerHTML = '<div class="col-12"><div class="alert alert-info border-0 shadow-sm text-center">لا توجد مرفقات في هذه القضية.</div></div>';
            return;
        }
        elements.filesList.innerHTML = files.map(f => {
            const secureUrl = window.API.getSecureUrl(f.file_url || f.attachment_url);
            const ext = (f.file_extension || '').toLowerCase();
            let icon = '📄';
            if (['pdf'].includes(ext)) icon = '📕';
            if (['jpg', 'png', 'jpeg'].includes(ext)) icon = '🖼️';

            return `
                <div class="col-md-4 col-6 mb-3">
                    <div class="card h-100 border-0 shadow-sm">
                        <div class="card-body text-center p-3">
                            <div class="display-4 mb-2">${icon}</div>
                            <h6 class="card-title text-truncate small fw-bold text-navy" title="${f.file_name}">${f.file_name}</h6>
                            <a href="${secureUrl}" target="_blank" class="btn btn-sm btn-outline-primary w-100 mt-2 fw-bold shadow-sm">عرض</a>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    };

    const renderFinancials = (installments, expenses, caseData) => {
        const totalFees = parseFloat(caseData.total_agreed_fees) || 0;
        const totalPaid = (installments || []).filter(i => i.status === 'مدفوعة').reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
        const totalExpenses = (expenses || []).reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);

        if(document.getElementById('fin-total-fees')) document.getElementById('fin-total-fees').textContent = `${totalFees.toLocaleString()}`;
        if(document.getElementById('fin-total-paid')) document.getElementById('fin-total-paid').textContent = `${totalPaid.toLocaleString()}`;
        if(document.getElementById('fin-total-expenses')) document.getElementById('fin-total-expenses').textContent = `${totalExpenses.toLocaleString()}`;
        if(document.getElementById('fin-remaining')) document.getElementById('fin-remaining').textContent = `${(totalFees - totalPaid).toLocaleString()}`;

        if (elements.installmentsList) {
            elements.installmentsList.innerHTML = (installments && installments.length) ? installments.map(inst => {
                const isPaid = inst.status === 'مدفوعة';
                const printBtn = isPaid ? `<button class="btn btn-sm btn-outline-dark shadow-sm px-2 py-0 fw-bold" onclick="printInstallment('${inst.id}')"><i class="fas fa-print"></i></button>` : '-';
                return `
                <tr>
                    <td class="fw-bold">${inst.amount}</td>
                    <td dir="ltr">${inst.due_date}</td>
                    <td><span class="badge ${isPaid ? 'bg-success' : 'bg-warning text-dark'}">${inst.status}</span></td>
                    <td>${printBtn}</td>
                </tr>
            `}).join('') : '<tr><td colspan="4" class="text-center p-3 text-muted">لا توجد دفعات مسجلة</td></tr>';
        }

        if (elements.expensesList) {
            elements.expensesList.innerHTML = (expenses && expenses.length) ? expenses.map(exp => {
                const receiptLink = exp.receipt_url ? `<a href="${window.API.getSecureUrl(exp.receipt_url)}" target="_blank" class="text-decoration-none fw-bold text-danger"><i class="fas fa-file-invoice"></i> المرفق</a>` : '-';
                return `
                <tr>
                    <td class="fw-bold text-danger">${exp.amount}</td>
                    <td class="small text-truncate" style="max-width: 120px;" title="${exp.description}">${exp.description}</td>
                    <td dir="ltr">${exp.expense_date}</td>
                    <td>${receiptLink}</td>
                </tr>
            `}).join('') : '<tr><td colspan="4" class="text-center p-3 text-muted">لا توجد مصاريف مسجلة</td></tr>';
        }
    };

    // ==========================================
    // 4. دالة الطباعة السحرية (Magic Receipt Print)
    // ==========================================
    window.printInstallment = function(instId) {
        if (!window.currentInstallments || !window.currentCaseData) return alert('البيانات غير مكتملة للطباعة.');
        
        const inst = window.currentInstallments.find(i => i.id === instId);
        if (!inst) return alert('الدفعة المحددة غير موجودة.');

        // جلب بيانات المكتب للترويسة
        const firmSettings = JSON.parse(localStorage.getItem('firm_settings')) || {};
        const firmName = firmSettings.firm_name || 'مكتب محاماة';

        // حقن البيانات في عناصر الطباعة المخفية
        const printFirmName = document.getElementById('print-firm-name');
        const printInvDate = document.getElementById('print-inv-date');
        const printInvCase = document.getElementById('print-inv-case');
        const printInvClient = document.getElementById('print-inv-client');
        const printInvAmount = document.getElementById('print-inv-amount');
        const printInvTafqeet = document.getElementById('print-inv-tafqeet');

        if(printFirmName) printFirmName.innerText = firmName;
        if(printInvDate) printInvDate.innerText = inst.due_date || (inst.created_at ? inst.created_at.split('T')[0] : '');
        if(printInvCase) printInvCase.innerText = window.currentCaseData.case_internal_id || 'غير محدد';
        if(printInvClient) printInvClient.innerText = window.currentCaseData.mo_clients?.full_name || 'الموكل';
        if(printInvAmount) printInvAmount.innerText = Number(inst.amount).toLocaleString();
        
        // استخدام خوارزمية التفقيط
        if(printInvTafqeet) printInvTafqeet.innerText = `فقط ${tafqeet(inst.amount)} دينار أردني`;

        // توليد رمز التحقق QR Code
        const qrContainer = document.getElementById('invoice-verification-qr');
        if (qrContainer) {
            qrContainer.innerHTML = ''; // مسح القديم
            const verifyUrl = `${window.location.origin}/verify.html?type=receipt&id=${inst.id}`;
            try {
                new QRCode(qrContainer, { text: verifyUrl, width: 80, height: 80, colorDark: "#000000", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.L });
            } catch(e) {
                console.warn("QRCode library not loaded for print.");
            }
        }

        // إطلاق أمر الطباعة (الـ CSS يتكفل بإخفاء الباقي)
        window.print();
    };

    // ==========================================
    // 5. آلة الزمن (سجل الرقابة - Time Machine)
    // ==========================================
    const viewTimeMachine = async () => {
        try {
            if (!elements.timeMachineBtn) return;
            const btnOriginalText = elements.timeMachineBtn.innerHTML;
            elements.timeMachineBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> جاري التحميل...';
            elements.timeMachineBtn.disabled = true;

            const history = await window.API.get(`/api/history?entity_type=eq.mo_cases&entity_id=eq.${caseId}&order=created_at.desc`);
            
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
                            <small class="text-secondary fw-bold" dir="ltr">⏰ ${date}</small>
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
                elements.timeMachineBtn.innerHTML = '<i class="fas fa-history"></i> تشغيل آلة الزمن ⏪';
                elements.timeMachineBtn.disabled = false;
            }
        }
    };

    if (elements.timeMachineBtn) {
        elements.timeMachineBtn.addEventListener('click', viewTimeMachine);
    }

    // ==========================================
    // 6. العمليات والإدخال (Forms Handling)
    // ==========================================
    if (elements.uploadFileForm) {
        elements.uploadFileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if(!elements.fileInput) return;
            const file = elements.fileInput.files[0];
            if (!file) return alert('يرجى اختيار ملف.');

            const btn = elements.uploadFileForm.querySelector('button[type="submit"]');
            if(btn) { btn.innerHTML = 'جاري الرفع للسحابة... <span class="spinner-border spinner-border-sm"></span>'; btn.disabled = true; }

            try {
                const uploadResult = await window.API.uploadToCloudR2(file, `cases/${caseId}/attachments`);
                await window.API.post('/api/files', {
                    case_id: caseId,
                    client_id: window.currentCaseData.client_id,
                    file_name: document.getElementById('file_title_input')?.value || file.name,
                    file_extension: file.name.split('.').pop(),
                    file_type: file.type,
                    file_category: document.getElementById('file-category-select')?.value || 'مرفقات عامة',
                    file_url: uploadResult.file_path, 
                    is_template: false
                });

                alert('تم رفع المستند بنجاح.');
                elements.uploadFileForm.reset();
                if (typeof bootstrap !== 'undefined') {
                    const modal = bootstrap.Modal.getInstance(document.getElementById('fileModal'));
                    if(modal) modal.hide();
                }
                loadCaseDetails(); 
            } catch (error) {
                alert(`خطأ في الرفع: ${error.message}`);
            } finally {
                if(btn) { btn.innerHTML = '<i class="fas fa-upload me-1"></i> بدء الرفع السحابي'; btn.disabled = false; }
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
                await window.API.post('/api/updates', payload);
                if (payload.next_hearing_date) {
                    await window.API.patch(`/api/cases?id=eq.${caseId}`, { 
                        status: 'متداولة', 
                        current_stage: 'مرحلة الجلسات' 
                    });
                }
                alert('تم إضافة الإجراء وإرسال الإشعارات بنجاح.');
                elements.addUpdateForm.reset();
                if (typeof bootstrap !== 'undefined') {
                    const modal = bootstrap.Modal.getInstance(document.getElementById('updateModal'));
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
                    const uploadRes = await window.API.uploadToCloudR2(receiptFile, `cases/${caseId}/financials`);
                    payload.receipt_url = uploadRes.file_path;
                }
                await window.API.post('/api/expenses', payload);
                alert('تم تسجيل المصروف بنجاح.');
                elements.addExpenseForm.reset();
                if (typeof bootstrap !== 'undefined') {
                    const modal = bootstrap.Modal.getInstance(document.getElementById('expenseModal'));
                    if(modal) modal.hide();
                }
                loadCaseDetails();
            } catch (error) {
                alert(`خطأ: ${error.message}`);
            }
        });
    }

    if (elements.addInstallmentForm) {
        elements.addInstallmentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                case_id: caseId,
                amount: parseFloat(document.getElementById('pay_amount')?.value || 0),
                due_date: document.getElementById('pay_due_date')?.value || new Date().toISOString().split('T')[0],
                status: document.getElementById('pay_status')?.value || 'مدفوعة'
            };
            
            try {
                await window.API.post('/api/installments', payload);
                alert('تم حفظ الدفعة بنجاح.');
                elements.addInstallmentForm.reset();
                if (typeof bootstrap !== 'undefined') {
                    const modal = bootstrap.Modal.getInstance(document.getElementById('paymentModal'));
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