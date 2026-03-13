// js/case-details.js - محرك تفاصيل القضية والتقارير

let currentCaseId = localStorage.getItem('current_case_id');
let caseObj = null;

/**
 * عند التحميل: جلب كل ما يخص هذه القضية
 */
window.onload = async () => {
    if (!currentCaseId) {
        window.location.href = 'app.html';
        return;
    }
    await loadCaseFullDetails();
};

/**
 * جلب البيانات (بيانات القضية، التحديثات، الدفعات)
 */
async function loadCaseFullDetails() {
    console.log("🔄 جاري تحميل سجل القضية...");
    
    // جلب البيانات بشكل متوازي لسرعة الأداء
    const [allCases, updates, installments] = await Promise.all([
        API.getCases(),
        API.getUpdates(currentCaseId),
        API.getInstallments(currentCaseId)
    ]);

    // العثور على القضية الحالية من القائمة
    caseObj = (allCases || []).find(c => c.id == currentCaseId);

    if (!caseObj) {
        alert("عذراً، لم يتم العثور على بيانات هذه القضية.");
        window.location.href = 'app.html';
        return;
    }

    renderHeader();
    renderTimeline(updates || []);
    renderPayments(installments || []);
    calculateFinances(installments || []);
}

/**
 * عرض بيانات الرأس (اسم الموكل ورقم القضية)
 */
function renderHeader() {
    const title = document.getElementById('case-title');
    const clientName = document.getElementById('case-client-name');
    const court = document.getElementById('case-court');
    const status = document.getElementById('case-status');

    if (title) title.innerText = `ملف: ${caseObj.case_internal_id}`;
    if (clientName) clientName.innerText = caseObj.mo_clients?.full_name || "اسم الموكل";
    if (court) court.innerText = caseObj.current_court || "المحكمة غير محددة";
    if (status) {
        status.innerText = caseObj.status;
        status.className = `badge ${caseObj.status === 'نشطة' ? 'bg-success' : 'bg-secondary'}`;
    }
}

/**
 * عرض الخط الزمني للأحداث (Timeline)
 */
function renderTimeline(updates) {
    const container = document.getElementById('timeline-container');
    if (!container) return;

    if (updates.length === 0) {
        container.innerHTML = '<div class="text-center p-4 text-muted small">لا يوجد وقائع مسجلة بعد.</div>';
        return;
    }

    container.innerHTML = updates.map(u => `
        <div class="timeline-item mb-3">
            <div class="card-custom p-3 shadow-sm bg-white border-end border-4 border-navy">
                <small class="text-primary d-block mb-1 fw-bold">
                    ${new Date(u.created_at).toLocaleDateString('ar-EG')}
                </small>
                <p class="mb-0 small text-navy fw-bold">${u.content}</p>
            </div>
        </div>
    `).join('');
}

/**
 * عرض سجل الدفعات المالية
 */
function renderPayments(installments) {
    const container = document.getElementById('payments-container');
    if (!container) return;

    container.innerHTML = installments.map(i => `
        <div class="card-custom p-2 mb-2 d-flex justify-content-between align-items-center border-bottom">
            <b class="text-success">+ ${i.amount} د.أ</b>
            <small class="text-muted">${new Date(i.created_at).toLocaleDateString()}</small>
        </div>
    `).join('') || '<p class="text-center text-muted p-3">لا توجد دفعات.</p>';
}

/**
 * حساب المبالغ المتبقية
 */
function calculateFinances(installments) {
    const totalPaid = installments.reduce((sum, i) => sum + Number(i.amount), 0);
    const agreedFees = Number(caseObj.total_agreed_fees) || 0;

    const agreedEl = document.getElementById('sum-agreed');
    const paidEl = document.getElementById('sum-paid');
    const remEl = document.getElementById('sum-rem');

    if (agreedEl) agreedEl.innerText = agreedFees + " د.أ";
    if (paidEl) paidEl.innerText = totalPaid + " د.أ";
    if (remEl) remEl.innerText = (agreedFees - totalPaid) + " د.أ";
}

/**
 * حفظ واقعة جديدة (Timeline)
 */
async function saveUpdate(event) {
    event.preventDefault();
    const content = document.getElementById('upd_content').value;
    if (!content) return;

    const res = await API.addUpdate({ case_id: currentCaseId, content: content });
    if (res) {
        closeModal('updateModal');
        await loadCaseFullDetails();
    }
}

/**
 * حفظ دفعة مالية جديدة
 */
async function savePayment(event) {
    event.preventDefault();
    const amount = document.getElementById('pay_amount').value;
    if (!amount) return;

    const res = await API.addInstallment({ case_id: currentCaseId, amount: amount });
    if (res) {
        closeModal('paymentModal');
        await loadCaseFullDetails();
    }
}

/**
 * توليد تقرير فوري للطباعة
 */
function generatePDF() {
    let printContent = `
        <div dir="rtl" style="font-family: Cairo, Arial; padding: 30px;">
            <h1 style="text-align:center;">تقرير ملف قانوني</h1>
            <hr>
            <p><b>رقم الملف الداخلي:</b> ${caseObj.case_internal_id}</p>
            <p><b>اسم الموكل:</b> ${caseObj.mo_clients?.full_name}</p>
            <p><b>المحكمة:</b> ${caseObj.current_court}</p>
            <hr>
            <h3>سجل الوقائع</h3>
            ${document.getElementById('timeline-container').innerHTML}
            <hr>
            <h3>ملخص المالية</h3>
            <p>الأتعاب المتفق عليها: ${caseObj.total_agreed_fees} د.أ</p>
            <p>إجمالي المدفوع: ${document.getElementById('sum-paid').innerText}</p>
        </div>
    `;

    const win = window.open('', '_blank');
    win.document.write(printContent);
    win.document.close();
    win.print();
}

/**
 * دوال مساعدة
 */
function openModal(id) { new bootstrap.Modal(document.getElementById(id)).show(); }
function closeModal(id) {
    const m = bootstrap.Modal.getInstance(document.getElementById(id));
    if (m) m.hide();
    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
}