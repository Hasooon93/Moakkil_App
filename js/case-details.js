// js/case-details.js - محرك تفاصيل القضية (النسخة الكاملة والنهائية - تم تأمين دوال التنبيهات)

let currentCaseId = localStorage.getItem('current_case_id') || new URLSearchParams(window.location.search).get('id');
let caseObj = null;

// =================================================================
// 🛠️ الدوال الأساسية للواجهة والتنبيهات (في الأعلى لضمان عملها)
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
    if (!dateString) return dateString;
    try {
        let d = new Date(dateString);
        d.setHours(d.getHours() + 3);
        return d.toISOString();
    } catch(e) { return dateString; }
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
    const settings = JSON.parse(localStorage.getItem('firm_settings'));
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
    
    document.getElementById('det-co-plaintiffs').innerText = Array.isArray(caseObj.co_plaintiffs) && caseObj.co_plaintiffs.length > 0 ? caseObj.co_plaintiffs.join('، ') : '--';
    document.getElementById('det-co-defendants').innerText = Array.isArray(caseObj.co_defendants) && caseObj.co_defendants.length > 0 ? caseObj.co_defendants.join('، ') : '--';
    document.getElementById('det-experts').innerText = Array.isArray(caseObj.experts_and_witnesses) && caseObj.experts_and_witnesses.length > 0 ? caseObj.experts_and_witnesses.join('، ') : '--';
    document.getElementById('det-poa-details').innerText = escapeHTML(caseObj.poa_details || "--");
    
    document.getElementById('det-case-type').innerText = escapeHTML(caseObj.case_type || "--");
    let parentCaseText = "لا يوجد";
    if(caseObj.parent_case_id) {
        const pCase = window.firmCases.find(c => c.id === caseObj.parent_case_id);
        parentCaseText = pCase ? pCase.case_internal_id : caseObj.parent_case_id;
    }
    document.getElementById('det-parent-case').innerText = escapeHTML(parentCaseText);
    document.getElementById('det-limit-date').innerText = escapeHTML(caseObj.statute_of_limitations_date || "--");
    document.getElementById('det-judgment-date').innerText = escapeHTML(caseObj.judgment_date || "--");
    
    const outcomeEl = document.getElementById('det-outcome');
    outcomeEl.innerText = escapeHTML(caseObj.case_outcome || "لم تحسم بعد");
    if(caseObj.case_outcome === 'ربح') outcomeEl.className = 'badge bg-success';
    else if(caseObj.case_outcome === 'خسارة' || caseObj.case_outcome === 'رد الدعوى') outcomeEl.className = 'badge bg-danger';
    else outcomeEl.className = 'badge bg-secondary';
    
    document.getElementById('det-closure-reason').innerText = escapeHTML(caseObj.closure_reason || "--");

    document.getElementById('det-manual-facts').innerText = escapeHTML(caseObj.lawsuit_facts || "--");
    document.getElementById('det-manual-legal').innerText = escapeHTML(caseObj.legal_basis || "--");
    document.getElementById('det-manual-reqs').innerText = Array.isArray(caseObj.final_requests) && caseObj.final_requests.length > 0 ? caseObj.final_requests.join('\n') : '--';

    document.getElementById('det-police').innerText = escapeHTML(caseObj.police_station_ref || "--");
    document.getElementById('det-prosecution').innerText = escapeHTML(caseObj.prosecution_ref || "--");
    document.getElementById('det-archive').innerText = escapeHTML(caseObj.physical_archive_location || "--");
    document.getElementById('det-clerk').innerText = escapeHTML(caseObj.court_clerk || "--");
    
    // الملخص التراكمي
    document.getElementById('det-ai-summary').innerText = escapeHTML(caseObj.ai_cumulative_summary || "لا يوجد ملخص تراكمي بعد.");
    
    // الوقائع والأسانيد المستخلصة ذكياً
    if(caseObj.ai_entities) {
        try {
            let ai = typeof caseObj.ai_entities === 'string' ? JSON.parse(caseObj.ai_entities) : caseObj.ai_entities;
            document.getElementById('det-ai-facts').innerText = ai.lawsuit_facts || ai["الوقائع"] || '--';
            document.getElementById('det-ai-legal').innerText = ai.legal_basis || ai["الأسانيد"] || '--';
            let reqs = ai.final_requests || ai["الطلبات"];
            document.getElementById('det-ai-requests').innerText = Array.isArray(reqs) ? reqs.join('، ') : (reqs || '--');
        } catch(e) { console.error("Error parsing AI entities", e); }
    } else {
        document.getElementById('det-ai-facts').innerText = '--';
        document.getElementById('det-ai-legal').innerText = '--';
        document.getElementById('det-ai-requests').innerText = '--';
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

    document.getElementById('edit_opponent').value = caseObj.opponent_name || '';
    document.getElementById('edit_opponent_lawyer').value = caseObj.opponent_lawyer || '';
    document.getElementById('edit_poa_number').value = caseObj.power_of_attorney_number || '';
    document.getElementById('edit_poa_details').value = caseObj.poa_details || '';

    document.getElementById('edit_co_plaintiffs').value = Array.isArray(caseObj.co_plaintiffs) ? caseObj.co_plaintiffs.join('، ') : '';
    document.getElementById('edit_co_defendants').value = Array.isArray(caseObj.co_defendants) ? caseObj.co_defendants.join('، ') : '';
    document.getElementById('edit_experts_and_witnesses').value = Array.isArray(caseObj.experts_and_witnesses) ? caseObj.experts_and_witnesses.join('، ') : '';

    document.getElementById('edit_lawsuit_facts').value = caseObj.lawsuit_facts || '';
    document.getElementById('edit_legal_basis').value = caseObj.legal_basis || '';
    document.getElementById('edit_final_requests').value = Array.isArray(caseObj.final_requests) ? caseObj.final_requests.join('\n') : '';
    document.getElementById('edit_case_outcome').value = caseObj.case_outcome || '';
    document.getElementById('edit_success_probability').value = caseObj.success_probability || '';
    document.getElementById('edit_closure_reason').value = caseObj.closure_reason || '';
    document.getElementById('edit_physical_archive_location').value = caseObj.physical_archive_location || '';

    document.getElementById('edit_claim').value = caseObj.claim_amount || '';
    document.getElementById('edit_fees').value = caseObj.total_agreed_fees || '';
    document.getElementById('edit_court_fees_paid').value = caseObj.court_fees_paid || '';
    document.getElementById('edit_court_deposits').value = caseObj.court_deposits || '';
    
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

    const parentIdValue = document.getElementById('edit_parent_case_id').value;
    const validParentId = parentIdValue === '' ? null : parentIdValue;

    const data = {
        case_internal_id: document.getElementById('edit_internal_id').value, status: document.getElementById('edit_status').value,
        access_pin: document.getElementById('edit_access_pin').value, case_type: document.getElementById('edit_type').value, 
        priority_level: document.getElementById('edit_priority_level').value, confidentiality_level: document.getElementById('edit_confidentiality_level').value,
        current_stage: document.getElementById('edit_current_stage').value, assigned_lawyer_id: selectedLawyers.length > 0 ? selectedLawyers : null,
        current_court: document.getElementById('edit_court').value, court_room: document.getElementById('edit_court_chamber').value, 
        court_case_number: document.getElementById('edit_court_case_number').value, case_year: document.getElementById('edit_case_year').value ? Number(document.getElementById('edit_case_year').value) : null,
        litigation_degree: document.getElementById('edit_litigation_degree').value, current_judge: document.getElementById('edit_judge').value,
        court_clerk: document.getElementById('edit_court_clerk').value, parent_case_id: validParentId,
        deadline_date: document.getElementById('edit_deadline_date').value || null, statute_of_limitations_date: document.getElementById('edit_statute_of_limitations_date').value || null,
        judgment_date: document.getElementById('edit_judgment_date').value || null, police_station_ref: document.getElementById('edit_police_station_ref').value,
        prosecution_ref: document.getElementById('edit_prosecution_ref').value, opponent_name: document.getElementById('edit_opponent').value,
        opponent_lawyer: document.getElementById('edit_opponent_lawyer').value, power_of_attorney_number: document.getElementById('edit_poa_number').value,
        poa_details: document.getElementById('edit_poa_details').value, co_plaintiffs: parseToArray(document.getElementById('edit_co_plaintiffs').value),
        co_defendants: parseToArray(document.getElementById('edit_co_defendants').value), experts_and_witnesses: parseToArray(document.getElementById('edit_experts_and_witnesses').value),
        lawsuit_facts: document.getElementById('edit_lawsuit_facts').value, legal_basis: document.getElementById('edit_legal_basis').value,
        final_requests: parseLinesToArray(document.getElementById('edit_final_requests').value), case_outcome: document.getElementById('edit_case_outcome').value,
        success_probability: document.getElementById('edit_success_probability').value ? Number(document.getElementById('edit_success_probability').value) : null,
        closure_reason: document.getElementById('edit_closure_reason').value, physical_archive_location: document.getElementById('edit_physical_archive_location').value,
        claim_amount: document.getElementById('edit_claim').value ? Number(document.getElementById('edit_claim').value) : null,
        total_agreed_fees: document.getElementById('edit_fees').value ? Number(document.getElementById('edit_fees').value) : 0,
        court_fees_paid: document.getElementById('edit_court_fees_paid').value ? Number(document.getElementById('edit_court_fees_paid').value) : 0,
        court_deposits: document.getElementById('edit_court_deposits').value ? Number(document.getElementById('edit_court_deposits').value) : 0
    };

    const res = await API.updateCase(currentCaseId, data);
    if(res && !res.error) { closeModal('editCaseModal'); showAlert(res.offline ? 'مخزن محلياً' : 'تم التحديث بنجاح', res.offline ? 'warning' : 'success'); await loadCaseFullDetails(); }
    btn.disabled = false; btn.innerHTML = '<i class="fas fa-save me-1"></i> حفظ التعديلات الشاملة';
}

// =================================================================
// 🤖 تحديث الإجراءات والاستخراج الذكي
// =================================================================

function openUpdateModal() { document.getElementById('upd_extracted_json').value = ''; openModal('updateModal'); }

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
        if (!navigator.onLine) { showAlert('لا رفع بدون إنترنت.', 'warning'); return; }
        btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> رفع...';
        try {
            const driveRes = await API.uploadToDrive(fileInput.files[0], caseObj.case_internal_id, caseObj.drive_folder_id);
            finalAttachmentUrl = driveRes.url;
        } catch(e) { showAlert('فشل رفع المرفق', 'error'); btn.disabled = false; btn.innerHTML = '<i class="fas fa-save me-1"></i> إضافة التحديث'; return; }
    } else {
        closeModal('updateModal'); showAlert('تمت إضافة الواقعة', 'success');
    }

    const extractedStr = document.getElementById('upd_extracted_json').value;
    const extractedData = extractedStr ? JSON.parse(extractedStr) : {};
    const rawHearing = document.getElementById('upd_hearing_date').value || null;
    const rawNextHearing = document.getElementById('upd_next_hearing').value || null;

    const data = {
        case_id: currentCaseId, update_title: document.getElementById('upd_title').value, update_details: details,
        hearing_date: rawHearing ? applyJordanTimeHackLocal(rawHearing) : null, next_hearing_date: rawNextHearing ? applyJordanTimeHackLocal(rawNextHearing) : null,
        is_visible_to_client: document.getElementById('upd_visible').checked, ai_extracted_entities: extractedData, attachment_url: finalAttachmentUrl
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
        const attachHtml = u.attachment_url ? `<a href="${escapeHTML(u.attachment_url)}" target="_blank" class="badge bg-soft-primary text-primary mt-2 border border-primary text-decoration-none shadow-sm p-1 px-2"><i class="fas fa-paperclip"></i> المرفق</a>` : '';
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

    document.getElementById('det-claim-amount').innerText = claimAmount.toLocaleString() + ' د.أ';
    document.getElementById('sum-agreed').innerText = agreedFees.toLocaleString();
    document.getElementById('sum-paid').innerText = totalPaid.toLocaleString();
    document.getElementById('sum-expenses').innerText = totalExpenses.toLocaleString();
    document.getElementById('sum-court-fees').innerText = courtFees.toLocaleString() + ' د.أ';
    document.getElementById('sum-court-deposits').innerText = courtDeposits.toLocaleString() + ' د.أ';
    
    const netEl = document.getElementById('sum-net');
    if(netEl) { netEl.innerText = clientRemaining.toLocaleString() + ' د.أ'; netEl.className = clientRemaining > 0 ? 'text-danger fw-bold fs-5' : 'text-success fw-bold fs-5'; }
}

function renderPayments(installments) {
    const container = document.getElementById('payments-container');
    document.getElementById('inst-count').innerText = installments.length;
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
    document.getElementById('exp-count').innerText = expenses.length;
    if (!expenses || expenses.length === 0) { container.innerHTML = '<div class="text-center p-3 text-muted small border bg-white rounded">لا مصروفات.</div>'; return; }
    container.innerHTML = expenses.map(e => {
        const receiptLink = e.receipt_url ? `<a href="${escapeHTML(e.receipt_url)}" target="_blank" class="btn btn-sm btn-outline-secondary mt-1 py-0 px-2"><i class="fas fa-paperclip"></i> مرفق</a>` : '';
        return `<div class="card-custom p-3 mb-2 d-flex justify-content-between align-items-center border-start border-4 border-danger bg-white"><div><b class="fs-5 text-danger">${Number(e.amount).toLocaleString()} د.أ</b><small class="d-block text-muted">${escapeHTML(e.description)}</small>${receiptLink}</div><div><small class="text-muted d-block mb-1"><i class="fas fa-calendar-alt"></i> ${escapeHTML(e.expense_date)}</small><div class="text-end"><button class="btn btn-sm text-danger py-0 px-2 ms-1" onclick="deleteRecord('expense', '${e.id}')"><i class="fas fa-trash"></i></button></div></div></div>`;
    }).join('');
}

function renderFiles(files) {
    const container = document.getElementById('files-container');
    if (!files || files.length === 0) { container.innerHTML = '<div class="col-12 text-center p-4 text-muted small border bg-white rounded">الأرشيف فارغ.</div>'; return; }
    container.innerHTML = files.map(f => {
        const isImage = f.file_type && f.file_type.includes('image');
        const iconHtml = (isImage && f.drive_file_id) ? `<i class="fas fa-image fs-1 text-primary mb-2"></i>` : `<i class="fas fa-file-pdf fs-1 text-danger mb-2"></i>`;
        const expiryBadge = f.expiry_date ? `<small class="d-block mt-1 text-danger" style="font-size: 0.65rem;"><i class="fas fa-clock"></i> ينتهي: ${escapeHTML(f.expiry_date)}</small>` : '';
        return `<div class="col-6"><div class="card-custom p-3 text-center border shadow-sm h-100 bg-white position-relative"><button class="btn btn-sm text-danger position-absolute top-0 start-0 m-1" onclick="deleteRecord('file', '${f.id}')"><i class="fas fa-trash"></i></button><span class="badge bg-light text-dark border mb-2 d-block text-truncate">${escapeHTML(f.file_category || 'مستند')}</span>${iconHtml} <h6 class="small fw-bold text-truncate mt-1 mb-0" title="${escapeHTML(f.file_name)}">${escapeHTML(f.file_name)}</h6>${expiryBadge}<div class="d-flex gap-1 mt-2"><a href="${escapeHTML(f.drive_file_id)}" target="_blank" class="btn btn-sm btn-outline-primary w-100 fw-bold">عرض</a></div></div></div>`;
    }).join('');
}

async function savePayment(event) { 
    event.preventDefault(); 
    const rawDate = document.getElementById('pay_due_date').value;
    const data = { case_id: currentCaseId, amount: Number(document.getElementById('pay_amount').value), due_date: applyJordanTimeHackLocal(rawDate), status: document.getElementById('pay_status').value }; 
    closeModal('paymentModal'); document.getElementById('paymentForm').reset(); showAlert('تم تسجيل الدفعة', 'success'); 
    try { const res = await API.addInstallment(data); if(res && !res.error) await loadCaseFullDetails(); else throw new Error(res?.error || 'خطأ'); } catch(e) { showAlert(e.message, 'error'); }
}

async function saveExpense(event) { 
    event.preventDefault(); 
    const rawDate = document.getElementById('exp_date').value;
    const data = { case_id: currentCaseId, amount: Number(document.getElementById('exp_amount').value), description: document.getElementById('exp_desc').value, expense_date: applyJordanTimeHackLocal(rawDate), receipt_url: document.getElementById('exp_receipt_url').value || null }; 
    closeModal('expenseModal'); document.getElementById('expenseForm').reset(); showAlert('تم تسجيل المصروف', 'success'); 
    try { const res = await API.addExpense(data); if(res && !res.error) await loadCaseFullDetails(); else throw new Error(res?.error || 'خطأ'); } catch(e) { showAlert(e.message, 'error'); }
}

async function saveFile(event) {
    event.preventDefault();
    const fileInput = document.getElementById('file_input');
    const titleInput = document.getElementById('file_title_input').value;
    const catInput = document.getElementById('file_category_input').value;
    const expiryInput = document.getElementById('file_expiry_date').value;
    const btn = document.getElementById('btn_upload');
    if (!fileInput.files.length) return;
    if (!navigator.onLine) { showAlert('لا يمكن رفع الملفات السحابية بلا إنترنت.', 'warning'); return; }
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> أرشفة...';
    try {
        const driveRes = await API.uploadToDrive(fileInput.files[0], caseObj.case_internal_id, caseObj.drive_folder_id);
        if(driveRes && driveRes.url) {
            const res = await API.addFileRecord({ case_id: currentCaseId, file_name: titleInput || fileInput.files[0].name, file_type: fileInput.files[0].type, file_category: catInput, drive_file_id: driveRes.url, is_template: false, expiry_date: expiryInput || null });
            if(res && !res.error) { closeModal('fileModal'); document.getElementById('fileForm').reset(); showAlert('تم الحفظ', 'success'); await loadCaseFullDetails(); }
        }
    } catch (err) { showAlert("فشل: " + err.message, 'error'); } finally { btn.disabled = false; btn.innerHTML = '<i class="fas fa-upload me-1"></i> رفع السحابي'; }
}

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
// 🎤 الإملاء الصوتي وتوليد المسودات
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

async function generateAiDraft() {
    const btn = document.getElementById('btn_generate_draft');
    const draftType = document.getElementById('ai_draft_type').value;
    const extraNotes = document.getElementById('ai_draft_notes').value;
    const client = window.firmClients.find(cl => cl.id === caseObj.client_id);
    const clientName = client ? client.full_name : 'الموكل';
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> صياغة...'; btn.disabled = true; document.getElementById('ai_draft_result_container').classList.add('d-none');
    const promptText = `بصفتك محامياً أردنياً متمرساً، قم بصياغة مستند قانوني رسمي جاهز للطباعة. نوع المستند: ${draftType}\nالمدعي: ${clientName} | المدعى عليه: ${caseObj.opponent_name || 'غير محدد'}\nالمحكمة: ${caseObj.current_court || 'المختصة'} | المطالبة: ${caseObj.claim_amount ? caseObj.claim_amount + ' دينار' : '--'}\nالوقائع: ${caseObj.lawsuit_facts || 'صغ وقائع قانونية تناسب الدعوى.'}\nالأسانيد: ${caseObj.legal_basis || 'القانون الأردني.'}\nالطلبات: ${Array.isArray(caseObj.final_requests) && caseObj.final_requests.length > 0 ? caseObj.final_requests.join('، ') : 'الرسوم والمصاريف والأتعاب.'}\nملاحظات: ${extraNotes}\nتعليمات: أجب بالعربية الفصحى فقط وبشكل رسمي، ابدأ المستند فوراً ببسم الله واسم المحكمة بدون مقدمات حوارية.`;
    try {
        const res = await API.askAI(promptText);
        if (res && res.reply) {
            let finalReply = res.reply.replace(/Here is the.*?:/ig, '').replace(/```/g, '').trim();
            document.getElementById('ai_draft_result').value = finalReply; document.getElementById('ai_draft_result_container').classList.remove('d-none'); showAlert('تم توليد المسودة!', 'success');
        } else throw new Error('لا رد');
    } catch (e) { showAlert('فشل الاتصال بالذكاء الاصطناعي.', 'error'); } finally { btn.innerHTML = '<i class="fas fa-robot me-1"></i> توليد المسودة'; btn.disabled = false; }
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
function openShareModal() {
    if(!caseObj.public_token) { showAlert('لا يوجد رمز وصول.', 'error'); return; }
    const pathArray = window.location.pathname.split('/'); pathArray.pop(); currentShareLink = `${window.location.origin + pathArray.join('/')}/client.html?token=${caseObj.public_token}`;
    document.getElementById('share_link_input').value = currentShareLink; document.getElementById('share_pin_input').value = caseObj.access_pin || 'لا يوجد';
    const qrContainer = document.getElementById('share-qrcode'); qrContainer.innerHTML = '';
    new QRCode(qrContainer, { text: currentShareLink, width: 150, height: 150, colorDark: "#10b981" });
    openModal('shareModal');
}

function copyShareLink() { navigator.clipboard.writeText(`مرحباً، رابط قضيتك:\n${currentShareLink}\nالرمز (PIN): ${document.getElementById('share_pin_input').value}`).then(() => showAlert('نسخ الرابط', 'success')); }
function sendViaWhatsApp() { window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(`مرحباً، رابط قضيتك:\n${currentShareLink}\nالرمز (PIN): ${document.getElementById('share_pin_input').value}`)}`, '_blank'); }

function sendWhatsAppReminder(amount, dueDate) {
    const client = window.firmClients.find(cl => cl.id === caseObj.client_id);
    if (!client || !client.phone) { showAlert('لا يوجد هاتف مسجل.', 'warning'); return; }
    let phoneStr = String(client.phone); if (phoneStr.startsWith('0')) phoneStr = '962' + phoneStr.substring(1);
    const text = `تحية طيبة السيد/ة ${client.full_name}،\nتذكير بدفعة بقيمة *${amount} دينار*، بتاريخ (${dueDate}).\nإدارة المكتب.`;
    window.open(`https://wa.me/${phoneStr}?text=${encodeURIComponent(text)}`, '_blank');
}

function goToClientProfile() { if (caseObj && caseObj.client_id) { localStorage.setItem('current_client_id', caseObj.client_id); window.location.href = 'client-details.html'; } }