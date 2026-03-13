// js/app.js
let globalData = { cases: [], clients: [], staff: [] };
let currentUser = JSON.parse(localStorage.getItem(CONFIG.USER_KEY));

window.onload = async () => {
    if (!localStorage.getItem(CONFIG.TOKEN_KEY)) {
        window.location.href = 'index.html';
        return;
    }
    
    // إعداد الاسم في الواجهة
    const welcomeName = document.getElementById('welcome-name');
    if (welcomeName && currentUser) welcomeName.innerText = currentUser.full_name;

    await loadAllData();
};

async function loadAllData() {
    console.log("🔄 جاري مزامنة البيانات...");
    
    // جلب البيانات من السيرفر (مع حماية ضد الفشل)
    const [clients, cases, staff] = await Promise.all([
        API.getClients(),
        API.getCases(),
        API.getStaff()
    ]);

    globalData.clients = clients || [];
    globalData.cases = cases || [];
    globalData.staff = staff || [];

    // استدعاء دوال العرض (كلها معرفة بالأسفل)
    renderDashboard();
    renderCasesList();
    renderClientsList();
    populateSelects();
}

function renderDashboard() {
    const caseStat = document.getElementById('stat-cases');
    const clientStat = document.getElementById('stat-clients');
    if(caseStat) caseStat.innerText = globalData.cases.length;
    if(clientStat) clientStat.innerText = globalData.clients.length;
}

function renderCasesList() {
    const list = document.getElementById('cases-list');
    if(!list) return;
    
    if (globalData.cases.length === 0) {
        list.innerHTML = '<p class="text-center p-3 text-muted">لا يوجد قضايا مسجلة</p>';
        return;
    }

    list.innerHTML = globalData.cases.map(c => `
        <div class="card-custom p-3 mb-2 shadow-sm border-start border-4 border-accent" onclick="viewCaseDetails('${c.id}')" style="cursor:pointer">
            <h6 class="fw-bold mb-1 text-navy">${c.case_internal_id || 'بدون رقم'}</h6>
            <small class="text-muted">الحالة: ${c.status || 'نشطة'}</small>
        </div>
    `).join('');
}

function renderClientsList() {
    const list = document.getElementById('clients-list');
    if(!list) return;

    if (globalData.clients.length === 0) {
        list.innerHTML = '<p class="text-center p-3 text-muted">لا يوجد موكلين مسجلين</p>';
        return;
    }

    list.innerHTML = globalData.clients.map(c => `
        <div class="card-custom p-3 mb-2 shadow-sm d-flex justify-content-between align-items-center">
            <div>
                <b class="text-navy">${c.full_name}</b><br>
                <small class="text-muted">${c.phone}</small>
            </div>
            <button class="btn btn-sm btn-light" onclick="copyDeepLink('${c.id}')"><i class="fas fa-link"></i></button>
        </div>
    `).join('');
}

function populateSelects() {
    const select = document.getElementById('case_client_id');
    if(select) {
        select.innerHTML = '<option value="">اختر الموكل...</option>' + 
            globalData.clients.map(c => `<option value="${c.id}">${c.full_name}</option>`).join('');
    }
}

function switchView(viewId) {
    // إخفاء كافة الشاشات
    document.querySelectorAll('.view').forEach(v => v.classList.add('d-none'));
    
    // إظهار الشاشة المختارة
    const target = document.getElementById(viewId + '-view');
    if(target) target.classList.remove('d-none');
    
    // تحديث القائمة السفلية
    document.querySelectorAll('.nav-item').forEach(n => n.classList.add('text-muted'));
    const activeNav = document.getElementById(`nav-icon-${viewId}`);
    if(activeNav) activeNav.parentElement.classList.remove('text-muted');
}

// دوال حفظ البيانات
async function saveClient(event) {
    event.preventDefault();
    const data = {
        full_name: document.getElementById('client_full_name').value,
        phone: document.getElementById('client_phone').value
    };
    await API.addClient(data);
    closeModal('clientModal');
    await loadAllData();
}

async function saveCase(event) {
    event.preventDefault();
    const data = {
        client_id: document.getElementById('case_client_id').value,
        case_internal_id: document.getElementById('case_internal_id').value,
        status: 'نشطة'
    };
    await API.addCase(data);
    closeModal('caseModal');
    await loadAllData();
}

function viewCaseDetails(id) {
    localStorage.setItem('current_case_id', id);
    window.location.href = 'case-details.html';
}

// دوال التحكم بالنوافذ (Modals)
function openModal(id) {
    const modalEl = document.getElementById(id);
    if(modalEl) {
        const m = new bootstrap.Modal(modalEl);
        m.show();
    }
}

function closeModal(id) {
    const modalEl = document.getElementById(id);
    if(modalEl) {
        const m = bootstrap.Modal.getInstance(modalEl);
        if(m) m.hide();
    }
    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
}