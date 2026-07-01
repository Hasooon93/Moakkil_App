/**
 * ============================================================================
 * نظام موكّل (Moakkil System) - 2026
 * الملف: js/case-details.js
 * الوصف: المحرك البرمجي لتفاصيل القضية (R2 Cloud & AI Auto-Draft & Smart Archive Edition)
 * الميزات:
 * 1. تکامل تام مع التخزين السحابي المشفر (Cloudflare R2).
 * 2. التوليد الآلي للوائح والمذكرات (AI Legal Drafter).
 * 3. المزامنة الذكية بدون اتصال بالإنترنت (Offline Mode).
 * 4. إدارة متقدمة للسجل الإجرائي والمالي وطباعة الفواتير والـ QR Codes.
 * 5. واجهة مدمجة وهادئة (Soft & Compact UI).
 * 6. تقسيم الأتعاب آلياً، نقل العهدة، ومنع تسريب الشاشة للقضايا السرية.
 * 7. الرابط الذكي للسوابق القضائية (Smart Cross-Case Linker).
 * 8. حماية الحذف الجذري بالمصادقة الثنائية (MFA Delete Protection).
 * ============================================================================
 */

// ============================================================================
// [1] المتغيرات العامة والحماية (Globals & Security)
// ============================================================================
let currentCaseId = localStorage.getItem('current_case_id') || new URLSearchParams(window.location.search).get('id');
let caseObj = null;

/**
 * حماية واجهة النظام من ثغرات الحقن الخبيثة (XSS Sanitization)
 */
const escapeHTML = (str) => {
    if (str === null || str === undefined) return '';
    return str.toString().replace(/[&<>'"]/g, tag => ({ 
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' 
    }[tag] || tag));
};

// ============================================================================
// [2] التهيئة وجلب البيانات (Initialization & Fetching)
// ============================================================================
window.onload = async () => {
    applyFirmSettings(); 
    if (!currentCaseId) { window.location.href = 'app.html'; return; }
    await loadCaseFullDetails();
};

/**
 * تطبيق هوية وألوان المكتب المخصصة (White-Labeling)
 */
function applyFirmSettings() {
    const settings = JSON.parse(localStorage.getItem('firm_settings') || '{}');
    if (!settings) return;
    const root = document.documentElement;
    if (settings.primary_color) root.style.setProperty('--navy', settings.primary_color);
    if (settings.accent_color) root.style.setProperty('--accent', settings.accent_color);
}

// العودة للشاشة السابقة
window.goBack = function() { window.location.href = 'app.html'; };

// المزامنة اليدوية وإعادة التحميل
window.manualSync = async () => {
    const btn = document.getElementById('btn_sync');
    if(btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-sync fa-spin"></i>'; }
    await loadCaseFullDetails();
    showAlert('تمت مزامنة بيانات القضية بنجاح', 'success');
    if(btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i>'; }
};

/**
 * المحرك الأساسي لجلب كل تفاصيل القضية بشكل متوازٍ لتسريع التحميل
 */
async function loadCaseFullDetails() {
    try {
        const [allCasesReq, updatesReq, installmentsReq, expensesReq, filesReq, staffReq, clientsReq] = await Promise.all([
            API.getCases(), API.getUpdates(currentCaseId), API.getInstallments(currentCaseId),
            API.getExpenses(currentCaseId), API.getFiles(currentCaseId), API.getStaff(), API.getClients()
        ]);
        
        // حفظ القوائم محلياً لاستخدامها في العرض والترابط
        window.firmStaff = Array.isArray(staffReq) ? staffReq : [];
        window.firmCases = Array.isArray(allCasesReq) ? allCasesReq : [];
        window.firmClients = Array.isArray(clientsReq) ? clientsReq : [];
        window.firmFiles = Array.isArray(filesReq) ? filesReq : [];
        
        caseObj = window.firmCases.find(c => c.id == currentCaseId);
        if (!caseObj) { window.location.href = 'app.html'; return; }

        // تفعيل البروتوكول الأمني (مانع تسريب الشاشة)
        applySecurityProtocols();

        // توزيع البيانات على واجهة المستخدم
        renderHeaderAndSummary();
        renderTimeline(Array.isArray(updatesReq) ? updatesReq : []);
        renderPayments(Array.isArray(installmentsReq) ? installmentsReq : []);
        renderExpenses(Array.isArray(expensesReq) ? expensesReq : []);
        renderFiles(Array.isArray(filesReq) ? filesReq : []);
        calculateFinances(Array.isArray(installmentsReq) ? installmentsReq : [], Array.isArray(expensesReq) ? expensesReq : []);
        
        if (document.getElementById('secret_notes_input')) {
            document.getElementById('secret_notes_input').value = caseObj.secret_notes || '';
        }
        await loadAuditTrail();

    } catch (error) { 
        console.error("Load Case Error:", error);
        showAlert('تعذر جلب البيانات. قد يكون هناك انقطاع في الإنترنت أو خطأ في السيرفر.', 'warning'); 
    }
}

/**
 * فكرة 33: تطبيق مانع تسريب الشاشة للحالات السرية
 */
function applySecurityProtocols() {
    const leakLayer = document.getElementById('screen-leak-protection');
    if (caseObj && caseObj.confidentiality_level === 'سري') {
        document.body.classList.add('confidential-active');
        if (leakLayer) {
            leakLayer.classList.remove('d-none');
            // محاولة جلب اسم المحامي أو المكتب لطباعته كعلامة مائية
            let userInfo = '';
            try {
                const sessionData = JSON.parse(localStorage.getItem('moakkil_user') || '{}');
                userInfo = sessionData.full_name || 'موظف المكتب';
            } catch(e) {}
            const timestamp = new Date().toLocaleString('ar-EG');
            // ملء الشاشة بنص شفاف مائل
            leakLayer.innerText = (`ملف سري - ${userInfo} - ${timestamp} \n`).repeat(150);
        }
    } else {
        document.body.classList.remove('confidential-active');
        if (leakLayer) leakLayer.classList.add('d-none');
    }
}

// ============================================================================
// [3] عرض الواجهة الأساسية والملخصات (UI Renderers)
// ============================================================================

/**
 * تعبئة البيانات الأساسية وتفاصيل اللائحة في الواجهة
 */
function renderHeaderAndSummary() {
    document.getElementById('case-title').innerText = `${escapeHTML(caseObj.case_internal_id || 'ملف قضية')}`;
    
    // شارات الأولوية والسرية (Soft UI Style)
    let badgesHtml = '';
    if (caseObj.priority_level === 'عاجل جداً') badgesHtml += `<span class="badge bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25 shadow-sm ms-1 heartbeat-animation"><i class="fas fa-fire"></i> عاجل جداً</span>`;
    else if (caseObj.priority_level === 'هام') badgesHtml += `<span class="badge bg-warning bg-opacity-10 text-dark border border-warning border-opacity-50 shadow-sm ms-1"><i class="fas fa-exclamation-circle"></i> هام</span>`;
    if (caseObj.confidentiality_level === 'سري') badgesHtml += `<span class="badge bg-dark bg-opacity-10 text-dark border border-dark border-opacity-25 shadow-sm ms-1"><i class="fas fa-lock text-warning"></i> سري جداً</span>`;
    document.getElementById('case-badges').innerHTML = badgesHtml;

    // بيانات الموكل
    const client = window.firmClients.find(cl => cl.id === caseObj.client_id);
    document.getElementById('case-client-name').innerHTML = `<i class="fas fa-user-tie me-2 text-info"></i> ${client ? escapeHTML(client.full_name) : "موكل غير محدد"}`;

    // فريق المحامين المسندين
    const lawyersContainer = document.getElementById('assigned-lawyers-container');
    if (lawyersContainer && caseObj.assigned_lawyer_id && Array.isArray(caseObj.assigned_lawyer_id) && window.firmStaff) {
        lawyersContainer.innerHTML = caseObj.assigned_lawyer_id.map(id => {
            const staff = window.firmStaff.find(s => s.id === id);
            return staff ? `<span class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 me-1 mb-1 shadow-sm px-2"><i class="fas fa-user-tie"></i> ${escapeHTML(staff.full_name.split(' ')[0])}</span>` : '';
        }).join('');
    } else if (lawyersContainer) {
        lawyersContainer.innerHTML = `<span class="badge bg-light text-muted border px-3 py-1"><i class="fas fa-exclamation-circle me-1"></i> لا يوجد إسناد محدد لمحامي</span>`;
    }
    
    // شريط توقعات النجاح (AI Assessment Bar)
    const prob = caseObj.success_probability || 0;
    const probBar = document.getElementById('det-success-bar');
    const probText = document.getElementById('det-success-text');
    if(probBar && probText) {
        probBar.style.width = prob + '%'; probText.innerText = prob + '%';
        if(prob < 40) { probBar.className = 'progress-bar bg-danger progress-bar-striped progress-bar-animated'; probText.className = 'fw-bold small text-danger'; }
        else if(prob < 75) { probBar.className = 'progress-bar bg-warning progress-bar-striped progress-bar-animated'; probText.className = 'fw-bold small text-warning'; }
        else { probBar.className = 'progress-bar bg-success progress-bar-striped progress-bar-animated'; probText.className = 'fw-bold small text-success'; }
    }

    // تفاصيل المحكمة والقضية
    let litText = escapeHTML(caseObj.litigation_degree || '--');
    if (caseObj.current_stage) litText += ` - مرحلة: ${escapeHTML(caseObj.current_stage)}`;
    document.getElementById('det-litigation').innerHTML = litText;
    
    document.getElementById('det-court').innerText = escapeHTML(caseObj.current_court || "--");
    document.getElementById('det-chamber').innerText = escapeHTML(caseObj.court_room || "--");
    document.getElementById('det-court-num').innerText = escapeHTML(caseObj.court_case_number || "--");
    document.getElementById('det-case-year').innerText = escapeHTML(caseObj.case_year || "--");
    document.getElementById('det-judge').innerText = escapeHTML(caseObj.current_judge || "--");
    document.getElementById('det-opponent').innerText = escapeHTML(caseObj.opponent_name || "--");
    document.getElementById('det-poa-number').innerText = escapeHTML(caseObj.power_of_attorney_number || "--");
    document.getElementById('det-opp-lawyer').innerText = escapeHTML(caseObj.opponent_lawyer || "--");
    
    // الرقم التنفيذي وتصنيفات القضية
    const execNumEl = document.getElementById('det-execution-num');
    if(execNumEl) {
        execNumEl.innerText = escapeHTML(caseObj.execution_file_number || "لا يوجد");
        execNumEl.className = caseObj.execution_file_number ? 'data-value text-success bg-success bg-opacity-10 border border-success border-opacity-25 px-3 py-1 rounded font-monospace' : 'data-value text-muted';
    }
    const tagsEl = document.getElementById('det-tags');
    if(tagsEl) {
        if(Array.isArray(caseObj.case_tags) && caseObj.case_tags.length > 0) {
            tagsEl.innerHTML = caseObj.case_tags.map(t => `<span class="badge bg-light text-dark border shadow-sm mx-1 px-2"><i class="fas fa-tag text-info me-1"></i> ${escapeHTML(t)}</span>`).join('');
        } else {
            tagsEl.innerHTML = '<span class="text-muted small ms-1">لا توجد تصنيفات</span>';
        }
    }
    
    // الأطراف والوكالات
    if(document.getElementById('det-co-plaintiffs')) document.getElementById('det-co-plaintiffs').innerText = Array.isArray(caseObj.co_plaintiffs) && caseObj.co_plaintiffs.length > 0 ? caseObj.co_plaintiffs.join('، ') : '--';
    if(document.getElementById('det-co-defendants')) document.getElementById('det-co-defendants').innerText = Array.isArray(caseObj.co_defendants) && caseObj.co_defendants.length > 0 ? caseObj.co_defendants.join('، ') : '--';
    if(document.getElementById('det-experts')) document.getElementById('det-experts').innerText = Array.isArray(caseObj.experts_and_witnesses) && caseObj.experts_and_witnesses.length > 0 ? caseObj.experts_and_witnesses.join('، ') : '--';
    if(document.getElementById('det-poa-details')) document.getElementById('det-poa-details').innerText = escapeHTML(caseObj.poa_details || "--");
    
    // المواعيد والإغلاق
    document.getElementById('det-case-type').innerText = escapeHTML(caseObj.case_type || "--");
    let parentCaseText = "لا يوجد";
    if(caseObj.parent_case_id) {
        const pCase = window.firmCases.find(c => c.id === caseObj.parent_case_id);
        parentCaseText = pCase ? pCase.case_internal_id : caseObj.parent_case_id;
    }
    if(document.getElementById('det-parent-case')) document.getElementById('det-parent-case').innerText = escapeHTML(parentCaseText);
    if(document.getElementById('det-limit-date')) document.getElementById('det-limit-date').innerText = escapeHTML(caseObj.statute_of_limitations_date || "--");
    if(document.getElementById('det-judgment-date')) document.getElementById('det-judgment-date').innerText = escapeHTML(caseObj.judgment_date || "--");
    
    const outcomeEl = document.getElementById('det-outcome');
    if(outcomeEl) {
        outcomeEl.innerText = escapeHTML(caseObj.case_outcome || "لم تحسم بعد");
        if(caseObj.case_outcome === 'ربح') outcomeEl.className = 'badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 fs-6 px-3 py-2 rounded-pill shadow-sm ms-2';
        else if(caseObj.case_outcome === 'خسارة' || caseObj.case_outcome === 'رد الدعوى') outcomeEl.className = 'badge bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25 fs-6 px-3 py-2 rounded-pill shadow-sm ms-2';
        else outcomeEl.className = 'badge bg-secondary bg-opacity-10 text-dark border border-secondary border-opacity-25 fs-6 px-3 py-2 rounded-pill shadow-sm ms-2';
    }
    
    if(document.getElementById('det-closure-reason')) document.getElementById('det-closure-reason').innerText = escapeHTML(caseObj.closure_reason || "لا يوجد أسباب مسجلة للإغلاق.");

    // السرد اليدوي للائحة
    if(document.getElementById('det-manual-facts')) document.getElementById('det-manual-facts').innerText = escapeHTML(caseObj.lawsuit_facts || "لم يتم سرد الوقائع.");
    if(document.getElementById('det-manual-legal')) document.getElementById('det-manual-legal').innerText = escapeHTML(caseObj.legal_basis || "لم يتم سرد الأسانيد.");
    if(document.getElementById('det-manual-reqs')) document.getElementById('det-manual-reqs').innerText = Array.isArray(caseObj.final_requests) && caseObj.final_requests.length > 0 ? caseObj.final_requests.join('\n') : "لم يتم سرد الطلبات.";

    // الأرشيف والجهات الحكومية
    if(document.getElementById('det-police')) document.getElementById('det-police').innerText = escapeHTML(caseObj.police_station_ref || "--");
    if(document.getElementById('det-prosecution')) document.getElementById('det-prosecution').innerText = escapeHTML(caseObj.prosecution_ref || "--");
    if(document.getElementById('det-archive')) document.getElementById('det-archive').innerText = escapeHTML(caseObj.physical_archive_location || "--");
    if(document.getElementById('det-clerk')) document.getElementById('det-clerk').innerText = escapeHTML(caseObj.court_clerk || "--");
    
    // الملخص التراكمي للذكاء الاصطناعي (AI Summary)
    if(document.getElementById('det-ai-summary')) document.getElementById('det-ai-summary').innerText = escapeHTML(caseObj.ai_cumulative_summary || "لا يوجد ملخص تراكمي بعد.");
    
    if (caseObj.ai_entities) {
        try {
            let ai = typeof caseObj.ai_entities === 'string' ? JSON.parse(caseObj.ai_entities) : caseObj.ai_entities;
            if(document.getElementById('det-ai-facts')) document.getElementById('det-ai-facts').innerText = ai.lawsuit_facts || ai["الوقائع"] || '--';
            if(document.getElementById('det-ai-legal')) document.getElementById('det-ai-legal').innerText = ai.legal_basis || ai["الأسانيد"] || '--';
            let reqs = ai.final_requests || ai["الطلبات"];
            if(document.getElementById('det-ai-requests')) document.getElementById('det-ai-requests').innerText = Array.isArray(reqs) ? reqs.join('، ') : (reqs || '--');
        } catch(e) { console.error("Error parsing AI entities", e); }
    } else {
        if(document.getElementById('det-ai-facts')) document.getElementById('det-ai-facts').innerText = '--';
        if(document.getElementById('det-ai-legal')) document.getElementById('det-ai-legal').innerText = '--';
        if(document.getElementById('det-ai-requests')) document.getElementById('det-ai-requests').innerText = '--';
    }

    // تنبيهات الجلسات (Deadlines)
    const deadlineEl = document.getElementById('det-deadline');
    let targetDate = caseObj.deadline_date;
    if (targetDate) {
        deadlineEl.innerText = escapeHTML(targetDate);
        const daysLeft = Math.ceil((new Date(targetDate) - new Date()) / 86400000);
        if(daysLeft <= 7 && daysLeft > 0) deadlineEl.className = "text-danger fw-bold heartbeat-animation fs-5 font-monospace ms-1";
        else if (daysLeft < 0) deadlineEl.innerHTML = `<span class="text-muted ms-1"><i class="fas fa-times-circle"></i> منتهي الصلاحية</span>`;
        else deadlineEl.className = "text-dark fs-5 font-monospace ms-1";
    } else { deadlineEl.innerText = "غير محدد"; }

    // حالة القضية وبوابة الموكل
    const statusEl = document.getElementById('case-status');
    statusEl.innerText = escapeHTML(caseObj.status || "نشطة");
    statusEl.className = `badge px-4 py-2 fs-6 rounded-pill shadow-sm border ${caseObj.status === 'نشطة' ? 'bg-success bg-opacity-10 text-success border-success' : (caseObj.status === 'مكتملة' ? 'bg-dark bg-opacity-10 text-dark border-dark' : 'bg-secondary bg-opacity-10 text-dark border-secondary')}`;
    
    document.getElementById('case-pin').innerHTML = `<i class="fas fa-key text-warning me-2"></i> رمز بوابة الموكل (PIN): ${escapeHTML(caseObj.access_pin || 'غير محدد')}`;
}

// ============================================================================
// [4] الجداول والقوائم (Timelines, Finance, Files & Audit) - Compact UI
// ============================================================================

/**
 * رسم الخط الزمني للإجراءات والجلسات (Timeline - Compact Hover Style)
 */
function renderTimeline(updates) {
    const container = document.getElementById('timeline-container');
    if (!updates || updates.length === 0) { 
        container.innerHTML = '<div class="text-center p-5 text-muted fw-bold bg-light rounded-4 border"><i class="fas fa-calendar-times fa-3x mb-3 opacity-25"></i><br>لا يوجد سجل وقائع أو إجراءات حتى الآن.</div>'; 
        return; 
    }
    
    container.innerHTML = updates.map(u => {
        let attachHtml = '';
        if (u.attachment_url) {
            const isR2 = !u.attachment_url.startsWith('http');
            if (isR2) {
                attachHtml = `<button class="btn btn-sm btn-outline-primary fw-bold mt-3 shadow-sm px-3 rounded-pill" onclick="API.downloadR2File('${escapeHTML(u.attachment_url)}')"><i class="fas fa-lock me-1"></i> تحميل المحضر المشفر</button>`;
            } else {
                attachHtml = `<a href="${escapeHTML(u.attachment_url)}" target="_blank" class="btn btn-sm btn-outline-primary fw-bold mt-3 shadow-sm px-3 rounded-pill"><i class="fas fa-external-link-alt me-1"></i> عرض المرفق</a>`;
            }
        }
        return `
        <div class="timeline-item fade-in">
            <div class="compact-card appt-card p-4 shadow-sm bg-white position-relative m-0 mb-3" style="border-right: 4px solid transparent;">
                <button class="btn btn-sm text-danger position-absolute top-0 start-0 m-2 bg-light rounded-circle shadow-sm border" onclick="deleteRecord('update', '${u.id}')" title="حذف هذا الإجراء"><i class="fas fa-trash"></i></button>
                <small class="text-primary fw-bold d-block mb-2 font-monospace"><i class="far fa-clock me-1"></i> ${new Date(u.created_at).toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</small>
                <h6 class="fw-bold text-navy mt-1 fs-5 mb-2">${escapeHTML(u.update_title)}</h6>
                <p class="mb-0 text-muted fw-bold lh-lg">${escapeHTML(u.update_details)}</p>
                ${u.hearing_date ? `<div class="mt-3 p-2 bg-success bg-opacity-10 text-success fw-bold rounded border border-success border-opacity-25 d-inline-block"><i class="fas fa-calendar-check me-1"></i> موعد الجلسة المحددة: ${escapeHTML(u.hearing_date)}</div>` : ''}
                ${attachHtml}
            </div>
        </div>`;
    }).join('');
}

/**
 * حساب وتعبئة واجهة الملخص المالي
 */
function calculateFinances(installments, expenses) {
    const totalPaid = installments.filter(i => i.status === 'مدفوعة').reduce((sum, i) => sum + Number(i.amount), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const agreedFees = Number(caseObj.total_agreed_fees) || 0;
    const courtFees = Number(caseObj.court_fees_paid) || 0;
    const courtDeposits = Number(caseObj.court_deposits) || 0;
    const claimAmount = Number(caseObj.claim_amount) || 0;
    const clientRemaining = (agreedFees + totalExpenses + courtFees) - (totalPaid + courtDeposits);

    if(document.getElementById('det-claim-amount')) document.getElementById('det-claim-amount').innerText = claimAmount.toLocaleString('en-US') + ' د.أ';
    document.getElementById('sum-agreed').innerText = agreedFees.toLocaleString('en-US');
    document.getElementById('sum-paid').innerText = totalPaid.toLocaleString('en-US');
    document.getElementById('sum-expenses').innerText = totalExpenses.toLocaleString('en-US');
    if(document.getElementById('sum-court-fees')) document.getElementById('sum-court-fees').innerText = courtFees.toLocaleString('en-US') + ' د.أ';
    if(document.getElementById('sum-court-deposits')) document.getElementById('sum-court-deposits').innerText = courtDeposits.toLocaleString('en-US') + ' د.أ';
    
    const netEl = document.getElementById('sum-net');
    if(netEl) { 
        netEl.innerText = clientRemaining.toLocaleString('en-US') + ' د.أ'; 
        netEl.className = clientRemaining > 0 ? 'fw-bold fs-2 text-danger font-monospace' : 'fw-bold fs-2 text-success font-monospace'; 
    }

    const progressEl = document.getElementById('fin_progress');
    if(progressEl) {
        let progressPct = agreedFees > 0 ? Math.round((totalPaid / agreedFees) * 100) : 0;
        if(progressPct > 100) progressPct = 100;
        progressEl.style.width = `${progressPct}%`;
        progressEl.className = `progress-bar progress-bar-striped progress-bar-animated ${progressPct === 100 ? 'bg-success' : (progressPct > 50 ? 'bg-primary' : 'bg-warning')}`;
    }
}

/**
 * رسم جدول الدفعات (Compact Hover Style)
 */
function renderPayments(installments) {
    const container = document.getElementById('payments-container');
    if (document.getElementById('inst-count')) document.getElementById('inst-count').innerText = installments.length;
    if (!installments || installments.length === 0) { 
        container.innerHTML = '<div class="text-center p-4 text-muted small border bg-light rounded-4 fw-bold">لا توجد سندات قبض أو دفعات مسجلة.</div>'; 
        return; 
    }
    
    container.innerHTML = installments.map(i => {
        const isPaid = i.status === 'مدفوعة';
        const printBtn = isPaid ? `<button class="btn btn-sm btn-outline-success fw-bold px-3 py-1 ms-1 rounded-pill" onclick="printInvoice('${escapeHTML(i.amount)}', '${escapeHTML(i.due_date || i.created_at.split('T')[0])}', '${i.id}')" title="طباعة الفاتورة"><i class="fas fa-print me-1"></i> طباعة</button>` : '';
        const waBtn = !isPaid ? `<button class="btn btn-sm fw-bold px-3 py-1 ms-1 rounded-pill shadow-sm" style="background:#25D366; color:white; border:none;" onclick="sendWhatsAppReminder('${escapeHTML(i.amount)}', '${escapeHTML(i.due_date || new Date(i.created_at).toLocaleDateString('ar-EG'))}')" title="إرسال تذكير للموكل"><i class="fab fa-whatsapp me-1"></i> تذكير</button>` : '';
        
        return `
        <div class="compact-card ${isPaid ? 'client-card' : 'case-card'} p-3 mb-3 d-flex justify-content-between align-items-center bg-white m-0">
            <div>
                <b class="fs-4 font-monospace ${isPaid ? 'text-success' : 'text-dark'}">${Number(i.amount).toLocaleString('en-US')} <small class="fs-6 text-muted">د.أ</small></b>
                <small class="d-block text-muted fw-bold mt-1 font-monospace"><i class="far fa-calendar-alt me-1"></i> استحقاق: ${escapeHTML(i.due_date || new Date(i.created_at).toLocaleDateString('ar-EG'))}</small>
            </div>
            <div class="text-end">
                <span class="badge ${isPaid ? 'bg-success bg-opacity-10 text-success border border-success border-opacity-25' : 'bg-warning bg-opacity-10 text-dark border border-warning border-opacity-50'} px-3 py-2 shadow-sm rounded-pill mb-2">${escapeHTML(i.status)}</span><br>
                ${printBtn} ${waBtn} 
                <button class="btn btn-sm btn-light text-danger fw-bold px-2 py-1 ms-1 rounded-circle border shadow-sm" onclick="deleteRecord('installment', '${i.id}')" title="حذف السند"><i class="fas fa-trash"></i></button>
            </div>
        </div>`;
    }).join('');
}

/**
 * رسم جدول المصروفات (Compact Hover Style)
 */
function renderExpenses(expenses) {
    const container = document.getElementById('expenses-container');
    if (document.getElementById('exp-count')) document.getElementById('exp-count').innerText = expenses.length;
    if (!expenses || expenses.length === 0) { 
        container.innerHTML = '<div class="text-center p-4 text-muted small border bg-light rounded-4 fw-bold">لا توجد مصروفات مسجلة لهذه القضية.</div>'; 
        return; 
    }
    
    container.innerHTML = expenses.map(e => {
        const receiptLink = e.receipt_url ? `<a href="${escapeHTML(e.receipt_url)}" target="_blank" class="badge bg-secondary mt-2 text-decoration-none px-2 py-1 shadow-sm"><i class="fas fa-paperclip me-1"></i> المرفق</a>` : '';
        
        return `
        <div class="compact-card p-3 mb-3 d-flex justify-content-between align-items-center bg-white m-0 transition-hover" onmouseover="this.style.borderColor='var(--danger)'" onmouseout="this.style.borderColor='transparent'">
            <div>
                <b class="fs-4 text-danger font-monospace">${Number(e.amount).toLocaleString('en-US')} <small class="fs-6 text-muted">د.أ</small></b>
                <span class="d-block text-dark fw-bold mt-1">${escapeHTML(e.description)}</span>
                ${receiptLink}
            </div>
            <div class="text-end">
                <small class="text-muted d-block mb-2 fw-bold font-monospace"><i class="fas fa-calendar-alt me-1"></i> ${escapeHTML(e.expense_date)}</small>
                <button class="btn btn-sm btn-light text-danger fw-bold px-2 py-1 rounded-circle border shadow-sm" onclick="deleteRecord('expense', '${e.id}')" title="حذف المصروف"><i class="fas fa-trash"></i></button>
            </div>
        </div>`;
    }).join('');
}

/**
 * رسم الأرشيف السحابي للملف (R2 Cloud) - Compact UI
 */
function renderFiles(files) {
    const container = document.getElementById('files-container');
    if (!files || files.length === 0) { 
        container.innerHTML = '<div class="col-12 text-center p-5 text-muted fw-bold border bg-light rounded-4 shadow-sm"><i class="fas fa-archive fa-3x mb-3 opacity-25"></i><br>أرشيف القضية فارغ حالياً.</div>'; 
        return; 
    }
    
    container.innerHTML = files.map(f => {
        const isImage = f.file_type && f.file_type.includes('image');
        const iconHtml = isImage ? `<i class="fas fa-image fs-1 text-primary mb-3"></i>` : `<i class="fas fa-file-pdf fs-1 text-danger mb-3"></i>`;
        const expiryBadge = f.expiry_date ? `<small class="d-block mt-2 text-danger fw-bold font-monospace" style="font-size: 0.75rem;"><i class="fas fa-clock me-1"></i> ينتهي: ${escapeHTML(f.expiry_date)}</small>` : '';
        
        const aiButton = `<button class="btn btn-sm ${f.is_analyzed ? 'btn-info text-white' : 'btn-outline-secondary bg-white'} mt-2 w-100 fw-bold shadow-sm rounded-pill" onclick="viewAiSummary('${f.id}')"><i class="fas fa-robot me-1"></i> ${f.is_analyzed ? 'عرض التلخيص الذكي' : 'استخلاص وتحليل (AI)'}</button>`;
        
        const isR2 = f.file_url && !f.file_url.startsWith('http');
        const viewBtn = isR2 
            ? `<button class="btn btn-sm btn-outline-primary bg-white w-100 fw-bold rounded-pill shadow-sm" onclick="API.downloadR2File('${escapeHTML(f.file_url)}', '${escapeHTML(f.file_name)}')"><i class="fas fa-lock me-1"></i> تحميل مشفر</button>`
            : `<a href="${escapeHTML(f.drive_file_id || f.file_url)}" target="_blank" class="btn btn-sm btn-outline-primary bg-white w-100 fw-bold rounded-pill shadow-sm"><i class="fas fa-external-link-alt me-1"></i> عرض</a>`;

        return `
        <div class="col-6 col-md-4 fade-in">
            <div class="compact-card appt-card p-4 text-center h-100 bg-white position-relative m-0 d-flex flex-column">
                <button class="btn btn-sm text-danger position-absolute top-0 start-0 m-2 bg-light rounded-circle shadow-sm border" onclick="deleteRecord('file', '${f.id}')"><i class="fas fa-trash"></i></button>
                <span class="badge bg-light text-dark border mb-3 d-inline-block text-truncate mx-auto px-3 py-1" style="max-width: 80%;">${escapeHTML(f.file_category || 'مستند')}</span>
                ${iconHtml} 
                <h6 class="small fw-bold text-truncate mt-1 mb-0 text-navy lh-base" title="${escapeHTML(f.file_name)}">${escapeHTML(f.file_name)}</h6>
                ${expiryBadge}
                <div class="mt-auto pt-3 d-flex flex-column gap-2">
                    ${viewBtn}
                    ${aiButton}
                </div>
            </div>
        </div>`;
    }).join('');
}

/**
 * جلب ورسم السجل الأمني للرقابة (Audit Trail - Compact UI)
 */
async function loadAuditTrail() {
    const container = document.getElementById('audit-container');
    if (!container) return;
    try {
        const history = await API.getHistory(currentCaseId);
        if (!history || history.length === 0) { 
            container.innerHTML = '<div class="alert bg-white border text-center fw-bold text-muted p-4 rounded-4 shadow-sm"><i class="fas fa-clipboard-list fa-2x mb-2 opacity-50"></i><br>لا توجد حركات مسجلة أو تعديلات على هذا الملف حتى الآن.</div>'; 
            return; 
        }
        
        container.innerHTML = history.map(h => {
            const actionMap = { 
                'CREATE': { color: 'success', ar: 'إنشاء/إضافة', icon: 'fa-plus' }, 
                'UPDATE': { color: 'info', ar: 'تعديل', icon: 'fa-edit' }, 
                'DELETE': { color: 'danger', ar: 'حذف', icon: 'fa-trash' } 
            };
            const action = actionMap[h.action_type] || { color: 'secondary', ar: h.action_type, icon: 'fa-cog' };
            
            return `
            <div class="compact-card transition-hover p-3 mb-3 bg-white m-0" style="border-right: 4px solid var(--bs-${action.color});">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <span class="badge bg-${action.color} bg-opacity-10 text-${action.color} border border-${action.color} border-opacity-25 px-3 py-1 rounded-pill"><i class="fas ${action.icon} me-1"></i> ${action.ar}</span>
                    <small class="text-muted fw-bold font-monospace"><i class="far fa-clock me-1"></i> ${new Date(h.created_at).toLocaleString('ar-EG')}</small>
                </div>
                <p class="mb-0 small fw-bold text-navy mt-2">تم تسجيل حركة رقابية على هذا الملف من قبل النظام.</p>
            </div>`;
        }).join('');
    } catch(e) { 
        container.innerHTML = '<div class="alert alert-danger text-center fw-bold shadow-sm">تعذر جلب السجل الأمني. يرجى مراجعة الصلاحيات.</div>'; 
    }
}

// ============================================================================
// [5] عمليات التعديل والحفظ الشاملة ونقل العهدة وتقسيم الأتعاب (CRUD & Advanced Actions)
// ============================================================================

/**
 * نقل العهدة (Case Delegation)
 */
window.openDelegationModal = function() {
    const select = document.getElementById('delegation_lawyer');
    if (select && window.firmStaff) {
        select.innerHTML = '<option value="">-- اختر الزميل المحامي --</option>' + 
            window.firmStaff.map(s => `<option value="${s.id}">${escapeHTML(s.full_name)}</option>`).join('');
    }
    openModal('delegationModal');
};

window.submitDelegation = async function(event) {
    event.preventDefault();
    const btn = event.target.querySelector('button[type="submit"]');
    const newLawyerId = document.getElementById('delegation_lawyer').value;
    
    if(!newLawyerId) return showAlert('الرجاء اختيار المحامي البديل', 'warning');
    
    const confirm = await Swal.fire({
        title: 'تأكيد إخلاء ونقل العهدة',
        text: 'بموجب هذا الإجراء، سيتم سحب صلاحياتك من هذه القضية ونقلها للزميل المختار. هل تقر بتسليم الملف؟',
        icon: 'warning', showCancelButton: true, confirmButtonText: '<i class="fas fa-signature"></i> نعم، أقر بالتسليم', cancelButtonText: 'إلغاء'
    });
    
    if(!confirm.isConfirmed) return;

    btn.disabled = true; 
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> جاري نقل العهدة...';
    
    try {
        // تحديث مصفوفة المحامين ليكون المحامي الجديد فقط (حسب الدستور: إزالة القديم وإضافة الجديد)
        const res = await API.updateCase(currentCaseId, { assigned_lawyer_id: [newLawyerId] });
        if(res && !res.error) {
            closeModal('delegationModal');
            showAlert('تم نقل عهدة الملف بنجاح وتم تسجيل بصمتك في سجل الرقابة.', 'success');
            await loadCaseFullDetails();
        } else {
            throw new Error(res?.error || 'حدث خطأ في النظام أثناء نقل العهدة');
        }
    } catch(e) {
        showAlert(e.message, 'error');
    } finally {
        btn.disabled = false; 
        btn.innerHTML = '<i class="fas fa-signature me-2"></i> أقر بتسليم الملف ونقل العهدة';
    }
};

/**
 * تقسيم الأتعاب (Fee Installments Splitter)
 */
window.openFeeSplitModal = function() {
    // حساب المبلغ المتبقي كقيمة افتراضية للتقسيم
    const totalAgreed = Number(caseObj.total_agreed_fees) || 0;
    const totalPaid = caseObj.total_paid || 0;
    const remaining = totalAgreed - totalPaid;
    
    document.getElementById('split_total_amount').value = remaining > 0 ? remaining : 0;
    openModal('feeSplitModal');
};

window.generateFeeInstallments = async function(event) {
    event.preventDefault();
    const totalAmount = Number(document.getElementById('split_total_amount').value);
    const startDate = document.getElementById('split_start_date').value;
    const count = Number(document.getElementById('split_count').value);
    const period = document.getElementById('split_period').value;

    if (!totalAmount || !startDate || count < 2) {
        return showAlert('يرجى تعبئة كافة الحقول بشكل صحيح، وعدد الدفعات يجب أن يكون 2 فما فوق.', 'warning');
    }

    const btn = event.target.querySelector('button[type="submit"]');
    btn.disabled = true; 
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> جاري الجدولة والتوليد الآلي...';

    const amountPerInst = (totalAmount / count).toFixed(2);
    let currentDate = new Date(startDate);
    let actions = [];

    try {
        for (let i = 0; i < count; i++) {
            const instData = {
                case_id: currentCaseId,
                amount: Number(amountPerInst),
                due_date: currentDate.toISOString(),
                status: 'مستحقة'
            };
            
            // استخدام الميزة الجديدة للمزامنة الدفعية (Bulk Insert via Offline Sync)
            actions.push({
                id: 'temp_inst_' + crypto.randomUUID(),
                endpoint: '/api/installments',
                method: 'POST',
                body: instData
            });

            // زيادة التاريخ بناءً على الدورية
            if (period === 'monthly') {
                currentDate.setMonth(currentDate.getMonth() + 1);
            } else if (period === 'weekly') {
                currentDate.setDate(currentDate.getDate() + 7);
            }
        }

        // إرسال حزمة الدفعات للوركر عبر مسار المزامنة
        const res = await API.post('/api/sync/offline', { actions });
        if (res && !res.error) {
            closeModal('feeSplitModal');
            document.getElementById('feeSplitForm').reset();
            showAlert('تم توليد وجدولة الدفعات بنجاح.', 'success');
            await loadCaseFullDetails();
        } else {
            throw new Error(res?.error || 'حدث خطأ أثناء إرسال حزمة الدفعات.');
        }

    } catch(e) {
        showAlert(e.message, 'error');
    } finally {
        btn.disabled = false; 
        btn.innerHTML = '<i class="fas fa-magic me-2"></i> توليد الدفعات وجدولتها آلياً';
    }
};

/**
 * حفظ الملاحظات السرية
 */
window.saveSecretNotes = async function() {
    const notes = document.getElementById('secret_notes_input').value;
    const res = await API.updateCase(currentCaseId, { secret_notes: notes });
    if (res && !res.error) showAlert(res.offline ? 'تم الحفظ محلياً لحين عودة الشبكة' : 'تم تشفير وحفظ الملاحظات السرية', res.offline ? 'warning' : 'success');
};

/**
 * دالة مساعدة لضبط التوقيت لتفادي مشكلة تقديم/تأخير اليوم في قاعدة البيانات
 */
function applyJordanTimeHackLocal(dateString) {
    if (!dateString || dateString.trim() === '') return null;
    try {
        let d = new Date(dateString);
        d.setHours(d.getHours() + 3);
        return d.toISOString();
    } catch(e) { return null; }
}

/**
 * فتح نافذة التعديل الشامل وتعبئة البيانات بداخلها
 */
window.openEditModal = function() {
    document.getElementById('edit_internal_id').value = caseObj.case_internal_id || '';
    document.getElementById('edit_status').value = caseObj.status || 'نشطة';
    document.getElementById('edit_access_pin').value = caseObj.access_pin || '';
    document.getElementById('edit_type').value = caseObj.case_type || '';
    document.getElementById('edit_priority_level').value = caseObj.priority_level || 'عادي';
    document.getElementById('edit_confidentiality_level').value = caseObj.confidentiality_level || 'عادي';
    document.getElementById('edit_current_stage').value = caseObj.current_stage || '';

    document.getElementById('edit_court').value = caseObj.current_court || '';
    document.getElementById('edit_court_chamber').value = caseObj.court_room || ''; 
    document.getElementById('edit_court_case_number').value = caseObj.court_case_number || '';
    document.getElementById('edit_case_year').value = caseObj.case_year || '';
    document.getElementById('edit_litigation_degree').value = caseObj.litigation_degree || '';
    document.getElementById('edit_judge').value = caseObj.current_judge || '';
    document.getElementById('edit_court_clerk').value = caseObj.court_clerk || '';
    document.getElementById('edit_deadline_date').value = caseObj.deadline_date || '';
    document.getElementById('edit_statute_of_limitations_date').value = caseObj.statute_of_limitations_date || '';
    document.getElementById('edit_judgment_date').value = caseObj.judgment_date || '';
    document.getElementById('edit_police_station_ref').value = caseObj.police_station_ref || '';
    document.getElementById('edit_prosecution_ref').value = caseObj.prosecution_ref || '';
    
    if(document.getElementById('edit_execution_file_number')) document.getElementById('edit_execution_file_number').value = caseObj.execution_file_number || '';
    if(document.getElementById('edit_case_tags')) document.getElementById('edit_case_tags').value = Array.isArray(caseObj.case_tags) ? caseObj.case_tags.join('، ') : '';

    document.getElementById('edit_opponent').value = caseObj.opponent_name || '';
    document.getElementById('edit_opponent_lawyer').value = caseObj.opponent_lawyer || '';
    document.getElementById('edit_poa_number').value = caseObj.power_of_attorney_number || '';
    document.getElementById('edit_poa_details').value = caseObj.poa_details || '';

    if(document.getElementById('edit_co_plaintiffs')) document.getElementById('edit_co_plaintiffs').value = Array.isArray(caseObj.co_plaintiffs) ? caseObj.co_plaintiffs.join('، ') : '';
    if(document.getElementById('edit_co_defendants')) document.getElementById('edit_co_defendants').value = Array.isArray(caseObj.co_defendants) ? caseObj.co_defendants.join('، ') : '';
    if(document.getElementById('edit_experts_and_witnesses')) document.getElementById('edit_experts_and_witnesses').value = Array.isArray(caseObj.experts_and_witnesses) ? caseObj.experts_and_witnesses.join('، ') : '';

    document.getElementById('edit_lawsuit_facts').value = caseObj.lawsuit_facts || '';
    document.getElementById('edit_legal_basis').value = caseObj.legal_basis || '';
    document.getElementById('edit_final_requests').value = Array.isArray(caseObj.final_requests) ? caseObj.final_requests.join('\n') : '';
    if(document.getElementById('edit_case_outcome')) document.getElementById('edit_case_outcome').value = caseObj.case_outcome || '';
    if(document.getElementById('edit_success_probability')) document.getElementById('edit_success_probability').value = caseObj.success_probability || '';
    if(document.getElementById('edit_closure_reason')) document.getElementById('edit_closure_reason').value = caseObj.closure_reason || '';
    if(document.getElementById('edit_physical_archive_location')) document.getElementById('edit_physical_archive_location').value = caseObj.physical_archive_location || '';

    document.getElementById('edit_claim').value = caseObj.claim_amount || '';
    document.getElementById('edit_fees').value = caseObj.total_agreed_fees || '';
    if(document.getElementById('edit_court_fees_paid')) document.getElementById('edit_court_fees_paid').value = caseObj.court_fees_paid || '';
    if(document.getElementById('edit_court_deposits')) document.getElementById('edit_court_deposits').value = caseObj.court_deposits || '';
    
    // إسناد المحامين عبر مكتبة Choices.js المتقدمة
    const lawyerSelect = document.getElementById('edit_assigned_lawyer');
    if(lawyerSelect && window.firmStaff) {
        lawyerSelect.innerHTML = window.firmStaff.map(s => {
            const isSelected = caseObj.assigned_lawyer_id && caseObj.assigned_lawyer_id.includes(s.id) ? 'selected' : '';
            return `<option value="${s.id}" ${isSelected}>${escapeHTML(s.full_name)}</option>`;
        }).join('');
        
        if (typeof Choices !== 'undefined') {
            if (window.lawyerChoices) window.lawyerChoices.destroy();
            window.lawyerChoices = new Choices(lawyerSelect, { 
                removeItemButton: true, searchEnabled: true, placeholderValue: 'ابحث واختر فريق العمل...' 
            });
        }
    }
    
    // ربط القضايا
    const parentCaseSelect = document.getElementById('edit_parent_case_id');
    if(parentCaseSelect && window.firmCases) {
        parentCaseSelect.innerHTML = '<option value="">لا يوجد (هذه قضية رئيسية)</option>' + 
        window.firmCases.filter(c => c.id !== currentCaseId).map(c => `<option value="${c.id}">${escapeHTML(c.case_internal_id)}</option>`).join('');
        if (caseObj.parent_case_id) parentCaseSelect.value = caseObj.parent_case_id;
    }

    openModal('editCaseModal');
};

/**
 * حفظ التعديلات الشاملة للقضية
 */
window.updateCaseDetails = async function(event) {
    event.preventDefault();
    const btn = document.getElementById('btn_save_case_edit');
    btn.disabled = true; 
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> جاري الحفظ والتشفير...';

    const selectedLawyers = Array.from(document.getElementById('edit_assigned_lawyer').selectedOptions).map(opt => opt.value);
    const parseToArray = (str) => str ? str.split('،').map(s => s.trim()).filter(s => s) : [];
    const parseLinesToArray = (str) => str ? str.split('\n').map(s => s.trim()).filter(s => s) : [];

    const getStr = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
    const getNull = (id) => { const el = document.getElementById(id); return (el && el.value.trim() !== '') ? el.value : null; };
    const getNumZero = (id) => { const el = document.getElementById(id); return (el && el.value.trim() !== '') ? Number(el.value) : 0; };
    const getNumNull = (id) => { const el = document.getElementById(id); return (el && el.value.trim() !== '') ? Number(el.value) : null; };

    const data = {
        case_internal_id: getStr('edit_internal_id'), 
        status: getStr('edit_status'),
        access_pin: getStr('edit_access_pin'), 
        case_type: getStr('edit_type'), 
        priority_level: getStr('edit_priority_level') || 'عادي', 
        confidentiality_level: getStr('edit_confidentiality_level') || 'عادي',
        current_stage: getStr('edit_current_stage'), 
        assigned_lawyer_id: selectedLawyers.length > 0 ? selectedLawyers : null,
        current_court: getStr('edit_court'), 
        court_room: getStr('edit_court_chamber'), 
        court_case_number: getStr('edit_court_case_number'), 
        case_year: getNumNull('edit_case_year'),
        litigation_degree: getNull('edit_litigation_degree'), 
        current_judge: getStr('edit_judge'),
        court_clerk: getStr('edit_court_clerk'), 
        parent_case_id: getNull('edit_parent_case_id'),
        
        deadline_date: getNull('edit_deadline_date'), 
        statute_of_limitations_date: getNull('edit_statute_of_limitations_date'),
        judgment_date: getNull('edit_judgment_date'), 
        
        police_station_ref: getStr('edit_police_station_ref'),
        prosecution_ref: getStr('edit_prosecution_ref'), 
        opponent_name: getStr('edit_opponent'),
        opponent_lawyer: getStr('edit_opponent_lawyer'), 
        power_of_attorney_number: getStr('edit_poa_number'),
        poa_details: getStr('edit_poa_details'), 
        co_plaintiffs: parseToArray(getStr('edit_co_plaintiffs')),
        co_defendants: parseToArray(getStr('edit_co_defendants')), 
        experts_and_witnesses: parseToArray(getStr('edit_experts_and_witnesses')),
        
        lawsuit_facts: getStr('edit_lawsuit_facts'), 
        legal_basis: getStr('edit_legal_basis'),
        final_requests: parseLinesToArray(getStr('edit_final_requests')), 
        case_outcome: getStr('edit_case_outcome'),
        success_probability: getNumNull('edit_success_probability'),
        closure_reason: getStr('edit_closure_reason'), 
        physical_archive_location: getStr('edit_physical_archive_location'),
        
        claim_amount: getNumNull('edit_claim'),
        total_agreed_fees: getNumZero('edit_fees'),
        court_fees_paid: getNumZero('edit_court_fees_paid'),
        court_deposits: getNumZero('edit_court_deposits'),
        
        execution_file_number: getNull('edit_execution_file_number'),
        case_tags: parseToArray(getStr('edit_case_tags'))
    };

    try {
        const res = await API.updateCase(currentCaseId, data);
        if(res && !res.error) { 
            closeModal('editCaseModal'); 
            showAlert(res.offline ? 'تم حفظ التعديلات محلياً بانتظار الاتصال' : 'تم تحديث بيانات الملف بنجاح', res.offline ? 'warning' : 'success'); 
            await loadCaseFullDetails(); 
        } else {
            throw new Error(res?.error || 'حدث خطأ في تحديث قاعدة البيانات');
        }
    } catch (error) {
        showAlert('فشل التحديث: ' + error.message, 'error');
    } finally {
        btn.disabled = false; 
        btn.innerHTML = '<i class="fas fa-save me-2"></i> حفظ التحديثات الشاملة للملف';
    }
};

// ============================================================================
// [6] الإجراءات، المرفقات، والمالية (Updates, Uploads & Finance)
// ============================================================================

window.openUpdateModal = function() { 
    if(document.getElementById('upd_extracted_json')) document.getElementById('upd_extracted_json').value = ''; 
    openModal('updateModal'); 
};

window.saveUpdate = async function(event) {
    event.preventDefault();
    const btn = document.getElementById('btn_save_update');
    const details = document.getElementById('upd_details').value;
    const fileInput = document.getElementById('upd_attachment_input');
    const hasFile = fileInput && fileInput.files.length > 0;
    let finalAttachmentUrl = null;

    if (hasFile) {
        if (!navigator.onLine) { 
            showAlert('حماية: لا يمكن رفع المرفقات السحابية بلا إنترنت.', 'warning'); 
            return; 
        }
        btn.disabled = true; 
        btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> جاري التشفير والرفع...';
        
        try {
            const r2Res = await API.uploadFileToR2(fileInput.files[0], caseObj.client_id, caseObj.id);
            if(r2Res && r2Res.r2_key) finalAttachmentUrl = r2Res.r2_key;
        } catch(e) { 
            showAlert('فشل الرفع السحابي. يرجى فحص الشبكة', 'error'); 
            btn.disabled = false; 
            btn.innerHTML = '<i class="fas fa-save me-2"></i> توثيق الإجراء في السجل'; 
            return; 
        }
    }

    const extractedStr = document.getElementById('upd_extracted_json') ? document.getElementById('upd_extracted_json').value : '';
    const extractedData = extractedStr ? JSON.parse(extractedStr) : {};
    
    const hearingVal = document.getElementById('upd_hearing_date') ? document.getElementById('upd_hearing_date').value : '';
    const nextHearingVal = document.getElementById('upd_next_hearing') ? document.getElementById('upd_next_hearing').value : '';
    const validHearing = hearingVal.trim() !== '' ? applyJordanTimeHackLocal(hearingVal) : null;
    const validNextHearing = nextHearingVal.trim() !== '' ? applyJordanTimeHackLocal(nextHearingVal) : null;

    const data = {
        case_id: currentCaseId, 
        update_title: document.getElementById('upd_title').value, 
        update_details: details,
        hearing_date: validHearing, 
        next_hearing_date: validNextHearing,
        is_visible_to_client: document.getElementById('upd_visible') ? document.getElementById('upd_visible').checked : true, 
        ai_extracted_entities: extractedData, 
        attachment_url: finalAttachmentUrl
    };
    
    try {
        const res = await API.addUpdate(data);
        if(res && !res.error) { 
            if (extractedData.lawsuit_facts || extractedData.legal_basis) {
                await API.updateCase(currentCaseId, { 
                    ai_entities: extractedData, 
                    lawsuit_facts: extractedData.lawsuit_facts || caseObj.lawsuit_facts, 
                    legal_basis: extractedData.legal_basis || caseObj.legal_basis, 
                    ai_cumulative_summary: (caseObj.ai_cumulative_summary ? caseObj.ai_cumulative_summary + "\n" : "") + (extractedData.lawsuit_facts || details).substring(0,150) 
                });
            }
            closeModal('updateModal'); 
            showAlert(res.offline ? 'تم الحفظ محلياً للأوفلاين' : 'تم توثيق الإجراء', res.offline ? 'warning' : 'success'); 
            document.getElementById('updateForm').reset(); 
            await loadCaseFullDetails(); 
        } else {
            throw new Error(res?.error || 'حدث خطأ في النظام');
        }
    } catch(err) { 
        showAlert(err.message, 'error'); 
    } finally { 
        if (hasFile) { 
            btn.disabled = false; 
            btn.innerHTML = '<i class="fas fa-save me-2"></i> توثيق الإجراء في السجل'; 
        } 
    }
};

window.savePayment = async function(event) { 
    event.preventDefault(); 
    const rawDate = document.getElementById('pay_due_date').value;
    const validDate = rawDate.trim() !== '' ? applyJordanTimeHackLocal(rawDate) : new Date().toISOString();
    
    const data = { 
        case_id: currentCaseId, 
        amount: Number(document.getElementById('pay_amount').value), 
        due_date: validDate, 
        status: document.getElementById('pay_status').value 
    }; 
    
    closeModal('paymentModal'); 
    document.getElementById('paymentForm').reset(); 
    showAlert('جاري حفظ السند...', 'info'); 
    
    try { 
        const res = await API.addInstallment(data); 
        if(res && !res.error) await loadCaseFullDetails(); 
        else throw new Error(res?.error || 'خطأ في الحفظ'); 
    } catch(e) { 
        showAlert(e.message, 'error'); 
    }
};

window.saveExpense = async function(event) { 
    event.preventDefault(); 
    const rawDate = document.getElementById('exp_date').value;
    const validDate = rawDate.trim() !== '' ? applyJordanTimeHackLocal(rawDate) : new Date().toISOString();
    const receipt = document.getElementById('exp_receipt_url') ? document.getElementById('exp_receipt_url').value : '';
    
    const data = { 
        case_id: currentCaseId, 
        amount: Number(document.getElementById('exp_amount').value), 
        description: document.getElementById('exp_desc').value, 
        expense_date: validDate, 
        receipt_url: receipt.trim() !== '' ? receipt : null 
    }; 
    
    closeModal('expenseModal'); 
    document.getElementById('expenseForm').reset(); 
    showAlert('جاري تسجيل المصروف...', 'info'); 
    
    try { 
        const res = await API.addExpense(data); 
        if(res && !res.error) await loadCaseFullDetails(); 
        else throw new Error(res?.error || 'خطأ في الحفظ'); 
    } catch(e) { 
        showAlert(e.message, 'error'); 
    }
};

// الرفع الآمن وتشفير الملفات للـ R2
window.saveFile = async function(event) {
    event.preventDefault();
    const fileInput = document.getElementById('file_input');
    const titleInput = document.getElementById('file_title_input').value;
    const catInput = document.getElementById('file_category_input').value;
    const expiryInput = document.getElementById('file_expiry_date').value;
    const validExpiry = expiryInput.trim() !== '' ? expiryInput : null;
    const btn = document.getElementById('btn_upload');
    
    if (!fileInput.files.length) return;
    if (!navigator.onLine) { showAlert('لا يمكن أرشفة المستندات سحابياً بلا إنترنت.', 'warning'); return; }
    
    btn.disabled = true; 
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> تشفير وأرشفة وذكاء اصطناعي...';
    
    try {
        const file = fileInput.files[0];

        const r2Res = await API.uploadFileToR2(file, caseObj.client_id, caseObj.id);
        
        if(r2Res && r2Res.r2_key) {
            let aiSummaryText = null;
            let isAnalyzed = false;
            
            try {
                if (window.AIHandler) {
                    const aiProcessedData = await window.AIHandler.processFile(file);
                    const token = localStorage.getItem(CONFIG.TOKEN_KEY || 'moakkil_token');
                    const baseUrl = window.API_BASE_URL || CONFIG.API_URL;
                    
                    const aiReq = await fetch(`${baseUrl}/api/ai/ocr`, { 
                        method: 'POST', 
                        headers: { 
                            'Content-Type': 'application/json', 
                            'Authorization': `Bearer ${token}` 
                        }, 
                        body: JSON.stringify({ 
                            file_type: aiProcessedData.type,
                            is_text_extracted: aiProcessedData.isTextExtracted,
                            payload: aiProcessedData.payload
                        }) 
                    });
                    
                    if(aiReq.ok) {
                        const aiData = await aiReq.json();
                        aiSummaryText = typeof aiData === 'string' ? aiData : JSON.stringify(aiData, null, 2);
                        isAnalyzed = true;
                    }
                }
            } catch (aiErr) {
                console.error("AI Handler Error:", aiErr);
                showAlert('تم حفظ الملف بأمان، لكن تخطينا عملية التحليل الذكي لحجمه المعقد.', 'warning');
            }

            const payload = { 
                case_id: currentCaseId, 
                file_name: titleInput || file.name, 
                file_type: file.type, 
                file_category: catInput, 
                file_url: r2Res.r2_key, 
                drive_file_id: r2Res.r2_key, 
                is_template: false, 
                expiry_date: validExpiry,
                ai_summary: aiSummaryText, 
                is_analyzed: isAnalyzed 
            };
            
            const res = await (API.addFileRecord ? API.addFileRecord(payload) : API.post('/api/files', payload));
            if(res && !res.error) { 
                closeModal('fileModal'); 
                document.getElementById('fileForm').reset(); 
                showAlert('تم الحفظ والتشفير السحابي بنجاح', 'success'); 
                await loadCaseFullDetails(); 
            } else {
                throw new Error(res?.error || 'خطأ أثناء تسجيل الملف');
            }
        } else {
            throw new Error('لم يتم استلام مفتاح التشفير من الأرشيف السحابي R2');
        }
    } catch (err) { 
        showAlert("فشل الرفع: " + err.message, 'error'); 
    } finally { 
        btn.disabled = false; 
        btn.innerHTML = '<i class="fas fa-lock me-2"></i> بدء التشفير والرفع'; 
    }
};

/**
 * 🛡️ ترقية الحذف (Action-Based MFA)
 * الآن يتم طلب التوكن للمصادقة وتمريره للعمليات الحساسة في الـ API.
 */
window.deleteRecord = async function(type, id) {
    const confirm = await Swal.fire({ 
        title: 'متأكد؟', text: "لا تراجع عن عملية الحذف، وستسجل العملية في الرقابة!", 
        icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', 
        confirmButtonText: 'احذف', cancelButtonText: 'إلغاء' 
    });
    
    if(!confirm.isConfirmed) return;

    // 🛡️ WebAuthn / PIN Security Check (Action-Based MFA)
    const secCheck = await Swal.fire({
        title: 'مصادقة أمنية مطلوبة',
        text: 'يرجى إدخال الرمز السري الخاص بك (PIN) أو استخدام البصمة لتأكيد الحذف الجذري.',
        input: 'password',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        showCancelButton: true,
        confirmButtonText: '<i class="fas fa-fingerprint"></i> تأكيد الهوية',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: '#0B132B',
        preConfirm: (pin) => {
            if (!pin) Swal.showValidationMessage('يجب إدخال الرمز السري أو المصادقة لتأكيد العملية');
            return pin;
        }
    });

    if(!secCheck.isConfirmed) return;
    const actionToken = secCheck.value;
    
    try {
        let res;
        // تمرير الـ actionToken بنجاح لدوال الـ API لتتوافق مع تعديلات api.js و worker.js
        if (type === 'update') res = await API.deleteUpdate(id, actionToken);
        if (type === 'installment') res = await API.deleteInstallment(id, currentCaseId, actionToken);
        if (type === 'expense') res = await API.deleteExpense(id, actionToken);
        if (type === 'file') res = await API.deleteFile(id, actionToken);
        
        if (res && !res.error) { 
            showAlert(res.offline ? 'تم حفظ الحذف محلياً لتنفذ لاحقاً' : 'تم الحذف وتوثيقه أمنياً', res.offline ? 'warning' : 'success'); 
            await loadCaseFullDetails(); 
        } else {
            showAlert(res?.error || 'خطأ أو لا تملك الصلاحية الإدارية.', 'error');
        }
    } catch(e) { 
        showAlert('فشل الاتصال بخادم الحذف.', 'error'); 
    }
};

// ============================================================================
// [7] الذكاء الاصطناعي: الاستخلاص وتوليد المسودات والسوابق الذكية (AI & RAG Engine)
// ============================================================================

window.previewAIExtraction = async function() {
    const details = document.getElementById('upd_details').value;
    if(!details) return showAlert('الرجاء كتابة تفاصيل الإجراء أو الإملاء الصوتي أولاً', 'warning');
    
    const btn = document.getElementById('btn_ai_extract');
    if(btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> جاري التحليل العميق واستخلاص المعطيات...'; }
    
    try {
        const ex = await API.extractLegalData(details);
        
        if(ex && !ex.error) {
            const facts = ex.lawsuit_facts || ex["الوقائع"] || ex["وقائع"] || '';
            const legal = ex.legal_basis || ex["الأسانيد"] || ex["السند القانوني"] || '';
            const reqs = ex.final_requests || ex["الطلبات"] || ex["الطلبات الختامية"] || '';
            const nextDate = ex.next_hearing_date || ex["الجلسة القادمة"] || ex["تاريخ الجلسة"] || '';

            if(nextDate && document.getElementById('upd_next_hearing')) {
                document.getElementById('upd_next_hearing').value = nextDate;
            }

            const cleanJson = {
                lawsuit_facts: Array.isArray(facts) ? facts.join('\n') : facts,
                legal_basis: Array.isArray(legal) ? legal.join('\n') : legal,
                final_requests: Array.isArray(reqs) ? reqs.join('\n') : reqs
            };

            if (cleanJson.lawsuit_facts || cleanJson.legal_basis) {
                document.getElementById('upd_extracted_json').value = JSON.stringify(cleanJson);
                showAlert('تم استخلاص الوقائع والأسانيد بنجاح لتغذية الذاكرة التراكمية', 'success');
            } else {
                showAlert('تم التحليل، لكن لم يتم العثور على وقائع قانونية واضحة للاستخلاص.', 'warning');
            }
        } else {
            throw new Error('فشل التحليل الذكي');
        }
    } catch(e) { 
        showAlert('فشل محرك الذكاء الاصطناعي بسبب الضغط أو الانقطاع', 'error'); 
    } finally {
        if(btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-robot me-2" style="color: var(--gold-luxury);"></i> تحليل ذكي واستخراج تواريخ (AI)'; }
    }
};

window.viewAiSummary = function(fileId) {
    const file = window.firmFiles ? window.firmFiles.find(f => f.id === fileId) : [];
    if (!file) return;

    const titleEl = document.getElementById('ai_doc_title');
    const summaryEl = document.getElementById('ai_doc_summary');
    if(titleEl) titleEl.innerHTML = `<i class="fas fa-file-alt me-2 text-info"></i> قراءة المستند: ${escapeHTML(file.file_name)}`;
    openModal('aiDocModal');

    if (file.is_analyzed && file.ai_summary) {
        if(summaryEl) summaryEl.innerHTML = `<div class="alert alert-success border-0 shadow-sm small fw-bold"><i class="fas fa-check-circle me-2"></i> تمت قراءة هذا المستند وتحليله آلياً بنجاح.</div><div dir="ltr" class="text-start font-monospace bg-light p-3 rounded border"><code>${escapeHTML(file.ai_summary)}</code></div>`;
    } else {
        const isR2 = file.file_url && !file.file_url.startsWith('http');
        const downloadAction = isR2 
            ? `API.downloadR2File('${escapeHTML(file.file_url)}', '${escapeHTML(file.file_name)}')`
            : `window.open('${escapeHTML(file.drive_file_id || file.file_url)}', '_blank')`;
            
        if(summaryEl) summaryEl.innerHTML = `
            <div class="text-center py-5">
                <i class="fas fa-info-circle fa-4x text-warning mb-4"></i>
                <h5 class="fw-bold text-navy">لم يتم استخراج النص آلياً من هذا المستند!</h5>
                <p class="text-muted fw-bold">نظراً لكونه ملفاً معقداً، يمكنك تحميله واستخدام (المساعد الذكي - Chat AI) لتلخيصه وسؤاله بحرية تامة.</p>
                <button class="btn btn-gold fw-bold px-5 py-3 mt-3 shadow-sm rounded-pill" onclick="${downloadAction}"><i class="fas fa-download me-2"></i> تحميل المستند الآن</button>
            </div>
        `;
    }
};

// 🚀 التوليد الآلي للوائح بناءً على المحرك المحدث في الوركر (RAG Auto-Drafting)
window.openAiDraftModal = function() { 
    document.getElementById('ai_draft_notes').value = ''; 
    document.getElementById('ai_draft_result_container').classList.add('d-none'); 
    document.getElementById('ai_draft_result').value = ''; 
    openModal('aiDraftModal'); 
};

window.generateAiDraft = async function() {
    const btn = document.getElementById('btn_generate_draft');
    const draftType = document.getElementById('ai_draft_type').value;
    const extraNotes = document.getElementById('ai_draft_notes').value;
    const client = window.firmClients.find(cl => cl.id === caseObj.client_id);
    const clientName = client ? client.full_name : 'الموكل المجهول';
    
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> العقل المدبر يصيغ اللائحة...'; 
    btn.disabled = true; 
    document.getElementById('ai_draft_result_container').classList.add('d-none');
    
    const caseFacts = caseObj.lawsuit_facts || 'الوقائع غير مكتملة، يرجى كتابة بعض النقاط ليعتمد عليها الذكاء الاصطناعي.';
    const similarCasesContext = extraNotes ? `ملاحظات إضافية وتوجيهات من المحامي: ${extraNotes}` : 'لا توجد توجيهات إضافية.';
    
    const promptText = `نوع المستند المطلوب صياغته: ${draftType}\nاسم المدعي: ${clientName} | اسم المدعى عليه: ${caseObj.opponent_name || 'غير محدد'}\nالمحكمة: ${caseObj.current_court || 'محكمة الاختصاص'} | قيمة المطالبة: ${caseObj.claim_amount ? caseObj.claim_amount + ' دينار أردني' : 'غير محددة'}\nالأسانيد القانونية المقترحة: ${caseObj.legal_basis || 'استناداً للقوانين الأردنية ذات الصلة.'}\nالطلبات الختامية: ${Array.isArray(caseObj.final_requests) && caseObj.final_requests.length > 0 ? caseObj.final_requests.join('، ') : 'تضمين الخصم الرسوم والمصاريف وأتعاب المحاماة والفائدة القانونية.'}\n${similarCasesContext}`;
    
    try {
        const res = await API.generateLegalDraft(caseFacts, promptText);
        if (res && res.draft) {
            document.getElementById('ai_draft_result').value = res.draft; 
            document.getElementById('ai_draft_result_container').classList.remove('d-none'); 
            showAlert('تم توليد المسودة القانونية بنجاح!', 'success');
        } else throw new Error('لم نتلقَ استجابة نصية من المحرك اللغوي');
    } catch (e) { 
        showAlert('فشل الاتصال بمحرك الصياغة الذكي.', 'error'); 
    } finally { 
        btn.innerHTML = '<i class="fas fa-cogs me-2"></i> توليد المسودة الآن'; 
        btn.disabled = false; 
    }
};

// 🚀 الميزة الماسية: الرابط الذكي للسوابق القضائية (AI Cross-Case Linker)
window.consultSmartArchive = async function() {
    if (!caseObj || !caseObj.lawsuit_facts || caseObj.lawsuit_facts.trim().length < 20) {
        showAlert('يرجى كتابة "الوقائع" بشكل مفصل أولاً في قسم (تعديل بيانات القضية) ليتمكن المحرك من البحث والمطابقة دلالياً.', 'warning');
        return;
    }

    const btn = document.getElementById('btn_consult_archive');
    const loading = document.getElementById('cross-case-loading');
    const resultsContainer = document.getElementById('cross-case-results');
    const recommendationEl = document.getElementById('cross-case-recommendation');
    const listEl = document.getElementById('cross-case-list');

    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> جاري البحث...'; }
    if (loading) loading.classList.remove('d-none');
    if (resultsContainer) resultsContainer.classList.add('d-none');

    try {
        // الاتصال بمحرك البحث الدلالي في الوركر (Vector Search)
        const res = await API.findSimilarCases(currentCaseId, caseObj.lawsuit_facts);
        
        if (res && !res.error) {
            if (recommendationEl) {
                recommendationEl.innerText = res.recommendation || 'لم يستخلص الذكاء الاصطناعي توصية استراتيجية واضحة من السوابق المتاحة.';
            }
            
            if (listEl) {
                if (res.similar_cases && res.similar_cases.length > 0) {
                    listEl.innerHTML = res.similar_cases.map(c => `
                        <div class="col-md-6">
                            <div class="bg-white p-3 rounded-3 border shadow-sm h-100 transition-hover" style="border-left: 3px solid var(--gold-luxury);">
                                <div class="d-flex justify-content-between align-items-center mb-2">
                                    <b class="text-navy font-monospace" style="font-size:0.95rem;">
                                        <i class="fas fa-folder text-primary me-1"></i> ${escapeHTML(c.case_internal_id || 'ملف سابق')}
                                    </b>
                                    <span class="badge ${c.case_outcome === 'ربح' ? 'bg-success text-success' : 'bg-secondary text-secondary'} bg-opacity-10 border">${escapeHTML(c.case_outcome || 'مغلقة')}</span>
                                </div>
                                <small class="text-muted d-block fw-bold text-truncate" title="${escapeHTML(c.legal_basis)}">
                                    <i class="fas fa-balance-scale-left me-1"></i> الأسانيد: ${escapeHTML(c.legal_basis || 'غير مسجلة')}
                                </small>
                            </div>
                        </div>
                    `).join('');
                } else {
                    listEl.innerHTML = '<div class="col-12 text-center small fw-bold text-muted border bg-light p-3 rounded-3 shadow-sm">لا توجد قضايا مطابقة بنسبة عالية في أرشيف المكتب للبحث الدلالي.</div>';
                }
            }
            
            if (resultsContainer) resultsContainer.classList.remove('d-none');
            showAlert('تم جلب السوابق والاستراتيجية بنجاح.', 'success');
        } else {
            throw new Error(res?.error || 'خطأ في محرك المطابقة.');
        }
    } catch (e) {
        showAlert(e.message, 'error');
    } finally {
        if (loading) loading.classList.add('d-none');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-search-plus me-1"></i> استشر الأرشيف الذكي'; }
    }
};

window.startDictation = function(elementId) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return showAlert('المتصفح الحالي أو الجهاز لا يدعم خدمة الإملاء الصوتي.', 'warning');
    
    try {
        const recognition = new SpeechRecognition(); 
        recognition.lang = 'ar-JO'; 
        recognition.interimResults = false;
        
        const textArea = document.getElementById(elementId); 
        const origPlaceholder = textArea.placeholder;
        
        recognition.onstart = function() { 
            textArea.placeholder = "الميكروفون يعمل.. تحدث الآن بوضوح."; 
            showAlert('الميكروفون يعمل، تفضل بالتحدث.', 'info'); 
        };
        recognition.onresult = function(e) { 
            textArea.value += (textArea.value ? ' ' : '') + e.results[0][0].transcript; 
            showAlert('تم التقاط وإدراج النص بنجاح.', 'success'); 
        };
        recognition.onerror = function(e) { 
            if(e.error === 'aborted') return; 
            showAlert('حدث خطأ في الميكروفون أو الصلاحيات.', 'danger'); 
            textArea.placeholder = origPlaceholder; 
        };
        recognition.onend = function() { textArea.placeholder = origPlaceholder; };
        
        recognition.start();
    } catch (e) { showAlert('فشل تهيئة خدمة الصوت في جهازك.', 'danger'); }
};

window.copyToClipboard = function(elementId) { 
    const el = document.getElementById(elementId); 
    el.select(); 
    el.setSelectionRange(0, 99999); 
    document.execCommand("copy"); 
    showAlert("تم نسخ النص بالكامل للذاكرة!", "success"); 
};

// ============================================================================
// [8] أدوات الطباعة ومشاركة البوابة (Printing, Invoices & QR Share)
// ============================================================================

/**
 * دالة التفقيط الذكية للعملات (تحويل الأرقام لنصوص عربية قانونية)
 */
function tafqeet(number) {
    const units = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];
    const tens = ["", "عشرة", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
    const hundreds = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];
    const thousands = ["", "ألف", "ألفان", "آلاف"];
    
    if (number === 0) return "صفر";
    const numStr = number.toString().padStart(6, '0');
    const hThous = parseInt(numStr[0]), tThous = parseInt(numStr[1]), uThous = parseInt(numStr[2]), 
          h = parseInt(numStr[3]), t = parseInt(numStr[4]), u = parseInt(numStr[5]);
          
    let thousandPart = "";
    if (hThous > 0) thousandPart += hundreds[hThous] + " و";
    if (tThous === 1 && uThous > 0) thousandPart += "أحد عشر ألفاً و"; 
    else if (tThous > 0) thousandPart += units[uThous] + " و" + tens[tThous] + " ألفاً و"; 
    else if (uThous > 2) thousandPart += units[uThous] + " آلاف و"; 
    else if (uThous === 2) thousandPart += thousands[2] + " و"; 
    else if (uThous === 1) thousandPart += thousands[1] + " و";
    
    let basicPart = "";
    if (h > 0) basicPart += hundreds[h] + " و";
    if (t === 1 && u > 0) basicPart += (u===1?"أحد":u===2?"اثنا":units[u]) + " عشر"; 
    else if (t > 0 && u > 0) basicPart += units[u] + " و" + tens[t]; 
    else if (t > 0) basicPart += tens[t]; 
    else if (u > 0) basicPart += units[u];
    
    return (thousandPart + basicPart).replace(/ و$/, "").trim();
}

window.printInvoice = function(amount, date, invoiceId) {
    document.getElementById('qr-print-container').style.display = 'none'; 
    document.getElementById('invoice-print-container').style.display = 'block';
    
    document.getElementById('print-inv-date').innerText = date; 
    document.getElementById('print-inv-case').innerText = caseObj.case_internal_id;
    
    const client = window.firmClients.find(cl => cl.id === caseObj.client_id); 
    document.getElementById('print-inv-client').innerText = client ? client.full_name : "الموكل";
    
    document.getElementById('print-inv-amount').innerText = Number(amount).toLocaleString('en-US'); 
    document.getElementById('print-inv-tafqeet').innerText = tafqeet(parseInt(amount)) + " دينار";
    
    const firmSettings = JSON.parse(localStorage.getItem('firm_settings')) || {}; 
    document.getElementById('print-firm-name').innerText = escapeHTML(firmSettings.firm_name || 'مكتب المحاماة');
    
    const qrContainer = document.getElementById("invoice-verification-qr");
    if (qrContainer && caseObj.public_token) {
        qrContainer.innerHTML = ""; 
        const pathArray = window.location.pathname.split('/'); 
        pathArray.pop(); 
        const verifyUrl = `${window.location.origin + pathArray.join('/')}/verify.html?type=receipt&id=${invoiceId}`;
        
        new QRCode(qrContainer, { text: verifyUrl, width: 90, height: 90, colorDark : "#000", colorLight : "#fff", correctLevel : QRCode.CorrectLevel.L });
    }
    
    window.print();
};

window.printQRCode = function() {
    if(!caseObj.public_token) { showAlert('لا يوجد رمز أمني (Token) لهذا الملف.', 'warning'); return; }
    document.getElementById('invoice-print-container').style.display = 'none'; 
    document.getElementById('qr-print-container').style.display = 'block';
    
    document.getElementById('print-qr-casenum').innerText = `ملف رقم: ${caseObj.case_internal_id}`;
    
    const qrContainer = document.getElementById("qrcode"); 
    qrContainer.innerHTML = ""; 
    const pathArray = window.location.pathname.split('/'); pathArray.pop(); 
    const deepLink = `${window.location.origin + pathArray.join('/')}/client.html?token=${caseObj.public_token}`;
    
    new QRCode(qrContainer, { text: deepLink, width: 250, height: 250, colorDark : "#0B132B", colorLight : "#fff", correctLevel : QRCode.CorrectLevel.H });
    window.print();
};

let currentShareLink = '';

// الإصلاح الأمني لجدار AppCore
window.openShareModal = function() {
    if(!caseObj.public_token) { showAlert('عذراً، هذا الملف لا يملك رمز وصول عام.', 'error'); return; }
    
    const pathArray = window.location.pathname.split('/'); 
    pathArray.pop(); 
    currentShareLink = `${window.location.origin + pathArray.join('/')}/client.html?token=${caseObj.public_token}`;
    
    document.getElementById('share_link_input').value = currentShareLink; 
    document.getElementById('share_pin_input').value = caseObj.access_pin || 'لا يوجد';
    
    const qrContainer = document.getElementById('share-qrcode'); 
    qrContainer.innerHTML = '';
    new QRCode(qrContainer, { text: currentShareLink, width: 180, height: 180, colorDark: "#1C2541" });
    
    openModal('shareModal');
};

window.copyShareLinkApp = function() { 
    navigator.clipboard.writeText(`تحية طيبة،\nرابط متابعة ملف قضيتك في المكتب:\n${currentShareLink}\n\nرمز الدخول السري (PIN): ${document.getElementById('share_pin_input').value}\n\nيرجى عدم مشاركة هذا الرمز مع أي شخص.`).then(() => showAlert('تم نسخ رسالة المشاركة للموكل بنجاح!', 'success')); 
};

window.sendShareViaWhatsApp = function() { 
    const textMsg = `تحية طيبة،\nرابط متابعة ملف قضيتك في المكتب:\n${currentShareLink}\n\nرمز الدخول السري (PIN): ${document.getElementById('share_pin_input').value}\n\nيرجى عدم مشاركة هذا الرمز مع أي شخص.`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(textMsg)}`, '_blank'); 
};

window.sendWhatsAppReminder = function(amount, dueDate) {
    const client = window.firmClients.find(cl => cl.id === caseObj.client_id);
    if (!client || !client.phone) { showAlert('لا يوجد رقم هاتف مسجل لهذا الموكل للمراسلة.', 'warning'); return; }
    
    let phoneStr = String(client.phone); 
    if (phoneStr.startsWith('0')) phoneStr = '962' + phoneStr.substring(1); 
    
    const text = `تحية طيبة السيد/ة ${client.full_name} المحترم،\nنود تذكيركم بلطف باستحقاق دفعة مالية بقيمة *${amount} دينار*، بتاريخ (${dueDate}).\n\nمع الشكر والتقدير، إدارة المكتب.`;
    window.open(`https://wa.me/${phoneStr}?text=${encodeURIComponent(text)}`, '_blank');
};

// ============================================================================
// [9] توجيهات الواجهة (Navigators)
// ============================================================================
window.goToClientProfile = function() { 
    if (caseObj && caseObj.client_id) { 
        localStorage.setItem('current_client_id', caseObj.client_id); 
        window.location.href = 'client-details.html'; 
    } 
};

// ============================================================================
// [10] النوافذ المساعدة (Modals & UI Helpers Fallback)
// ============================================================================
window.openModal = function(id) { 
    if (window.AppCore && typeof window.AppCore.openModal === 'function') {
        window.AppCore.openModal(id);
    } else {
        const el = document.getElementById(id); 
        if(el) { const m = new bootstrap.Modal(el); m.show(); } 
    }
};

window.closeModal = function(id) { 
    if (window.AppCore && typeof window.AppCore.closeModal === 'function') {
        window.AppCore.closeModal(id);
    } else {
        const el = document.getElementById(id); 
        if(el) { 
            const m = bootstrap.Modal.getInstance(el); 
            if(m) m.hide(); 
            document.querySelectorAll('.modal-backdrop').forEach(b => b.remove()); 
            document.body.classList.remove('modal-open'); 
            document.body.style.overflow = ''; 
            document.body.style.paddingRight = ''; 
        } 
    }
};

window.showAlert = function(message, type = 'success') { 
    if (window.AppCore && typeof window.AppCore.showAlert === 'function') {
        window.AppCore.showAlert(message, type);
    } else if (typeof Swal !== 'undefined') { 
        Swal.fire({ toast: true, position: 'top-end', icon: type === 'danger' ? 'error' : (type === 'info' ? 'info' : type), title: escapeHTML(message), showConfirmButton: false, timer: 3000, timerProgressBar: true }); 
    } else { 
        alert(message); 
    } 
};