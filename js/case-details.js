// js/case-details.js - محرك التفاصيل والأرشفة والتحليل الذكي

let currentCaseId = localStorage.getItem('current_case_id');
let caseObj = null;

window.onload = async () => {
    if (!currentCaseId) {
        window.location.href = 'app.html';
        return;
    }
    await loadCaseFullDetails();
};

function goBack() { 
    window.location.href = 'app.html'; 
}

async function loadCaseFullDetails() {
    try {
        const [allCases, updates, installments, files] = await Promise.all([
            API.getCases(),
            API.getUpdates(currentCaseId),
            API.getInstallments(currentCaseId),
            API.getFiles(currentCaseId)
        ]);

        caseObj = (allCases || []).find(c => c.id == currentCaseId);
        if (!caseObj) {
            window.location.href = 'app.html';
            return;
        }

        renderHeaderAndSummary();
        renderAIAnalysis(); // الدالة الجديدة الخاصة بالذكاء الاصطناعي
        renderTimeline(updates || []);
        renderPayments(installments || []);
        renderFiles(files || []);
        calculateFinances(installments || []);
        
        // تعبئة نموذج التعديل بالبيانات الحالية
        populateEditForm();
    } catch (error) {
        console.error("خطأ في تحميل تفاصيل القضية:", error);
        showAlert('حدث خطأ أثناء تحميل البيانات', 'danger');
    }
}

function renderHeaderAndSummary() {
    document.getElementById('case-title').innerText = `${caseObj.case_internal_id}`;
    document.getElementById('case-client-name').innerHTML = `<i class="fas fa-user-tie me-2 text-info"></i> ${caseObj.mo_clients?.full_name || "اسم الموكل"}`;
    
    document.getElementById('det-court').innerText = caseObj.current_court || "--";
    document.getElementById('det-judge').innerText = caseObj.current_judge || "--";
    document.getElementById('det-type').innerText = caseObj.case_type || "--";
    document.getElementById('det-opponent').innerText = caseObj.opponent_name || "--";
    document.getElementById('det-claim').innerText = caseObj.claim_amount ? `${Number(caseObj.claim_amount).toLocaleString()} د.أ` : "--";
    
    document.getElementById('case-pin').innerHTML = `<i class="fas fa-key text-warning"></i> PIN: ${caseObj.access_pin || 'غير محدد'}`;
    
    const statusEl = document.getElementById('case-status');
    statusEl.innerText = caseObj.status || "نشطة";
    
    // تلوين حالة القضية
    if (caseObj.status === 'نشطة') statusEl.className = 'badge fs-6 bg-success';
    else if (caseObj.status === 'مغلقة') statusEl.className = 'badge fs-6 bg-dark';
    else if (caseObj.status === 'قيد الاستئناف') statusEl.className = 'badge fs-6 bg-warning text-dark';
    else statusEl.className = 'badge fs-6 bg-secondary';
}

// ==========================================
// محرك العرض الخاص بالذكاء الاصطناعي (AI)
// ==========================================
function renderAIAnalysis() {
    const aiCard = document.getElementById('ai-analysis-card');
    if (!aiCard) return;

    // التحقق من وجود كيانات ذكاء اصطناعي محفوظة في القضية
    if (caseObj.ai_entities && Object.keys(caseObj.ai_entities).length > 0) {
        const ai = caseObj.ai_entities;
        
        // عرض ملخص الوقائع
        const summaryEl = document.getElementById('ai-facts_summary');
        if (summaryEl) summaryEl.innerText = ai.facts_summary || 'لم يتمكن الذكاء الاصطناعي من استخراج ملخص واضح.';

        // عرض الأسماء
        const namesEl = document.getElementById('ai-names');
        if (namesEl) {
            namesEl.innerHTML = (ai.names && Array.isArray(ai.names) && ai.names.length > 0) 
                ? ai.names.map(n => `<span class="ai-badge"><i class="fas fa-user"></i> ${n}</span>`).join('')
                : '<span class="text-muted small">لم يتم اكتشاف أسماء محددة</span>';
        }

        // عرض التواريخ
        const datesEl = document.getElementById('ai-dates');
        if (datesEl) {
            datesEl.innerHTML = (ai.dates && Array.isArray(ai.dates) && ai.dates.length > 0) 
                ? ai.dates.map(d => `<span class="ai-badge border-danger text-danger bg-soft-danger" style="background:#ffebee; border-color:#ffcdd2;"><i class="fas fa-calendar"></i> ${d}</span>`).join('')
                : '<span class="text-muted small">لم يتم اكتشاف تواريخ</span>';
        }

        // عرض المواد القانونية
        const legalEl = document.getElementById('ai-legal_articles');
        if (legalEl) {
            legalEl.innerHTML = (ai.legal_articles && Array.isArray(ai.legal_articles) && ai.legal_articles.length > 0) 
                ? ai.legal_articles.map(l => `<span class="ai-badge border-success text-success" style="background:#e8f5e9; border-color:#c8e6c9;"><i class="fas fa-balance-scale"></i> ${l}</span>`).join('')
                : '<span class="text-muted small">لم يتم اكتشاف إشارات قانونية</span>';
        }

        // إظهار البطاقة
        aiCard.classList.remove('d-none');
    } else {
        // إخفاء البطاقة إذا لم يكن هناك تحليل
        aiCard.classList.add('d-none');
    }
}

function renderTimeline(updates) {
    const container = document.getElementById('timeline-container');
    if (!updates || updates.length === 0) {
        container.innerHTML = '<div class="text-center p-4 text-muted small"><i class="fas fa-history fa-2x mb-2 opacity-50 d-block"></i>لا يوجد وقائع أو جلسات مسجلة حتى الآن.</div>';
        return;
    }
    container.innerHTML = updates.map(u => `
        <div class="timeline-item mb-3">
            <div class="card-custom p-3 shadow-sm bg-white border-end border-4 border-navy">
                <div class="d-flex justify-content-between">
                    <small class="text-primary fw-bold"><i class="fas fa-calendar-day me-1"></i> ${new Date(u.created_at).toLocaleDateString('ar-EG')}</small>
                    ${u.is_visible_to_client ? '<span class="badge bg-light text-success border border-success"><i class="fas fa-eye"></i> مرئي للموكل</span>' : '<span class="badge bg-light text-secondary border"><i class="fas fa-eye-slash"></i> مخفي عن الموكل</span>'}
                </div>
                <h6 class="fw-bold text-navy mt-2">${u.update_title}</h6>
                <p class="mb-2 small text-dark" style="line-height: 1.6;">${u.update_details.replace(/\n/g, '<br>')}</p>
                ${u.hearing_date ? `<small class="d-inline-block bg-light p-1 rounded border me-2"><i class="fas fa-gavel text-warning"></i> <b>تاريخ الجلسة:</b> ${new Date(u.hearing_date).toLocaleDateString('ar-EG')}</small>` : ''}
                ${u.next_hearing_date ? `<small class="d-inline-block bg-light p-1 rounded border"><i class="fas fa-forward text-danger"></i> <b>الجلسة القادمة:</b> ${new Date(u.next_hearing_date).toLocaleDateString('ar-EG')}</small>` : ''}
            </div>
        </div>
    `).join('');
}

function renderPayments(installments) {
    const container = document.getElementById('payments-container');
    if (!installments || installments.length === 0) {
        container.innerHTML = '<div class="text-center p-4 text-muted small"><i class="fas fa-file-invoice-dollar fa-2x mb-2 opacity-50 d-block"></i>لا توجد دفعات مسجلة.</div>';
        return;
    }
    container.innerHTML = installments.map(i => `
        <div class="card-custom p-3 mb-2 d-flex justify-content-between align-items-center border-start border-4 ${i.status === 'مدفوعة' ? 'border-success' : 'border-warning'}">
            <div>
                <b class="fs-5 text-navy">${Number(i.amount).toLocaleString()} د.أ</b>
                <small class="text-muted d-block"><i class="fas fa-calendar-alt"></i> التاريح: ${new Date(i.due_date).toLocaleDateString('ar-EG')}</small>
            </div>
            <span class="badge ${i.status === 'مدفوعة' ? 'bg-success' : 'bg-warning text-dark'}">${i.status}</span>
        </div>
    `).join('');
}

function renderFiles(files) {
    const container = document.getElementById('files-container');
    if (!files || files.length === 0) {
        container.innerHTML = '<div class="col-12 text-center p-4 text-muted small"><i class="fas fa-folder-open fa-2x mb-2 opacity-50 d-block"></i>الأرشيف فارغ.</div>';
        return;
    }
    container.innerHTML = files.map(f => `
        <div class="col-6">
            <div class="card-custom p-3 text-center border shadow-sm">
                <i class="fas fa-file-alt fs-1 text-primary mb-2"></i>
                <h6 class="small fw-bold text-truncate" title="${f.file_name}">${f.file_name}</h6>
                <a href="${f.drive_file_id}" target="_blank" class="btn btn-sm btn-outline-primary w-100 fw-bold mt-2"><i class="fas fa-external-link-alt"></i> عرض الملف</a>
            </div>
        </div>
    `).join('');
}

function calculateFinances(installments) {
    const totalPaid = (installments || []).filter(i => i.status === 'مدفوعة').reduce((sum, i) => sum + Number(i.amount), 0);
    const agreedFees = Number(caseObj.total_agreed_fees) || 0;
    
    document.getElementById('sum-agreed').innerText = agreedFees.toLocaleString();
    document.getElementById('sum-paid').innerText = totalPaid.toLocaleString();
    document.getElementById('sum-rem').innerText = (agreedFees - totalPaid).toLocaleString();
}

// ==========================================
// دوال الإضافة والتعديل
// ==========================================

function populateEditForm() {
    if (!caseObj) return;
    document.getElementById('edit_internal_id').value = caseObj.case_internal_id || '';
    document.getElementById('edit_status').value = caseObj.status || 'نشطة';
    document.getElementById('edit_access_pin').value = caseObj.access_pin || '';
    document.getElementById('edit_court').value = caseObj.current_court || '';
    document.getElementById('edit_judge').value = caseObj.current_judge || '';
    document.getElementById('edit_type').value = caseObj.case_type || '';
    document.getElementById('edit_opponent').value = caseObj.opponent_name || '';
    document.getElementById('edit_claim').value = caseObj.claim_amount || '';
    document.getElementById('edit_fees').value = caseObj.total_agreed_fees || '';
}

async function updateCaseDetails(event) {
    event.preventDefault();
    const data = {
        case_internal_id: document.getElementById('edit_internal_id').value,
        status: document.getElementById('edit_status').value,
        access_pin: document.getElementById('edit_access_pin').value,
        current_court: document.getElementById('edit_court').value,
        current_judge: document.getElementById('edit_judge').value,
        case_type: document.getElementById('edit_type').value,
        opponent_name: document.getElementById('edit_opponent').value,
        claim_amount: document.getElementById('edit_claim').value ? Number(document.getElementById('edit_claim').value) : null,
        total_agreed_fees: document.getElementById('edit_fees').value ? Number(document.getElementById('edit_fees').value) : 0
    };

    try {
        const res = await fetchAPI(`/api/cases?id=eq.${currentCaseId}`, 'PATCH', data);
        if (res && !res.error) {
            closeModal('editCaseModal');
            showAlert('تم تحديث بيانات القضية بنجاح', 'success');
            await loadCaseFullDetails();
        } else {
            showAlert(res?.error || 'حدث خطأ أثناء التعديل', 'danger');
        }
    } catch (e) {
        showAlert('تعذر الاتصال بالخادم', 'danger');
    }
}

async function saveUpdate(event) {
    event.preventDefault();
    const data = {
        case_id: currentCaseId,
        update_title: document.getElementById('upd_title').value,
        update_details: document.getElementById('upd_details').value,
        hearing_date: document.getElementById('upd_hearing_date').value || null,
        next_hearing_date: document.getElementById('upd_next_hearing').value || null,
        is_visible_to_client: document.getElementById('upd_visible').checked
    };

    const res = await API.addUpdate(data);
    if(res && !res.error) {
        closeModal('updateModal');
        document.getElementById('updateForm').reset();
        showAlert('تم تسجيل الواقعة بنجاح', 'success');
        await loadCaseFullDetails();
    } else {
        showAlert(res?.error || 'حدث خطأ أثناء الحفظ', 'danger');
    }
}

async function savePayment(event) {
    event.preventDefault();
    const data = {
        case_id: currentCaseId,
        amount: Number(document.getElementById('pay_amount').value),
        due_date: document.getElementById('pay_due_date').value,
        status: document.getElementById('pay_status').value
    };

    const res = await API.addInstallment(data);
    if(res && !res.error) {
        closeModal('paymentModal');
        document.getElementById('paymentForm').reset();
        showAlert('تم تسجيل الدفعة بنجاح', 'success');
        await loadCaseFullDetails();
    } else {
        showAlert(res?.error || 'حدث خطأ أثناء الحفظ', 'danger');
    }
}

async function saveFile(event) {
    event.preventDefault();
    const fileInput = document.getElementById('file_input');
    const titleInput = document.getElementById('file_title_input').value;
    const btn = document.getElementById('btn_upload');
    
    if (!fileInput.files.length) return;
    const file = fileInput.files[0];
    
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> جاري الرفع والأرشفة في Drive...';
    
    try {
        const driveRes = await API.uploadToDrive(file, caseObj.case_internal_id);
        if(driveRes && driveRes.url) {
            const dbRes = await API.addFileRecord({
                case_id: currentCaseId,
                file_name: titleInput || file.name,
                file_type: file.type,
                drive_file_id: driveRes.url
            });
            if(dbRes && !dbRes.error) {
                closeModal('fileModal');
                document.getElementById('fileForm').reset();
                showAlert('تم أرشفة الملف بنجاح', 'success');
                await loadCaseFullDetails();
            } else {
                throw new Error(dbRes?.error || "حدث خطأ في قاعدة البيانات");
            }
        }
    } catch (err) {
        showAlert("فشل العملية: " + err.message, 'danger');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-cloud-upload-alt me-1"></i> بدء الرفع والأرشفة';
    }
}

// ==========================================
// أدوات النظام (المشاركة والطباعة)
// ==========================================

function copyDeepLink() {
    if(!caseObj || !caseObj.public_token) {
        showAlert('لم يتم إنشاء رابط عام لهذه القضية بعد', 'warning');
        return;
    }
    const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
    const deepLink = `${baseUrl}client.html?token=${caseObj.public_token}`;
    const safePin = caseObj.access_pin || "غير محدد";
    
    const shareText = `مرحباً، يمكنك متابعة تفاصيل قضيتك عبر الرابط التالي:\n${deepLink}\n\nرمز الدخول السري (PIN) الخاص بك هو: ${safePin}`;
    
    if (navigator.share) {
        navigator.share({ title: 'رابط متابعة القضية', text: shareText }).catch(err => console.log('فشلت المشاركة', err));
    } else {
        // نسخ إلى الحافظة إذا كان المتصفح لا يدعم المشاركة المباشرة
        navigator.clipboard.writeText(shareText).then(() => {
            showAlert('تم نسخ الرابط ومعلومات الدخول للحافظة', 'success');
        }).catch(() => {
            window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank');
        });
    }
}

function generatePDF() {
    // حل بسيط وسريع للطباعة يدعم اللغة العربية بكفاءة عبر متصفح المستخدم
    window.print();
}

function openEditModal() {
    populateEditForm();
    openModal('editCaseModal');
}

function openModal(id) { 
    const el = document.getElementById(id);
    if(el) new bootstrap.Modal(el).show(); 
}

function closeModal(id) {
    const el = document.getElementById(id);
    if(el) {
        const m = bootstrap.Modal.getInstance(el);
        if (m) m.hide();
        document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
    }
}

function showAlert(message, type = 'info') {
    const box = document.getElementById('alertBox');
    if(!box) return;
    const alertId = 'alert-' + Date.now();
    let typeClass = type === 'success' ? 'alert-success-custom' : 'alert-danger-custom';
    if(type === 'warning') typeClass = 'bg-warning text-dark border-warning';
    
    box.insertAdjacentHTML('beforeend', `<div id="${alertId}" class="alert-custom ${typeClass} shadow-lg" style="animation: fadeInDown 0.4s ease;"><span>${message}</span></div>`);
    
    setTimeout(() => { 
        const el = document.getElementById(alertId); 
        if(el) { 
            el.style.transition = 'opacity 0.4s ease';
            el.style.opacity = '0'; 
            setTimeout(() => el.remove(), 400); 
        } 
    }, 4000);
}