// js/case-details.js - محرك تفاصيل القضية (يشمل الذكاء الاصطناعي، الإملاء الصوتي، الواتساب، والتحقق الأمني، محمي ضد XSS)

let currentCaseId = localStorage.getItem('current_case_id');
let caseObj = null;
let realtimeSyncTimer = null;

// دالة الحماية من ثغرات الحقن (XSS Sanitizer)
const escapeHTML = (str) => {
    if (str === null || str === undefined) return '';
    return str.toString().replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
};

window.onload = async () => {
    applyFirmSettings(); 
    if (!currentCaseId) { window.location.href = 'app.html'; return; }
    await loadCaseFullDetails();
    startRealtimeSync();
};

function applyFirmSettings() {
    const settings = JSON.parse(localStorage.getItem('firm_settings'));
    if (!settings) return;
    const root = document.documentElement;
    if (settings.primary_color) root.style.setProperty('--navy', settings.primary_color);
    if (settings.accent_color) root.style.setProperty('--accent', settings.accent_color);
}

function startRealtimeSync() {
    realtimeSyncTimer = setInterval(async () => {
        try {
            const [updates, installments, expenses] = await Promise.all([
                API.getUpdates(currentCaseId),
                API.getInstallments(currentCaseId),
                API.getExpenses(currentCaseId)
            ]);
            renderTimeline(Array.isArray(updates) ? updates : []);
            renderPayments(Array.isArray(installments) ? installments : []);
            renderExpenses(Array.isArray(expenses) ? expenses : []);
            calculateFinances(Array.isArray(installments) ? installments : [], Array.isArray(expenses) ? expenses : []);
        } catch(e) {}
    }, 5000);
}

function goBack() { window.location.href = 'app.html'; }

async function loadCaseFullDetails() {
    try {
        const [allCasesReq, updatesReq, installmentsReq, expensesReq, filesReq, staffReq, clientsReq] = await Promise.all([
            API.getCases(), 
            API.getUpdates(currentCaseId), 
            API.getInstallments(currentCaseId),
            API.getExpenses(currentCaseId), 
            API.getFiles(currentCaseId),
            API.getStaff(),
            API.getClients()
        ]);
        
        window.firmStaff = Array.isArray(staffReq) ? staffReq : [];
        window.firmCases = Array.isArray(allCasesReq) ? allCasesReq : [];
        window.firmClients = Array.isArray(clientsReq) ? clientsReq : [];
        
        caseObj = window.firmCases.find(c => c.id == currentCaseId);
        if (!caseObj) { window.location.href = 'app.html'; return; }

        renderHeaderAndSummary();
        renderAiAnalysis(); 
        renderTimeline(Array.isArray(updatesReq) ? updatesReq : []);
        renderPayments(Array.isArray(installmentsReq) ? installmentsReq : []);
        renderExpenses(Array.isArray(expensesReq) ? expensesReq : []);
        renderFiles(Array.isArray(filesReq) ? filesReq : []);
        calculateFinances(Array.isArray(installmentsReq) ? installmentsReq : [], Array.isArray(expensesReq) ? expensesReq : []);
        
        if(document.getElementById('secret_notes_input')) {
            document.getElementById('secret_notes_input').value = caseObj.secret_notes || '';
        }
        
    } catch (error) { showAlert('تأكد من الاتصال بالإنترنت', 'warning'); }
}

function renderHeaderAndSummary() {
    document.getElementById('case-title').innerText = `${escapeHTML(caseObj.case_internal_id || 'ملف قضية')}`;
    
    const client = window.firmClients.find(cl => cl.id === caseObj.client_id);
    const clientName = client ? escapeHTML(client.full_name) : "موكل غير محدد";
    document.getElementById('case-client-name').innerHTML = `<i class="fas fa-user-tie me-2 text-info"></i> ${clientName}`;
    
    const lastSeenContainer = document.getElementById('client-last-seen-container');
    const lastSeenEl = document.getElementById('det-client-last-seen');
    if (caseObj.client_last_seen) {
        lastSeenEl.innerText = new Date(caseObj.client_last_seen).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
        if(lastSeenContainer) lastSeenContainer.classList.remove('d-none');
    } else {
        if(lastSeenContainer) lastSeenContainer.classList.add('d-none');
    }

    document.getElementById('det-court').innerText = escapeHTML(caseObj.current_court || "--");
    document.getElementById('det-court-num').innerText = escapeHTML(caseObj.court_case_number || "--");
    document.getElementById('det-judge').innerText = escapeHTML(caseObj.current_judge || "--");
    document.getElementById('det-type').innerText = escapeHTML(caseObj.case_type || "--");
    document.getElementById('det-opponent').innerText = escapeHTML(caseObj.opponent_name || "--");
    
    document.getElementById('det-opp-lawyer').innerText = escapeHTML(caseObj.opponent_lawyer || "غير محدد");
    document.getElementById('det-poa').innerText = escapeHTML(caseObj.poa_details || "غير محدد");
    document.getElementById('det-success').innerText = caseObj.success_probability ? `${escapeHTML(caseObj.success_probability)}%` : "غير محدد";
    
    const deadlineEl = document.getElementById('det-deadline');
    if (caseObj.deadline_date) {
        deadlineEl.innerText = escapeHTML(caseObj.deadline_date);
        const daysLeft = Math.ceil((new Date(caseObj.deadline_date) - new Date()) / (1000 * 60 * 60 * 24));
        if(daysLeft <= 7 && daysLeft > 0) deadlineEl.className = "text-danger fw-bold heartbeat-animation fs-6";
        else if (daysLeft < 0) deadlineEl.innerHTML = `<span class="text-dark"><i class="fas fa-times"></i> منتهي</span>`;
        else deadlineEl.className = "fs-6";
    } else {
        deadlineEl.innerText = "غير محدد";
    }

    document.getElementById('case-pin').innerHTML = `<i class="fas fa-key text-warning"></i> PIN: ${escapeHTML(caseObj.access_pin || 'غير محدد')}`;
    const statusEl = document.getElementById('case-status');
    statusEl.innerText = escapeHTML(caseObj.status || "نشطة");
    statusEl.className = `badge fs-6 ${caseObj.status === 'نشطة' ? 'bg-success' : 'bg-danger'}`;
}

function renderAiAnalysis() {
    const aiContainer = document.getElementById('ai-analysis-container');
    if(!aiContainer) return;
    if (!caseObj.ai_entities || Object.keys(caseObj.ai_entities).length === 0) {
        aiContainer.classList.add('d-none');
        return;
    }
    
    aiContainer.classList.remove('d-none');
    const ai = caseObj.ai_entities;
    
    document.getElementById('ai-names').innerText = (ai.names && ai.names.length > 0) ? escapeHTML(ai.names.join('، ')) : '--';
    document.getElementById('ai-dates').innerText = (ai.dates && ai.dates.length > 0) ? escapeHTML(ai.dates.join('، ')) : '--';
    document.getElementById('ai-articles').innerText = (ai.legal_articles && ai.legal_articles.length > 0) ? escapeHTML(ai.legal_articles.join('، ')) : '--';
    document.getElementById('ai-summary').innerText = escapeHTML(ai.facts_summary || 'لا يوجد ملخص متاح.');
}

async function saveSecretNotes() {
    const notes = document.getElementById('secret_notes_input').value;
    const res = await API.updateCase(currentCaseId, { secret_notes: notes });
    if (res) showAlert('تم حفظ الملاحظات السرية بنجاح', 'success');
}

function renderTimeline(updates) {
    const container = document.getElementById('timeline-container');
    if (!updates || updates.length === 0) { container.innerHTML = '<div class="text-center p-4 text-muted small">لا يوجد وقائع.</div>'; return; }
    container.innerHTML = updates.map(u => `
        <div class="timeline-item mb-3">
            <div class="card-custom p-3 shadow-sm bg-white border-end border-4 border-navy position-relative">
                <button class="btn btn-sm text-danger position-absolute top-0 end-0 mt-2 me-2" onclick="deleteRecord('update', '${u.id}')"><i class="fas fa-trash"></i></button>
                <small class="text-primary fw-bold">${new Date(u.created_at).toLocaleDateString('ar-EG')}</small>
                <h6 class="fw-bold text-navy mt-1">${escapeHTML(u.update_title)}</h6>
                <p class="mb-0 small">${escapeHTML(u.update_details)}</p>
                ${u.hearing_date ? `<small class="d-block mt-2 text-muted"><i class="fas fa-calendar-check text-success"></i> الجلسة: ${escapeHTML(u.hearing_date)}</small>` : ''}
            </div>
        </div>
    `).join('');
}

function renderPayments(installments) {
    const container = document.getElementById('payments-container');
    if (!installments || installments.length === 0) { container.innerHTML = '<div class="text-center p-3 text-muted small border bg-white rounded">لا توجد دفعات.</div>'; return; }
    
    container.innerHTML = installments.map(i => {
        const isPaid = i.status === 'مدفوعة';
        const printBtn = isPaid ? `<button class="btn btn-sm btn-outline-success py-0 px-2 fw-bold ms-1 shadow-sm" onclick="printInvoice('${escapeHTML(i.amount)}', '${escapeHTML(i.due_date || i.created_at.split('T')[0])}', '${i.id}')" title="إصدار فاتورة"><i class="fas fa-print"></i></button>` : '';
        const waBtn = !isPaid ? `<button class="btn btn-sm whatsapp-btn py-0 px-2 ms-1 shadow-sm" onclick="sendWhatsAppReminder('${escapeHTML(i.amount)}', '${escapeHTML(i.due_date || new Date(i.created_at).toLocaleDateString('ar-EG'))}')" title="إرسال تذكير بالدفع عبر واتساب"><i class="fab fa-whatsapp"></i></button>` : '';
        const delBtn = `<button class="btn btn-sm text-danger py-0 px-2 ms-1 shadow-sm" onclick="deleteRecord('installment', '${i.id}')" title="حذف الدفعة"><i class="fas fa-trash"></i></button>`;

        return `
        <div class="card-custom p-3 mb-2 d-flex justify-content-between align-items-center border-start border-4 ${isPaid ? 'border-success' : 'border-warning'} bg-white">
            <div>
                <b class="fs-5 ${isPaid ? 'text-success' : 'text-dark'}">${Number(i.amount).toLocaleString()} د.أ</b>
                <small class="d-block text-muted">تاريخ: ${escapeHTML(i.due_date || new Date(i.created_at).toLocaleDateString('ar-EG'))}</small>
            </div>
            <div>
                <span class="badge ${isPaid ? 'bg-success' : 'bg-warning text-dark'}">${escapeHTML(i.status)}</span>
                ${printBtn}
                ${waBtn}
                ${delBtn}
            </div>
        </div>
    `}).join('');
}

function sendWhatsAppReminder(amount, dueDate) {
    const client = window.firmClients.find(cl => cl.id === caseObj.client_id);
    if (!client || !client.phone) {
        showAlert('لا يوجد رقم هاتف مسجل للموكل في النظام.', 'warning');
        return;
    }
    let phoneStr = String(client.phone);
    if (phoneStr.startsWith('0')) phoneStr = '962' + phoneStr.substring(1);
    
    const text = `تحية طيبة السيد/ة ${client.full_name}،\n\nنود تذكيركم باستحقاق دفعة مالية مستحقة بقيمة *${amount} دينار أردني*، بتاريخ (${dueDate}).\nيرجى التواصل معنا لترتيب عملية السداد.\n\nمع التحية،\nإدارة المكتب.`;
    window.open(`https://wa.me/${phoneStr}?text=${encodeURIComponent(text)}`, '_blank');
}

function renderExpenses(expenses) {
    const container = document.getElementById('expenses-container');
    if (!expenses || expenses.length === 0) { container.innerHTML = '<div class="text-center p-3 text-muted small border bg-white rounded">لا توجد مصروفات.</div>'; return; }
    container.innerHTML = expenses.map(e => {
        const receiptLink = e.receipt_url ? `<a href="${escapeHTML(e.receipt_url)}" target="_blank" class="btn btn-sm btn-outline-secondary mt-1 py-0 px-2" title="عرض الإيصال المرفق"><i class="fas fa-paperclip"></i> مرفق</a>` : '';
        const delBtn = `<button class="btn btn-sm text-danger py-0 px-2 ms-1 shadow-sm" onclick="deleteRecord('expense', '${e.id}')" title="حذف المصروف"><i class="fas fa-trash"></i></button>`;
        return `
        <div class="card-custom p-3 mb-2 d-flex justify-content-between align-items-center border-start border-4 border-danger bg-white">
            <div>
                <b class="fs-5 text-danger">${Number(e.amount).toLocaleString()} د.أ</b>
                <small class="d-block text-muted">${escapeHTML(e.description)}</small>
                ${receiptLink}
            </div>
            <div>
                <small class="text-muted d-block mb-1"><i class="fas fa-calendar-alt"></i> ${escapeHTML(e.expense_date)}</small>
                <div class="text-end">${delBtn}</div>
            </div>
        </div>
    `}).join('');
}

function renderFiles(files) {
    const container = document.getElementById('files-container');
    if (!files || files.length === 0) { container.innerHTML = '<div class="col-12 text-center p-4 text-muted small border bg-white rounded">الأرشيف فارغ.</div>'; return; }
    container.innerHTML = files.map(f => {
        const isImage = f.file_type && f.file_type.includes('image');
        const iconHtml = (isImage && f.drive_file_id) ? `<i class="fas fa-image fs-1 text-primary mb-2"></i>` : `<i class="fas fa-file-pdf fs-1 text-danger mb-2"></i>`;
        const expiryBadge = f.expiry_date ? `<small class="d-block mt-1 text-danger" style="font-size: 0.65rem;"><i class="fas fa-clock"></i> ينتهي: ${escapeHTML(f.expiry_date)}</small>` : '';
        return `
        <div class="col-6">
            <div class="card-custom p-3 text-center border shadow-sm h-100 bg-white position-relative">
                <button class="btn btn-sm text-danger position-absolute top-0 start-0 m-1" onclick="deleteRecord('file', '${f.id}')"><i class="fas fa-trash"></i></button>
                <span class="badge bg-light text-dark border mb-2 d-block text-truncate">${escapeHTML(f.file_category || 'مستند')}</span>
                ${iconHtml}
                <h6 class="small fw-bold text-truncate mt-1 mb-0" title="${escapeHTML(f.file_name)}">${escapeHTML(f.file_name)}</h6>
                ${expiryBadge}
                <div class="d-flex gap-1 mt-2">
                    <a href="${escapeHTML(f.drive_file_id)}" target="_blank" class="btn btn-sm btn-outline-primary w-100 fw-bold">عرض</a>
                </div>
            </div>
        </div>
    `}).join('');
}

function calculateFinances(installments, expenses) {
    const totalPaid = installments.filter(i => i.status === 'مدفوعة').reduce((sum, i) => sum + Number(i.amount), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const agreedFees = Number(caseObj.total_agreed_fees) || 0;
    
    const clientRemaining = (agreedFees + totalExpenses) - totalPaid;

    document.getElementById('sum-agreed').innerText = agreedFees.toLocaleString();
    document.getElementById('sum-paid').innerText = totalPaid.toLocaleString();
    document.getElementById('sum-expenses').innerText = totalExpenses.toLocaleString();
    
    const netEl = document.getElementById('sum-net');
    if(netEl) {
        netEl.innerText = clientRemaining.toLocaleString();
        netEl.className = clientRemaining > 0 ? 'text-danger fw-bold fs-5' : 'text-success fw-bold fs-5';
    }
}

// دالة الحذف الموحدة
async function deleteRecord(type, id) {
    if(!confirm('هل أنت متأكد من الحذف؟ لا يمكن التراجع عن هذا الإجراء.')) return;
    try {
        if (type === 'update') await fetch(`${CONFIG.API_URL}/api/updates?id=eq.${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${localStorage.getItem(CONFIG.TOKEN_KEY)}` }});
        if (type === 'installment') await API.deleteInstallment(id, currentCaseId);
        if (type === 'expense') await fetch(`${CONFIG.API_URL}/api/expenses?id=eq.${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${localStorage.getItem(CONFIG.TOKEN_KEY)}` }});
        if (type === 'file') await fetch(`${CONFIG.API_URL}/api/files?id=eq.${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${localStorage.getItem(CONFIG.TOKEN_KEY)}` }});
        
        showAlert('تم الحذف بنجاح', 'success');
        await loadCaseFullDetails();
    } catch(e) {
        showAlert('حدث خطأ أثناء الحذف', 'danger');
    }
}

// ------------------- ميزة الإملاء الصوتي -------------------
function startDictation(elementId) {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        showAlert('عذراً، متصفحك لا يدعم الإملاء الصوتي. يرجى التحديث.', 'warning');
        return;
    }
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'ar-JO'; 
    recognition.interimResults = false;

    const textArea = document.getElementById(elementId);
    const originalPlaceholder = textArea.placeholder;
    textArea.placeholder = "جاري الاستماع... تحدث الآن.";
    
    showAlert('الميكروفون يعمل.. تحدث الآن', 'info');

    recognition.start();

    recognition.onresult = function(event) {
        textArea.value += (textArea.value ? ' ' : '') + event.results[0][0].transcript;
    };

    recognition.onerror = function() {
        showAlert('تم إيقاف الميكروفون أو حدث خطأ.', 'danger');
        textArea.placeholder = originalPlaceholder;
    };

    recognition.onend = function() {
        textArea.placeholder = originalPlaceholder;
        showAlert('تم إدراج النص الصوتي بنجاح.', 'success');
    };
}

// ------------------- ميزة المولد الآلي للمسودات (AI) -------------------
function openAiDraftModal() {
    document.getElementById('ai_draft_notes').value = '';
    document.getElementById('ai_draft_result_container').classList.add('d-none');
    document.getElementById('ai_draft_result').value = '';
    openModal('aiDraftModal');
}

async function generateAiDraft() {
    const btn = document.getElementById('btn_generate_draft');
    const draftType = document.getElementById('ai_draft_type').value;
    const extraNotes = document.getElementById('ai_draft_notes').value;
    
    const client = window.firmClients.find(cl => cl.id === caseObj.client_id);
    const clientName = client ? client.full_name : 'الموكل';
    const opponent = caseObj.opponent_name || 'الخصم';
    const claim = caseObj.claim_amount || 'غير محدد';
    const court = caseObj.current_court || 'المحكمة المختصة';

    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> جاري توليد المسودة...';
    btn.disabled = true;
    document.getElementById('ai_draft_result_container').classList.add('d-none');

    const promptText = `أنت محامي أردني محترف. قم بصياغة مسودة قانونية رسمية من نوع: (${draftType}).
البيانات المتوفرة للدمج:
- الطرف الأول (الموكل): ${clientName}
- الطرف الثاني (الخصم): ${opponent}
- المحكمة المختصة: ${court}
- المطالبة المالية: ${claim} دينار أردني
- ملاحظات إضافية من المحامي: ${extraNotes}

المطلوب:
اكتب المسودة بشكل رسمي وجاهز للطباعة والتوقيع. لا تكتب أي مقدمات أو ردود أو شروحات خارج النص القانوني. ابدأ بالبسملة والنص مباشرة.`;

    try {
        const res = await API.askAI(promptText);
        
        if (res && res.reply) {
            document.getElementById('ai_draft_result').value = res.reply;
            document.getElementById('ai_draft_result_container').classList.remove('d-none');
            showAlert('تم توليد المسودة بنجاح! يمكنك مراجعتها ونسخها.', 'success');
        } else {
            throw new Error('لم يتم استلام رد من الذكاء الاصطناعي');
        }
    } catch (e) {
        showAlert('فشل الاتصال بمحرك الذكاء الاصطناعي.', 'danger');
    } finally {
        btn.innerHTML = '<i class="fas fa-robot me-1"></i> توليد المسودة الآن';
        btn.disabled = false;
    }
}

function copyToClipboard(elementId) {
    const el = document.getElementById(elementId);
    el.select();
    el.setSelectionRange(0, 99999);
    document.execCommand("copy");
    showAlert("تم نسخ النص للحافظة بنجاح!", "success");
}

function tafqeet(number) {
    const units = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];
    const tens = ["", "عشرة", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
    const hundreds = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];
    const thousands = ["", "ألف", "ألفان", "آلاف"];

    if (number === 0) return "صفر";
    let words = "";

    const numStr = number.toString().padStart(6, '0');
    const hThous = parseInt(numStr[0]);
    const tThous = parseInt(numStr[1]);
    const uThous = parseInt(numStr[2]);
    const h = parseInt(numStr[3]);
    const t = parseInt(numStr[4]);
    const u = parseInt(numStr[5]);

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

    words = thousandPart + basicPart;
    words = words.replace(/ و$/, "").trim();
    return words;
}

// دالة الطباعة المتطورة (تتضمن الفاتورة و الـ QR للتحقق)
function printInvoice(amount, date, invoiceId) {
    document.getElementById('print-section').style.display = 'block';
    document.getElementById('qr-print-container').style.display = 'none';
    document.getElementById('invoice-print-container').style.display = 'block';

    document.getElementById('print-inv-date').innerText = date;
    document.getElementById('print-inv-case').innerText = caseObj.case_internal_id;
    
    const client = window.firmClients.find(cl => cl.id === caseObj.client_id);
    document.getElementById('print-inv-client').innerText = client ? client.full_name : "موكل";
    
    document.getElementById('print-inv-amount').innerText = amount;
    
    const textAmount = tafqeet(parseInt(amount));
    document.getElementById('print-inv-tafqeet').innerText = textAmount + " دينار أردني";

    const qrContainer = document.getElementById("invoice-verification-qr");
    if (qrContainer && caseObj.public_token) {
        qrContainer.innerHTML = "";
        const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
        const verifyUrl = `${baseUrl}verify.html?token=${caseObj.public_token}&inv=${invoiceId}`;
        
        new QRCode(qrContainer, {
            text: verifyUrl,
            width: 100,
            height: 100,
            colorDark : "#000000",
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.L
        });
        
        let note = document.createElement('div');
        note.style.fontSize = "11px";
        note.style.marginTop = "8px";
        note.style.color = "#555";
        note.innerHTML = "<b>حماية المستندات:</b> امسح الرمز أعلاه بكاميرا هاتفك للتحقق من أن هذا السند أصلي ومسجل.";
        qrContainer.appendChild(note);
    } else if (qrContainer) {
        qrContainer.innerHTML = "<small>لا يمكن توليد رمز التحقق.</small>";
    }

    window.print();
    setTimeout(() => { document.getElementById('print-section').style.display = 'none'; }, 1000);
}

function printQRCode() {
    if(!caseObj.public_token) {
        showAlert('لا يوجد رابط وصول عام لهذه القضية لتوليد الرمز.', 'danger');
        return;
    }
    
    document.getElementById('print-section').style.display = 'block';
    document.getElementById('invoice-print-container').style.display = 'none';
    document.getElementById('qr-print-container').style.display = 'block';
    
    document.getElementById('print-qr-casenum').innerText = `ملف رقم: ${caseObj.case_internal_id}`;

    const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
    const deepLink = `${baseUrl}client.html?token=${caseObj.public_token}`;

    const qrContainer = document.getElementById("qrcode");
    qrContainer.innerHTML = ""; 
    
    new QRCode(qrContainer, {
        text: deepLink,
        width: 200,
        height: 200,
        colorDark : "#0a192f",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
    });

    setTimeout(() => {
        window.print();
        document.getElementById('print-section').style.display = 'none';
    }, 500);
}

function openEditModal() {
    document.getElementById('edit_internal_id').value = caseObj.case_internal_id || '';
    document.getElementById('edit_status').value = caseObj.status || 'نشطة';
    document.getElementById('edit_access_pin').value = caseObj.access_pin || '';
    document.getElementById('edit_court').value = caseObj.current_court || '';
    document.getElementById('edit_court_case_number').value = caseObj.court_case_number || '';
    document.getElementById('edit_case_year').value = caseObj.case_year || '';
    document.getElementById('edit_litigation_degree').value = caseObj.litigation_degree || '';
    document.getElementById('edit_judge').value = caseObj.current_judge || '';
    document.getElementById('edit_type').value = caseObj.case_type || '';
    document.getElementById('edit_opponent').value = caseObj.opponent_name || '';
    document.getElementById('edit_claim').value = caseObj.claim_amount || '';
    document.getElementById('edit_fees').value = caseObj.total_agreed_fees || '';
    
    document.getElementById('edit_opponent_lawyer').value = caseObj.opponent_lawyer || '';
    document.getElementById('edit_poa_details').value = caseObj.poa_details || '';
    document.getElementById('edit_deadline_date').value = caseObj.deadline_date || '';
    document.getElementById('edit_success_probability').value = caseObj.success_probability || '';
    
    const lawyerSelect = document.getElementById('edit_assigned_lawyer');
    if(lawyerSelect && window.firmStaff) {
        lawyerSelect.innerHTML = '<option value="">بدون إسناد (لمكتب العمل)</option>' + 
            window.firmStaff.map(s => `<option value="${s.id}">${escapeHTML(s.full_name)}</option>`).join('');
            
        if (caseObj.assigned_lawyer_id) {
            lawyerSelect.value = Array.isArray(caseObj.assigned_lawyer_id) ? caseObj.assigned_lawyer_id[0] : caseObj.assigned_lawyer_id;
        } else {
            lawyerSelect.value = '';
        }
    }
    
    const parentCaseSelect = document.getElementById('edit_parent_case_id');
    if(parentCaseSelect && window.firmCases) {
        parentCaseSelect.innerHTML = '<option value="">لا يوجد (قضية رئيسية)</option>' + 
            window.firmCases.filter(c => c.id !== currentCaseId).map(c => `<option value="${c.id}">${escapeHTML(c.case_internal_id)}</option>`).join('');
        if (caseObj.parent_case_id) parentCaseSelect.value = caseObj.parent_case_id;
    }
    
    openModal('editCaseModal');
}

async function updateCaseDetails(event) {
    event.preventDefault();
    const assignedVal = document.getElementById('edit_assigned_lawyer')?.value;
    const parentCaseVal = document.getElementById('edit_parent_case_id')?.value;
    
    const data = {
        case_internal_id: document.getElementById('edit_internal_id')?.value, 
        status: document.getElementById('edit_status')?.value,
        access_pin: document.getElementById('edit_access_pin')?.value, 
        current_court: document.getElementById('edit_court')?.value,
        court_case_number: document.getElementById('edit_court_case_number')?.value, 
        case_year: document.getElementById('edit_case_year')?.value ? Number(document.getElementById('edit_case_year').value) : null,
        litigation_degree: document.getElementById('edit_litigation_degree')?.value, 
        current_judge: document.getElementById('edit_judge')?.value,
        case_type: document.getElementById('edit_type')?.value, 
        opponent_name: document.getElementById('edit_opponent')?.value,
        claim_amount: document.getElementById('edit_claim')?.value ? Number(document.getElementById('edit_claim').value) : null,
        total_agreed_fees: document.getElementById('edit_fees')?.value ? Number(document.getElementById('edit_fees').value) : 0,
        
        opponent_lawyer: document.getElementById('edit_opponent_lawyer')?.value || null,
        poa_details: document.getElementById('edit_poa_details')?.value || null,
        deadline_date: document.getElementById('edit_deadline_date')?.value || null,
        success_probability: document.getElementById('edit_success_probability')?.value ? Number(document.getElementById('edit_success_probability').value) : null,
        
        assigned_lawyer_id: assignedVal ? [assignedVal] : null,
        parent_case_id: parentCaseVal || null
    };
    if(await API.updateCase(currentCaseId, data)) { closeModal('editCaseModal'); showAlert('تم التحديث بنجاح', 'success'); await loadCaseFullDetails(); }
}

function openUpdateModal() {
    const lawyerSelect = document.getElementById('upd_assigned_lawyer');
    if(lawyerSelect && window.firmStaff) {
        lawyerSelect.innerHTML = '<option value="">لا يوجد إسناد محدد</option>' + 
            window.firmStaff.map(s => `<option value="${s.id}">${escapeHTML(s.full_name)}</option>`).join('');
    }
    openModal('updateModal');
}

async function saveUpdate(event) {
    event.preventDefault();
    const assignedLawyer = document.getElementById('upd_assigned_lawyer') ? document.getElementById('upd_assigned_lawyer').value : null;

    const data = {
        case_id: currentCaseId, 
        update_title: document.getElementById('upd_title').value, 
        update_details: document.getElementById('upd_details').value,
        hearing_date: document.getElementById('upd_hearing_date').value || null, 
        next_hearing_date: document.getElementById('upd_next_hearing').value || null,
        is_visible_to_client: document.getElementById('upd_visible').checked,
        assigned_to: assignedLawyer ? [assignedLawyer] : null 
    };
    if(await API.addUpdate(data)) { closeModal('updateModal'); document.getElementById('updateForm').reset(); showAlert('تمت الإضافة وإرسال الإشعار', 'success'); await loadCaseFullDetails(); }
}

async function savePayment(event) {
    event.preventDefault();
    const data = { case_id: currentCaseId, amount: Number(document.getElementById('pay_amount').value), due_date: document.getElementById('pay_due_date').value, status: document.getElementById('pay_status').value };
    if(await API.addInstallment(data)) { closeModal('paymentModal'); document.getElementById('paymentForm').reset(); showAlert('تم تسجيل الدفعة', 'success'); await loadCaseFullDetails(); }
}

async function saveExpense(event) {
    event.preventDefault();
    const data = { 
        case_id: currentCaseId, 
        amount: Number(document.getElementById('exp_amount').value), 
        description: document.getElementById('exp_desc').value, 
        expense_date: document.getElementById('exp_date').value,
        receipt_url: document.getElementById('exp_receipt_url').value || null 
    };
    if(await API.addExpense(data)) { closeModal('expenseModal'); document.getElementById('expenseForm').reset(); showAlert('تم تسجيل المصروف', 'success'); await loadCaseFullDetails(); }
}

async function saveFile(event) {
    event.preventDefault();
    const fileInput = document.getElementById('file_input');
    const titleInput = document.getElementById('file_title_input').value;
    const catInput = document.getElementById('file_category_input').value;
    const expiryInput = document.getElementById('file_expiry_date').value;
    const btn = document.getElementById('btn_upload');
    if (!fileInput.files.length) return;
    const file = fileInput.files[0];
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> جاري الأرشفة...';
    try {
        const driveRes = await API.uploadToDrive(file, caseObj.case_internal_id);
        if(driveRes && driveRes.url) {
            if(await API.addFileRecord({ 
                case_id: currentCaseId, 
                file_name: titleInput || file.name, 
                file_type: file.type, 
                file_category: catInput, 
                drive_file_id: driveRes.url, 
                is_template: false,
                expiry_date: expiryInput || null
            })) {
                closeModal('fileModal'); document.getElementById('fileForm').reset(); showAlert('تم الحفظ السحابي', 'success'); await loadCaseFullDetails();
            }
        }
    } catch (err) { showAlert("فشل: " + err.message, 'danger'); } finally { btn.disabled = false; btn.innerHTML = '<i class="fas fa-upload me-1"></i> بدء الرفع السحابي'; }
}

function copyDeepLink() {
    if(!caseObj.public_token) { showAlert('لا يوجد رمز وصول آمن.', 'danger'); return; }
    const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
    const deepLink = `${baseUrl}client.html?token=${caseObj.public_token}`;
    const pin = caseObj.access_pin || 'غير محدد';
    const shareText = `مرحباً، يمكنك متابعة قضيتك عبر الرابط:\n${deepLink}\n\nرمز الدخول PIN الخاص بك هو: ${pin}`;
    if (navigator.share) navigator.share({ title: 'رابط القضية', text: shareText }).catch(err => console.log(err));
    else window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank');
}

function goToClientProfile() { if (caseObj && caseObj.client_id) { localStorage.setItem('current_client_id', caseObj.client_id); window.location.href = 'client-details.html'; } }
function openModal(id) { const el = document.getElementById(id); if(el) { const m = new bootstrap.Modal(el); m.show(); } }
function closeModal(id) { const el = document.getElementById(id); if(el) { const m = bootstrap.Modal.getInstance(el); if(m) m.hide(); document.querySelectorAll('.modal-backdrop').forEach(b => b.remove()); document.body.classList.remove('modal-open'); document.body.style.overflow = ''; document.body.style.paddingRight = ''; } }
function showAlert(message, type = 'info') { const box = document.getElementById('alertBox'); if(!box) return; const alertId = 'alert-' + Date.now(); let typeClass = type === 'success' ? 'alert-success-custom' : 'alert-danger-custom'; if(type === 'warning') typeClass = 'bg-warning text-dark border-warning'; box.insertAdjacentHTML('beforeend', `<div id="${alertId}" class="alert-custom ${typeClass}"><span>${escapeHTML(message)}</span></div>`); setTimeout(() => { const el = document.getElementById(alertId); if(el) { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); } }, 4000); }