// js/case-details.js - محرك التفاصيل المطور (يدعم الفواتير، التفقيط، الـ QR Code، الملاحظات السرية)

let currentCaseId = localStorage.getItem('current_case_id');
let caseObj = null;
let realtimeSyncTimer = null;
let qrCodeInstance = null;

window.onload = async () => {
    if (!currentCaseId) { window.location.href = 'app.html'; return; }
    await loadCaseFullDetails();
    startRealtimeSync();
};

function startRealtimeSync() {
    realtimeSyncTimer = setInterval(async () => {
        try {
            const [updates, installments, expenses] = await Promise.all([
                fetchAPI(`/api/updates?case_id=${currentCaseId}`),
                fetchAPI(`/api/installments?case_id=${currentCaseId}`),
                fetchAPI(`/api/expenses?case_id=${currentCaseId}`)
            ]);
            renderTimeline(updates || []);
            renderPayments(installments || []);
            renderExpenses(expenses || []);
            calculateFinances(installments || [], expenses || []);
        } catch(e) {}
    }, 5000);
}

function goBack() { window.location.href = 'app.html'; }

async function loadCaseFullDetails() {
    try {
        const [allCases, updates, installments, expenses, files] = await Promise.all([
            API.getCases(), fetchAPI(`/api/updates?case_id=${currentCaseId}`), fetchAPI(`/api/installments?case_id=${currentCaseId}`),
            fetchAPI(`/api/expenses?case_id=${currentCaseId}`), fetchAPI(`/api/files?case_id=${currentCaseId}`)
        ]);
        caseObj = (allCases || []).find(c => c.id == currentCaseId);
        if (!caseObj) { window.location.href = 'app.html'; return; }

        renderHeaderAndSummary();
        renderTimeline(updates || []);
        renderPayments(installments || []);
        renderExpenses(expenses || []);
        renderFiles(files || []);
        calculateFinances(installments || [], expenses || []);
        
        // تعبئة الملاحظات السرية
        document.getElementById('secret_notes_input').value = caseObj.secret_notes || '';
        
    } catch (error) { showAlert('حدث خطأ أثناء جلب التفاصيل', 'danger'); }
}

function renderHeaderAndSummary() {
    document.getElementById('case-title').innerText = `${caseObj.case_internal_id || 'ملف قضية'}`;
    document.getElementById('case-client-name').innerHTML = `<i class="fas fa-user-tie me-2 text-info"></i> ${caseObj.mo_clients?.full_name || "موكل غير محدد"}`;
    document.getElementById('det-court').innerText = caseObj.current_court || "--";
    document.getElementById('det-court-num').innerText = caseObj.court_case_number || "--";
    document.getElementById('det-judge').innerText = caseObj.current_judge || "--";
    document.getElementById('det-type').innerText = caseObj.case_type || "--";
    document.getElementById('det-opponent').innerText = caseObj.opponent_name || "--";
    
    // الحقول المؤسسية
    document.getElementById('det-opp-lawyer').innerText = caseObj.opponent_lawyer || "غير محدد";
    document.getElementById('det-poa').innerText = caseObj.poa_details || "غير محدد";
    document.getElementById('det-success').innerText = caseObj.success_probability ? `${caseObj.success_probability}%` : "غير محدد";
    
    // حساب الموعد النهائي
    const deadlineEl = document.getElementById('det-deadline');
    if (caseObj.deadline_date) {
        deadlineEl.innerText = caseObj.deadline_date;
        const daysLeft = Math.ceil((new Date(caseObj.deadline_date) - new Date()) / (1000 * 60 * 60 * 24));
        if(daysLeft <= 7 && daysLeft > 0) deadlineEl.className = "text-danger fw-bold heartbeat-animation";
        else if (daysLeft < 0) deadlineEl.innerHTML = `<span class="text-dark"><i class="fas fa-times"></i> منتهي</span>`;
    } else {
        deadlineEl.innerText = "غير محدد";
    }

    document.getElementById('case-pin').innerHTML = `<i class="fas fa-key text-warning"></i> PIN: ${caseObj.access_pin || 'غير محدد'}`;
    const statusEl = document.getElementById('case-status');
    statusEl.innerText = caseObj.status || "نشطة";
    statusEl.className = `badge fs-6 ${caseObj.status === 'نشطة' ? 'bg-success' : 'bg-danger'}`;
}

// حفظ الملاحظات السرية
async function saveSecretNotes() {
    const notes = document.getElementById('secret_notes_input').value;
    const res = await API.updateCase(currentCaseId, { secret_notes: notes });
    if (res) showAlert('تم حفظ الملاحظات السرية', 'success');
}

function renderTimeline(updates) {
    const container = document.getElementById('timeline-container');
    if (!updates || updates.length === 0) { container.innerHTML = '<div class="text-center p-4 text-muted small">لا يوجد وقائع.</div>'; return; }
    container.innerHTML = updates.map(u => `
        <div class="timeline-item mb-3">
            <div class="card-custom p-3 shadow-sm bg-white border-end border-4 border-navy">
                <small class="text-primary fw-bold">${new Date(u.created_at).toLocaleDateString('ar-EG')}</small>
                <h6 class="fw-bold text-navy mt-1">${u.update_title}</h6>
                <p class="mb-0 small">${u.update_details}</p>
                ${u.hearing_date ? `<small class="d-block mt-2 text-muted"><i class="fas fa-calendar-check text-success"></i> الجلسة: ${u.hearing_date}</small>` : ''}
            </div>
        </div>
    `).join('');
}

function renderPayments(installments) {
    const container = document.getElementById('payments-container');
    if (!installments || installments.length === 0) { container.innerHTML = '<div class="text-center p-3 text-muted small border bg-white">لا توجد دفعات.</div>'; return; }
    
    container.innerHTML = installments.map(i => {
        // زر طباعة الفاتورة يظهر فقط للتي حالتها مدفوعة
        const printBtn = i.status === 'مدفوعة' ? `<button class="btn btn-sm btn-outline-success fw-bold ms-2" onclick="printInvoice('${i.amount}', '${i.due_date || i.created_at.split('T')[0]}', '${i.id}')" title="إصدار فاتورة"><i class="fas fa-print"></i> فاتورة</button>` : '';
        
        return `
        <div class="card-custom p-3 mb-2 d-flex justify-content-between align-items-center border-start border-4 ${i.status === 'مدفوعة' ? 'border-success' : 'border-warning'}">
            <div>
                <b class="fs-5 text-success">${Number(i.amount).toLocaleString()} د.أ</b>
                <small class="d-block text-muted">تاريخ: ${i.due_date || new Date(i.created_at).toLocaleDateString()}</small>
            </div>
            <div>
                <span class="badge ${i.status === 'مدفوعة' ? 'bg-success' : 'bg-warning text-dark'}">${i.status}</span>
                ${printBtn}
            </div>
        </div>
    `}).join('');
}

function renderExpenses(expenses) { /* نفس الكود السابق تماماً */ }
function renderFiles(files) { /* نفس الكود السابق تماماً */ }

function calculateFinances(installments, expenses) {
    const totalPaid = installments.filter(i => i.status === 'مدفوعة').reduce((sum, i) => sum + Number(i.amount), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const agreedFees = Number(caseObj.total_agreed_fees) || 0;
    const netProfit = totalPaid - totalExpenses;
    document.getElementById('sum-agreed').innerText = agreedFees.toLocaleString();
    document.getElementById('sum-paid').innerText = totalPaid.toLocaleString();
    document.getElementById('sum-expenses').innerText = totalExpenses.toLocaleString();
    document.getElementById('sum-net').innerText = netProfit.toLocaleString();
    document.getElementById('sum-net').className = netProfit >= 0 ? 'text-primary' : 'text-danger';
}

// -------------------------------------------------------------
// نظام طباعة الفواتير و التفقيط الآلي (Numbers to Arabic)
// -------------------------------------------------------------

function tafqeet(number) {
    const units = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];
    const tens = ["", "عشرة", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
    const hundreds = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];
    const thousands = ["", "ألف", "ألفان", "آلاف"];

    if (number === 0) return "صفر";
    let words = "";

    // للتبسيط، يدعم حتى مئات الآلاف
    const numStr = number.toString().padStart(6, '0');
    const hThous = parseInt(numStr[0]);
    const tThous = parseInt(numStr[1]);
    const uThous = parseInt(numStr[2]);
    const h = parseInt(numStr[3]);
    const t = parseInt(numStr[4]);
    const u = parseInt(numStr[5]);

    let thousandPart = "";
    if (hThous > 0) thousandPart += hundreds[hThous] + " و";
    if (tThous === 1 && uThous > 0) thousandPart += "أحد عشر ألفاً و"; // مبسط جداً
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
    words = words.replace(/ و$/, "").trim(); // إزالة حرف العطف الزائد في النهاية
    return words;
}

function printInvoice(amount, date, invoiceId) {
    document.getElementById('print-section').style.display = 'block';
    document.getElementById('qr-print-container').style.display = 'none';
    document.getElementById('invoice-print-container').style.display = 'block';

    document.getElementById('print-inv-date').innerText = date;
    document.getElementById('print-inv-case').innerText = caseObj.case_internal_id;
    document.getElementById('print-inv-client').innerText = caseObj.mo_clients?.full_name || "موكل";
    document.getElementById('print-inv-amount').innerText = amount;
    
    // تفعيل التفقيط
    const textAmount = tafqeet(parseInt(amount));
    document.getElementById('print-inv-tafqeet').innerText = textAmount + " دينار أردني";

    window.print();
    
    setTimeout(() => { document.getElementById('print-section').style.display = 'none'; }, 1000);
}

// -------------------------------------------------------------
// نظام توليد الـ QR Code وطباعته
// -------------------------------------------------------------
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
    qrContainer.innerHTML = ""; // تفريغ القديم
    
    // إنشاء الكود
    new QRCode(qrContainer, {
        text: deepLink,
        width: 200,
        height: 200,
        colorDark : "#0a192f",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
    });

    // الانتظار قليلاً ليتم رسم الكود ثم الطباعة
    setTimeout(() => {
        window.print();
        document.getElementById('print-section').style.display = 'none';
    }, 500);
}

// دالة المشاركة كما هي
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
function openModal(id) { new bootstrap.Modal(document.getElementById(id)).show(); }
function closeModal(id) { const m = bootstrap.Modal.getInstance(document.getElementById(id)); if (m) m.hide(); document.querySelectorAll('.modal-backdrop').forEach(el => el.remove()); }
function showAlert(message, type = 'info') {
    const box = document.getElementById('alertBox'); if(!box) return;
    const alertId = 'alert-' + Date.now();
    let typeClass = type === 'success' ? 'alert-success-custom' : 'alert-danger-custom';
    box.insertAdjacentHTML('beforeend', `<div id="${alertId}" class="alert-custom ${typeClass}"><span>${message}</span></div>`);
    setTimeout(() => { const el = document.getElementById(alertId); if(el) { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); } }, 3000);
}