// js/case-details.js - محرك تفاصيل القضية (النسخة السحابية المحدثة R2 & AI Auto-Draft Edition)
// التحديثات: تكامل تام مع Cloudflare R2، المزامنة دون اتصال، والتوليد الآلي للوائح، ومعالجة PDF/الصور محلياً (AIHandler).

let currentCaseId = localStorage.getItem('current_case_id') || new URLSearchParams(window.location.search).get('id');
let caseObj = null;

// =================================================================
// 🛠️ الدوال الأساسية للواجهة والتنبيهات
// =================================================================

const escapeHTML = (str) => {
    if (str === null || str === undefined) return '';
    return str.toString().replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
};

function showAlert(message, type = 'info') { 
    if (typeof Swal !== 'undefined') {
        Swal.fire({ toast: true, position: 'top-end', icon: type === 'danger' ? 'error' : (type === 'info' ? 'info' : type), title: escapeHTML(message), showConfirmButton: false, timer: 3000, timerProgressBar: true }); 
    } else { 
        alert(message); 
    }
}

window.showToast = function(msg, type) { showAlert(msg, type === 'error' ? 'danger' : type); };

function openModal(id) { 
    const el = document.getElementById(id); 
    if(el) { 
        const m = new bootstrap.Modal(el); m.show(); 
    } 
}

function closeModal(id) { 
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

function applyJordanTimeHackLocal(dateString) {
    if (!dateString || dateString.trim() === '') return null;
    try {
        let d = new Date(dateString);
        d.setHours(d.getHours() + 3);
        return d.toISOString();
    } catch(e) { return null; }
}

// =================================================================
// ⚙️ التهيئة وجلب البيانات
// =================================================================

window.onload = async () => {
    applyFirmSettings(); 
    if (!currentCaseId) { window.location.href = 'app.html'; return; }
    await loadCaseFullDetails();
};

function applyFirmSettings() {
    const settings = JSON.parse(localStorage.getItem('firm_settings') || '{}');
    if (!settings) return;
    const root = document.documentElement;
    if (settings.primary_color) root.style.setProperty('--navy', settings.primary_color);
    if (settings.accent_color) root.style.setProperty('--accent', settings.accent_color);
}

window.manualSync = async () => {
    const btn = document.getElementById('btn_sync');
    if(btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-sync fa-spin"></i>'; }
    await loadCaseFullDetails();
    showAlert('تمت مزامنة البيانات بنجاح', 'success');
    if(btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync"></i>'; }
};

function goBack() { window.location.href = 'app.html'; }

async function loadCaseFullDetails() {
    try {
        const [allCasesReq, updatesReq, installmentsReq, expensesReq, filesReq, staffReq, clientsReq] = await Promise.all([
            API.getCases(), API.getUpdates(currentCaseId), API.getInstallments(currentCaseId),
            API.getExpenses(currentCaseId), API.getFiles(currentCaseId), API.getStaff(), API.getClients()
        ]);
        
        window.firmStaff = Array.isArray(staffReq) ? staffReq : [];
        window.firmCases = Array.isArray(allCasesReq) ? allCasesReq : [];
        window.firmClients = Array.isArray(clientsReq) ? clientsReq : [];
        window.firmFiles = Array.isArray(filesReq) ? filesReq : [];
        
        caseObj = window.firmCases.find(c => c.id == currentCaseId);
        if (!caseObj) { window.location.href = 'app.html'; return; }

        renderHeaderAndSummary();
        renderTimeline(Array.isArray(updatesReq) ? updatesReq : []);
        renderPayments(Array.isArray(installmentsReq) ? installmentsReq : []);
        renderExpenses(Array.isArray(expensesReq) ? expensesReq : []);
        renderFiles(Array.isArray(filesReq) ? filesReq : []);
        calculateFinances(Array.isArray(installmentsReq) ? installmentsReq : [], Array.isArray(expensesReq) ? expensesReq : []);
        
        if(document.getElementById('secret_notes_input')) document.getElementById('secret_notes_input').value = caseObj.secret_notes || '';
        await loadAuditTrail();
    } catch (error) { 
        console.error("Load Error:", error);
        showAlert('حدث خطأ أثناء جلب البيانات أو تأكد من الاتصال بالإنترنت', 'warning'); 
    }
}

// =================================================================
// 📊 عرض تفاصيل القضية والملخصات
// =================================================================

function renderHeaderAndSummary() {
    document.getElementById('case-title').innerText = `${escapeHTML(caseObj.case_internal_id || 'ملف قضية')}`;
    let badgesHtml = '';
    if (caseObj.priority_level === 'عاجل جداً') badgesHtml += `<span class="badge bg-danger shadow-sm ms-1 heartbeat-animation"><i class="fas fa-fire"></i> عاجل جداً</span>`;
    else if (caseObj.priority_level === 'هام') badgesHtml += `<span class="badge bg-warning text-dark shadow-sm ms-1"><i class="fas fa-exclamation-circle"></i> هام</span>`;
    if (caseObj.confidentiality_level === 'سري') badgesHtml += `<span class="badge bg-dark shadow-sm ms-1"><i class="fas fa-lock text-warning"></i> سري جداً</span>`;
    document.getElementById('case-badges').innerHTML = badgesHtml;

    const client = window.firmClients.find(cl => cl.id === caseObj.client_id);
    document.getElementById('case-client-name').innerHTML = `<i class="fas fa-user-tie me-2 text-info"></i> ${client ? escapeHTML(client.full_name) : "موكل غير محدد"}`;

    const lawyersContainer = document.getElementById('assigned-lawyers-container');
    if (lawyersContainer && caseObj.assigned_lawyer_id && Array.isArray(caseObj.assigned_lawyer_id) && window.firmStaff) {
        lawyersContainer.innerHTML = caseObj.assigned_lawyer_id.map(id => {
            const staff = window.firmStaff.find(s => s.id === id);
            return staff ? `<span class="badge bg-soft-primary text-primary border border-primary me-1 mb-1 shadow-sm"><i class="fas fa-user-tie"></i> ${escapeHTML(staff.full_name.split(' ')[0])}</span>` : '';
        }).join('');
    } else if (lawyersContainer) {
        lawyersContainer.innerHTML = `<span class="badge bg-light text-muted border">لا يوجد إسناد محدد</span>`;
    }
    
    const prob = caseObj.success_probability || 0;
    const probBar = document.getElementById('det-success-bar');
    const probText = document.getElementById('det-success-text');
    if(probBar && probText) {
        probBar.style.width = prob + '%'; probText.innerText = prob + '%';
        if(prob < 40) { probBar.className = 'progress-bar bg-danger progress-bar-striped progress-bar-animated'; probText.className = 'fw-bold small text-danger'; }
        else if(prob < 75) { probBar.className = 'progress-bar bg-warning progress-bar-striped progress-bar-animated'; probText.className = 'fw-bold small text-warning'; }
        else { probBar.className = 'progress-bar bg-success progress-bar-striped progress-bar-animated'; probText.className = 'fw-bold small text-success'; }
    }

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
    
    const execNumEl = document.getElementById('det-execution-num');
    if(execNumEl) {
        execNumEl.innerText = escapeHTML(caseObj.execution_file_number || "لا يوجد");
        execNumEl.className = caseObj.execution_file_number ? 'data-value text-success bg-soft-success px-2 rounded' : 'data-value text-muted';
    }
    const tagsEl = document.getElementById('det-tags');
    if(tagsEl) {
        if(Array.isArray(caseObj.case_tags) && caseObj.case_tags.length > 0) {
            tagsEl.innerHTML = caseObj.case_tags.map(t => `<span class="badge bg-light text-dark border shadow-sm"><i class="fas fa-tag text-info"></i> ${escapeHTML(t)}</span>`).join('');
        } else {
            tagsEl.innerHTML = '<span class="text-muted small">لا توجد تصنيفات</span>';
        }
    }
    
    if(document.getElementById('det-co-plaintiffs')) document.getElementById('det-co-plaintiffs').innerText = Array.isArray(caseObj.co_plaintiffs) && caseObj.co_plaintiffs.length > 0 ? caseObj.co_plaintiffs.join('، ') : '--';
    if(document.getElementById('det-co-defendants')) document.getElementById('det-co-defendants').innerText = Array.isArray(caseObj.co_defendants) && caseObj.co_defendants.length > 0 ? caseObj.co_defendants.join('، ') : '--';
    if(document.getElementById('det-experts')) document.getElementById('det-experts').innerText = Array.isArray(caseObj.experts_and_witnesses) && caseObj.experts_and_witnesses.length > 0 ? caseObj.experts_and_witnesses.join('، ') : '--';
    if(document.getElementById('det-poa-details')) document.getElementById('det-poa-details').innerText = escapeHTML(caseObj.poa_details || "--");
    
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
        if(caseObj.case_outcome === 'ربح') outcomeEl.className = 'badge bg-success';
        else if(caseObj.case_outcome === 'خسارة' || caseObj.case_outcome === 'رد الدعوى') outcomeEl.className = 'badge bg-danger';
        else outcomeEl.className = 'badge bg-secondary';
    }
    
    if(document.getElementById('det-closure-reason')) document.getElementById('det-closure-reason').innerText = escapeHTML(caseObj.closure_reason || "--");

    if(document.getElementById('det-manual-facts')) document.getElementById('det-manual-facts').innerText = escapeHTML(caseObj.lawsuit_facts || "--");
    if(document.getElementById('det-manual-legal')) document.getElementById('det-manual-legal').innerText = escapeHTML(caseObj.legal_basis || "--");
    if(document.getElementById('det-manual-reqs')) document.getElementById('det-manual-reqs').innerText = Array.isArray(caseObj.final_requests) && caseObj.final_requests.length > 0 ? caseObj.final_requests.join('\n') : '--';

    if(document.getElementById('det-police')) document.getElementById('det-police').innerText = escapeHTML(caseObj.police_station_ref || "--");
    if(document.getElementById('det-prosecution')) document.getElementById('det-prosecution').innerText = escapeHTML(caseObj.prosecution_ref || "--");
    if(document.getElementById('det-archive')) document.getElementById('det-archive').innerText = escapeHTML(caseObj.physical_archive_location || "--");
    if(document.getElementById('det-clerk')) document.getElementById('det-clerk').innerText = escapeHTML(caseObj.court_clerk || "--");
    
    if(document.getElementById('det-ai-summary')) document.getElementById('det-ai-summary').innerText = escapeHTML(caseObj.ai_cumulative_summary || "لا يوجد ملخص تراكمي بعد.");
    
    if(caseObj.ai_entities) {
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

    const deadlineEl = document.getElementById('det-deadline');
    let targetDate = caseObj.deadline_date;
    if (targetDate) {
        deadlineEl.innerText = escapeHTML(targetDate);
        const daysLeft = Math.ceil((new Date(targetDate) - new Date()) / 86400000);
        if(daysLeft <= 7 && daysLeft > 0) deadlineEl.className = "text-danger fw-bold heartbeat-animation fs-6";
        else if (daysLeft < 0) deadlineEl.innerHTML = `<span class="text-dark"><i class="fas fa-times"></i> منتهي</span>`;
        else deadlineEl.className = "fs-6 text-dark";
    } else { deadlineEl.innerText = "غير محدد"; }

    const statusEl = document.getElementById('case-status');
    statusEl.innerText = escapeHTML(caseObj.status || "نشطة");
    statusEl.className = `badge fs-6 ${caseObj.status === 'نشطة' ? 'bg-success' : (caseObj.status === 'مكتملة' ? 'bg-dark' : 'bg-secondary')}`;
    document.getElementById('case-pin').innerHTML = `<i class="fas fa-key text-warning"></i> PIN: ${escapeHTML(caseObj.access_pin || 'غير محدد')}`;
}

// =================================================================
// 📝 التعديل والملاحظات السرية
// =================================================================

async function saveSecretNotes() {
    const notes = document.getElementById('secret_notes_input').value;
    const res = await API.updateCase(currentCaseId, { secret_notes: notes });
    if (res && !res.error) showAlert(res.offline ? 'تم الحفظ محلياً' : 'تم حفظ الملاحظات السرية', res.offline ? 'warning' : 'success');
}

function openEditModal() {
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
    
    const lawyerSelect = document.getElementById('edit_assigned_lawyer');
    if(lawyerSelect && window.firmStaff) {
        lawyerSelect.innerHTML = window.firmStaff.map(s => {
            const isSelected = caseObj.assigned_lawyer_id && caseObj.assigned_lawyer_id.includes(s.id) ? 'selected' : '';
            return `<option value="${s.id}" ${isSelected}>${escapeHTML(s.full_name)}</option>`;
        }).join('');
        if (typeof Choices !== 'undefined') {
            if (window.lawyerChoices) window.lawyerChoices.destroy();
            window.lawyerChoices = new Choices(lawyerSelect, { removeItemButton: true, searchEnabled: true, placeholderValue: 'اختر المحامين...' });
        }
    }
    
    const parentCaseSelect = document.getElementById('edit_parent_case_id');
    if(parentCaseSelect && window.firmCases) {
        parentCaseSelect.innerHTML = '<option value="">لا يوجد (قضية رئيسية)</option>' + window.firmCases.filter(c => c.id !== currentCaseId).map(c => `<option value="${c.id}">${escapeHTML(c.case_internal_id)}</option>`).join('');
        if (caseObj.parent_case_id) parentCaseSelect.value = caseObj.parent_case_id;
    }
    openModal('editCaseModal');
}

async function updateCaseDetails(event) {
    event.preventDefault();
    const btn = document.getElementById('btn_save_case_edit');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> جاري الحفظ...';

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
            showAlert(res.offline ? 'مخزن محلياً' : 'تم التحديث بنجاح', res.offline ? 'warning' : 'success'); 
            await loadCaseFullDetails(); 
        } else {
            throw new Error(res?.error || 'خطأ في التحديث');
        }
    } catch (error) {
        showAlert('فشل التحديث: ' + error.message, 'error');
    } finally {
        btn.disabled = false; btn.innerHTML = '<i class="fas fa-save me-1"></i> حفظ التعديلات الشاملة';
    }
}

// =================================================================
// 🤖 تحديث الإجراءات والاستخراج الذكي (ومرفقات R2)
// =================================================================

function openUpdateModal() { 
    if(document.getElementById('upd_extracted_json')) document.getElementById('upd_extracted_json').value = ''; 
    openModal('updateModal'); 
}

async function previewAIExtraction() {
    const details = document.getElementById('upd_details').value;
    if(!details) return showAlert('الرجاء كتابة النص أولاً', 'warning');
    
    const btn = document.getElementById('btn_ai_extract');
    if(btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> التحليل العميق...'; }
    
    try {
        const ex = await API.extractLegalData(details);
        
        if(ex && !ex.error) {
            const facts = ex.lawsuit_facts || ex["الوقائع"] || ex["وقائع"] || ex["وقائع الدعوى"] || '';
            const legal = ex.legal_basis || ex["الأسانيد"] || ex["السند القانوني"] || ex["الاسانيد"] || '';
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
                showAlert('تم استخلاص الوقائع والأسانيد بنجاح', 'success');
            } else {
                showAlert('تم التحليل، لكن لم نجد وقائع واضحة للاستخلاص.', 'warning');
            }
        } else {
            throw new Error('فشل التحليل');
        }
    } catch(e) { 
        showAlert('فشل محرك الذكاء الاصطناعي', 'error'); 
    }
    
    if(btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-robot"></i> استخلاص البيانات'; }
}

async function saveUpdate(event) {
    event.preventDefault();
    const btn = document.getElementById('btn_save_update');
    const details = document.getElementById('upd_details').value;
    const fileInput = document.getElementById('upd_attachment_input');
    const hasFile = fileInput && fileInput.files.length > 0;
    let finalAttachmentUrl = null;

    if (hasFile) {
        if (!navigator.onLine) { showAlert('لا يمكن رفع المرفقات السحابية بلا إنترنت.', 'warning'); return; }
        btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> رفع آمن...';
        try {
            // 🚀 الرفع مباشرة عبر Cloudflare R2
            const r2Res = await API.uploadFileToR2(fileInput.files[0], caseObj.client_id, caseObj.id);
            if(r2Res && r2Res.r2_key) finalAttachmentUrl = r2Res.r2_key;
        } catch(e) { 
            showAlert('فشل الرفع السحابي', 'error'); btn.disabled = false; btn.innerHTML = '<i class="fas fa-save me-1"></i> إضافة التحديث'; return; 
        }
    } else {
        closeModal('updateModal'); showAlert('تمت إضافة الواقعة', 'success');
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
                    ai_cumulative_summary: (caseObj.ai_cumulative_summary ? caseObj.ai_cumulative_summary + "\n" : "") + (extractedData.lawsuit_facts || details).substring(0,100) 
                });
            }
            if (hasFile) { closeModal('updateModal'); showAlert(res.offline ? 'حفظ محلي' : 'تمت الإضافة', res.offline ? 'warning' : 'success'); }
            document.getElementById('updateForm').reset(); await loadCaseFullDetails(); 
        } else throw new Error(res?.error || 'حدث خطأ');
    } catch(err) { showAlert(err.message, 'error'); } finally { if (hasFile) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save me-1"></i> إضافة التحديث'; } }
}

function renderTimeline(updates) {
    const container = document.getElementById('timeline-container');
    if (!updates || updates.length === 0) { container.innerHTML = '<div class="text-center p-4 text-muted small bg-white rounded border shadow-sm">لا يوجد وقائع.</div>'; return; }
    container.innerHTML = updates.map(u => {
        let attachHtml = '';
        if (u.attachment_url) {
            const isR2 = !u.attachment_url.startsWith('http');
            if (isR2) {
                attachHtml = `<button class="btn badge bg-soft-primary text-primary mt-2 border border-primary text-decoration-none shadow-sm p-1 px-2" onclick="API.downloadR2File('${escapeHTML(u.attachment_url)}')"><i class="fas fa-lock"></i> تحميل المرفق المشفر</button>`;
            } else {
                attachHtml = `<a href="${escapeHTML(u.attachment_url)}" target="_blank" class="badge bg-soft-primary text-primary mt-2 border border-primary text-decoration-none shadow-sm p-1 px-2"><i class="fas fa-paperclip"></i> المرفق</a>`;
            }
        }
        return `<div class="timeline-item mb-3"><div class="card-custom p-3 shadow-sm bg-white border-end border-4 border-navy position-relative"><button class="btn btn-sm text-danger position-absolute top-0 end-0 mt-2 me-2" onclick="deleteRecord('update', '${u.id}')"><i class="fas fa-trash"></i></button><small class="text-primary fw-bold">${new Date(u.created_at).toLocaleDateString('ar-EG')}</small><h6 class="fw-bold text-navy mt-1">${escapeHTML(u.update_title)}</h6><p class="mb-0 small">${escapeHTML(u.update_details)}</p>${u.hearing_date ? `<small class="d-block mt-2 text-muted"><i class="fas fa-calendar-check text-success"></i> تاريخ الجلسة: ${escapeHTML(u.hearing_date)}</small>` : ''}${attachHtml}</div></div>`;
    }).join('');
}

// =================================================================
// 💰 المالية والملفات وسجل الرقابة
// =================================================================

async function loadAuditTrail() {
    const container = document.getElementById('audit-container');
    if(!container) return;
    try {
        const history = await API.getHistory(currentCaseId);
        if(!history || history.length === 0) { container.innerHTML = '<div class="alert alert-light border text-center small text-muted mb-0">لا حركات.</div>'; return; }
        container.innerHTML = history.map(h => {
            const actionMap = { 'CREATE': { color: 'success', ar: 'إنشاء' }, 'UPDATE': { color: 'warning', ar: 'تعديل' }, 'DELETE': { color: 'danger', ar: 'حذف' } };
            const action = actionMap[h.action_type] || { color: 'secondary', ar: h.action_type };
            return `<div class="border-start border-4 border-${action.color} ps-3 mb-3 pb-2 border-bottom"><small class="text-muted d-block mb-1"><i class="far fa-clock"></i> ${new Date(h.created_at).toLocaleString('ar-EG')}</small><span class="badge bg-${action.color} mb-1">${action.ar}</span><p class="mb-0 small fw-bold text-dark">تحديث السجل.</p></div>`;
        }).join('');
    } catch(e) { container.innerHTML = '<div class="text-danger small">خطأ بالرقابة.</div>'; }
}

function calculateFinances(installments, expenses) {
    const totalPaid = installments.filter(i => i.status === 'مدفوعة').reduce((sum, i) => sum + Number(i.amount), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const agreedFees = Number(caseObj.total_agreed_fees) || 0;
    const courtFees = Number(caseObj.court_fees_paid) || 0;
    const courtDeposits = Number(caseObj.court_deposits) || 0;
    const claimAmount = Number(caseObj.claim_amount) || 0;
    const clientRemaining = (agreedFees + totalExpenses + courtFees) - (totalPaid + courtDeposits);

    if(document.getElementById('det-claim-amount')) document.getElementById('det-claim-amount').innerText = claimAmount.toLocaleString() + ' د.أ';
    document.getElementById('sum-agreed').innerText = agreedFees.toLocaleString();
    document.getElementById('sum-paid').innerText = totalPaid.toLocaleString();
    document.getElementById('sum-expenses').innerText = totalExpenses.toLocaleString();
    if(document.getElementById('sum-court-fees')) document.getElementById('sum-court-fees').innerText = courtFees.toLocaleString() + ' د.أ';
    if(document.getElementById('sum-court-deposits')) document.getElementById('sum-court-deposits').innerText = courtDeposits.toLocaleString() + ' د.أ';
    
    const netEl = document.getElementById('sum-net');
    if(netEl) { netEl.innerText = clientRemaining.toLocaleString() + ' د.أ'; netEl.className = clientRemaining > 0 ? 'text-danger fw-bold fs-5' : 'text-success fw-bold fs-5'; }

    const progressEl = document.getElementById('fin_progress');
    if(progressEl) {
        let progressPct = agreedFees > 0 ? Math.round((totalPaid / agreedFees) * 100) : 0;
        if(progressPct > 100) progressPct = 100;
        progressEl.style.width = `${progressPct}%`;
        progressEl.innerText = `${progressPct}%`;
        progressEl.className = `progress-bar ${progressPct === 100 ? 'bg-success' : (progressPct > 50 ? 'bg-primary' : 'bg-warning')}`;
    }
}

function renderPayments(installments) {
    const container = document.getElementById('payments-container');
    if(document.getElementById('inst-count')) document.getElementById('inst-count').innerText = installments.length;
    if (!installments || installments.length === 0) { container.innerHTML = '<div class="text-center p-3 text-muted small border bg-white rounded">لا دفعات.</div>'; return; }
    container.innerHTML = installments.map(i => {
        const isPaid = i.status === 'مدفوعة';
        const printBtn = isPaid ? `<button class="btn btn-sm btn-outline-success py-0 px-2 fw-bold ms-1" onclick="printInvoice('${escapeHTML(i.amount)}', '${escapeHTML(i.due_date || i.created_at.split('T')[0])}', '${i.id}')"><i class="fas fa-print"></i></button>` : '';
        const waBtn = !isPaid ? `<button class="btn btn-sm whatsapp-btn py-0 px-2 ms-1" onclick="sendWhatsAppReminder('${escapeHTML(i.amount)}', '${escapeHTML(i.due_date || new Date(i.created_at).toLocaleDateString('ar-EG'))}')"><i class="fab fa-whatsapp"></i></button>` : '';
        return `<div class="card-custom p-3 mb-2 d-flex justify-content-between align-items-center border-start border-4 ${isPaid ? 'border-success' : 'border-warning'} bg-white"><div><b class="fs-5 ${isPaid ? 'text-success' : 'text-dark'}">${Number(i.amount).toLocaleString()} د.أ</b><small class="d-block text-muted">تاريخ: ${escapeHTML(i.due_date || new Date(i.created_at).toLocaleDateString('ar-EG'))}</small></div><div><span class="badge ${isPaid ? 'bg-success' : 'bg-warning text-dark'}">${escapeHTML(i.status)}</span>${printBtn} ${waBtn} <button class="btn btn-sm text-danger py-0 px-2 ms-1" onclick="deleteRecord('installment', '${i.id}')"><i class="fas fa-trash"></i></button></div></div>`;
    }).join('');
}

function renderExpenses(expenses) {
    const container = document.getElementById('expenses-container');
    if(document.getElementById('exp-count')) document.getElementById('exp-count').innerText = expenses.length;
    if (!expenses || expenses.length === 0) { container.innerHTML = '<div class="text-center p-3 text-muted small border bg-white rounded">لا مصروفات.</div>'; return; }
    container.innerHTML = expenses.map(e => {
        const receiptLink = e.receipt_url ? `<a href="${escapeHTML(e.receipt_url)}" target="_blank" class="btn btn-sm btn-outline-secondary mt-1 py-0 px-2"><i class="fas fa-paperclip"></i> مرفق</a>` : '';
        return `<div class="card-custom p-3 mb-2 d-flex justify-content-between align-items-center border-start border-4 border-danger bg-white"><div><b class="fs-5 text-danger">${Number(e.amount).toLocaleString()} د.أ</b><small class="d-block text-muted">${escapeHTML(e.description)}</small>${receiptLink}</div><div><small class="text-muted d-block mb-1"><i class="fas fa-calendar-alt"></i> ${escapeHTML(e.expense_date)}</small><div class="text-end"><button class="btn btn-sm text-danger py-0 px-2 ms-1" onclick="deleteRecord('expense', '${e.id}')"><i class="fas fa-trash"></i></button></div></div></div>`;
    }).join('');
}

// 🛡️ الأرشيف المحمي لملفات R2
function renderFiles(files) {
    const container = document.getElementById('files-container');
    if (!files || files.length === 0) { container.innerHTML = '<div class="col-12 text-center p-4 text-muted small border bg-white rounded">الأرشيف فارغ.</div>'; return; }
    container.innerHTML = files.map(f => {
        const isImage = f.file_type && f.file_type.includes('image');
        const iconHtml = isImage ? `<i class="fas fa-image fs-1 text-primary mb-2"></i>` : `<i class="fas fa-file-pdf fs-1 text-danger mb-2"></i>`;
        const expiryBadge = f.expiry_date ? `<small class="d-block mt-1 text-danger" style="font-size: 0.65rem;"><i class="fas fa-clock"></i> ينتهي: ${escapeHTML(f.expiry_date)}</small>` : '';
        
        const aiButton = `<button class="btn btn-sm ${f.is_analyzed ? 'btn-info text-white' : 'btn-outline-secondary'} mt-2 w-100 fw-bold shadow-sm" onclick="viewAiSummary('${f.id}')"><i class="fas fa-robot"></i> ${f.is_analyzed ? 'عرض التلخيص' : 'تحليل ذكي'}</button>`;
        
        const isR2 = f.file_url && !f.file_url.startsWith('http');
        const viewBtn = isR2 
            ? `<button class="btn btn-sm btn-outline-primary w-100 fw-bold" onclick="API.downloadR2File('${escapeHTML(f.file_url)}', '${escapeHTML(f.file_name)}')"><i class="fas fa-lock"></i> تحميل آمن</button>`
            : `<a href="${escapeHTML(f.drive_file_id || f.file_url)}" target="_blank" class="btn btn-sm btn-outline-primary w-100 fw-bold">عرض</a>`;

        return `<div class="col-6"><div class="card-custom p-3 text-center border shadow-sm h-100 bg-white position-relative"><button class="btn btn-sm text-danger position-absolute top-0 start-0 m-1" onclick="deleteRecord('file', '${f.id}')"><i class="fas fa-trash"></i></button><span class="badge bg-light text-dark border mb-2 d-block text-truncate">${escapeHTML(f.file_category || 'مستند')}</span>${iconHtml} <h6 class="small fw-bold text-truncate mt-1 mb-0" title="${escapeHTML(f.file_name)}">${escapeHTML(f.file_name)}</h6>${expiryBadge}<div class="d-flex flex-column gap-1 mt-2">${viewBtn}${aiButton}</div></div></div>`;
    }).join('');
}

async function savePayment(event) { 
    event.preventDefault(); 
    const rawDate = document.getElementById('pay_due_date').value;
    const validDate = rawDate.trim() !== '' ? applyJordanTimeHackLocal(rawDate) : new Date().toISOString();
    
    const data = { case_id: currentCaseId, amount: Number(document.getElementById('pay_amount').value), due_date: validDate, status: document.getElementById('pay_status').value }; 
    closeModal('paymentModal'); document.getElementById('paymentForm').reset(); showAlert('تم تسجيل الدفعة', 'success'); 
    try { const res = await API.addInstallment(data); if(res && !res.error) await loadCaseFullDetails(); else throw new Error(res?.error || 'خطأ'); } catch(e) { showAlert(e.message, 'error'); }
}

async function saveExpense(event) { 
    event.preventDefault(); 
    const rawDate = document.getElementById('exp_date').value;
    const validDate = rawDate.trim() !== '' ? applyJordanTimeHackLocal(rawDate) : new Date().toISOString();
    const receipt = document.getElementById('exp_receipt_url') ? document.getElementById('exp_receipt_url').value : '';
    
    const data = { case_id: currentCaseId, amount: Number(document.getElementById('exp_amount').value), description: document.getElementById('exp_desc').value, expense_date: validDate, receipt_url: receipt.trim() !== '' ? receipt : null }; 
    closeModal('expenseModal'); document.getElementById('expenseForm').reset(); showAlert('تم تسجيل المصروف', 'success'); 
    try { const res = await API.addExpense(data); if(res && !res.error) await loadCaseFullDetails(); else throw new Error(res?.error || 'خطأ'); } catch(e) { showAlert(e.message, 'error'); }
}

// =================================================================
// 🧠 الرفع الآمن مع تفعيل العقل المدبر للفرونت إند (AIHandler)
// =================================================================
async function saveFile(event) {
    event.preventDefault();
    const fileInput = document.getElementById('file_input');
    const titleInput = document.getElementById('file_title_input').value;
    const catInput = document.getElementById('file_category_input').value;
    
    const expiryInput = document.getElementById('file_expiry_date').value;
    const validExpiry = expiryInput.trim() !== '' ? expiryInput : null;

    const btn = document.getElementById('btn_upload');
    if (!fileInput.files.length) return;
    if (!navigator.onLine) { showAlert('لا يمكن رفع الملفات السحابية بلا إنترنت.', 'warning'); return; }
    
    btn.disabled = true; 
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> أرشفة وتحليل ذكي...';
    
    try {
        const file = fileInput.files[0];

        // 1. الرفع المباشر إلى Cloudflare R2 للأرشفة (تخزين الملف الأصلي كما هو دون تلاعب لضمان سلامته القانونية)
        const r2Res = await API.uploadFileToR2(file, caseObj.client_id, caseObj.id);
        
        if(r2Res && r2Res.r2_key) {
            let aiSummaryText = null;
            let isAnalyzed = false;
            
            // 2. تمرير الملف لـ AIHandler (ضغط الصورة لتخفيف الـ Payload، أو قراءة الـ PDF محلياً بمتصفح المستخدم!)
            try {
                if (window.AIHandler) {
                    const aiProcessedData = await window.AIHandler.processFile(file);
                    
                    const token = localStorage.getItem(CONFIG.TOKEN_KEY || 'moakkil_token');
                    const baseUrl = window.API_BASE_URL || CONFIG.API_URL;
                    
                    // إرسال النتيجة المعالجة للوركر بدلاً من إرهاق السيرفر بالملف الثقيل
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
                // لا نوقف عملية الحفظ النهائي في حال وجود أي خطأ بالذكاء الاصطناعي
                showAlert('تم حفظ الملف للأرشيف، لكن واجهنا صعوبة في تحليله ذكياً.', 'warning');
            }

            // 3. حفظ سجل الملف في قاعدة البيانات مع نتائج الذكاء الاصطناعي إن وجدت
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
                showAlert('تم الحفظ والتحليل سحابياً', 'success'); 
                await loadCaseFullDetails(); 
            } else {
                throw new Error(res?.error || 'خطأ أثناء تسجيل الملف');
            }
        } else {
            throw new Error('لم يتم استلام معرف التخزين من الأرشيف السحابي R2');
        }
    } catch (err) { 
        showAlert("فشل الرفع السحابي: " + err.message, 'error'); 
    } finally { 
        btn.disabled = false; 
        btn.innerHTML = '<i class="fas fa-upload me-1"></i> بدء الرفع السحابي'; 
    }
}

window.viewAiSummary = function(fileId) {
    const file = window.firmFiles ? window.firmFiles.find(f => f.id === fileId) : caseFiles.find(f => f.id === fileId);
    if (!file) return;

    const titleEl = document.getElementById('ai_doc_title');
    const summaryEl = document.getElementById('ai_doc_summary');
    if(titleEl) titleEl.innerHTML = `<i class="fas fa-file-alt me-2"></i> ${escapeHTML(file.file_name)}`;
    openModal('aiDocModal');

    if (file.is_analyzed && file.ai_summary) {
        if(summaryEl) summaryEl.innerHTML = `<div class="alert alert-success border-0 shadow-sm small fw-bold"><i class="fas fa-check-circle me-1"></i> تم تحليل هذا المستند آلياً.</div><div dir="ltr" class="text-start"><code>${escapeHTML(file.ai_summary)}</code></div>`;
    } else {
        const isR2 = file.file_url && !file.file_url.startsWith('http');
        const downloadAction = isR2 
            ? `API.downloadR2File('${escapeHTML(file.file_url)}', '${escapeHTML(file.file_name)}')`
            : `window.open('${escapeHTML(file.drive_file_id || file.file_url)}', '_blank')`;
            
        if(summaryEl) summaryEl.innerHTML = `
            <div class="text-center py-4">
                <i class="fas fa-info-circle fa-3x text-warning mb-3"></i>
                <h6 class="fw-bold">لم يتم استخراج النص آلياً من هذا المستند.</h6>
                <p class="text-muted small">نظراً لكونه ملفاً من نوع PDF، يمكنك تحميل الملف ونسخ محتواه إلى (المساعد الذكي - Chat AI) لتلخيصه.</p>
                <button class="btn btn-primary fw-bold px-4 mt-2 shadow-sm" onclick="${downloadAction}"><i class="fas fa-download me-1"></i> تحميل المستند الآن</button>
            </div>
        `;
    }
};

async function deleteRecord(type, id) {
    const confirm = await Swal.fire({ title: 'متأكد؟', text: "لا تراجع عن الحذف!", icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'احذف', cancelButtonText: 'إلغاء' });
    if(!confirm.isConfirmed) return;
    try {
        let res;
        if (type === 'update') res = await API.deleteUpdate(id);
        if (type === 'installment') res = await API.deleteInstallment(id, currentCaseId);
        if (type === 'expense') res = await API.deleteExpense(id);
        if (type === 'file') res = await API.deleteFile(id);
        if (res && !res.error) { showAlert(res.offline ? 'حفظ الحذف محلياً' : 'تم الحذف', res.offline ? 'warning' : 'success'); await loadCaseFullDetails(); } else showAlert(res?.error || 'خطأ', 'error');
    } catch(e) { showAlert('خطأ أو لا تملك صلاحية.', 'error'); }
}

// =================================================================
// 🎤 الإملاء الصوتي وتوليد المسودات (التكامل مع محرك RAG)
// =================================================================

function startDictation(elementId) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return showAlert('المتصفح لا يدعم الإملاء الصوتي.', 'warning');
    try {
        const recognition = new SpeechRecognition(); recognition.lang = 'ar-JO'; recognition.interimResults = false;
        const textArea = document.getElementById(elementId); const origPlaceholder = textArea.placeholder;
        recognition.onstart = function() { textArea.placeholder = "تحدث الآن."; showAlert('الميكروفون يعمل', 'info'); };
        recognition.onresult = function(e) { textArea.value += (textArea.value ? ' ' : '') + e.results[0][0].transcript; showAlert('تم إدراج النص.', 'success'); };
        recognition.onerror = function(e) { if(e.error==='aborted') return; console.error(e); showAlert('خطأ بالميكروفون.', 'danger'); textArea.placeholder = origPlaceholder; };
        recognition.onend = function() { textArea.placeholder = origPlaceholder; };
        recognition.start();
    } catch (e) { showAlert('فشل خدمة الصوت.', 'danger'); }
}

function openAiDraftModal() { document.getElementById('ai_draft_notes').value = ''; document.getElementById('ai_draft_result_container').classList.add('d-none'); document.getElementById('ai_draft_result').value = ''; openModal('aiDraftModal'); }

// 🚀 توليد اللوائح بناءً على المحرك الجديد المحدث في الوركر (RAG Auto-Drafting)
async function generateAiDraft() {
    const btn = document.getElementById('btn_generate_draft');
    const draftType = document.getElementById('ai_draft_type').value;
    const extraNotes = document.getElementById('ai_draft_notes').value;
    const client = window.firmClients.find(cl => cl.id === caseObj.client_id);
    const clientName = client ? client.full_name : 'الموكل';
    
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> صياغة قانونية...'; btn.disabled = true; document.getElementById('ai_draft_result_container').classList.add('d-none');
    
    const caseFacts = caseObj.lawsuit_facts || 'يرجى كتابة وقائع الدعوى ليتمكن الذكاء الاصطناعي من صياغة مذكرة أدق.';
    const similarCasesContext = extraNotes ? `ملاحظات إضافية من المحامي: ${extraNotes}` : 'لا توجد ملاحظات إضافية.';
    const promptText = `نوع المستند المطلوب: ${draftType}\nالمدعي: ${clientName} | المدعى عليه: ${caseObj.opponent_name || 'غير محدد'}\nالمحكمة: ${caseObj.current_court || 'المختصة'} | المطالبة: ${caseObj.claim_amount ? caseObj.claim_amount + ' دينار' : '--'}\nالأسانيد القانونية: ${caseObj.legal_basis || 'القانون الأردني.'}\nالطلبات: ${Array.isArray(caseObj.final_requests) && caseObj.final_requests.length > 0 ? caseObj.final_requests.join('، ') : 'الرسوم والمصاريف والأتعاب.'}\n${similarCasesContext}`;
    
    try {
        // نستخدم الدالة الجديدة المخصصة لصياغة المذكرات
        const res = await API.generateLegalDraft(caseFacts, promptText);
        if (res && res.draft) {
            document.getElementById('ai_draft_result').value = res.draft; 
            document.getElementById('ai_draft_result_container').classList.remove('d-none'); 
            showAlert('تم توليد اللائحة القانونية!', 'success');
        } else throw new Error('لا رد من المحرك');
    } catch (e) { 
        showAlert('فشل الاتصال بمحرك الصياغة الذكي.', 'error'); 
    } finally { 
        btn.innerHTML = '<i class="fas fa-robot me-1"></i> توليد اللائحة'; btn.disabled = false; 
    }
}

function copyToClipboard(elementId) { const el = document.getElementById(elementId); el.select(); el.setSelectionRange(0, 99999); document.execCommand("copy"); showAlert("تم نسخ النص!", "success"); }

// =================================================================
// 🖨️ أدوات الطباعة والمشاركة
// =================================================================

function tafqeet(number) {
    const units = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];
    const tens = ["", "عشرة", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
    const hundreds = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];
    const thousands = ["", "ألف", "ألفان", "آلاف"];
    if (number === 0) return "صفر";
    const numStr = number.toString().padStart(6, '0');
    const hThous = parseInt(numStr[0]), tThous = parseInt(numStr[1]), uThous = parseInt(numStr[2]), h = parseInt(numStr[3]), t = parseInt(numStr[4]), u = parseInt(numStr[5]);
    let thousandPart = "";
    if (hThous > 0) thousandPart += hundreds[hThous] + " و";
    if (tThous === 1 && uThous > 0) thousandPart += "أحد عشر ألفاً و"; else if (tThous > 0) thousandPart += units[uThous] + " و" + tens[tThous] + " ألفاً و"; else if (uThous > 2) thousandPart += units[uThous] + " آلاف و"; else if (uThous === 2) thousandPart += thousands[2] + " و"; else if (uThous === 1) thousandPart += thousands[1] + " و";
    let basicPart = "";
    if (h > 0) basicPart += hundreds[h] + " و";
    if (t === 1 && u > 0) basicPart += (u===1?"أحد":u===2?"اثنا":units[u]) + " عشر"; else if (t > 0 && u > 0) basicPart += units[u] + " و" + tens[t]; else if (t > 0) basicPart += tens[t]; else if (u > 0) basicPart += units[u];
    return (thousandPart + basicPart).replace(/ و$/, "").trim();
}

function printInvoice(amount, date, invoiceId) {
    document.getElementById('qr-print-container').style.display = 'none'; document.getElementById('invoice-print-container').style.display = 'block';
    document.getElementById('print-inv-date').innerText = date; document.getElementById('print-inv-case').innerText = caseObj.case_internal_id;
    const client = window.firmClients.find(cl => cl.id === caseObj.client_id); document.getElementById('print-inv-client').innerText = client ? client.full_name : "موكل";
    document.getElementById('print-inv-amount').innerText = amount; document.getElementById('print-inv-tafqeet').innerText = tafqeet(parseInt(amount)) + " دينار";
    const firmSettings = JSON.parse(localStorage.getItem('firm_settings')) || {}; document.getElementById('print-firm-name').innerText = escapeHTML(firmSettings.firm_name || 'المكتب');
    const qrContainer = document.getElementById("invoice-verification-qr");
    if (qrContainer && caseObj.public_token) {
        qrContainer.innerHTML = ""; const pathArray = window.location.pathname.split('/'); pathArray.pop(); const verifyUrl = `${window.location.origin + pathArray.join('/')}/verify.html?type=receipt&id=${invoiceId}`;
        new QRCode(qrContainer, { text: verifyUrl, width: 100, height: 100, colorDark : "#000", colorLight : "#fff", correctLevel : QRCode.CorrectLevel.L });
        let note = document.createElement('div'); note.style.fontSize = "11px"; note.style.marginTop = "8px"; note.style.color = "#555"; note.innerHTML = "<b>للحماية:</b> امسح للتحقق."; qrContainer.appendChild(note);
    }
    window.print();
}

function printQRCode() {
    if(!caseObj.public_token) { showAlert('لا يوجد رابط وصول.', 'warning'); return; }
    document.getElementById('invoice-print-container').style.display = 'none'; document.getElementById('qr-print-container').style.display = 'block';
    document.getElementById('print-qr-casenum').innerText = `ملف رقم: ${caseObj.case_internal_id}`;
    const qrContainer = document.getElementById("qrcode"); qrContainer.innerHTML = ""; 
    const pathArray = window.location.pathname.split('/'); pathArray.pop(); const deepLink = `${window.location.origin + pathArray.join('/')}/client.html?token=${caseObj.public_token}`;
    new QRCode(qrContainer, { text: deepLink, width: 200, height: 200, colorDark : "#0a192f", colorLight : "#fff", correctLevel : QRCode.CorrectLevel.H });
    window.print();
}

let currentShareLink = '';
window.openShareModal = function() {
    if(!caseObj.public_token) { showAlert('لا يوجد رمز وصول.', 'error'); return; }
    const pathArray = window.location.pathname.split('/'); pathArray.pop(); currentShareLink = `${window.location.origin + pathArray.join('/')}/client.html?token=${caseObj.public_token}`;
    document.getElementById('share_link_input').value = currentShareLink; document.getElementById('share_pin_input').value = caseObj.access_pin || 'لا يوجد';
    const qrContainer = document.getElementById('share-qrcode'); qrContainer.innerHTML = '';
    new QRCode(qrContainer, { text: currentShareLink, width: 150, height: 150, colorDark: "#10b981" });
    openModal('shareModal');
};

window.copyShareLink = function() { navigator.clipboard.writeText(`مرحباً، رابط قضيتك:\n${currentShareLink}\nالرمز (PIN): ${document.getElementById('share_pin_input').value}`).then(() => showAlert('نسخ الرابط', 'success')); };
window.sendViaWhatsApp = function() { window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(`مرحباً، رابط قضيتك:\n${currentShareLink}\nالرمز (PIN): ${document.getElementById('share_pin_input').value}`)}`, '_blank'); };

function sendWhatsAppReminder(amount, dueDate) {
    const client = window.firmClients.find(cl => cl.id === caseObj.client_id);
    if (!client || !client.phone) { showAlert('لا يوجد هاتف مسجل.', 'warning'); return; }
    let phoneStr = String(client.phone); if (phoneStr.startsWith('0')) phoneStr = '962' + phoneStr.substring(1);
    const text = `تحية طيبة السيد/ة ${client.full_name}،\nتذكير بدفعة بقيمة *${amount} دينار*، بتاريخ (${dueDate}).\nإدارة المكتب.`;
    window.open(`https://wa.me/${phoneStr}?text=${encodeURIComponent(text)}`, '_blank');
}

function goToClientProfile() { if (caseObj && caseObj.client_id) { localStorage.setItem('current_client_id', caseObj.client_id); window.location.href = 'client-details.html'; } }