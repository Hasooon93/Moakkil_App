// js/app.js (النسخة الاحترافية الكاملة)

let globalData = { cases: [], clients: [], staff: [], appointments: [] };
let currentUser = JSON.parse(localStorage.getItem('moakkil_v2_user'));

window.onload = async () => {
    if (!localStorage.getItem('moakkil_v2_token')) return window.location.href = 'index.html';
    setupUI();
    await loadAllData();
};

function setupUI() {
    document.getElementById('welcome-name').innerText = currentUser.full_name;
    document.getElementById('top-user-name').innerText = currentUser.full_name;
    if (currentUser.role === 'admin') document.getElementById('stat-staff-card').style.display = 'block';
}

// تحميل كافة البيانات
async function loadAllData() {
    try {
        const [clients, cases, staff, appts] = await Promise.all([
            API.getClients(), API.getCases(), API.getStaff(), API.getAppointments()
        ]);
        globalData = { clients, cases, staff, appointments: appts };
        renderDashboard();
        renderClientsList();
        renderCasesList();
        populateSelects();
    } catch (e) { console.error("Data Load Error:", e); }
}

// عرض القضايا (بطريقة احترافية)
function renderCasesList() {
    const container = document.getElementById('cases-list');
    container.innerHTML = globalData.cases.map(c => `
        <div class="card-custom p-3 mb-2 border-start border-4 border-accent" onclick="viewCaseDetails('${c.id}')">
            <div class="d-flex justify-content-between align-items-start">
                <div>
                    <h6 class="fw-bold text-navy mb-1">${c.case_internal_id}</h6>
                    <small class="text-muted"><i class="fas fa-user me-1"></i> ${c.mo_clients?.full_name || 'موكل غير معروف'}</small>
                </div>
                <span class="badge ${c.status === 'نشطة' ? 'bg-success' : 'bg-secondary'}">${c.status}</span>
            </div>
            <div class="mt-2 d-flex justify-content-between align-items-center">
                <small class="text-muted small"><i class="fas fa-gavel me-1"></i> ${c.current_court || 'لم تحدد'}</small>
                <i class="fas fa-chevron-left text-muted small"></i>
            </div>
        </div>
    `).join('') || '<p class="text-center text-muted">لا يوجد قضايا حالياً</p>';
}

// عرض الموكلين
function renderClientsList() {
    const container = document.getElementById('clients-list');
    container.innerHTML = globalData.clients.map(c => `
        <div class="card-custom p-3 mb-2">
            <div class="d-flex justify-content-between">
                <b class="text-navy">${c.full_name}</b>
                <a href="tel:${c.phone}" class="text-decoration-none"><i class="fas fa-phone text-success"></i></a>
            </div>
            <div class="mt-2">
                <button class="btn btn-sm btn-outline-primary" onclick="copyDeepLink('${c.id}')"><i class="fas fa-link"></i> رابط الموكل</button>
            </div>
        </div>
    `).join('') || '<p class="text-center text-muted">لا يوجد موكلين</p>';
}

// دالة الذكاء الاصطناعي
async function askAI() {
    const prompt = document.querySelector('#library-view textarea').value;
    if (!prompt) return;
    
    const btn = document.querySelector('#library-view button');
    const resultDiv = document.getElementById('ai-results');
    
    btn.disabled = true;
    btn.innerHTML = 'جاري التفكير... <i class="fas fa-spinner fa-spin"></i>';
    resultDiv.innerHTML = '<div class="card-custom p-3">جاري تحليل الطلب...</div>';

    try {
        const res = await fetch(`${CONFIG.API_URL}/api/ai/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem(CONFIG.TOKEN_KEY)}` },
            body: JSON.stringify({ prompt })
        });
        const data = await res.json();
        resultDiv.innerHTML = `<div class="card-custom p-3 bg-white shadow-sm border-start border-4 border-purple">
            <h6 class="fw-bold text-purple"><i class="fas fa-robot"></i> رد موكّل الذكي:</h6>
            <p class="mb-0" style="white-space: pre-wrap;">${data.result}</p>
        </div>`;
    } catch (e) {
        resultDiv.innerHTML = '<div class="alert alert-danger">فشل الاتصال بالذكاء الاصطناعي</div>';
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-magic me-1"></i> تحليل وبحث';
    }
}

// إنشاء رابط الموكل العميق
function copyDeepLink(clientId) {
    const link = `${window.location.origin}/client.html?id=${clientId}`;
    navigator.clipboard.writeText(link);
    showAlert('تم نسخ رابط الموكل بنجاح!', 'success');
}

// (بقية الدوال saveCase, saveClient موجودة في الكود السابق ويجب الإبقاء عليها)